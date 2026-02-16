---
title: "Transaction Fees and Priority Fees"
description: "Solana Transaction Fees, Priority Fees, Compute Budget, ComputeBudgetProgram, SIMD-0096"
tags: [solana, transactions, fees, priority, compute-budget, lamports]
---

# Transaction Fees and Priority Fees

## 概述

Solana 的交易費用由兩部分組成：**base fee**（固定，每個簽名 5000 lamports）和 **priority fee**（可選，以 micro-lamports per compute unit 計價）。開發者透過 `ComputeBudgetProgram` 設定 compute unit limit 和 price，以控制交易的優先順序和執行資源。自 SIMD-0096 實施後，100% 的 priority fee 歸 validator 所有。相較於 Ethereum 的 [EIP-1559](/ethereum/accounts/eip-1559/) 動態費率模型，Solana 的 base fee 是固定的。

## 核心原理

### 費用公式

$$\text{Total Fee} = \text{Base Fee} + \text{Priority Fee}$$

$$\text{Base Fee} = 5000 \times \text{num\_signatures} \text{ (lamports)}$$

$$\text{Priority Fee} = \frac{\text{CU\_limit} \times \text{CU\_price}}{10^6} \text{ (lamports)}$$

其中 CU\_price 的單位是 micro-lamports per compute unit。

### Base Fee

Base fee 完全固定，與交易複雜度無關：

| 項目 | 值 |
|------|-----|
| 每簽名費用 | 5000 lamports |
| 單簽名交易 | 5000 lamports（0.000005 SOL） |
| 3 簽名交易 | 15000 lamports |

Base fee 的 50% 被 burn，50% 歸 leader validator。

### Priority Fee

Priority fee 是可選的，用途包含：
- 在高流量時段提升交易的排序優先級
- 激勵 validator 優先處理此交易
- [Jito MEV](/solana/advanced/jito-mev/) tip 也是一種 priority fee 形式

### Compute Budget

每筆交易和每個 instruction 有 compute unit（CU）限制：

| 項目 | 預設值 | 最大值 |
|------|--------|--------|
| 每個 instruction | 200,000 CU | - |
| 每筆交易 | 200,000 * N instructions | 1,400,000 CU |

### ComputeBudgetProgram

透過特殊的 `ComputeBudgetProgram` instruction 調整 compute budget：

| Instruction | 說明 |
|-------------|------|
| `SetComputeUnitLimit` | 設定交易的 CU 上限（覆蓋預設值） |
| `SetComputeUnitPrice` | 設定 CU 價格（micro-lamports） |

最佳實踐：
- 先用 `simulateTransaction` 估算實際 CU 消耗
- `SetComputeUnitLimit` 設為估算值的 1.1-1.2 倍
- 避免設定過高的 limit（浪費 priority fee）

### SIMD-0096: 100% Priority Fee to Validators

SIMD-0096 改變了 priority fee 的分配機制：

| 項目 | SIMD-0096 前 | SIMD-0096 後 |
|------|-------------|-------------|
| Base fee | 50% burn / 50% validator | 50% burn / 50% validator |
| Priority fee | 50% burn / 50% validator | **100% validator** |

這個改變增強了 validator 的經濟激勵，減少了 off-protocol 的 side channel 交易。

### 與 EIP-1559 的比較

| 特性 | Solana | Ethereum (EIP-1559) |
|------|--------|---------------------|
| Base fee | 固定 5000 lamports/sig | 動態，根據區塊使用率調整 |
| Priority fee | micro-lamports/CU | maxPriorityFeePerGas (wei/gas) |
| 機制 | 手動設定 CU price | 算法自動調整 baseFee |
| Burn | 50% base fee | 100% base fee |
| Validator 收入 | 50% base + 100% priority | 100% priority |
| 資源計量 | [Compute Units](/solana/runtime/compute-units/) | [Gas](/ethereum/accounts/gas/) |

## 程式碼範例

```typescript
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const payer = Keypair.generate();

// --- 1. 基本交易（僅 base fee） ---
const basicTx = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: Keypair.generate().publicKey,
    lamports: 1_000_000,
  })
);
// 費用 = 5000 lamports（1 signature * 5000）

// --- 2. 帶 Priority Fee 的交易 ---
const priorityTx = new Transaction().add(
  // 設定 CU 上限
  ComputeBudgetProgram.setComputeUnitLimit({
    units: 200_000,
  }),
  // 設定 CU 價格（micro-lamports）
  ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 50_000, // 50,000 micro-lamports per CU
  }),
  // 實際業務 instruction
  SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: Keypair.generate().publicKey,
    lamports: 1_000_000,
  })
);
// Priority fee = 200,000 * 50,000 / 1,000,000 = 10,000 lamports
// Total fee = 5,000 (base) + 10,000 (priority) = 15,000 lamports

// --- 3. 估算最佳 CU Limit ---
async function getOptimalCULimit(tx: Transaction, payer: Keypair) {
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = payer.publicKey;

  const simulation = await connection.simulateTransaction(tx);
  const unitsConsumed = simulation.value.unitsConsumed || 200_000;

  // 加上 20% buffer
  return Math.ceil(unitsConsumed * 1.2);
}

// --- 4. 動態查詢建議 priority fee ---
async function getRecommendedPriorityFee() {
  const fees = await connection.getRecentPrioritizationFees();
  if (fees.length === 0) return 0;

  // 取中位數
  const sorted = fees
    .map((f) => f.prioritizationFee)
    .sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return median;
}

// --- 5. 完整示範 ---
async function sendWithOptimalFees(payer: Keypair, recipient: Keypair) {
  const transferIx = SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: recipient.publicKey,
    lamports: 1_000_000,
  });

  // 先估算 CU
  const tempTx = new Transaction().add(transferIx);
  const optimalCU = await getOptimalCULimit(tempTx, payer);
  const recommendedFee = await getRecommendedPriorityFee();

  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: optimalCU }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: recommendedFee }),
    transferIx
  );

  return await sendAndConfirmTransaction(connection, tx, [payer]);
}
```

## 相關概念

- [Compute Units](/solana/runtime/compute-units/) - 計算資源的計量與限制
- [Transaction Anatomy](/solana/transactions/transaction-anatomy/) - 費用在交易結構中的位置
- [Transaction Signing](/solana/transactions/signing/) - Fee payer 是第一個 signer
- [Jito MEV](/solana/advanced/jito-mev/) - MEV tip 作為額外的 priority 機制
- [Solana Transaction Lifecycle](/solana/transactions/transaction-lifecycle-solana/) - 費用如何影響排序
- [Transaction Errors](/solana/transactions/transaction-errors/) - 餘額不足等費用相關錯誤
- [Validators and Staking](/solana/consensus/validators-staking/) - Validator 收取費用的機制
- [EIP-1559 (ETH)](/ethereum/accounts/eip-1559/) - Ethereum 的動態費率模型
- [Gas (ETH)](/ethereum/accounts/gas/) - Ethereum 的計算資源計量
