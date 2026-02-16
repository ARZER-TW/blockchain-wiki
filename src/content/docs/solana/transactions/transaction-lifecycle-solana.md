---
title: "Solana Transaction Lifecycle"
description: "Solana Transaction Lifecycle, 交易生命週期, Gulf Stream, TPU, Sealevel, PoH, Turbine, Tower BFT"
tags: [solana, transactions, lifecycle, gulf-stream, tpu, sealevel]
---

# Solana Transaction Lifecycle

## 概述

Solana 的交易生命週期與 Ethereum 有根本性差異——沒有全域 mempool。交易從 RPC 節點提交後，經由 [Gulf Stream](/solana/consensus/gulf-stream/) 直接轉發給即將出塊的 leader validator。Leader 在 [PoH](/solana/consensus/proof-of-history/) 時鐘中交織交易，[SVM/Sealevel](/solana/runtime/svm-sealevel/) 並行執行後打包成 shred，透過 [Turbine](/solana/consensus/turbine/) 傳播至網路。最終經由 [Tower BFT](/solana/consensus/tower-bft/)（或未來的 [Alpenglow](/solana/consensus/alpenglow/)）達成共識和 finality。

## 核心原理

### 完整流程

```
1. Client 建構 + 簽署交易
      |
2. 提交至 RPC 節點
      |
3. RPC 轉發至 TPU（Gulf Stream）
      |
4. Leader 接收 + 去重 + SigVerify
      |
5. Banking Stage: SVM 並行執行
      |
6. PoH 交織: 交易穿插在 hash chain 中
      |
7. Shred 建立 + Turbine 廣播
      |
8. 其他 validator 驗證 + 重放
      |
9. 投票 + 確認（Tower BFT）
      |
10. Finality: optimistic / rooted
```

### Step 1-2: 提交至 RPC

Client 透過 JSON-RPC 呼叫 `sendTransaction` 將簽署完成的交易送至 RPC 節點。RPC 節點進行初步檢查：

- 交易格式是否正確
- Blockhash 是否仍有效
- 基本簽名格式驗證

### Step 3: Gulf Stream 轉發

RPC 節點根據 [leader schedule](/solana/consensus/leader-schedule/) 得知未來幾個 slot 的 leader，將交易轉發至當前和下一個 leader 的 TPU（Transaction Processing Unit）端口：

- **TPU 端口**：接受 UDP 和 QUIC 協議
- **QUIC**：自 v1.15 起啟用，提供 spam resistance 和 stake-weighted 連線優先
- **無全域 mempool**：交易直接送到 leader，降低延遲

### Step 4: Leader 處理

Leader validator 的 TPU pipeline：

1. **Fetch Stage**：從網路接收交易封包
2. **SigVerify Stage**：GPU 加速批量 Ed25519 簽名驗證
3. **Banking Stage**：交易執行的核心

### Step 5: SVM 並行執行

[SVM/Sealevel](/solana/runtime/svm-sealevel/) 是 Solana 的執行引擎，支援交易級並行：

- 分析每筆交易的帳戶讀寫集（account read/write set）
- 無衝突的交易可同時在多核心上執行
- 有寫入衝突的交易必須序列化執行
- 每個 instruction 消耗 [Compute Units](/solana/runtime/compute-units/)

### Step 6: PoH 交織

執行成功的交易被穿插在 [PoH](/solana/consensus/proof-of-history/) hash chain 中：

$$h_{n+1} = \text{SHA-256}(h_n)$$
$$h_{\text{tx}} = \text{SHA-256}(h_n \| \text{tx\_hash})$$

這提供了交易的全域排序證明，不需要 validator 之間額外通訊。

### Step 7: Shred 和 Turbine

Leader 將區塊切割成 shred（小封包），加上 Reed-Solomon erasure coding，透過 [Turbine](/solana/consensus/turbine/) 的樹狀結構廣播：

- Fan-out ~200 節點
- $O(\log_{200}(n))$ 跳數到達所有 validator
- Erasure coding 容許部分 shred 遺失

### Step 8-9: 驗證和投票

其他 validator：
1. 接收 shred，重建區塊
2. 重放交易驗證結果
3. 使用 [Tower BFT](/solana/consensus/tower-bft/) 投票

### Step 10: Finality 層級

| 層級 | 延遲 | 安全性 |
|------|------|--------|
| Processed | ~400ms | 單一 validator 確認，可能回滾 |
| Confirmed（optimistic） | ~400ms | 2/3+ stake 投票，極少回滾 |
| Finalized（rooted） | ~6.4s | 32-depth lockout，等同最終確認 |

Optimistic confirmation 在 2/3 以上的 stake 對該 slot 投票後成立，通常在交易提交後約 400ms-1s 內達成。Rooted（finalized）需要等待 vote tower 深度達到 32。

### 與 Ethereum 交易生命週期的比較

| 階段 | Solana | Ethereum |
|------|--------|----------|
| Mempool | 無（Gulf Stream 直送 leader） | 全域 mempool / PBS |
| 排序 | Leader 單方決定 + PoH | Block builder / proposer |
| 執行 | 並行（Sealevel） | 序列（EVM） |
| 傳播 | Turbine（shred tree） | Gossip 協議 |
| Finality | ~400ms optimistic / ~6.4s root | ~12.8 min（2 epochs） |

## 程式碼範例

```typescript
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
const payer = Keypair.generate();

// --- 1. 發送並追蹤交易狀態 ---
const tx = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: Keypair.generate().publicKey,
    lamports: 1_000_000,
  })
);
tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
tx.feePayer = payer.publicKey;
tx.sign(payer);

// 發送交易（不等待確認）
const signature = await connection.sendRawTransaction(tx.serialize(), {
  skipPreflight: false,
  preflightCommitment: "confirmed",
});

// --- 2. 監聽確認狀態 ---
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

const confirmation = await connection.confirmTransaction({
  signature,
  blockhash,
  lastValidBlockHeight,
}, "confirmed"); // "processed" | "confirmed" | "finalized"

// --- 3. 查詢交易詳情 ---
const txDetails = await connection.getTransaction(signature, {
  commitment: "confirmed",
  maxSupportedTransactionVersion: 0, // 支援 v0 交易
});

if (txDetails) {
  const { meta } = txDetails;
  // meta.fee: 實際支付的費用
  // meta.computeUnitsConsumed: 消耗的 CU
  // meta.err: 錯誤資訊（null 表示成功）
  // meta.logMessages: program 的 log 輸出
}

// --- 4. 使用 WebSocket 訂閱交易狀態 ---
connection.onSignature(
  signature,
  (result) => {
    if (result.err) {
      // 交易失敗
    } else {
      // 交易已在指定 commitment level 確認
    }
  },
  "finalized"
);
```

## 相關概念

- [Gulf Stream](/solana/consensus/gulf-stream/) - 無 mempool 的交易轉發機制
- [Turbine](/solana/consensus/turbine/) - BitTorrent 式區塊傳播
- [Tower BFT](/solana/consensus/tower-bft/) - 投票和 finality 共識
- [SVM/Sealevel](/solana/runtime/svm-sealevel/) - 並行交易執行引擎
- [Proof of History](/solana/consensus/proof-of-history/) - 交易排序的時間證明
- [Leader Schedule](/solana/consensus/leader-schedule/) - Gulf Stream 依賴的 leader 預知
- [Alpenglow](/solana/consensus/alpenglow/) - 下一代共識協議
- [Transaction Fees](/solana/transactions/fees-priority/) - 費用如何影響交易優先級
- [Transaction Errors](/solana/transactions/transaction-errors/) - 生命週期中可能出現的錯誤
- [Transaction Lifecycle (ETH)](/ethereum/transaction-lifecycle/transaction-lifecycle/) - Ethereum 交易生命週期的比較
