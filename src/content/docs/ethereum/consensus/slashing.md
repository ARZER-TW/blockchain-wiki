---
title: "Slashing"
description: "Slashing, 罰沒, Slash"
tags: [ethereum, consensus, pos, slashing, penalty]
sidebar:
  order: 9
---

# Slashing

## 概述

Slashing 是 Ethereum PoS 對惡意 [Validators](/ethereum/consensus/validators/) 的經濟懲罰機制。兩種可被 slash 的行為：double voting（同一 slot 提議/投票兩個不同區塊）和 surround voting（投出包圍或被包圍的 attestation）。被 slash 的 validator 會損失至少 1/32 的有效餘額，並在約 36 天後強制退出。如果同時期有大量 validator 被 slash，額外的 correlation penalty 可能導致損失全部質押。

## 核心原理

### 兩類 Slashable 行為

#### Proposer Slashing（Double Proposal）

Proposer 在同一個 slot 提議兩個不同的區塊：

$$\text{block}_1.\text{slot} = \text{block}_2.\text{slot} \wedge \text{block}_1.\text{root} \neq \text{block}_2.\text{root}$$

且兩個區塊都有 proposer 的有效 [BLS Signatures](/ethereum/cryptography/bls-signatures/)。

#### Attester Slashing

[Attestation](/ethereum/consensus/attestation/) 有兩條 [Casper FFG](/ethereum/consensus/casper-ffg/) slashing 規則：

**規則 1：Double Voting**

同一個 validator 在同一個 target epoch 投了兩個不同的 attestation：

$$\text{att}_1.\text{target.epoch} = \text{att}_2.\text{target.epoch}$$
$$\text{att}_1 \neq \text{att}_2$$

**規則 2：Surround Voting**

一個 attestation 的 source-target 範圍包圍了另一個：

$$\text{att}_1.\text{source.epoch} < \text{att}_2.\text{source.epoch}$$
$$\text{att}_2.\text{target.epoch} < \text{att}_1.\text{target.epoch}$$

直覺：如果 validator 在 epoch 3->7 之間投了一票，又在 epoch 2->8 之間投了一票，後者「包圍」了前者。這代表 validator 試圖支持兩條不同的鏈。

### Slashing 流程

當有人發現 slashable 行為並提交到區塊中：

1. **標記**：`validator.slashed = True`
2. **初始懲罰**：扣除 $\frac{\text{effective\_balance}}{32}$（約 1 ETH）
3. **設定退出 epoch**：`validator.exit_epoch = current_epoch + MAX_SEED_LOOKAHEAD + 1`
4. **設定提款 epoch**：`validator.withdrawable_epoch = exit_epoch + 8192`（約 36 天）
5. **舉報獎勵**：proposer 獲得 $\frac{\text{effective\_balance}}{512}$ 作為收錄獎勵

### Correlation Penalty

在被 slash 後約 18 天（`EPOCHS_PER_SLASHINGS_VECTOR / 2`），會計算 correlation penalty：

$$\text{penalty} = \frac{\text{effective\_balance} \times \text{adjusted\_total\_slashing\_balance}}{\text{total\_active\_balance}}$$

$$\text{adjusted\_total\_slashing\_balance} = \min(\text{sum\_of\_slashings} \times 3, \text{total\_active\_balance})$$

這意味著：

| 同期被 slash 的比例 | 大約損失 |
|---------------------|----------|
| 少數個別（< 1/3） | ~1/32 有效餘額 |
| 1/3 | 全部有效餘額 |
| > 1/3 | 全部有效餘額（上限） |

設計目的：懲罰與「多少人同時作弊」成正比。個別的操作失誤（如跑了兩個相同 validator key）懲罰輕微，但協調攻擊的懲罰極其嚴重。

### 持續懲罰

被 slash 的 validator 在等待退出期間不能獲得任何 attestation 獎勵，每個 epoch 都會被扣除離線懲罰（即使實際上在線）。

完整懲罰時間線：

```
Epoch T:    被 slash，扣除 1/32
Epoch T+1 to T+8192: 每 epoch 扣離線罰款
Epoch T+4096:        Correlation penalty 計算
Epoch T+8192:        可提款（但餘額已大幅縮水）
```

### Slashing 證據的構造

要提交 slashing 證據到區塊中，需要提供：

**ProposerSlashing**：
```
signed_header_1: SignedBeaconBlockHeader
signed_header_2: SignedBeaconBlockHeader
```
兩個 header 必須 slot 相同、proposer 相同、root 不同，且簽名有效。

**AttesterSlashing**：
```
attestation_1: IndexedAttestation
attestation_2: IndexedAttestation
```
兩個 attestation 必須違反 double voting 或 surround voting 規則，且包含重疊的 validator。

### 為什麼用 BLS 不用 ECDSA

[BLS Signatures](/ethereum/cryptography/bls-signatures/) 的聚合特性讓 slashing 證據驗證高效：一次 pairing check 驗證多個 validator 的簽名。如果用 [ECDSA](/ethereum/cryptography/ecdsa/)，需要對每個 validator 獨立驗證。

此外 BLS 簽名的確定性（同一密鑰同一訊息只有一個有效簽名）讓 double voting 的檢測更明確。

## 在 Ethereum 中的應用

### 歷史 Slashing 事件

實際發生的 slashing 絕大多數是操作失誤，而非惡意攻擊：

- 在多台機器上運行同一個 validator key（最常見原因）
- 從備份恢復時未正確處理 slashing protection database
- 客戶端 bug 導致 equivocation

### Slashing Protection

Validator 客戶端維護本地的 slashing protection database（EIP-3076），記錄所有已簽名的 attestation 的 source/target epoch，防止簽名矛盾的訊息。

遷移 validator 時必須匯出並匯入此 database。

### 經濟安全性

Slashing 是 Ethereum PoS 經濟安全的基石：

- 攻擊需要控制 $\geq 1/3$ 的總質押（目前 > 1000 萬 ETH）
- 如果攻擊被偵測（一定會），攻擊者損失全部質押
- 經濟安全性 = 攻擊成本 = 質押總量的 1/3 = 數十億美元

### Whistleblower 機制

任何人都可以監控鏈上的 attestation/proposal，偵測 slashable 行為並提交證據。Proposer 收錄 slashing 證據會獲得獎勵，形成了去中心化的監控機制。

## 程式碼範例

```python
# Slashing 處理邏輯
from dataclasses import replace

MIN_SLASHING_PENALTY_QUOTIENT = 32
WHISTLEBLOWER_REWARD_QUOTIENT = 512
PROPOSER_REWARD_QUOTIENT = 8
EPOCHS_PER_SLASHINGS_VECTOR = 8192

def slash_validator(state, slashed_index: int, whistleblower_index: int = None):
    """對 validator 執行 slashing。"""
    epoch = compute_epoch_at_slot(state.slot)
    validator = state.validators[slashed_index]

    # 啟動退出流程
    initiated_exit = initiate_validator_exit(state, slashed_index)

    # 標記為 slashed
    new_validator = replace(
        initiated_exit.validators[slashed_index],
        slashed=True,
        withdrawable_epoch=max(
            initiated_exit.validators[slashed_index].withdrawable_epoch,
            epoch + EPOCHS_PER_SLASHINGS_VECTOR,
        ),
    )

    # 更新 validators（不可變）
    validators = list(initiated_exit.validators)
    validators[slashed_index] = new_validator
    state = replace(initiated_exit, validators=tuple(validators))

    # 記錄 slashing 金額
    slashings = list(state.slashings)
    slashings[epoch % EPOCHS_PER_SLASHINGS_VECTOR] += (
        validator.effective_balance
    )
    state = replace(state, slashings=tuple(slashings))

    # 初始懲罰：1/32
    penalty = validator.effective_balance // MIN_SLASHING_PENALTY_QUOTIENT
    state = decrease_balance(state, slashed_index, penalty)

    # Whistleblower 獎勵
    proposer_index = get_beacon_proposer_index(state)
    if whistleblower_index is None:
        whistleblower_index = proposer_index
    whistleblower_reward = (
        validator.effective_balance // WHISTLEBLOWER_REWARD_QUOTIENT
    )
    proposer_reward = whistleblower_reward // PROPOSER_REWARD_QUOTIENT
    state = increase_balance(state, proposer_index, proposer_reward)
    state = increase_balance(
        state, whistleblower_index, whistleblower_reward - proposer_reward
    )

    return state

def process_slashings(state):
    """Epoch processing 中的 correlation penalty 計算。"""
    epoch = compute_epoch_at_slot(state.slot)
    total_balance = get_total_active_balance(state)
    total_slashings = sum(state.slashings)
    adjusted = min(total_slashings * 3, total_balance)

    balances = list(state.balances)
    for index, validator in enumerate(state.validators):
        if (
            validator.slashed
            and epoch + EPOCHS_PER_SLASHINGS_VECTOR // 2
            == validator.withdrawable_epoch
        ):
            penalty = (
                validator.effective_balance * adjusted // total_balance
            )
            balances[index] = max(0, balances[index] - penalty)

    return replace(state, balances=tuple(balances))
```

```javascript
// 檢測 slashable attestation
function isSlashableAttestation(att1, att2) {
  // Rule 1: Double voting
  const doubleVote =
    att1.data.target.epoch === att2.data.target.epoch &&
    att1.data.target.root !== att2.data.target.root;

  // Rule 2: Surround voting
  const surroundVote =
    att1.data.source.epoch < att2.data.source.epoch &&
    att2.data.target.epoch < att1.data.target.epoch;

  return doubleVote || surroundVote;
}

// EIP-3076 slashing protection DB 格式
const slashingProtection = {
  metadata: { interchange_format_version: "5", genesis_validators_root: "0x..." },
  data: [
    {
      pubkey: "0x...",
      signed_blocks: [{ slot: "123", signing_root: "0x..." }],
      signed_attestations: [
        { source_epoch: "5", target_epoch: "6", signing_root: "0x..." },
      ],
    },
  ],
};
```

## 相關概念

- [Validators](/ethereum/consensus/validators/) - Slashing 的對象
- [Attestation](/ethereum/consensus/attestation/) - Attester slashing 涉及矛盾的 attestation
- [Casper FFG](/ethereum/consensus/casper-ffg/) - Slashing 規則源自 Casper 安全性證明
- [Beacon Chain](/ethereum/consensus/beacon-chain/) - Slashing 處理在 block processing 中執行
- [BLS Signatures](/ethereum/cryptography/bls-signatures/) - Slashing 證據需要有效的 BLS 簽名
- [區塊結構](/ethereum/consensus/block-structure/) - Slashing 證據包含在 BeaconBlockBody 中
- [LMD GHOST](/ethereum/consensus/lmd-ghost/) - Equivocation 影響 fork choice weight
