---
title: "SVM and Sealevel"
description: "SVM, Sealevel, Solana Virtual Machine, 並行執行引擎, sBPF, register-based VM"
tags: [solana, runtime, svm, sealevel, parallel-execution, sbpf]
---

# SVM and Sealevel

## 概述

SVM（Solana Virtual Machine）是 Solana 的 register-based 執行環境，運行 sBPF（Solana Berkeley Packet Filter）bytecode。Sealevel 是建構在 SVM 之上的**並行交易執行引擎**，是 Solana 高吞吐量的核心技術。與 Ethereum 的 EVM 逐筆循序執行不同，Sealevel 利用交易預先宣告所有帳戶的特性構建依賴圖，將不衝突的交易分配到多個 CPU 核心同時執行。這是 Solana 能達成數千 TPS 的關鍵設計。

## 核心原理

### SVM 架構

SVM 是 register-based 虛擬機，與 EVM 的 stack-based 架構根本不同：

| 特性 | SVM | EVM |
|------|-----|-----|
| 架構 | Register-based（11 registers） | Stack-based（1024 depth） |
| Bytecode | sBPF（64-bit registers） | EVM bytecode（256-bit words） |
| 執行模型 | 並行（Sealevel） | 循序執行 |
| 狀態存取 | 帳戶預先宣告 | 動態存取 storage |
| 計費單位 | [Compute Units](/solana/runtime/compute-units/) | [Gas](/ethereum/accounts/gas/) |
| 程式語言 | Rust/C -> LLVM -> sBPF | Solidity/Vyper -> EVM bytecode |

### 交易帳戶宣告

Solana 交易的核心設計：**所有要存取的帳戶必須在交易提交前宣告**。

```
Transaction {
    signatures: [...],
    message: {
        account_keys: [
            account_A (writable),  // 寫入帳戶
            account_B (writable),  // 寫入帳戶
            account_C (readonly),  // 只讀帳戶
            program_X (readonly),  // 程式帳戶
        ],
        instructions: [...]
    }
}
```

每個帳戶標記為 **writable** 或 **readonly**，這讓 runtime 在執行前就能判斷交易之間是否有衝突。

### Sealevel 並行執行

Sealevel 根據帳戶依賴關係建立 dependency graph：

```
TX1: writes [A], reads [C]
TX2: writes [B], reads [C]
TX3: writes [A], reads [D]
TX4: reads  [B, D]

依賴分析:
  TX1 和 TX2: 無衝突 -> 可並行（C 為 readonly，可共享）
  TX1 和 TX3: 衝突 -> 必須序列化（都寫 A）
  TX2 和 TX4: 無衝突 -> 可並行（TX4 只讀 B）
```

### 並行規則

帳戶存取遵循以下鎖定規則：

| 情境 | 規則 |
|------|------|
| 多筆交易讀同一帳戶 | 允許並行（共享讀鎖） |
| 一筆寫 + 一筆讀同一帳戶 | 序列化（寫鎖排他） |
| 多筆交易寫同一帳戶 | 序列化（寫鎖排他） |
| 存取不同帳戶 | 允許並行 |

### 執行流程

```
1. 接收交易批次
   |
2. 帳戶鎖定分析
   |-- 提取每筆交易的 read set / write set
   |-- 構建衝突圖
   |
3. 排程分配
   |-- 不衝突的交易分配到不同 thread
   |-- 衝突的交易排入同一 thread（保序）
   |
4. 並行執行
   |-- Thread 1: TX1, TX3 (序列, 都寫 A)
   |-- Thread 2: TX2 (獨立)
   |-- Thread 3: TX4 (獨立)
   |
5. 結果收集與 commit
```

### 與 EVM 循序執行的對比

EVM 的執行模型：

```
EVM (Sequential):
  Block N: TX1 -> TX2 -> TX3 -> TX4 (逐筆執行)
  每筆交易可動態 SLOAD/SSTORE 任意 storage slot
  無法預知哪些 state 會被存取

Sealevel (Parallel):
  Block N: [TX1, TX3] || [TX2] || [TX4] (並行批次)
  所有帳戶預先宣告, runtime 靜態分析衝突
  不衝突的交易分配到不同 CPU 核心
```

EVM 無法預先知道交易會存取哪些 storage，因為 `SLOAD`/`SSTORE` 的地址是動態計算的。Solana 強制預先宣告解決了這個問題，代價是開發者必須明確管理帳戶。

### 水平擴展

Sealevel 的並行度隨硬體線性擴展：

- 4 核 CPU: 理論上 4x 吞吐（無衝突情境）
- 16 核 CPU: 理論上 16x 吞吐
- 實際受限於帳戶衝突率和記憶體頻寬

熱門帳戶（如 DEX pool）成為瓶頸，因為所有存取該帳戶的交易都必須序列化。

## 程式碼範例

```typescript
import {
  Connection,
  Transaction,
  SystemProgram,
  PublicKey,
  Keypair,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

// 展示 Sealevel 並行執行：兩筆不衝突的轉帳可並行處理
const connection = new Connection("https://api.mainnet-beta.solana.com");

// 這兩筆交易存取不同帳戶，Sealevel 會並行執行
const payer = Keypair.generate();
const recipientA = Keypair.generate().publicKey;
const recipientB = Keypair.generate().publicKey;

// TX1: payer -> recipientA (writes: payer, recipientA)
const tx1 = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: recipientA,
    lamports: 1_000_000,
  })
);

// TX2: payer -> recipientB (writes: payer, recipientB)
// 注意: 兩筆交易都寫入 payer，所以實際上會序列化
// 若 TX1 和 TX2 來自不同 payer，則可真正並行

// 查詢交易的帳戶存取模式
async function analyzeTransaction(txSignature: string) {
  const tx = await connection.getTransaction(txSignature, {
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) return;

  const message = tx.transaction.message;
  const accountKeys = message.staticAccountKeys
    ? message.staticAccountKeys
    : (message as any).accountKeys;

  // 分析 header 判斷帳戶角色
  const header = (message as any).header;
  const numSigners = header.numRequiredSignatures;
  const numReadonlySigned = header.numReadonlySignedAccounts;
  const numReadonlyUnsigned = header.numReadonlyUnsignedAccounts;

  const writableSigners = accountKeys.slice(0, numSigners - numReadonlySigned);
  const readonlySigners = accountKeys.slice(
    numSigners - numReadonlySigned,
    numSigners
  );
  const totalReadonly = numReadonlyUnsigned;
  const writableUnsigned = accountKeys.slice(
    numSigners,
    accountKeys.length - totalReadonly
  );
  const readonlyUnsigned = accountKeys.slice(
    accountKeys.length - totalReadonly
  );

  return {
    writableAccounts: [...writableSigners, ...writableUnsigned],
    readonlyAccounts: [...readonlySigners, ...readonlyUnsigned],
    computeUnitsConsumed: tx.meta?.computeUnitsConsumed,
  };
}
```

```rust
// Anchor program: 帳戶宣告範例
// Sealevel 根據這些宣告判斷並行安全性
use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod parallel_demo {
    use super::*;

    // 這個 instruction 宣告了明確的 read/write 帳戶
    // Sealevel 用這些資訊排程並行執行
    pub fn swap(ctx: Context<Swap>, amount_in: u64) -> Result<()> {
        // pool_a 和 pool_b 都是 writable
        // 其他存取相同 pool 的交易會被序列化
        let pool_a = &mut ctx.accounts.pool_a;
        let pool_b = &mut ctx.accounts.pool_b;

        // 常數乘積公式: x * y = k
        let k = pool_a.reserve as u128 * pool_b.reserve as u128;
        let new_reserve_a = pool_a.reserve + amount_in;
        let new_reserve_b = (k / new_reserve_a as u128) as u64;
        let amount_out = pool_b.reserve - new_reserve_b;

        pool_a.reserve = new_reserve_a;
        pool_b.reserve = new_reserve_b;

        msg!("Swapped {} for {}", amount_in, amount_out);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]  // writable: Sealevel 會取得寫鎖
    pub pool_a: Account<'info, Pool>,
    #[account(mut)]  // writable: 寫鎖
    pub pool_b: Account<'info, Pool>,
    pub user: Signer<'info>,  // readonly signer
}

#[account]
pub struct Pool {
    pub reserve: u64,
    pub mint: Pubkey,
}
```

## 相關概念

- [BPF/SBF Bytecode](/solana/runtime/bpf-sbf/) - SVM 執行的位元組碼格式
- [Compute Units](/solana/runtime/compute-units/) - SVM 的計算資源計量單位
- [Instructions](/solana/transactions/instructions/) - 交易內的操作單元，聲明帳戶存取
- [Account Model](/solana/account-model/account-model-overview/) - 帳戶模型是並行執行的基礎
- [Banking Stage](/solana/runtime/banking-stage/) - 交易排程與執行的 pipeline 階段
- [Transaction Anatomy](/solana/transactions/transaction-anatomy/) - 交易結構中的帳戶宣告
- [Firedancer](/solana/advanced/firedancer/) - 高效能驗證者客戶端的並行優化
- [State Transition (ETH)](/ethereum/transaction-lifecycle/state-transition/) - Ethereum 循序狀態轉換的對比
- [Gas (ETH)](/ethereum/accounts/gas/) - Ethereum 計費模型的對比
