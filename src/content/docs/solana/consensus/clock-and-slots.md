---
title: "Slots, Blocks, and Epochs"
description: "Solana Slots, Blocks, Epochs, clock, skip rate, blockhash, timing"
tags: [solana, consensus, slots, blocks, epochs, clock, timing]
---

# Slots, Blocks, and Epochs

## 概述

Solana 的時間系統由三個層級的單位組成：**Slot**（約 400ms，區塊生產的基本單位）、**Block**（由 leader 在其 slot 中產生的實際區塊）、和 **Epoch**（432,000 slots，約 2-3 天，stake 和 [leader schedule](/solana/consensus/leader-schedule/) 更新的週期）。並非每個 slot 都有區塊——leader 可能因離線或效能問題而 skip slot，全網 skip rate 約 5%。Recent blockhash 作為交易的有效期標記，在 300 slots（~2 分鐘）後過期。

## 核心原理

### 時間單位層級

```
Epoch (432,000 slots, ~2-3 days)
  |
  +-- Slot 0-3     (Leader A, 4 consecutive slots)
  |     +-- Block 0  (produced)
  |     +-- Block 1  (produced)
  |     +-- Slot 2   (skipped - no block)
  |     +-- Block 3  (produced)
  |
  +-- Slot 4-7     (Leader B, 4 consecutive slots)
  |     +-- Block 4  (produced)
  |     +-- Block 5  (produced)
  |     +-- Block 6  (produced)
  |     +-- Block 7  (produced)
  |
  +-- ...
  |
  +-- Slot 431,996-431,999 (Last leader of epoch)
```

### Slot

| 屬性 | 值 |
|------|-----|
| 目標時長 | 400ms |
| 用途 | 區塊生產的時間窗口 |
| 編號 | 自 genesis 以來的累計編號 |
| PoH ticks | 每 slot 包含固定數量的 [PoH](/solana/consensus/proof-of-history/) ticks |

每個 slot 被分配給一位 leader validator。Leader 有 400ms 的窗口來：
1. 接收交易（via [Gulf Stream](/solana/consensus/gulf-stream/)）
2. 執行交易（via [SVM/Sealevel](/solana/runtime/svm-sealevel/)）
3. 產生 PoH hash chain
4. 創建 shred 並透過 [Turbine](/solana/consensus/turbine/) 傳播

### Block

Block 是 leader 在其 slot 中實際產出的內容：

| 屬性 | 說明 |
|------|------|
| Slot | 所屬的 slot 編號 |
| Blockhash | 該區塊最後一個 PoH hash |
| Parent slot | 前一個成功出塊的 slot |
| Transactions | 包含的交易列表 |
| Block height | 自 genesis 以來的區塊計數（不含 skip） |

Slot 和 block height 的差異：
- Slot 是連續遞增的（即使沒有區塊）
- Block height 只計算成功產出的區塊
- `block_height <= slot`，差距等於被 skip 的 slot 數

### Skip Rate

| 項目 | 值 |
|------|-----|
| 全網平均 skip rate | ~5% |
| 優秀 validator | <2% |
| 差的 validator | >10% |
| Skip 原因 | 離線、效能不足、網路延遲 |

Skip slot 不包含任何交易或區塊。下一個 leader 的區塊會以跳過的 slot 的前一個有效區塊為 parent。

### Epoch

| 屬性 | 值 |
|------|-----|
| Slots per epoch | 432,000 |
| 時長 | ~2-3 天（受 skip rate 影響） |
| Epoch 事件 | Leader schedule 更新、stake delegation 生效/解除、獎勵分配 |

Epoch boundary 事件：

1. **Leader schedule 生成**：基於 epoch 開始時的 stake 快照
2. **Stake activation/deactivation**：委託變更在 epoch boundary 生效
3. **Rewards distribution**：前一 epoch 的 staking rewards 在 epoch 起始時分配
4. **Rent collection**：帳戶 rent 在 epoch 中被收取（已轉為 rent-exempt 為主）

### Recent Blockhash 和交易有效期

| 項目 | 值 |
|------|-----|
| Blockhash 有效期 | 300 slots（~2 分鐘） |
| 來源 | 任何最近 300 slots 內的區塊 blockhash |
| 用途 | 交易防重放 + 有效期控制 |
| 替代方案 | Durable nonce（無過期） |

交易中的 `recentBlockhash` 必須是最近 300 個 slot 內的某個 blockhash，否則交易被視為過期並拒絕。這是 [Transaction Errors](/solana/transactions/transaction-errors/) 中最常見的錯誤之一。

### 與 Ethereum 的時間比較

| 概念 | Solana | Ethereum |
|------|--------|----------|
| Slot 時長 | ~400ms | 12 秒 |
| Epoch | 432,000 slots (~2-3 天) | 32 slots (~6.4 分鐘) |
| Block/Slot | 一一對應（可 skip） | 一一對應（可 miss） |
| Finality 時間 | ~6.4s rooted / ~150ms (Alpenglow) | ~12.8 分鐘 |
| TX 有效期 | 300 slots (~2 min) | 無固定（nonce based） |

### 實際時間 vs 理論時間

| 項目 | 理論值 | 實際值 |
|------|--------|--------|
| Slot 時長 | 400ms | 350-450ms（波動） |
| Epoch 時長 | 172,800s (2 天) | ~2-3 天（受 skip 影響） |
| 年 slot 數 | 78,840,000 | ~75,000,000 |

Solana 的時鐘並非嚴格精確——PoH 的 hash rate 受硬體效能影響，不同 leader 的 slot 時長可能略有不同。

## 程式碼範例

```typescript
import { Connection } from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");

// --- 1. 查詢基本時間資訊 ---
const slot = await connection.getSlot("confirmed");
const blockHeight = await connection.getBlockHeight("confirmed");
const blockTime = await connection.getBlockTime(slot);
const epochInfo = await connection.getEpochInfo();

// slot vs blockHeight 差距 = 歷史總 skip 數
const totalSkips = slot - blockHeight;

// --- 2. Epoch 詳細資訊 ---
// epochInfo.epoch: 當前 epoch 編號
// epochInfo.slotIndex: epoch 內的進度
// epochInfo.slotsInEpoch: 432,000
// epochInfo.absoluteSlot: 總 slot 數

const epochProgress = epochInfo.slotIndex / epochInfo.slotsInEpoch;
const slotsUntilNextEpoch = epochInfo.slotsInEpoch - epochInfo.slotIndex;
const estimatedSecondsRemaining = slotsUntilNextEpoch * 0.4;

// --- 3. Blockhash 有效期管理 ---
async function isBlockhashValid(blockhash: string): Promise<boolean> {
  const result = await connection.isBlockhashValid(blockhash, {
    commitment: "processed",
  });
  return result.value;
}

// 安全地取得 blockhash 並追蹤其有效期
async function getBlockhashWithExpiry() {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  return {
    blockhash,
    lastValidBlockHeight,
    // 交易必須在 lastValidBlockHeight 之前被確認
  };
}

// --- 4. 計算兩個 slot 之間的時間差 ---
async function estimateTimeBetweenSlots(
  slotA: number,
  slotB: number
): Promise<number> {
  const timeA = await connection.getBlockTime(slotA);
  const timeB = await connection.getBlockTime(slotB);
  if (timeA === null || timeB === null) {
    // slot 可能被 skip，使用估算值
    return Math.abs(slotB - slotA) * 0.4;
  }
  return Math.abs(timeB - timeA);
}

// --- 5. Epoch Schedule 資訊 ---
const epochSchedule = await connection.getEpochSchedule();
// epochSchedule.slotsPerEpoch: 432,000
// epochSchedule.firstNormalEpoch: warmup 後的第一個正常 epoch
// epochSchedule.firstNormalSlot: 對應的 slot

// 計算某 slot 屬於哪個 epoch
function getEpochForSlot(targetSlot: number, slotsPerEpoch: number): number {
  return Math.floor(targetSlot / slotsPerEpoch);
}

// --- 6. 監聽 slot 變化 ---
const slotSubscription = connection.onSlotChange((slotInfo) => {
  // slotInfo.slot: 最新 slot
  // slotInfo.parent: 父 slot
  // slotInfo.root: 當前 finalized slot
});
```

## 相關概念

- [Proof of History](/solana/consensus/proof-of-history/) - PoH ticks 定義 slot 的內部時鐘
- [Leader Schedule](/solana/consensus/leader-schedule/) - 每個 epoch 的 leader 分配排程
- [Tower BFT](/solana/consensus/tower-bft/) - 投票的 lockout 以 slot 為單位計算
- [Alpenglow](/solana/consensus/alpenglow/) - 改變 finality 速度的新共識
- [Transaction Errors](/solana/transactions/transaction-errors/) - Blockhash 過期是最常見的錯誤
- [Validators and Staking](/solana/consensus/validators-staking/) - Stake 變更在 epoch boundary 生效
- [Gulf Stream](/solana/consensus/gulf-stream/) - 交易在 slot 時間內被轉發到 leader
- [Turbine](/solana/consensus/turbine/) - 區塊在 slot 內透過 shred 傳播
- [Transaction Anatomy](/solana/transactions/transaction-anatomy/) - Blockhash 在交易結構中的位置
- [Beacon Chain (ETH)](/ethereum/consensus/beacon-chain/) - Ethereum 的 slot/epoch 時間系統
