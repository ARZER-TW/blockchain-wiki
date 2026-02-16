---
title: "Validators"
description: "Validators, 驗證者, Validator"
tags: [ethereum, consensus, pos, validator, staking]
---

# Validators

## 概述

Validator 是 Ethereum PoS 共識的核心參與者，負責提議區塊（propose）和投票（attest）。每個 validator 需質押 32 ETH，用 [BLS Signatures](/ethereum/cryptography/bls-signatures/) 簽署操作。Validator 的生命週期包含排隊進入、活躍參與、自願退出或被 [Slashing](/ethereum/consensus/slashing/) 強制退出。

## 核心原理

### Validator 結構

每個 validator 在 [Beacon Chain](/ethereum/consensus/beacon-chain/) state 中的記錄：

| 欄位 | 類型 | 說明 |
|------|------|------|
| `pubkey` | `BLSPubkey` | [BLS12-381](/ethereum/cryptography/bls12-381/) 公鑰（48 bytes） |
| `withdrawal_credentials` | `Bytes32` | 提款憑證（0x00 = BLS, 0x01 = ETH address） |
| `effective_balance` | `Gwei` | 有效餘額（Pectra 後上限 2048 ETH，步進 1 ETH） |
| `slashed` | `bool` | 是否已被 slashed |
| `activation_eligibility_epoch` | `Epoch` | 符合啟用資格的 epoch |
| `activation_epoch` | `Epoch` | 實際啟用 epoch |
| `exit_epoch` | `Epoch` | 退出 epoch |
| `withdrawable_epoch` | `Epoch` | 可提款 epoch |

### 質押與啟用

入場流程：

1. 在 Execution Layer 向 deposit contract（`0x00000000219ab540356cBB839Cbe05303d7705Fa`）發送 32 ETH
2. Deposit 包含：pubkey、withdrawal_credentials、amount、signature
3. EL 發出 deposit log，CL 客戶端解析並加入 pending 隊列
4. **Pectra 前**：等待 `ETH1_FOLLOW_DISTANCE`（約 12 小時）確認 deposit 有效；**Pectra 後**（EIP-6110）：存款資訊直接寫入 execution payload，確認時間降至約 13 分鐘（1 epoch）
5. 進入 activation queue

**Activation Queue**：每個 epoch 最多啟用 `max(4, active_validator_count // 65536)` 個 validator。以當前約 100 萬個 validator 計算，churn limit 約 15/epoch，啟用等待時間可能數天到數週。

### Effective Balance

Effective balance 不等於實際餘額，它有滯後更新機制防止頻繁波動：

- 上限：2048 ETH（`MAX_EFFECTIVE_BALANCE`，Pectra 前為 32 ETH，見 EIP-7251）
- 下限：16 ETH（低於此值會被強制退出）
- 步進：1 ETH
- 更新規則：只有當實際餘額與 effective balance 差距 $> 0.25$ ETH（向下）或 $\geq 1.25$ ETH（向上）時才更新

$$
\text{eff\_balance}_{new} = \min\left(
  \left\lfloor\frac{\text{balance}}{10^9}\right\rfloor \times 10^9,
  \text{MAX\_EFFECTIVE\_BALANCE}
\right)
$$

但僅在 `balance + DOWNWARD_THRESHOLD < effective_balance` 或 `effective_balance + UPWARD_THRESHOLD < balance` 時觸發。

### Validator 責任

**每個 epoch**：
- 被分配到某個 slot 的某個 committee
- 在該 slot 提交 [Attestation](/ethereum/consensus/attestation/)（source/target/head 三票）

**被選為 proposer 時**：
- 組裝並提議 [Beacon Block](/ethereum/consensus/block-structure/)
- 包含 execution payload、attestation、slashing 證據
- 提交 [RANDAO](/ethereum/consensus/randao/) reveal

**被選為 sync committee 時**（每 256 epoch 輪換）：
- 簽署每個 slot 的 head block

### 獎勵與懲罰

Validator 的收益來源：

| 類型 | 說明 | 佔比 |
|------|------|------|
| Source attestation | 正確投票 justified checkpoint | ~12.5% |
| Target attestation | 正確投票 target checkpoint | ~23.5% |
| Head attestation | 正確投票 chain head | ~12.5% |
| Sync committee | 參與 sync committee 簽名 | ~3% |
| Proposer reward | 成功提議區塊 | ~12.5% |
| Inclusion delay | attestation 越快被收錄獎勵越高 | 含在上述 |
| Priority fees + MEV | Execution layer 收入 | 變動 |

懲罰：
- **離線懲罰**：未 attest 的每個 epoch 扣除等同於正確 attest 獎勵的金額
- **Inactivity leak**：超過 4 個 epoch 未 finalize 時，離線 validator 的餘額加速衰減，直到線上的 validator 佔總質押的 2/3 以上
- **Slashing**：見 [Slashing](/ethereum/consensus/slashing/)

### 退出機制

**自願退出**：
1. Validator 簽署 `VoluntaryExit` 訊息，或 Pectra 後透過 EL 合約觸發（EIP-7002）
2. 進入 exit queue（churn limit 同 activation）
3. 等待 `MIN_VALIDATOR_WITHDRAWABILITY_DELAY`（256 epoch，約 27 小時）
4. Capella 升級後自動提款到 withdrawal address

**強制退出**：
- Effective balance $\leq$ 16 ETH 時自動觸發退出
- 被 slashed 後強制退出，額外等待 8192 epoch（約 36 天）

### 密鑰管理

每個 validator 需要兩組密鑰：

- **Signing key**（[BLS12-381](/ethereum/cryptography/bls12-381/)）：用於簽署 attestation、block proposal、RANDAO reveal。必須線上，熱存儲。
- **Withdrawal key**：控制提款。可以是 BLS 密鑰（0x00 prefix）或 ETH1 地址（0x01 prefix）。冷存儲即可。

密鑰推導遵循 EIP-2333（BLS Key Derivation）和 EIP-2334（BLS Key Path）：

$$m / 12381 / 3600 / i / 0 \quad \text{(signing key)}$$
$$m / 12381 / 3600 / i / 0 / 0 \quad \text{(withdrawal key)}$$

其中 $i$ 是 validator index。

## Pectra/Fusaka 升級更新（2025）

### Pectra 升級（2025/5/7，epoch 364032）

**EIP-7251：`MAX_EFFECTIVE_BALANCE` 從 32 ETH 提升至 2048 ETH**
- 大型質押者（如 Lido、機構節點）可將多個 32 ETH validator 合併為單一 validator
- 有效減少 validator set 大小，降低 [Beacon Chain](/ethereum/consensus/beacon-chain/) 的 state 膨脹壓力
- 質押門檻仍為 32 ETH，但單一 validator 可承載至多 2048 ETH
- 合併操作透過退出舊 validator 再以更高金額重新質押實現

**EIP-7002：執行層觸發驗證者退出**
- 提款地址持有者可直接透過 EL 系統合約發起退出，不再強制依賴 BLS signing key
- 解決了 signing key 遺失或被竊時無法退出的問題
- 退出流程與原本的 `VoluntaryExit` 並行，新增一條 EL 路徑

**EIP-6110：驗證者存款確認加速**
- Deposit 資訊直接嵌入 execution payload，取代 CL 輪詢 EL deposit log 的舊機制
- 確認時間從約 12 小時大幅降至約 13 分鐘（1 epoch）
- 降低新 validator 的入場延遲

## 在 Ethereum 中的應用

目前（2025+）Ethereum 有超過 100 萬個 active validator，總質押量超過 3200 萬 ETH。主要質押方式：

- **Solo staking**：自己運行節點，最去中心化
- **Staking pools**：如 Lido（stETH）、Rocket Pool（rETH）
- **CEX staking**：Coinbase、Kraken 等

Validator 的表現直接影響 [Beacon Chain](/ethereum/consensus/beacon-chain/) 的 finality。如果超過 1/3 的 validator 離線，鏈將無法 finalize，觸發 inactivity leak。

## 程式碼範例

```python
# Validator 啟用/退出判斷
from dataclasses import dataclass

MAX_EFFECTIVE_BALANCE = 2048 * 10**9  # 2048 ETH in Gwei (post-Pectra, was 32 ETH)
EJECTION_BALANCE = 16 * 10**9       # 16 ETH in Gwei
FAR_FUTURE_EPOCH = 2**64 - 1

@dataclass(frozen=True)
class Validator:
    pubkey: bytes
    withdrawal_credentials: bytes
    effective_balance: int
    slashed: bool
    activation_eligibility_epoch: int
    activation_epoch: int
    exit_epoch: int
    withdrawable_epoch: int

def is_active(validator: Validator, epoch: int) -> bool:
    return validator.activation_epoch <= epoch < validator.exit_epoch

def is_eligible_for_activation(state, validator: Validator) -> bool:
    return (
        validator.activation_eligibility_epoch <= state.finalized_checkpoint.epoch
        and validator.activation_epoch == FAR_FUTURE_EPOCH
    )

def compute_churn_limit(active_validator_count: int) -> int:
    return max(4, active_validator_count // 65536)
```

```javascript
// 查詢 validator 狀態（Beacon API）
async function getValidatorInfo(beaconUrl, validatorIndex) {
  const res = await fetch(
    `${beaconUrl}/eth/v1/beacon/states/head/validators/${validatorIndex}`
  );
  const data = await res.json();
  const v = data.data;

  return {
    index: v.index,
    status: v.status,  // "active_ongoing", "pending_queued", "exited_slashed" 等
    balance: v.balance,
    effectiveBalance: v.validator.effective_balance,
    activationEpoch: v.validator.activation_epoch,
    exitEpoch: v.validator.exit_epoch,
    slashed: v.validator.slashed,
  };
}
```

## 相關概念

- [Beacon Chain](/ethereum/consensus/beacon-chain/) - Validator 的管理與調度中心
- [Attestation](/ethereum/consensus/attestation/) - Validator 的主要職責：投票
- [Slashing](/ethereum/consensus/slashing/) - 惡意 validator 的懲罰機制
- [BLS Signatures](/ethereum/cryptography/bls-signatures/) - Validator 的簽名方案
- [BLS12-381](/ethereum/cryptography/bls12-381/) - 簽名使用的橢圓曲線
- [RANDAO](/ethereum/consensus/randao/) - Validator 參與的隨機數生成
- [Casper FFG](/ethereum/consensus/casper-ffg/) - Validator attestation 驅動的 finality
- [密鑰生成與帳戶創建](/ethereum/transaction-lifecycle/key-generation/) - Validator 密鑰推導流程
- [區塊結構](/ethereum/consensus/block-structure/) - Validator 提議的區塊格式
- [區塊生產](/ethereum/transaction-lifecycle/block-production/) - 交易流程中 validator 組裝區塊的過程
