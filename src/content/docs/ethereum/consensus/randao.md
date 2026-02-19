---
title: "RANDAO"
description: "RANDAO, 隨機數, Random Beacon"
tags: [ethereum, consensus, pos, randomness, randao]
sidebar:
  order: 5
---

# RANDAO

## 概述

RANDAO 是 [Beacon Chain](/ethereum/consensus/beacon-chain/) 的鏈上偽隨機數產生機制，基於 commit-reveal 模式。每個 slot 的 proposer 用 [BLS Signatures](/ethereum/cryptography/bls-signatures/) 對 epoch number 簽名作為 reveal 值，與前一個 RANDAO mix 做 XOR，產生新的 mix。這個隨機數用於 [Validators](/ethereum/consensus/validators/) 的 proposer 選擇和 committee 分配。

## 核心原理

### Commit-Reveal 機制

傳統 RANDAO 分兩階段：
1. **Commit**：參與者提交 hash(secret)
2. **Reveal**：參與者揭示 secret，所有 secret 混合產生隨機數

Ethereum 的 RANDAO 簡化了這個流程：BLS 簽名的確定性特性天然提供了 commit-reveal 效果。

### BLS 簽名作為 Reveal

[BLS Signatures](/ethereum/cryptography/bls-signatures/) 有一個關鍵特性：同一私鑰對同一訊息只能產生一個有效簽名（確定性）。這意味著：

- **Commit**：validator 的公鑰就是隱式的 commit（公鑰已知，但對應的簽名未知）
- **Reveal**：validator 對 epoch number 的 BLS 簽名就是 reveal

$$\text{randao\_reveal} = \text{BLS\_Sign}(sk_{\text{proposer}}, \text{epoch})$$

驗證：

$$\text{BLS\_Verify}(pk_{\text{proposer}}, \text{epoch}, \text{randao\_reveal}) = \text{true}$$

### RANDAO Mix 更新

每個 slot，proposer 的 reveal 會與當前的 RANDAO mix 做 XOR：

$$\text{mix}_{new} = \text{mix}_{old} \oplus \text{hash}(\text{randao\_reveal})$$

其中 hash 使用 [SHA-256](/ethereum/cryptography/sha-256/)（Beacon Chain 的內部 hash function）。

XOR 的性質確保：
- 任何一個誠實 proposer 的貢獻都能改變 mix
- 攻擊者無法預測最終的 mix（除非控制所有後續 proposer）

### 隨機數使用

RANDAO mix 被用於多處：

**Proposer 選擇**：
$$\text{proposer\_index} = \text{compute\_proposer\_index}(\text{state}, \text{epoch\_seed})$$
$$\text{epoch\_seed} = \text{hash}(\text{DOMAIN\_BEACON\_PROPOSER} \| \text{randao\_mix}[\text{epoch}] \| \text{epoch})$$

**Committee 分配**：
$$\text{seed} = \text{hash}(\text{DOMAIN\_BEACON\_ATTESTER} \| \text{randao\_mix}[\text{epoch}] \| \text{epoch})$$

然後用 swap-or-not shuffle 打亂 validator 列表。

**Sync Committee 選擇**：
$$\text{seed} = \text{hash}(\text{DOMAIN\_SYNC\_COMMITTEE} \| \text{randao\_mix}[\text{epoch}] \| \text{period})$$

### 預測延遲（Lookahead）

為了讓 validator 有時間準備，proposer 和 committee 分配使用的是前幾個 epoch 的 RANDAO mix：

- **Proposer**：使用前 1 個 epoch 的 mix（`MIN_SEED_LOOKAHEAD = 1`）
- **Committee**：使用前 4 個 epoch 的 mix（`MAX_SEED_LOOKAHEAD = 4`）

$$\text{seed\_epoch} = \text{current\_epoch} - \text{MIN\_SEED\_LOOKAHEAD} - 1$$

這意味著要操縱 committee 分配，攻擊者需要在 4 個 epoch 前就控制所有 proposer。

### RANDAO 的局限性

**Last Proposer Attack**：epoch 中最後一個 proposer 有 1 bit 的操控能力——選擇是否提交區塊（不提交 = 不更新 mix）。如果控制最後 $n$ 個 proposer，操控能力為 $n$ bits，即 $2^n$ 種可能。

緩解措施：
- Proposer 不提交區塊會損失出塊獎勵
- 攻擊者控制連續多個 proposer 的概率隨 $n$ 指數下降
- Lookahead 限制了攻擊效果

**無法預計算未來結果**：
- 當前 RANDAO mix 只能用於確定 lookahead 範圍內的分配
- 更遠的未來取決於尚未揭示的 RANDAO reveal

### 在 Execution Layer 的使用

Post-Merge 後，[區塊 Header](/ethereum/consensus/block-header/) 的 `mixHash`（`prevRandao`）欄位攜帶 RANDAO 值。EVM 中的 `PREVRANDAO` opcode（原 `DIFFICULTY`，EIP-4399）返回這個值：

$$\texttt{PREVRANDAO} = \text{parent\_beacon\_block.body.randao\_mix}$$

注意這不是密碼學安全的隨機數（single-slot proposer 可以操縱），但對大多數 DApp 場景足夠。

## Fusaka 升級更新（2025）

### EIP-7917：Proposer 預測透明化（2025/12/3，slot 13,164,544）

Fusaka 升級引入 EIP-7917，改善 proposer 選擇的可預測性：

- 提供更穩定的 proposer lookahead 機制，validator 可更早確認自己的出塊職責
- 減少因 RANDAO 操控（尤其是 last proposer attack）對 proposer 排程的影響
- 增強網路中 proposer 身份的透明度，有助於 MEV 供應鏈（如 PBS）提前準備
- 不改變 RANDAO mix 的產生邏輯，而是在 proposer 計算層加入額外約束

與既有的 `MIN_SEED_LOOKAHEAD` / `MAX_SEED_LOOKAHEAD` 機制互補，而非取代。

## 在 Ethereum 中的應用

### Beacon State 中的存儲

State 維護一個長度為 `EPOCHS_PER_HISTORICAL_VECTOR`（65536）的環形緩衝區：

```
state.randao_mixes[epoch % 65536] = new_mix
```

這讓約 291 天內的歷史 RANDAO mix 都可查詢。

### 智能合約中的隨機數

```solidity
// 使用 PREVRANDAO 作為隨機數源
uint256 randomValue = block.prevrandao;
```

適用場景：NFT trait 分配、鏈上遊戲（低價值決定）
不適用場景：高價值抽獎（proposer 可操縱 1 bit）

對於需要更強隨機數的場景，可以結合 VRF 或等待多個區塊後才使用。

## 程式碼範例

```python
# RANDAO processing 在 block processing 中
from hashlib import sha256

EPOCHS_PER_HISTORICAL_VECTOR = 65536

def process_randao(state, body):
    epoch = compute_epoch_at_slot(state.slot)
    proposer = state.validators[get_beacon_proposer_index(state)]

    # 驗證 RANDAO reveal
    signing_root = compute_signing_root(epoch, get_domain(state, DOMAIN_RANDAO))
    assert bls_verify(proposer.pubkey, signing_root, body.randao_reveal)

    # 更新 RANDAO mix（不可變方式）
    mix = xor(
        get_randao_mix(state, epoch),
        sha256(body.randao_reveal).digest()
    )

    new_mixes = list(state.randao_mixes)
    new_mixes[epoch % EPOCHS_PER_HISTORICAL_VECTOR] = mix

    return replace(state, randao_mixes=tuple(new_mixes))

def get_randao_mix(state, epoch: int) -> bytes:
    return state.randao_mixes[epoch % EPOCHS_PER_HISTORICAL_VECTOR]

def xor(a: bytes, b: bytes) -> bytes:
    return bytes(x ^ y for x, y in zip(a, b))
```

```javascript
// 讀取 PREVRANDAO（EVM / Solidity）
const { ethers } = require("ethers");

async function getPrevRandao(provider) {
  const block = await provider.getBlock("latest");

  // post-merge: mixHash 就是 prevRandao
  return {
    blockNumber: block.number,
    prevRandao: block.mixHash,
    // 轉換為 uint256 用於鏈上比較
    asUint256: BigInt(block.mixHash),
  };
}

// 在合約中安全使用 RANDAO 的模式
// 延遲揭示：在 block N 提交 commit，在 block N+K 用 prevRandao 計算結果
// K >= 2 確保 proposer 無法預知結果
```

```python
# 模擬 proposer 選擇（使用 RANDAO seed）
def compute_proposer_index(state, indices, seed):
    """
    加權隨機選擇 proposer。
    effective_balance 越高，被選中概率越大。
    """
    total = len(indices)
    i = 0
    while True:
        candidate_index = indices[
            compute_shuffled_index(i % total, total, seed)
        ]
        random_byte = sha256(seed + (i // 32).to_bytes(8, 'little')).digest()[i % 32]
        effective_balance = state.validators[candidate_index].effective_balance
        if effective_balance * 255 >= MAX_EFFECTIVE_BALANCE * random_byte:
            return candidate_index
        i += 1
```

## 相關概念

- [Beacon Chain](/ethereum/consensus/beacon-chain/) - RANDAO 運作的環境
- [Validators](/ethereum/consensus/validators/) - RANDAO reveal 的提供者
- [BLS Signatures](/ethereum/cryptography/bls-signatures/) - RANDAO reveal 的簽名方案
- [BLS12-381](/ethereum/cryptography/bls12-381/) - 底層橢圓曲線
- [SHA-256](/ethereum/cryptography/sha-256/) - RANDAO mix 的 hash function
- [區塊 Header](/ethereum/consensus/block-header/) - prevRandao 欄位的來源
- [區塊結構](/ethereum/consensus/block-structure/) - randao_reveal 在 BeaconBlockBody 中的位置
- [Attestation](/ethereum/consensus/attestation/) - Committee 分配依賴 RANDAO
- [Slashing](/ethereum/consensus/slashing/) - 不提交 RANDAO reveal 的機會成本
