---
title: "Compute Units"
description: "Compute Units, CU, Solana gas, ComputeBudgetProgram, priority fees, heap, stack"
tags: [solana, runtime, compute-units, gas, fees, compute-budget]
---

# Compute Units

## 概述

Compute Units（CU）是 Solana 對計算資源的計量單位，功能類似 Ethereum 的 [Gas](/ethereum/accounts/gas/)。每筆交易有 CU 預算上限，每個 instruction 預設 200,000 CU，整筆交易上限 1,400,000 CU（1.4M），每個區塊上限 48,000,000 CU（48M，計劃提升至 60M）。開發者可透過 `ComputeBudgetProgram` 調整 CU 限制和設定 priority fee，影響交易的排序優先級和費用。

## 核心原理

### CU 預算層級

| 層級 | 預設值 | 說明 |
|------|--------|------|
| 每 instruction | 200,000 CU | 單個 instruction 的預設上限 |
| 每交易 | 1,400,000 CU | 整筆交易所有 instruction 的總和上限 |
| 每區塊 | 48,000,000 CU | 整個 block 的計算預算 |

### 常見操作的 CU 成本

| 操作 | 大約 CU 成本 |
|------|-------------|
| 基本算術（add, mul） | 1 |
| 記憶體存取 | 1-10 |
| SHA-256（32 bytes） | ~200 |
| SHA-256（>32 bytes） | ~200 + 每 chunk ~20 |
| Ed25519 signature verify | ~20,000 |
| Secp256k1 recover | ~25,000 |
| CPI overhead | ~1,000 |
| Account allocation | ~5,000 |
| Log（sol_log） | ~100 |
| PDA derivation | ~1,500 |

### ComputeBudgetProgram

兩個關鍵 instruction：

```
SetComputeUnitLimit:
  設定整筆交易的 CU 上限
  最大值: 1,400,000 CU
  降低 CU 上限可提高交易被打包的機率

SetComputeUnitPrice:
  設定每 CU 的 micro-lamports 價格
  priority fee = CU_limit * CU_price / 1,000,000
  較高價格讓交易優先被處理
```

### 費用計算

```
base fee = 5,000 lamports/signature (固定)
priority fee = compute_unit_limit * compute_unit_price / 1,000,000

total fee = base fee + priority fee

範例:
  signatures: 1 -> base fee = 5,000 lamports
  CU limit: 200,000
  CU price: 50,000 micro-lamports
  priority fee = 200,000 * 50,000 / 1,000,000 = 10,000 lamports

  total = 5,000 + 10,000 = 15,000 lamports = 0.000015 SOL
```

### 記憶體限制

| 資源 | 預設值 | 可請求上限 |
|------|--------|-----------|
| Heap | 32 KB | 256 KB（需 RequestHeapFrame） |
| Stack | 4 KB/frame | 不可調整 |
| Stack frames | 64 frames | 不可調整 |
| Account data | 10 MB/tx | 不可調整 |

Heap 超過 32 KB 需要額外 CU 成本。

### 與 Ethereum Gas 的比較

| 特性 | Solana CU | Ethereum Gas |
|------|-----------|-------------|
| 計量單位 | Compute Units | Gas Units |
| 基本轉帳 | ~300 CU | 21,000 gas |
| 價格機制 | 固定 base + priority | EIP-1559 動態 base + tip |
| 區塊限制 | 48M CU | 30M gas (target 15M) |
| 費用燒毀 | base fee 50% 燒毀 | base fee 100% 燒毀 |
| 未使用退費 | CU 上限非實際消耗收費 | 未使用 gas 退還 |
| 設定方式 | ComputeBudgetProgram ix | 交易欄位 gasLimit |

重要差異：Solana 的 priority fee 基於 **CU limit**（設定的上限），而非實際消耗的 CU。因此精確設定 CU limit 可以節省費用。

### 最佳化策略

降低 CU 消耗的策略：

```
1. 精確設定 CU limit:
   - 先模擬交易取得實際 CU 消耗
   - 設定 CU limit 為 actual + 少量 buffer
   - priority fee 按 limit 計費, 越精確越省

2. 減少帳戶數量:
   - 每個帳戶載入有額外 CU 成本
   - 合併不必要的帳戶

3. 避免昂貴操作:
   - 減少 CPI 呼叫層數
   - 用 Keccak-256 取代 SHA-256（CU 成本相似但視情況而定）
   - 預計算 PDA（而非在 program 中反覆 derive）

4. 記憶體效率:
   - 避免大量 heap allocation
   - 使用 zero-copy deserialization
```

## 程式碼範例

```typescript
import {
  Connection,
  Transaction,
  SystemProgram,
  ComputeBudgetProgram,
  PublicKey,
  Keypair,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");

// 設定 Compute Budget
function buildTransactionWithComputeBudget(
  payer: PublicKey,
  recipient: PublicKey,
  lamports: number,
  computeUnitLimit: number,
  computeUnitPriceMicroLamports: number
): Transaction {
  const tx = new Transaction();

  // 設定 CU 上限（放在交易的第一個 instruction）
  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnitLimit,
    })
  );

  // 設定 CU 價格（priority fee）
  tx.add(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: computeUnitPriceMicroLamports,
    })
  );

  // 實際操作
  tx.add(
    SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: recipient,
      lamports,
    })
  );

  return tx;
}

// 模擬交易以取得實際 CU 消耗
async function simulateAndGetCU(
  connection: Connection,
  tx: Transaction,
  payer: Keypair
): Promise<number> {
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);

  const simulation = await connection.simulateTransaction(tx);

  if (simulation.value.err) {
    throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
  }

  return simulation.value.unitsConsumed ?? 0;
}

// 計算費用
function calculateFee(
  signatures: number,
  computeUnitLimit: number,
  computeUnitPriceMicroLamports: number
): { baseFee: number; priorityFee: number; totalFee: number } {
  const baseFee = signatures * 5000; // 5000 lamports per signature
  const priorityFee = Math.floor(
    (computeUnitLimit * computeUnitPriceMicroLamports) / 1_000_000
  );
  return {
    baseFee,
    priorityFee,
    totalFee: baseFee + priorityFee,
  };
}
```

```rust
use anchor_lang::prelude::*;
use anchor_lang::solana_program::compute_units::sol_remaining_compute_units;

declare_id!("CUDemo1111111111111111111111111111111111111");

#[program]
pub mod compute_units_demo {
    use super::*;

    // 監控 CU 消耗
    pub fn optimized_operation(ctx: Context<Operation>, iterations: u32) -> Result<()> {
        // 記錄起始 CU
        let start_cu = sol_remaining_compute_units();
        msg!("Starting CU: {}", start_cu);

        // 執行計算（CU 成本隨 iterations 增加）
        let account = &mut ctx.accounts.data;
        let mut result: u64 = account.value;
        for _ in 0..iterations {
            result = result.wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
        }
        account.value = result;

        // 記錄結束 CU
        let end_cu = sol_remaining_compute_units();
        msg!("CU consumed: {}", start_cu - end_cu);
        msg!("CU remaining: {}", end_cu);

        Ok(())
    }

    // 請求更多 heap 空間
    pub fn large_data_operation(
        ctx: Context<Operation>,
        data: Vec<u8>,
    ) -> Result<()> {
        // 如果 data 很大, 可能需要 RequestHeapFrame
        // 客戶端需要在交易中加入:
        // ComputeBudgetProgram.requestHeapFrame({ bytes: 262144 })
        require!(data.len() <= 10240, ErrorCode::DataTooLarge);

        let hash = anchor_lang::solana_program::hash::hash(&data);
        msg!("Hash of {} bytes: {:?}", data.len(), hash);

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Operation<'info> {
    #[account(mut)]
    pub data: Account<'info, DataAccount>,
    pub authority: Signer<'info>,
}

#[account]
pub struct DataAccount {
    pub value: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Data exceeds maximum size")]
    DataTooLarge,
}
```

## 相關概念

- [SVM/Sealevel](/solana/runtime/svm-sealevel/) - CU 是 SVM 執行的計量單位
- [Fees and Priority Fees](/solana/transactions/fees-priority/) - CU 價格決定交易的優先順序
- [BPF/SBF](/solana/runtime/bpf-sbf/) - SBF 指令的 CU 成本計量
- [CPI](/solana/runtime/cpi/) - CPI 呼叫消耗額外 CU overhead
- [Gas (ETH)](/ethereum/accounts/gas/) - Ethereum 的對等計費單位
- [EIP-1559 (ETH)](/ethereum/accounts/eip-1559/) - Ethereum 的動態費用模型
- [Transaction Anatomy](/solana/transactions/transaction-anatomy/) - ComputeBudget instruction 在交易中的位置
- [Banking Stage](/solana/runtime/banking-stage/) - CU 限制影響區塊打包
- [Jito MEV](/solana/advanced/jito-mev/) - Priority fee 與 MEV 競標的關係
