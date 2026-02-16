---
title: "Attestation"
description: "Attestation, 見證, 投票"
tags: [ethereum, consensus, pos, attestation, voting]
---

# Attestation

## 概述

Attestation 是 [Validators](/ethereum/consensus/validators/) 在 [Beacon Chain](/ethereum/consensus/beacon-chain/) 上對區塊的投票行為。每個 attestation 包含三個投票：source（上一個 justified checkpoint）、target（當前 epoch 的 checkpoint）、head（鏈頭區塊）。前兩者驅動 [Casper FFG](/ethereum/consensus/casper-ffg/) 的 finality，後者驅動 [LMD GHOST](/ethereum/consensus/lmd-ghost/) 的 fork choice。Attestation 透過 [BLS Signatures](/ethereum/cryptography/bls-signatures/) 聚合壓縮，降低網路與儲存開銷。

## 核心原理

### Attestation 結構

```
AttestationData:
  slot: Slot                       # 投票的 slot
  index: CommitteeIndex            # committee 編號
  beacon_block_root: Root          # head vote - 鏈頭區塊 root
  source: Checkpoint               # source vote - justified checkpoint
    epoch: Epoch
    root: Root
  target: Checkpoint               # target vote - 當前 epoch checkpoint
    epoch: Epoch
    root: Root
```

完整的 Attestation 還包含：

| 欄位 | 說明 |
|------|------|
| `aggregation_bits` | Bitfield，標記 committee 中哪些 validator 投了這票 |
| `data` | 上述 AttestationData |
| `signature` | 聚合的 [BLS Signatures](/ethereum/cryptography/bls-signatures/) |

### 三個投票的語義

**Head vote**（`beacon_block_root`）：
- 指向 validator 認為的 canonical chain head
- 驅動 [LMD GHOST](/ethereum/consensus/lmd-ghost/) fork choice
- 獎勵條件：與最終確定的 head 一致

**Source vote**（`source`）：
- 指向 validator 知道的最新 justified checkpoint
- 必須與 [Beacon Chain](/ethereum/consensus/beacon-chain/) state 中的 `current_justified_checkpoint` 或 `previous_justified_checkpoint` 一致
- 驅動 [Casper FFG](/ethereum/consensus/casper-ffg/) justification

**Target vote**（`target`）：
- 指向當前 epoch 的第一個 slot 對應的區塊
- 驅動 [Casper FFG](/ethereum/consensus/casper-ffg/) finalization
- 獎勵條件：target epoch 的區塊確實在 canonical chain 上

### Attestation 時序

在一個 slot（12 秒）內：

| 時間 | 事件 |
|------|------|
| t=0s | Slot 開始，proposer 廣播區塊 |
| t=4s | Attestation deadline：attester 根據看到的資訊投票 |
| t=8s | Aggregation deadline：aggregator 收集並聚合 attestation |
| t=12s | 下一個 slot，aggregated attestation 可被下一個 proposer 收錄 |

Attestation 收錄越早越好。最佳情況是被下一個 slot 的區塊收錄（inclusion delay = 1）。最晚必須在同一 epoch 結束前被收錄。

### Aggregation

為什麼要聚合：如果每個 validator 的 attestation 都獨立傳播和儲存，每個 epoch 會有幾十萬筆簽名。透過 BLS aggregation 大幅壓縮。

聚合流程：

1. 每個 committee 隨機選出幾個 **aggregator**
2. Aggregator 判定條件：$\text{hash}(\text{slot\_signature}) \mod \frac{\text{committee\_size}}{16} = 0$
3. Aggregator 收集同一 `AttestationData` 的所有 attestation
4. 合併 `aggregation_bits`（OR 運算）
5. 聚合 BLS 簽名：$\sigma_{agg} = \sigma_1 + \sigma_2 + ... + \sigma_n$

聚合後，一個 attestation 可以代表整個 committee 的投票，驗證時只需一次 pairing check：

$$e(\sigma_{agg}, g_2) = e(H(m), \sum_{i} pk_i)$$

其中 $H(m)$ 是 attestation data 的 hash-to-curve 結果。

### 獎勵計算

Attestation 獎勵由 base reward 和各投票的 weight 決定：

$$\text{base\_reward} = \frac{\text{effective\_balance} \times \text{BASE\_REWARD\_FACTOR}}{\sqrt{\text{total\_active\_balance}}}$$

各投票的 weight（Altair 後）：

| 投票 | Weight | 名稱 |
|------|--------|------|
| Source | 14 | `TIMELY_SOURCE_WEIGHT` |
| Target | 26 | `TIMELY_TARGET_WEIGHT` |
| Head | 14 | `TIMELY_HEAD_WEIGHT` |

總 weight 分母為 64（`WEIGHT_DENOMINATOR`）。

各投票的獎勵：

$$\text{reward}_{\text{flag}} = \frac{\text{base\_reward} \times \text{flag\_weight}}{\text{WEIGHT\_DENOMINATOR}} \times \frac{\text{unslashed\_participating\_balance}}{\text{total\_active\_balance}}$$

「timely」意味著 attestation 必須在下一個 epoch 之前被收錄。

## Pectra 升級更新（2025）

### EIP-7549：Committee Index 移出 Attestation Message（2025/5/7，epoch 364032）

Pectra 升級中的 EIP-7549 將 `index`（committee index）欄位從 `AttestationData` 移出。調整後的結構：

```
AttestationData:
  slot: Slot                       # 投票的 slot
  beacon_block_root: Root          # head vote
  source: Checkpoint               # source vote
  target: Checkpoint               # target vote
```

`committee_bits` 改為在外層 `Attestation` 物件中以 bitfield 表示，與 `aggregation_bits` 並列。

**影響**：
- 不同 committee 但投相同 slot/source/target/head 的 attestation 現在擁有相同的 `AttestationData`
- 這使得跨 committee 聚合成為可能，大幅提升 BLS 聚合效率
- 鏈上 attestation 數量減少約 98%，顯著降低 [Beacon Chain](/ethereum/consensus/beacon-chain/) 的頻寬和儲存開銷
- Proposer 在區塊中需要收錄的 attestation 物件數量大幅下降

## 在 Ethereum 中的應用

### 對 Finality 的影響

每個 epoch 結束時，Beacon Chain 統計所有 attestation：

- 如果 target vote 正確的 validator 的 effective balance 總和 $\geq \frac{2}{3}$ 總質押量 -> checkpoint 被 justified
- 連續兩個 epoch 的 checkpoint 被 justified -> 前一個被 finalized

詳見 [Casper FFG](/ethereum/consensus/casper-ffg/)。

### 對 Fork Choice 的影響

[LMD GHOST](/ethereum/consensus/lmd-ghost/) 使用每個 validator 的最新 attestation（latest message）來決定 fork choice：

- 每個 validator 的 head vote 為對應區塊及其祖先增加 weight
- 從最新 justified checkpoint 開始，每個 fork point 選 weight 最大的分支

### 網路傳播

Attestation 在 gossip 網路中傳播：
- 未聚合的 attestation 走 `beacon_attestation_{subnet_id}` topic
- 聚合後的 attestation 走 `beacon_aggregate_and_proof` topic
- Subnet 的分配與 committee 相關，確保資訊傳播效率

## 程式碼範例

```python
# Attestation 獎勵計算
from math import isqrt

BASE_REWARD_FACTOR = 64
TIMELY_SOURCE_WEIGHT = 14
TIMELY_TARGET_WEIGHT = 26
TIMELY_HEAD_WEIGHT = 14
WEIGHT_DENOMINATOR = 64

def compute_base_reward(effective_balance: int, total_active_balance: int) -> int:
    return (
        effective_balance * BASE_REWARD_FACTOR
        // isqrt(total_active_balance)
    )

def compute_attestation_reward(
    effective_balance: int,
    total_active_balance: int,
    flag_weight: int,
    unslashed_participating_balance: int,
) -> int:
    base_reward = compute_base_reward(effective_balance, total_active_balance)
    return (
        base_reward
        * flag_weight
        // WEIGHT_DENOMINATOR
        * unslashed_participating_balance
        // total_active_balance
    )
```

```javascript
// 解析 Beacon API 回傳的 attestation
async function getSlotAttestations(beaconUrl, slot) {
  const res = await fetch(
    `${beaconUrl}/eth/v1/beacon/blocks/${slot}/attestations`
  );
  const data = await res.json();

  return data.data.map((att) => ({
    slot: att.data.slot,
    committeeIndex: att.data.index,
    beaconBlockRoot: att.data.beacon_block_root,
    source: {
      epoch: att.data.source.epoch,
      root: att.data.source.root,
    },
    target: {
      epoch: att.data.target.epoch,
      root: att.data.target.root,
    },
    // 計算參與的 validator 數量
    participantCount: att.aggregation_bits
      .slice(2)  // 去掉 0x prefix
      .split("")
      .reduce((acc, hex) => acc + popcount(parseInt(hex, 16)), 0),
  }));
}

function popcount(n) {
  let count = 0;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}
```

## 相關概念

- [Validators](/ethereum/consensus/validators/) - 產生 attestation 的主體
- [Beacon Chain](/ethereum/consensus/beacon-chain/) - Attestation 的收集與處理環境
- [Casper FFG](/ethereum/consensus/casper-ffg/) - Source/target vote 驅動的 finality 機制
- [LMD GHOST](/ethereum/consensus/lmd-ghost/) - Head vote 驅動的 fork choice rule
- [BLS Signatures](/ethereum/cryptography/bls-signatures/) - Attestation 簽名與聚合方案
- [BLS12-381](/ethereum/cryptography/bls12-381/) - 底層橢圓曲線
- [Slashing](/ethereum/consensus/slashing/) - 矛盾 attestation 導致的懲罰
- [區塊結構](/ethereum/consensus/block-structure/) - Attestation 被收錄在 BeaconBlockBody 中
- [共識與最終性](/ethereum/transaction-lifecycle/consensus-finality/) - 交易流程中 attestation 的角色
