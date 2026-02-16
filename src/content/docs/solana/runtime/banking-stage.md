---
title: "Banking Stage"
description: "Banking Stage, TPU Pipeline, transaction scheduling, entry creation, block building"
tags: [solana, runtime, banking-stage, pipeline, scheduling, block-building]
---

# Banking Stage

## 概述

Banking Stage 是 Solana 驗證者交易處理 pipeline 的核心階段，負責接收已驗證簽名的交易、排程執行、並將結果打包為 [PoH](/solana/consensus/proof-of-history/) entries。整個 TPU（Transaction Processing Unit）pipeline 包含 fetch -> sigverify -> banking -> broadcast 四階段，Banking Stage 是其中最複雜的部分。它處理寫鎖競爭、交易排序、重試邏輯，並影響區塊的最終內容和 MEV 機會。

## 核心原理

### TPU Pipeline

```
Fetch Stage          SigVerify Stage        Banking Stage         Broadcast Stage
(接收交易)           (驗證簽名)              (排程+執行)           (廣播區塊)
    |                    |                      |                      |
  QUIC/UDP          Ed25519 批次驗證        帳戶鎖定分析          Turbine 分片
  接收封包           過濾無效簽名           並行執行              傳播給其他節點
  限速+優先           丟棄重複交易           記錄 PoH entries       生成 shreds
```

每個階段以 pipeline 方式並行運作：Fetch 接收第 N 批交易時，SigVerify 正在處理第 N-1 批，Banking 正在執行第 N-2 批。

### Banking Stage 內部流程

```
已驗證交易到達
    |
    v
Transaction Scheduler
    |-- 提取 read set / write set
    |-- 嘗試取得帳戶鎖
    |-- 鎖定成功 -> 分配到執行 thread
    |-- 鎖定失敗 -> 放入重試佇列
    |
    v
Execution Threads (多個)
    |-- 載入帳戶資料
    |-- 在 SVM 中執行 instructions
    |-- 產生執行結果
    |
    v
Recording
    |-- 成功交易寫入 PoH stream
    |-- 建立 Entry (txs batch + PoH hash)
    |-- 失敗交易記錄錯誤
    |
    v
Commit
    |-- 更新帳戶狀態
    |-- 收取費用
    |-- 回傳結果
```

### Transaction Scheduler

Scheduler 是 Banking Stage 的核心元件，負責解決帳戶鎖競爭：

**Central Scheduler（舊版）**：
```
單一 thread 負責排程
  -> 按 priority fee 排序交易
  -> 逐筆嘗試取得帳戶鎖
  -> 成功: 分派到 worker thread
  -> 失敗: 放入重試 queue
  -> 瓶頸: 單一排程器限制吞吐
```

**Multi-iterator Scheduler（新版，SIMD-0085）**：
```
多個 scheduler thread 並行處理
  -> 分區化帳戶鎖定
  -> 減少排程瓶頸
  -> 更好的並行度
  -> Agave 1.18+ 實作
```

### 寫鎖競爭與重試

```
Thread Pool:
  Thread 1: processing TX_A (writes: account_X)
  Thread 2: processing TX_B (writes: account_Y)
  Thread 3: idle

新交易 TX_C arrives (writes: account_X)
  -> 嘗試取得 account_X 的寫鎖
  -> 失敗! (TX_A 持有鎖)
  -> TX_C 進入重試佇列
  -> TX_A 完成後, TX_C 重新排程
```

熱門帳戶（如 Raydium/Orca pool）的寫鎖競爭是 Solana 的主要瓶頸。

### Entry 建立

交易執行後被打包為 entries：

```
Entry {
    num_hashes: u64,          // 自上一個 entry 的 PoH hash 數
    hash: Hash,               // 當前 PoH hash
    transactions: Vec<Tx>,    // 本 entry 包含的交易
}

一個 slot 包含多個 entries:
  Slot N: [Entry_0, Entry_1, ..., Entry_k]
  Entry_0: 可能包含 10-50 筆交易
  Entry_1: 另一批並行執行的交易
```

Entries 間的 PoH hash 鏈提供了時間順序證明。

### 區塊限制

| 限制 | 值 |
|------|---|
| CU per block | 48,000,000（計劃 60M） |
| Max entries per slot | ~800 |
| Max transactions per block | ~2,700（依 CU 和大小） |
| Slot duration | ~400ms |
| Write lock 重試次數 | 有限次，超過丟棄 |

### 與 Ethereum Block Building 的比較

| 特性 | Solana Banking Stage | Ethereum Block Building |
|------|---------------------|------------------------|
| 排程方式 | 持續串流（400ms slot） | 離散（12s slot，一次性） |
| Builder 角色 | Validator 直接建構 | PBS: Proposer/Builder 分離 |
| 交易排序 | Priority fee + 到達順序 | Builder 自由排序（MEV） |
| 並行執行 | 是（Sealevel） | 否（循序） |
| Mempool | 無全域 mempool（Gulf Stream） | 全域 mempool |
| MEV 機制 | Jito bundles/tips | Flashbots MEV-Boost |

Ethereum 的 PBS（Proposer-Builder Separation）將區塊建構外包給專業 builder，validator 只選擇最高出價的區塊。Solana 的 leader 直接處理所有交易，MEV 透過 [Jito](/solana/advanced/jito-mev/) bundles 插入。

### Scheduler 最佳化

Banking Stage 的效能影響整體網路吞吐：

```
最佳化方向:
  1. 減少鎖競爭:
     - 更精細的鎖粒度
     - 樂觀併發控制
  2. 更好的排序:
     - 考慮帳戶衝突的智慧排序
     - 批次處理相似交易
  3. 記憶體效率:
     - 帳戶快取
     - 預載常用帳戶
  4. Firedancer 的方案:
     - Tile 架構: 每個功能在獨立 process
     - 共享記憶體 IPC
     - Kernel-bypass networking
```

## 程式碼範例

```typescript
import {
  Connection,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
  SystemProgram,
  Keypair,
} from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");

// 查詢區塊內的 entries 和交易排列
async function analyzeBlock(slot: number) {
  const block = await connection.getBlock(slot, {
    maxSupportedTransactionVersion: 0,
    transactionDetails: "full",
  });

  if (!block) {
    throw new Error(`Block not found for slot ${slot}`);
  }

  const transactions = block.transactions;
  let totalCU = 0;
  let successCount = 0;
  let failCount = 0;

  for (const tx of transactions) {
    const cuConsumed = tx.meta?.computeUnitsConsumed ?? 0;
    totalCU += cuConsumed;

    if (tx.meta?.err) {
      failCount++;
    } else {
      successCount++;
    }
  }

  return {
    slot,
    blockTime: block.blockTime,
    totalTransactions: transactions.length,
    successCount,
    failCount,
    totalCUConsumed: totalCU,
    cuUtilization: ((totalCU / 48_000_000) * 100).toFixed(2) + "%",
    parentSlot: block.parentSlot,
  };
}

// 構建高優先級交易以在 Banking Stage 中優先處理
function buildHighPriorityTransaction(
  payer: PublicKey,
  recipient: PublicKey,
  lamports: number
): Transaction {
  const tx = new Transaction();

  // Banking Stage 按 priority fee 排序交易
  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 })
  );
  tx.add(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 100_000, // 高 priority fee
    })
  );

  tx.add(
    SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: recipient,
      lamports,
    })
  );

  return tx;
}

// 監控 slot 生產效能
async function monitorSlotPerformance(
  connection: Connection,
  numSlots: number
) {
  const results = [];
  const currentSlot = await connection.getSlot();

  for (let i = 0; i < numSlots; i++) {
    const slot = currentSlot - i;
    try {
      const info = await analyzeBlock(slot);
      results.push(info);
    } catch {
      // slot 可能被 skipped
      results.push({ slot, skipped: true });
    }
  }

  return results;
}
```

```rust
// Banking Stage 處理的交易範例
// 展示 write lock 競爭的場景
use anchor_lang::prelude::*;

declare_id!("BankDemo1111111111111111111111111111111111");

#[program]
pub mod banking_stage_demo {
    use super::*;

    // 這個 instruction 需要寫鎖 counter account
    // 多筆對同一 counter 的交易會在 Banking Stage 序列化
    pub fn increment(ctx: Context<Increment>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.count = counter.count.checked_add(1)
            .ok_or(ErrorCode::Overflow)?;
        msg!("Counter incremented to: {}", counter.count);
        Ok(())
    }

    // 不同的 counter 可以並行更新
    // Banking Stage 的 scheduler 會把不衝突的交易分到不同 thread
    pub fn increment_independent(ctx: Context<IncrementIndependent>) -> Result<()> {
        let counter_a = &mut ctx.accounts.counter_a;
        let counter_b = &mut ctx.accounts.counter_b;

        counter_a.count = counter_a.count.checked_add(1)
            .ok_or(ErrorCode::Overflow)?;
        counter_b.count = counter_b.count.checked_add(1)
            .ok_or(ErrorCode::Overflow)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Increment<'info> {
    #[account(mut)]  // 需要寫鎖
    pub counter: Account<'info, Counter>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct IncrementIndependent<'info> {
    #[account(mut)]
    pub counter_a: Account<'info, Counter>,
    #[account(mut)]
    pub counter_b: Account<'info, Counter>,
    pub authority: Signer<'info>,
}

#[account]
pub struct Counter {
    pub count: u64,
    pub authority: Pubkey,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Counter overflow")]
    Overflow,
}
```

## 相關概念

- [SVM/Sealevel](/solana/runtime/svm-sealevel/) - Banking Stage 內的並行執行引擎
- [PoH](/solana/consensus/proof-of-history/) - Entry 包含 PoH hash 作為時間證明
- [TX Lifecycle](/solana/transactions/transaction-lifecycle-solana/) - 交易從提交到確認的完整流程
- [Compute Units](/solana/runtime/compute-units/) - 區塊的 CU 限制影響打包策略
- [Fees and Priority Fees](/solana/transactions/fees-priority/) - Priority fee 影響排程順序
- [Firedancer](/solana/advanced/firedancer/) - 重新設計的 Banking Stage 實作
- [Jito MEV](/solana/advanced/jito-mev/) - Jito 在 Banking Stage 插入 bundles
- [Gulf Stream](/solana/consensus/gulf-stream/) - 交易轉發到 leader 的機制
- [Block Production (ETH)](/ethereum/transaction-lifecycle/block-production/) - Ethereum 區塊建構的比較
