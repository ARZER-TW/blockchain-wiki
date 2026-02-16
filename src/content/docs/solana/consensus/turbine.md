---
title: "Turbine"
description: "Turbine, block propagation, shred, Reed-Solomon erasure coding, fan-out tree"
tags: [solana, consensus, turbine, shred, erasure-coding, propagation]
---

# Turbine

## 概述

Turbine 是 Solana 的區塊傳播協議，靈感來自 BitTorrent 的分層傳播機制。Leader 將區塊拆分成稱為 **shred** 的小封包，並加上 Reed-Solomon erasure coding 以容忍封包遺失。Shred 透過一個 stake-weighted 的 fan-out tree 傳播，每一層約 200 個節點，使得傳播延遲僅為 $O(\log_{200}(n))$ 跳（hop）。相比 Ethereum 的 gossip 協議，Turbine 的結構化傳播大幅降低了頻寬需求和延遲。

## 核心原理

### Shred 結構

區塊在傳播前被切割為 shred：

| 類型 | 說明 |
|------|------|
| Data shred | 包含實際的區塊資料（交易、PoH entry） |
| Coding shred | Reed-Solomon erasure coding 的冗餘封包 |

每個 shred 大小約為 1228 bytes（適合 UDP/QUIC 封包），包含：

- Shred header：slot、index、version
- 資料或冗餘碼
- Merkle proof（近期版本加入）

### Reed-Solomon Erasure Coding

Erasure coding 讓接收者在遺失部分 shred 的情況下仍能重建完整資料：

```
假設一個 batch 有 32 個 data shred:
  + 32 個 coding shred（冗餘碼）
  = 64 個 shred 總共

只需接收其中任意 32 個 shred 即可重建完整資料
```

這表示最多可以容忍 50% 的封包遺失。實際的 data:coding 比率可調整。

### Fan-out Tree

Turbine 使用分層樹狀結構傳播 shred：

```
Layer 0: Leader
         |
Layer 1: [Node_1, Node_2, ..., Node_200]    (fan-out = 200)
         |         |              |
Layer 2: [200]    [200]    ...  [200]        (200 * 200 = 40,000 nodes)
         |         |              |
Layer 3: [200]    [200]    ...  [200]        (200^3 = 8,000,000 nodes)
```

傳播跳數：$\lceil \log_{200}(n) \rceil$

| 網路大小 | 跳數 | 預估延遲 |
|----------|------|----------|
| 200 | 1 | ~50ms |
| 2,000 | 2 | ~100ms |
| 40,000 | 2 | ~100ms |
| 8,000,000 | 3 | ~150ms |

目前 Solana 主網約 2,000-3,000 個 validator，通常只需 2 跳。

### Neighborhood 結構

Validator 在 fan-out tree 中的位置由 stake weight 決定：

- **高 stake validator 靠近 root**：更早收到 shred，責任更大
- **低 stake validator 在下層**：延遲稍高但責任較輕
- **每個 neighborhood**：約 200 個 validator 組成一組
- **Neighborhood leader**：負責將 shred 轉發給下一層

Stake-weighted 排序確保網路的核心傳播路徑由最可靠的節點承擔。

### Data Shred vs Coding Shred

| 特性 | Data Shred | Coding Shred |
|------|------------|--------------|
| 內容 | 原始區塊資料片段 | Erasure coding 冗餘 |
| 可獨立使用 | 是（該段資料） | 否（需搭配其他 shred） |
| 目的 | 傳輸資料 | 容錯 |
| 大小 | ~1228 bytes | ~1228 bytes |

### 與 Ethereum Gossip 的比較

| 特性 | Turbine (Solana) | Gossip (Ethereum) |
|------|------------------|-------------------|
| 傳播結構 | 結構化 tree | 非結構化 mesh |
| 傳播延遲 | $O(\log n)$ | $O(\log n)$ 但常數較大 |
| 頻寬效率 | 高（每 shred 只送一次） | 低（重複接收） |
| 容錯 | Erasure coding | 重複傳播 |
| 封包大小 | ~1228 bytes (shred) | ~128 KB (blob/block) |
| Leader 頻寬 | 只需送 ~200 份 | 需送多份 |

Turbine 的核心優勢：Leader 只需要 200x 的頻寬（送給第一層），而非 N 倍頻寬廣播給所有節點。

### Shred 的 Merkle Proof

較新版本的 Turbine 為 shred 加入了 Merkle proof：

- 每個 shred 包含其在 Merkle tree 中的路徑證明
- 接收者可驗證 shred 確實屬於該 slot 的區塊
- 防止惡意節點偽造或修改 shred

## 程式碼範例

```typescript
import { Connection } from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");

// --- 1. 查詢區塊（Turbine 傳播的結果） ---
const slot = await connection.getSlot("confirmed");
const block = await connection.getBlock(slot, {
  maxSupportedTransactionVersion: 0,
  transactionDetails: "full",
});

if (block) {
  // block.transactions: Turbine 傳播的所有交易
  // block.blockHeight: 區塊高度
  // block.parentSlot: 父 slot
  const txCount = block.transactions.length;
  // 每筆交易都是從 shred 中重建的
}

// --- 2. 查詢 cluster 節點（Turbine tree 的參與者） ---
const clusterNodes = await connection.getClusterNodes();

for (const node of clusterNodes.slice(0, 3)) {
  // node.pubkey: validator identity
  // node.tpu: TPU 地址（接收交易）
  // node.rpc: RPC 地址
  // node.version: Solana 版本
  // Turbine 使用這些節點資訊建構 fan-out tree
}

// --- 3. 觀察 slot 狀態更新（反映 shred 接收情況） ---
const subscriptionId = connection.onSlotChange((slotInfo) => {
  // slotInfo.slot: 被更新的 slot
  // slotInfo.parent: 父 slot
  // slotInfo.root: 當前 root slot
  // slot 從 processed -> confirmed -> finalized
  // 反映了 shred 接收和重放的進度
});

// --- 4. 檢查 block production 統計 ---
const blockProduction = await connection.getBlockProduction();
// byIdentity: 每個 validator 的出塊統計
// range: 統計的 slot 範圍
// 可用於計算 skip rate（與 Turbine 傳播成功率相關）
```

## 相關概念

- [Proof of History](/solana/consensus/proof-of-history/) - Turbine 傳播的區塊包含 PoH hash chain
- [Leader Schedule](/solana/consensus/leader-schedule/) - Leader 產生區塊，啟動 Turbine 傳播
- [Tower BFT](/solana/consensus/tower-bft/) - Validator 接收 shred 後進行投票
- [Gulf Stream](/solana/consensus/gulf-stream/) - 交易進入 leader，Turbine 傳播出去
- [Alpenglow](/solana/consensus/alpenglow/) - Rotor 協議取代 Turbine 的一跳傳播
- [Validators and Staking](/solana/consensus/validators-staking/) - Stake 決定 Turbine tree 中的位置
- [Solana Transaction Lifecycle](/solana/transactions/transaction-lifecycle-solana/) - Turbine 在交易確認中的角色
- [Slots, Blocks, and Epochs](/solana/consensus/clock-and-slots/) - Shred 對應的時間結構
- [Broadcast and Validation (ETH)](/ethereum/transaction-lifecycle/broadcast-validation/) - Ethereum 的區塊傳播機制
