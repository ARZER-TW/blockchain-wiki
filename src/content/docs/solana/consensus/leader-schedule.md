---
title: "Leader Schedule"
description: "Leader Schedule, 出塊者排程, stake-weighted rotation, epoch, slot assignment"
tags: [solana, consensus, leader-schedule, epoch, validators, stake]
---

# Leader Schedule

## 概述

Solana 的 leader schedule 是一個確定性的出塊者輪換機制——每個 epoch（432,000 slots，約 2-3 天）開始時，根據 validator 的 stake 權重隨機生成該 epoch 的完整出塊排程。每位被選中的 leader 連續生產 4 個 slot 的區塊。由於排程是提前已知的，[Gulf Stream](/solana/consensus/gulf-stream/) 可以將交易直接轉發給即將成為 leader 的 validator，消除了全域 mempool 的需求。

## 核心原理

### 排程生成

Leader schedule 在每個 epoch 開始前生成：

1. 取得前一個 epoch 結束時的 stake distribution 快照
2. 使用確定性的偽隨機演算法，按 stake 權重分配 slot
3. 每個 leader 被分配連續 4 個 slot（leader slot）

$$P(\text{validator } v \text{ 被選為某 slot 的 leader}) = \frac{\text{stake}_v}{\text{total\_stake}}$$

更高 stake 的 validator 在一個 epoch 中會被分配到更多的 leader slot。

### Epoch 結構

| 項目 | 值 |
|------|-----|
| Slots per epoch | 432,000 |
| Slot 時長 | ~400ms |
| Epoch 時長 | ~2-3 天 |
| Leader 連續 slot | 4 |
| 每 epoch 的 leader 輪次 | 108,000（432,000 / 4） |

### 確定性與可預測性

Leader schedule 的確定性是 Solana 架構的關鍵設計：

- **所有 validator 計算出相同的排程**：使用相同的 stake snapshot 和隨機種子
- **Client 可以提前知道 leader**：RPC 節點公開 `getLeaderSchedule`
- **Gulf Stream 依賴此特性**：交易直送 leader 而非廣播到 mempool

### 連續 4 Slot 的設計

為什麼每位 leader 連續產生 4 個 slot？

1. **減少 leader 切換開銷**：validator 準備出塊需要一定啟動時間
2. **提高管線效率**：TPU pipeline 可以連續處理交易
3. **降低 skip rate**：給 leader 更多機會成功出塊
4. **容錯**：即使前 1-2 個 slot 有問題，後續 slot 仍可恢復

### Skip Rate

並非所有 leader slot 都成功產出區塊：

| 項目 | 說明 |
|------|------|
| Skip | Leader 未在分配的 slot 中產生有效區塊 |
| Skip rate | 全網平均約 5% |
| 原因 | Leader 離線、網路延遲、效能不足 |
| 影響 | 跳過的 slot 無區塊，下一個 leader 接手 |

Skip rate 是衡量 validator 表現的重要指標，過高的 skip rate 會導致 delegator 轉移 stake。

### Stake-Weighted 選擇

排程演算法確保 stake 比例對應出塊機會：

```
範例：3 個 validator
  A: 50% stake -> ~216,000 slots / epoch (~54,000 leader 輪次)
  B: 30% stake -> ~129,600 slots / epoch (~32,400 leader 輪次)
  C: 20% stake -> ~86,400 slots / epoch  (~21,600 leader 輪次)
```

### 與 Ethereum RANDAO 的比較

| 特性 | Solana Leader Schedule | Ethereum RANDAO |
|------|----------------------|-----------------|
| 排程單位 | Epoch (432K slots) | Epoch (32 slots) |
| 可預測性 | 整個 epoch 已知 | 只知道一個 epoch |
| 連續出塊 | 4 slots | 1 slot |
| 隨機源 | Stake snapshot + seed | RANDAO mix |
| 公開程度 | 完全公開 | 下一個 epoch 才完整公開 |

## 程式碼範例

```typescript
import { Connection, PublicKey } from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");

// --- 1. 查詢當前 epoch 的 leader schedule ---
const leaderSchedule = await connection.getLeaderSchedule();

if (leaderSchedule) {
  // leaderSchedule 是一個 Map: validator identity -> slot indices[]
  for (const [validator, slots] of Object.entries(leaderSchedule)) {
    // 每個 validator 在此 epoch 中分配到的 slot 列表
    // slots 是相對於 epoch 起始的索引
    break; // 只看第一個
  }
}

// --- 2. 查詢特定 slot 的 leader ---
const slot = await connection.getSlot();
const slotLeaders = await connection.getSlotLeaders(slot, 10);
// 回傳從 slot 開始的 10 個連續 slot 的 leader public key

// --- 3. 查詢 epoch 資訊 ---
const epochInfo = await connection.getEpochInfo();
// epochInfo.epoch: 當前 epoch 編號
// epochInfo.slotIndex: 當前 epoch 中的 slot 索引
// epochInfo.slotsInEpoch: 每 epoch 的 slot 數 (432,000)
// epochInfo.absoluteSlot: 自 genesis 以來的總 slot 數
// epochInfo.transactionCount: 總交易數

// --- 4. 計算下一個 epoch 何時開始 ---
const slotsRemaining = epochInfo.slotsInEpoch - epochInfo.slotIndex;
const secondsRemaining = slotsRemaining * 0.4; // ~400ms per slot
const nextEpochTime = new Date(Date.now() + secondsRemaining * 1000);

// --- 5. 查詢 validator 的 leader slot 統計 ---
const epochSchedule = await connection.getEpochSchedule();
// epochSchedule.slotsPerEpoch: 432,000
// epochSchedule.leaderScheduleSlotOffset: leader schedule 的提前計算偏移
// epochSchedule.warmup: 前幾個 epoch 的 warmup 期
// epochSchedule.firstNormalEpoch: warmup 結束後的第一個正常 epoch
// epochSchedule.firstNormalSlot: 對應的第一個正常 slot

// --- 6. 找到某 validator 下一次當 leader 的時間 ---
async function findNextLeaderSlot(
  validatorIdentity: string,
  currentSlot: number
): Promise<number | null> {
  const leaders = await connection.getSlotLeaders(currentSlot, 200);
  for (let i = 0; i < leaders.length; i++) {
    if (leaders[i].toBase58() === validatorIdentity) {
      return currentSlot + i;
    }
  }
  return null;
}
```

## 相關概念

- [Proof of History](/solana/consensus/proof-of-history/) - Leader 在分配的 slot 中產生 PoH hash chain
- [Gulf Stream](/solana/consensus/gulf-stream/) - 利用 leader schedule 的可預測性轉發交易
- [Validators and Staking](/solana/consensus/validators-staking/) - Stake 權重決定出塊機會
- [Tower BFT](/solana/consensus/tower-bft/) - 投票與 fork choice 依賴 leader 排程
- [Slots, Blocks, and Epochs](/solana/consensus/clock-and-slots/) - Leader schedule 的時間框架
- [Turbine](/solana/consensus/turbine/) - Leader 產出的區塊如何傳播
- [Alpenglow](/solana/consensus/alpenglow/) - 新共識下 leader 角色的變化
- [Solana Transaction Lifecycle](/solana/transactions/transaction-lifecycle-solana/) - Leader 在交易處理中的角色
- [RANDAO (ETH)](/ethereum/consensus/randao/) - Ethereum 的隨機出塊者選擇機制
