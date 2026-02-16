---
title: "Gulf Stream"
description: "Gulf Stream, mempoolless transaction forwarding, TPU, QUIC, leader-aware routing"
tags: [solana, consensus, gulf-stream, mempool, tpu, quic]
---

# Gulf Stream

## 概述

Gulf Stream 是 Solana 獨特的交易轉發協議——取消了傳統的全域 mempool，改為將交易直接轉發給即將出塊的 leader validator。由於 [Leader Schedule](/solana/consensus/leader-schedule/) 是提前已知的，RPC 節點和 validator 可以預判未來的 leader，並將交易提前送達。這大幅降低了交易確認延遲，也減少了全網的冗餘頻寬消耗。自 v1.15 起，TPU 端口採用 QUIC 協議以提供 stake-weighted 的 spam resistance。

## 核心原理

### 無全域 Mempool

傳統區塊鏈（包括 Ethereum）維護一個全域的未確認交易池（mempool）。Solana 的做法截然不同：

| 特性 | 傳統 Mempool | Gulf Stream |
|------|-------------|-------------|
| 交易儲存 | 全網廣播到所有節點 | 直送 leader |
| 延遲 | 需等待被選入區塊 | 即時到達 leader |
| 頻寬 | 每筆交易廣播 N 次 | 只送給少數 leader |
| MEV 風險 | Mempool 可見性 -> 搶跑 | 較不透明（但仍有 Jito） |

### 交易轉發流程

```
1. Client 建構交易
      |
2. 送至 RPC 節點
      |
3. RPC 查詢 leader schedule
      |
4. 轉發至當前 leader 和下 N 個 leader 的 TPU
      |
5. Leader 在其 slot 中處理交易
```

RPC 通常將交易同時轉發給當前 leader 和接下來 2-4 個 leader，確保即使當前 leader miss slot，交易也能被後續 leader 處理。

### TPU（Transaction Processing Unit）

TPU 是 validator 的交易接收管線，由幾個 stage 組成：

| Stage | 功能 |
|-------|------|
| Fetch | 從網路接收交易封包 |
| SigVerify | GPU 加速驗證 Ed25519 簽名 |
| Banking | 交易執行和狀態更新 |
| Broadcast | 將結果透過 [Turbine](/solana/consensus/turbine/) 廣播 |

### TPU 端口和協議

| 協議 | 端口 | 說明 |
|------|------|------|
| UDP (legacy) | TPU port | 原始協議，無擁塞控制 |
| QUIC | TPU forward port | v1.15+ 預設，提供 spam resistance |

### QUIC 的 Spam Resistance

QUIC 協議替代 UDP 帶來了關鍵的安全改進：

1. **Stake-weighted connection priority**：高 stake 的 validator 和 staker 連線有更高優先級
2. **Rate limiting**：每個連線有流量限制
3. **Connection authentication**：防止 IP 偽造
4. **Congestion control**：避免網路過載

```
連線優先級:
  Validator（按 stake weight） > Staker > 一般 RPC > 未驗證 client
```

### 交易快取

交易在網路邊緣會被暫時快取：

- RPC 節點在轉發後保留交易一段時間
- 如果 leader 切換（skip slot），可快速重新轉發
- 快取時間與 blockhash 有效期相關（~300 slots）

### 與 Ethereum Mempool 的比較

| 面向 | Gulf Stream (Solana) | Mempool (Ethereum) |
|------|---------------------|-------------------|
| 交易可見性 | 低（直送 leader） | 高（全網可見） |
| MEV 搶跑 | 較困難（但 Jito bundles 存在） | 容易（mempool sniping） |
| 確認延遲 | ~400ms | 12s（一個 slot） |
| 替換交易 | 不直接支援 | 支援（higher gas） |
| Pending 狀態 | 極短暫 | 可能很長 |
| 節點頻寬 | 低（定向轉發） | 高（全網廣播） |

## 程式碼範例

```typescript
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  PublicKey,
} from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com", {
  commitment: "confirmed",
});

// --- 1. 基本交易提交（RPC 自動透過 Gulf Stream 轉發） ---
const payer = Keypair.generate();
const tx = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: Keypair.generate().publicKey,
    lamports: 1_000_000,
  })
);
const { blockhash } = await connection.getLatestBlockhash();
tx.recentBlockhash = blockhash;
tx.feePayer = payer.publicKey;
tx.sign(payer);

// sendRawTransaction 送到 RPC，RPC 通過 Gulf Stream 轉發到 leader
const signature = await connection.sendRawTransaction(tx.serialize(), {
  skipPreflight: false,         // 先做本地 simulation
  preflightCommitment: "confirmed",
  maxRetries: 3,                // RPC 層的重試次數
});

// --- 2. 查詢即將出塊的 leader ---
const currentSlot = await connection.getSlot();
const upcomingLeaders = await connection.getSlotLeaders(currentSlot, 12);
// Gulf Stream 將交易送給這些即將到來的 leader

// --- 3. 監控交易狀態（反映 Gulf Stream 的處理結果） ---
connection.onSignature(
  signature,
  (result, context) => {
    if (result.err) {
      // 交易在 leader 處執行失敗
    } else {
      // context.slot: 交易被包含的 slot
      // 從提交到確認的時間差反映 Gulf Stream 效率
    }
  },
  "confirmed"
);

// --- 4. 查詢 TPU 節點資訊 ---
const clusterNodes = await connection.getClusterNodes();
for (const node of clusterNodes.slice(0, 3)) {
  // node.tpu: TPU 地址（Gulf Stream 的接收端）
  // node.pubkey: validator identity
  // 可用於直接向 leader 的 TPU 提交交易（進階用法）
}

// --- 5. 獲取 recent performance 樣本 ---
const perfSamples = await connection.getRecentPerformanceSamples(10);
for (const sample of perfSamples) {
  // sample.numTransactions: 此時段處理的交易數
  // sample.numSlots: 此時段的 slot 數
  // sample.samplePeriodSecs: 取樣時段（秒）
  // TPS = numTransactions / samplePeriodSecs
}
```

## 相關概念

- [Leader Schedule](/solana/consensus/leader-schedule/) - Gulf Stream 依賴的 leader 預知機制
- [Turbine](/solana/consensus/turbine/) - Leader 處理交易後的區塊傳播
- [Solana Transaction Lifecycle](/solana/transactions/transaction-lifecycle-solana/) - Gulf Stream 在完整流程中的位置
- [Transaction Fees](/solana/transactions/fees-priority/) - Priority fee 影響 leader 的交易排序
- [Transaction Errors](/solana/transactions/transaction-errors/) - Gulf Stream 轉發過程中可能的錯誤
- [Proof of History](/solana/consensus/proof-of-history/) - Leader 使用 PoH 為收到的交易排序
- [Tower BFT](/solana/consensus/tower-bft/) - Leader 出塊後的共識投票
- [Validators and Staking](/solana/consensus/validators-staking/) - Stake 影響 QUIC 連線優先級
- [Mempool (ETH)](/ethereum/transaction-lifecycle/mempool/) - Ethereum mempool 的架構比較
