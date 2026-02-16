---
title: "共識與最終性"
description: "Consensus and Finality, 共識機制, 最終確認性"
tags: [ethereum, consensus, finality, PoS, Casper]
---

# 共識與最終性

## 概述

Ethereum PoS 的共識機制由兩個協議組成：[LMD GHOST](/ethereum/consensus/lmd-ghost/) 負責 fork choice（選擇鏈頭），[Casper FFG](/ethereum/consensus/casper-ffg/) 負責 finality（最終確認）。驗證者透過 [Attestation](/ethereum/consensus/attestation/) 同時為兩者投票。一筆交易被包含在區塊後，經過約 2 個 epoch（~12.8 分鐘），checkpoint 被 finalize，該交易獲得不可逆轉的最終性。

## 核心原理

### 雙層共識

```
LMD GHOST（fork choice）      Casper FFG（finality）
    │                              │
    ├── 每 slot 投票               ├── 每 epoch 邊界投票
    ├── 選出最新的鏈頭             ├── justify → finalize
    ├── 即時但可逆               ├── 延遲但不可逆
    └── 最重子樹原則              └── 2/3 超級多數決
```

### LMD GHOST

Latest Message Driven - Greedy Heaviest Observed SubTree：

1. 從最近一個 finalized checkpoint 開始
2. 每個分叉點，選擇累積 attestation 權重（stake）最大的子樹
3. 遞迴直到葉節點 = 鏈頭

每個驗證者的「最新訊息」（latest message）是他最近一次 attestation 指向的區塊。權重計算只考慮每個驗證者的最新投票，不累加歷史投票。

### Casper FFG

Casper the Friendly Finality Gadget 在 epoch 邊界運作：

**Checkpoint**：每個 epoch 第一個 slot 的區塊（或最近的非空區塊）

**投票**：每個驗證者在 attestation 中包含：
- `source`：目前認為的最新 justified checkpoint
- `target`：當前 epoch 的 checkpoint

**狀態轉移**：

$$\text{Genesis} \xrightarrow{\text{justify}} \text{Justified} \xrightarrow{\text{finalize}} \text{Finalized}$$

具體規則：

1. **Justify**：當一個 checkpoint 收到 2/3 以上 total effective balance 的 `target` 投票
2. **Finalize**：當 checkpoint $C$ 被 justified，且 $C$ 的下一個 epoch 的 checkpoint 也被 justified，則 $C$ 被 finalized

正常情況下的時序：

```
Epoch N         Epoch N+1       Epoch N+2
  │               │               │
  C_N             C_{N+1}         C_{N+2}
  │               │               │
  └── justified ──┘── justified ──┘
                  │
            C_N finalized
```

一個 checkpoint 從被 justified 到被 finalized，需要再等一個 epoch（~6.4 分鐘）。所以 finality 延遲 = 2 epochs = ~12.8 分鐘。

### Attestation 結構

每個 attestation 包含：

```
AttestationData:              # Pectra 後（EIP-7549）
  slot: uint64                    # 投票的 slot
  beacon_block_root: bytes32      # LMD GHOST 投票（指向哪個區塊）
  source: Checkpoint              # FFG source（最新 justified）
  target: Checkpoint              # FFG target（當前 epoch checkpoint）

Checkpoint:
  epoch: uint64
  root: bytes32
```

注意：Pectra 升級後 `index`（committee index）已從 `AttestationData` 移出（EIP-7549），改為外層的 `committee_bits` bitfield，使跨 committee 聚合成為可能，減少約 98% 的鏈上 attestation 開銷。

一次 attestation 同時完成兩件事：
- `beacon_block_root` = LMD GHOST 投票
- `source` + `target` = Casper FFG 投票

### 聚合簽章

同一 committee 中投相同內容的 attestation 可以聚合：

1. 使用 [BLS Signatures](/ethereum/cryptography/bls-signatures/) 的聚合特性
2. 多個簽章合併為一個，大幅減少資料量
3. 聚合後的 attestation 包含一個 bitfield，標記哪些驗證者參與

$$\sigma_{agg} = \sum_{i \in S} \sigma_i$$

驗證聚合簽章只需一次 pairing 運算，而非 $|S|$ 次獨立驗證。

### Finality 保證

Casper FFG 的安全性建立在 slashing 條件上。驗證者違反以下任一規則會被 [罰沒](/ethereum/consensus/slashing/)：

1. **Double vote**：在同一 epoch 為不同 target 投票
2. **Surround vote**：投票 $(s_1, t_1)$ 包圍了另一票 $(s_2, t_2)$，即 $s_1 < s_2 < t_2 < t_1$

這兩條規則保證：如果有兩個衝突的 finalized checkpoint，至少 1/3 的驗證者違規被罰沒。Pectra 後單一 validator 可質押至 2048 ETH（EIP-7251），validator 數量可能減少但單位質押量增加，安全性不變。

### Inactivity Leak

如果超過 4 個 epoch 沒有新的 finalization（例如 1/3 驗證者離線），啟動 inactivity leak：

- 離線驗證者的餘額逐漸被扣減
- 在線驗證者的相對權重增加
- 最終在線驗證者超過 2/3，重新恢復 finality
- 這保證了 liveness -- 即使大規模節點故障，網路最終能恢復

## Pectra/Fusaka 升級更新（2025）

### Pectra（2025/5/7）對共識的影響

- **EIP-6110**：驗證者存款直接寫入 execution payload，新 validator 入場延遲從約 12 小時降至約 13 分鐘。validator 集合變動更快反映在共識中。
- **EIP-7002**：從 EL 觸發 validator 退出，withdrawal credential 持有者無需 BLS key 即可退出。退出後的餘額重新分配更靈活。
- **EIP-7251**：`MAX_EFFECTIVE_BALANCE` 提升至 2048 ETH，大型質押者可合併 validator，減少 validator set 大小。較小的 validator set 意味著 attestation 聚合和 epoch processing 的效率提升。
- **EIP-7549**：committee index 移出 attestation data，跨 committee 聚合減少 98% 的鏈上 attestation 開銷，降低 Beacon Block 大小與驗證成本。

### Fusaka（2025/12/3）對共識的影響

- **EIP-7917**：proposer 預測透明化，改善 validator 對出塊排程的可見度，間接提升 fork choice 穩定性。

## 在 Ethereum 中的應用

- **交易所入金**：通常等待 finality（~12.8 min）才確認入帳
- **跨鏈橋**：依賴 finality 來確認來源鏈的交易
- **DeFi 協議**：部分操作在 1 confirmation 後即可，但清算等高價值操作應等 finality
- **L2 Sequencer**：將 batch 提交到 L1 後，需等 L1 finality 才算最終確認

## 程式碼範例

```javascript
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider('http://localhost:8545');

// --- 1. 查看各階段的區塊 ---
const [latest, safe, finalized] = await Promise.all([
  provider.getBlock('latest'),
  provider.getBlock('safe'),       // justified
  provider.getBlock('finalized'),  // finalized
]);

console.log('Latest block:', latest.number);
console.log('Safe block:', safe.number, `(${latest.number - safe.number} blocks behind)`);
console.log('Finalized block:', finalized.number, `(${latest.number - finalized.number} blocks behind)`);

// --- 2. 檢查交易是否已 finalized ---
async function isFinalized(txHash) {
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) return { status: 'not found' };

  const finalizedBlock = await provider.getBlock('finalized');
  if (receipt.blockNumber <= finalizedBlock.number) {
    return { status: 'finalized', block: receipt.blockNumber };
  }

  const safeBlock = await provider.getBlock('safe');
  if (receipt.blockNumber <= safeBlock.number) {
    return { status: 'justified (safe)', block: receipt.blockNumber };
  }

  return {
    status: 'confirmed but not finalized',
    block: receipt.blockNumber,
    blocksToFinality: receipt.blockNumber - finalizedBlock.number,
  };
}

// --- 3. 等待 finality ---
async function waitForFinality(txHash, pollInterval) {
  const interval = pollInterval || 12000;
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) throw new Error('Transaction not found');

  return new Promise((resolve) => {
    const check = async () => {
      const finalizedBlock = await provider.getBlock('finalized');
      if (receipt.blockNumber <= finalizedBlock.number) {
        resolve({ finalized: true, block: receipt.blockNumber });
      } else {
        setTimeout(check, interval);
      }
    };
    check();
  });
}

// --- 4. Beacon API 查看 finality checkpoint ---
// const beaconUrl = 'http://localhost:5052';
// const resp = await fetch(`${beaconUrl}/eth/v1/beacon/states/head/finality_checkpoints`);
// const data = await resp.json();
// console.log('Justified epoch:', data.data.current_justified.epoch);
// console.log('Finalized epoch:', data.data.finalized.epoch);
```

## 相關概念

- [交易生命週期](/ethereum/transaction-lifecycle/transaction-lifecycle/) - 本筆記是流程第七步
- [區塊生產](/ethereum/transaction-lifecycle/block-production/) - 流程上一步：區塊被 proposer 產出
- [狀態轉換](/ethereum/transaction-lifecycle/state-transition/) - 流程下一步：finalized 區塊中的交易結果永久生效
- [Casper FFG](/ethereum/consensus/casper-ffg/) - Finality gadget 的完整規格
- [LMD GHOST](/ethereum/consensus/lmd-ghost/) - Fork choice rule
- [Attestation](/ethereum/consensus/attestation/) - 驗證者投票機制
- [Beacon Chain](/ethereum/consensus/beacon-chain/) - 共識層運作
- [Validators](/ethereum/consensus/validators/) - 驗證者角色與責任
- [BLS Signatures](/ethereum/cryptography/bls-signatures/) - 聚合簽章技術
- [BLS12-381](/ethereum/cryptography/bls12-381/) - BLS 使用的曲線
- [Slashing](/ethereum/consensus/slashing/) - 懲罰機制保障安全性
- [RANDAO](/ethereum/consensus/randao/) - 隨機性來源
