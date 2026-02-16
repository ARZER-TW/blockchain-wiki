---
title: "Beacon Chain"
description: "Beacon Chain, 信標鏈, CL"
tags: [ethereum, consensus, pos, beacon-chain, consensus-layer]
---

# Beacon Chain

## 概述

Beacon Chain 是 Ethereum 的 Consensus Layer，2020 年 12 月上線，The Merge 後正式成為主鏈共識引擎。它管理 [Validators](/ethereum/consensus/validators/) 註冊表、slot/epoch 時間分配、[Attestation](/ethereum/consensus/attestation/) 收集、[RANDAO](/ethereum/consensus/randao/) 隨機數產生，並透過 [Casper FFG](/ethereum/consensus/casper-ffg/) + [LMD GHOST](/ethereum/consensus/lmd-ghost/) 達成共識與最終性。

## 核心原理

### 時間劃分

Beacon Chain 把時間切成固定單位：

| 單位 | 長度 | 說明 |
|------|------|------|
| **Slot** | 12 秒 | 最小時間單位，每個 slot 最多一個區塊 |
| **Epoch** | 32 slots = 6.4 分鐘 | 一輪完整的 attestation 週期 |

Slot 從 0 開始編號，epoch $e$ 包含 slot $[32e, 32e + 31]$。

### Proposer 選擇

每個 slot 有一個 proposer，選擇過程：

1. 取當前 epoch 的 [RANDAO](/ethereum/consensus/randao/) seed
2. 對 active validator 集合做確定性 shuffle（Fisher-Yates，使用 swap-or-not 網路）
3. 按 effective balance 加權的偽隨機選擇

加權公式讓 effective balance 較高的 validator 更可能被選為 proposer。Pectra 升級前有效餘額上限為 32 ETH，大戶需要跑多個 validator；Pectra 後上限提升至 2048 ETH（EIP-7251），單一 validator 可承載更多質押。

### Committee 分配

每個 epoch 開始時，所有 active validator 被分配到 32 個 slot 的 committee：

1. Shuffle 所有 validator（用 epoch 的 RANDAO seed）
2. 平均分成 32 組，每組對應一個 slot
3. 每個 slot 的 validator 再細分為多個 committee（最多 64 個）
4. 每個 committee 至少 128 個 validator

Committee 成員在其分配的 slot 進行 [Attestation](/ethereum/consensus/attestation/)。

### State Transition

Beacon Chain 維護一個 `BeaconState`，每個 slot 進行 state transition：

$$\text{state}_{n+1} = \text{state\_transition}(\text{state}_n, \text{block}_n)$$

State transition 分為三步：

1. **Slot processing**：即使沒有區塊也要執行
   - 更新 state slot number
   - 處理 cache 過期

2. **Epoch processing**（每 32 slots 一次）：
   - 計算 attestation 獎勵與懲罰
   - 更新 [Casper FFG](/ethereum/consensus/casper-ffg/) justification/finalization
   - 處理 validator activation/exit queue
   - 更新 effective balances
   - 重置 RANDAO mix
   - 計算 sync committee

3. **Block processing**：
   - 驗證 proposer 簽名（[BLS Signatures](/ethereum/cryptography/bls-signatures/)）
   - 更新 [RANDAO](/ethereum/consensus/randao/) reveal
   - 處理 [Attestation](/ethereum/consensus/attestation/)
   - 處理 [Slashing](/ethereum/consensus/slashing/) 證據
   - 處理存款和退出

### Beacon State 主要欄位

| 欄位 | 說明 |
|------|------|
| `slot` | 當前 slot |
| `validators` | 完整 validator 列表 |
| `balances` | 各 validator 餘額 |
| `randao_mixes` | 最近 256 個 epoch 的 RANDAO mix |
| `slashings` | 各 epoch 的 slashing 總量 |
| `previous_epoch_attestations` | 前一 epoch 的 attestation |
| `current_epoch_attestations` | 當前 epoch 的 attestation |
| `justification_bits` | 最近 4 個 epoch 的 justification 狀態 |
| `finalized_checkpoint` | 最新 finalized checkpoint |
| `current_sync_committee` | 當前 sync committee |

State 使用 [SSZ 編碼](/ethereum/data-structures/ssz-encoding/) 序列化，root hash 記錄在 [區塊結構](/ethereum/consensus/block-structure/) 的 `state_root` 欄位。

### Sync Committee

每 256 個 epoch（約 27 小時）隨機選出 512 個 validator 組成 sync committee。他們的工作是簽署每個 slot 的 head block，讓輕節點可以用少量簽名驗證鏈的狀態，無需下載所有 attestation。

## 在 Ethereum 中的應用

### 出塊流程

一個 slot 內的完整流程（以 [交易生命週期](/ethereum/transaction-lifecycle/transaction-lifecycle/) 的 [區塊生產](/ethereum/transaction-lifecycle/block-production/) 和 [共識與最終性](/ethereum/transaction-lifecycle/consensus-finality/) 階段為例）：

1. **t=0s**：Slot 開始，proposer 從 EL 取得 execution payload
2. **t=0s**：Proposer 組裝 Beacon Block 並廣播
3. **t=4s**：Attester 對區塊投票（[Attestation](/ethereum/consensus/attestation/)）
4. **t=8s**：Attestation aggregator 聚合投票並廣播
5. **t=12s**：下一個 slot 開始

### 與 Execution Layer 的互動

CL 和 EL 透過 Engine API（JSON-RPC）溝通：

- `engine_forkchoiceUpdatedV3`：通知 EL 當前 head/safe/finalized block
- `engine_getPayloadV3`：從 EL 取得 execution payload
- `engine_newPayloadV3`：讓 EL 驗證 execution payload

### Fork 歷史

Beacon Chain 經歷多次升級（fork）：

| Fork | 時間 | 重要變更 |
|------|------|----------|
| Phase 0 | 2020-12 | Beacon Chain 啟動 |
| Altair | 2021-10 | Sync committee、獎勵調整 |
| Bellatrix | 2022-09 | The Merge 準備 |
| Capella | 2023-04 | 質押提款功能 |
| Deneb | 2024-03 | [EIP-4844 Proto-Danksharding](/ethereum/advanced/eip-4844/) |
| Pectra | 2025-05 | EIP-7251 MAX_EFFECTIVE_BALANCE 提升、EIP-7002 EL 觸發退出、EIP-6110 存款上鏈 |
| Fusaka | 2025-12 | EIP-7917 Proposer 預測透明化、共識層最佳化 |

## Pectra/Fusaka 升級更新（2025）

### Pectra 升級（2025/5/7，epoch 364032）

Pectra 對 Beacon Chain 帶來三項重大變更：

**EIP-6110：驗證者存款處理移至執行層**
- 存款不再透過 CL 輪詢 EL 的 deposit log，改為直接在 execution payload 中攜帶存款資訊
- 存款確認時間從約 12 小時（`ETH1_FOLLOW_DISTANCE`）大幅降至約 13 分鐘（1 epoch）
- Block processing 步驟中的存款處理邏輯相應調整

**EIP-7002：執行層可觸發驗證者退出**
- 新增從 EL 發起 validator exit 的路徑，不再強制依賴 BLS signing key
- 提款地址持有者可直接透過 EL 合約觸發退出，強化了 withdrawal credential 的控制權

**EIP-7251：`MAX_EFFECTIVE_BALANCE` 提升至 2048 ETH**
- Proposer 選擇的加權空間大幅擴展
- 大型質押者可合併多個 validator 為一個，減少 validator set 膨脹
- Effective balance 的步進與更新規則不變，但上限放寬

### Fusaka 升級（2025/12/3，slot 13,164,544）

**EIP-7917：區塊提議者預測透明化**
- 改善 proposer 選擇的可預測性，讓 validator 更早知道自己的出塊時間
- 降低 [RANDAO](/ethereum/consensus/randao/) 操控對 proposer 選擇的影響

### 硬分叉節奏

自 Pectra/Fusaka 起，Ethereum 確立每年約兩次硬分叉的升級節奏，交替處理 EL 和 CL 改進。

## 程式碼範例

```python
# Beacon Chain state transition（簡化版）
from dataclasses import dataclass, replace
from typing import Optional

@dataclass(frozen=True)
class BeaconState:
    slot: int
    validators: tuple
    balances: tuple
    randao_mixes: tuple
    finalized_checkpoint: 'Checkpoint'

def state_transition(state: BeaconState, block: Optional['BeaconBlock']) -> BeaconState:
    # 1. Slot processing（不可變更新）
    state = process_slots(state, block.slot if block else state.slot + 1)

    # 2. Block processing（如果有區塊）
    if block is not None:
        state = process_block(state, block)

    return state

def process_slots(state: BeaconState, target_slot: int) -> BeaconState:
    while state.slot < target_slot:
        # 每個 slot 都要處理
        state = replace(state, slot=state.slot + 1)

        # Epoch boundary 額外處理
        if state.slot % 32 == 0:
            state = process_epoch(state)

    return state

def process_epoch(state: BeaconState) -> BeaconState:
    state = process_justification_and_finalization(state)
    state = process_rewards_and_penalties(state)
    state = process_registry_updates(state)
    state = process_slashings(state)
    state = process_effective_balance_updates(state)
    state = process_randao_mixes_reset(state)
    return state
```

```javascript
// 查詢 Beacon Chain 狀態（使用 Beacon API）
async function getBeaconInfo(beaconUrl) {
  // 取得當前 head
  const headRes = await fetch(`${beaconUrl}/eth/v1/beacon/headers/head`);
  const head = await headRes.json();

  // 取得 finality checkpoints
  const finalityRes = await fetch(
    `${beaconUrl}/eth/v1/beacon/states/head/finality_checkpoints`
  );
  const finality = await finalityRes.json();

  // 取得特定 slot 的 proposer
  const epoch = Math.floor(head.data.header.message.slot / 32);
  const dutiesRes = await fetch(
    `${beaconUrl}/eth/v1/validator/duties/proposer/${epoch}`
  );
  const duties = await dutiesRes.json();

  return {
    slot: head.data.header.message.slot,
    epoch: epoch,
    finalizedEpoch: finality.data.finalized.epoch,
    justifiedEpoch: finality.data.current_justified.epoch,
    proposerDuties: duties.data,
  };
}
```

## 相關概念

- [區塊結構](/ethereum/consensus/block-structure/) - Beacon Block 的完整結構定義
- [Validators](/ethereum/consensus/validators/) - Beacon Chain 管理的驗證者集合
- [Attestation](/ethereum/consensus/attestation/) - Validator 在每個 slot 的投票
- [Casper FFG](/ethereum/consensus/casper-ffg/) - Finality gadget，決定哪些 checkpoint 被 finalized
- [LMD GHOST](/ethereum/consensus/lmd-ghost/) - Fork choice rule，決定 canonical head
- [RANDAO](/ethereum/consensus/randao/) - 偽隨機數來源，用於 proposer/committee 選擇
- [Slashing](/ethereum/consensus/slashing/) - 惡意行為的懲罰機制
- [SSZ 編碼](/ethereum/data-structures/ssz-encoding/) - Beacon State 的序列化格式
- [BLS Signatures](/ethereum/cryptography/bls-signatures/) - Validator 簽名方案
- [BLS12-381](/ethereum/cryptography/bls12-381/) - BLS 簽名使用的橢圓曲線
- [共識與最終性](/ethereum/transaction-lifecycle/consensus-finality/) - 交易流程中的共識階段
- [區塊生產](/ethereum/transaction-lifecycle/block-production/) - 交易流程中的出塊階段
