---
title: "Transaction Errors"
description: "Solana Transaction Errors, 交易錯誤, blockhash expiration, write lock contention, program errors"
tags: [solana, transactions, errors, blockhash, retry, troubleshooting]
---

# Transaction Errors

## 概述

Solana 交易可能在生命週期的多個階段失敗：預檢（preflight）、提交、執行或確認。常見錯誤包括 blockhash 過期（300 slots / ~2 分鐘）、餘額不足、write lock 競爭、program 自定義錯誤碼等。理解這些錯誤的成因和重試策略對於建構可靠的 Solana 應用至關重要。Durable nonce 機制可解決 blockhash 過期問題，而交易 simulation 有助於在提交前預先發現錯誤。

## 核心原理

### 錯誤分類

Solana 交易錯誤可分為幾大類：

| 類別 | 常見錯誤 | 階段 |
|------|----------|------|
| Blockhash 相關 | `BlockhashNotFound` | 提交/確認 |
| 費用相關 | `InsufficientFundsForFee` | 預檢/執行 |
| 帳戶相關 | `AccountNotFound`, `InsufficientFunds` | 執行 |
| 鎖定相關 | Write lock contention | 排程 |
| Program 錯誤 | Custom error codes | 執行 |
| 大小相關 | `TransactionTooLarge` | 預檢 |
| 簽名相關 | `SignatureFailure` | SigVerify |

### Blockhash 過期

最常見的錯誤之一。Recent blockhash 的有效期為 300 slots（約 2 分鐘）：

**成因**：
- 交易建構到提交之間延遲過長
- 網路擁塞導致交易排隊超時
- Partial signing 收集簽名時間過長

**解決方案**：
1. 使用較新的 blockhash（提交前才取得）
2. 使用 durable nonce（參見 [Transaction Signing](/solana/transactions/signing/)）
3. 實作 blockhash 輪換的重試邏輯

### 餘額不足

分為兩種情境：

**Fee 不足**：fee payer 的 SOL 餘額無法支付 [base fee + priority fee](/solana/transactions/fees-priority/)。

**Rent-exempt 不足**：帳戶的 lamport 餘額低於 [rent-exempt](/solana/account-model/rent/) 最低要求。對於新建帳戶，必須預先計算所需的 rent-exempt 金額：

$$\text{rent\_exempt} = \text{rent\_rate} \times (128 + \text{data\_size})$$

### Write Lock Contention

Solana 的 [SVM/Sealevel](/solana/runtime/svm-sealevel/) 並行引擎要求同時寫入同一帳戶的交易必須序列化：

- 高頻寫入的帳戶（如 AMM pool 的 state account）容易成為瓶頸
- 大量交易競爭同一 write lock 時，部分交易可能被丟棄
- 這是 Solana 在高負載時交易成功率下降的主要原因之一

### Program Errors

每個 program 定義自己的錯誤碼。常見模式：

**Anchor 框架**：
- 前 6000 為 Anchor 內建錯誤（如 `AccountNotInitialized`, `ConstraintMut`）
- 6000 以上為自定義錯誤碼

**System Program**：
- `0`: InsufficientFunds
- `1`: InvalidAccountData
- 其他內建 program 各有獨立的錯誤碼定義

### Simulation vs On-chain 差異

`simulateTransaction` 的結果可能與實際執行不同：

| 項目 | Simulation | On-chain |
|------|------------|----------|
| 狀態快照 | RPC 節點的本地狀態 | Leader 的即時狀態 |
| 時間差 | 可能落後數個 slot | 最新狀態 |
| 並行效果 | 不考慮其他交易 | 可能受其他交易影響 |
| Sysvar 值 | 可能過時 | 最新值 |

因此，simulation 成功不保證鏈上執行成功，但 simulation 失敗幾乎可以確定鏈上也會失敗。

### 重試策略

```
重試決策樹:

交易失敗
  |
  +-- BlockhashNotFound?
  |     -> 取新 blockhash，重新簽署，重試
  |
  +-- 餘額不足?
  |     -> 不重試，通知使用者
  |
  +-- Write lock contention?
  |     -> 指數退避重試（50ms, 100ms, 200ms...）
  |
  +-- Program error?
  |     -> 檢查錯誤碼，修正參數後重試
  |
  +-- 交易已 landed 但失敗?
        -> 不重試（已消耗 fee）
```

重要原則：
- **已上鏈的失敗交易仍然扣費**——base fee 不退還
- 使用 `skipPreflight: false` 在提交前做本地 simulation
- 設定 `maxRetries` 限制 RPC 的自動重試次數

### Durable Nonce 作為錯誤防護

Durable nonce 解決了 blockhash 過期的根本問題：

- Nonce 交易不會因時間過期而失敗
- 適用於需要離線簽署或多方審批的場景
- 代價：每筆交易需額外一個 `AdvanceNonce` instruction

## 程式碼範例

```typescript
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  TransactionExpiredBlockheightExceededError,
  SendTransactionError,
} from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

// --- 1. 帶重試邏輯的交易發送 ---
async function sendWithRetry(
  tx: Transaction,
  signers: Keypair[],
  maxRetries = 3
): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // 每次重試都取新的 blockhash
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = signers[0].publicKey;
      tx.sign(...signers);

      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
        maxRetries: 0, // 停用 RPC 自動重試
      });

      // 等待確認
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, "confirmed");

      if (confirmation.value.err) {
        throw new Error(`TX confirmed but failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      return signature;
    } catch (error) {
      if (error instanceof TransactionExpiredBlockheightExceededError) {
        // Blockhash 過期，重試
        continue;
      }

      if (error instanceof SendTransactionError) {
        const logs = error.logs;
        // 分析 program logs 判斷是否值得重試
        const isRetryable = !logs?.some(
          (log) => log.includes("insufficient funds")
        );
        if (!isRetryable) throw error;
        // 指數退避
        await new Promise((r) => setTimeout(r, 100 * Math.pow(2, attempt)));
        continue;
      }

      throw error;
    }
  }

  throw new Error("Max retries exceeded");
}

// --- 2. Simulation 預檢 ---
async function simulateFirst(tx: Transaction, payer: Keypair) {
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = payer.publicKey;

  const simulation = await connection.simulateTransaction(tx);

  if (simulation.value.err) {
    // 解析 program 錯誤
    const logs = simulation.value.logs || [];
    const errorLog = logs.find((l) => l.includes("Error"));
    throw new Error(`Simulation failed: ${errorLog || JSON.stringify(simulation.value.err)}`);
  }

  return {
    unitsConsumed: simulation.value.unitsConsumed,
    logs: simulation.value.logs,
  };
}

// --- 3. 解析 Anchor 錯誤碼 ---
function parseAnchorError(errorCode: number): string {
  const anchorErrors: Record<number, string> = {
    100: "InstructionMissing",
    2000: "AccountNotInitialized",
    2001: "AccountNotProgramOwned",
    2003: "AccountNotMutable",
    2006: "ConstraintSeeds",
    2012: "ConstraintHasOne",
  };
  return anchorErrors[errorCode] || `Custom error: ${errorCode}`;
}
```

## 相關概念

- [Transaction Anatomy](/solana/transactions/transaction-anatomy/) - 交易結構及其限制
- [Transaction Fees](/solana/transactions/fees-priority/) - 費用不足導致的錯誤
- [Transaction Signing](/solana/transactions/signing/) - Durable nonce 防止 blockhash 過期
- [Rent](/solana/account-model/rent/) - Rent-exempt 相關的帳戶錯誤
- [Solana Transaction Lifecycle](/solana/transactions/transaction-lifecycle-solana/) - 錯誤可能發生的各個階段
- [Compute Units](/solana/runtime/compute-units/) - CU 超限導致的執行失敗
- [SVM/Sealevel](/solana/runtime/svm-sealevel/) - Write lock contention 的根源
- [Slots, Blocks, and Epochs](/solana/consensus/clock-and-slots/) - Blockhash 過期的時間單位
- [Programs](/solana/account-model/programs/) - Program 自定義錯誤碼
