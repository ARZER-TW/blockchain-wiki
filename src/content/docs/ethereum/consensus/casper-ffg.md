---
title: "Casper FFG"
description: "Casper FFG, Casper, Friendly Finality Gadget"
tags: [ethereum, consensus, pos, finality, casper]
---

# Casper FFG

## 概述

Casper FFG（Friendly Finality Gadget）是 Ethereum PoS 的 finality 機制，由 Vitalik Buterin 和 Virgil Griffith 提出。它在 [Beacon Chain](/ethereum/consensus/beacon-chain/) 上運作，利用 [Validators](/ethereum/consensus/validators/) 的 [Attestation](/ethereum/consensus/attestation/)（source/target vote）將 checkpoint 從 justified 推進到 finalized。Finalized 的區塊不可逆轉，除非攻擊者控制並願意銷毀超過 1/3 的總質押量。

## 核心原理

### Checkpoint 與 Epoch Boundary

Checkpoint 是 epoch 的第一個 slot 對應的區塊：

$$\text{checkpoint}(e) = (\text{epoch}=e, \text{root}=\text{block\_root\_at\_slot}(32e))$$

如果 epoch 的第一個 slot 沒有區塊，則使用最近的祖先區塊的 root。

### Supermajority Link

定義 **supermajority link** $A \rightarrow B$：如果超過 2/3 的 active validator（以 effective balance 加權）在 attestation 中將 $A$ 作為 source、$B$ 作為 target，則存在從 $A$ 到 $B$ 的 supermajority link。

$$\frac{\sum_{\text{validator votes } A \rightarrow B} \text{effective\_balance}}{\text{total\_active\_balance}} > \frac{2}{3}$$

### Justification

Checkpoint $B$ 被 **justified** 的條件：

1. Genesis checkpoint 天然 justified
2. 存在 supermajority link $A \rightarrow B$，其中 $A$ 已經是 justified

也就是說：一個已 justified 的 checkpoint 可以通過 supermajority link justify 下一個 checkpoint。

### Finalization

Checkpoint $A$ 被 **finalized** 的條件（有幾種情況）：

**Case 1（正常路徑，k=1）**：
- $A$ 已 justified
- 存在 supermajority link $A \rightarrow B$，其中 $B$ 的 epoch = $A$ 的 epoch + 1
- 即連續兩個 epoch 的 checkpoint 都被 justify

**Case 2（k=2）**：
- $A$ 已 justified
- 存在 supermajority link $A \rightarrow B$，其中 $B$ 的 epoch = $A$ 的 epoch + 2
- 且 $A$ 和 $B$ 之間的 checkpoint 也已 justified

正常情況下 Case 1 最常發生：epoch $n$ 的 checkpoint 被 justify，epoch $n+1$ 的 checkpoint 也被 justify，則 epoch $n$ 被 finalize。

最快 finalization 時間：2 個 epoch = 12.8 分鐘。

### 安全性證明

Casper FFG 的核心安全保證：**Accountable Safety**。

兩個互相矛盾的 finalized checkpoint 不可能同時存在，除非 $\geq 1/3$ 的 validator 違反 slashing 規則。

**Slashing 條件**（兩條 Casper 規則）：

1. **Double voting**：validator 不能在同一個 target epoch 投兩個不同的 target
   $$\text{att}_1.\text{target.epoch} = \text{att}_2.\text{target.epoch} \wedge \text{att}_1.\text{target.root} \neq \text{att}_2.\text{target.root}$$

2. **Surround voting**：validator 不能投出包圍其他投票的 vote
   $$\text{att}_1.\text{source.epoch} < \text{att}_2.\text{source.epoch} \wedge \text{att}_2.\text{target.epoch} < \text{att}_1.\text{target.epoch}$$

**證明邏輯**：假設存在兩個不一致的 finalized checkpoint $F_1$ 和 $F_2$。justification 各需要 2/3 的投票，兩者重疊的 validator 至少佔 1/3。這些重疊的 validator 必然違反了上述兩條規則之一，會被 [Slashing](/ethereum/consensus/slashing/)。

### Inactivity Leak

如果鏈超過 4 個 epoch 未 finalize（`MIN_EPOCHS_TO_INACTIVITY_PENALTY = 4`），進入 inactivity leak 模式：

- 離線 validator 的餘額加速衰減
- 衰減速率：$\text{penalty} \propto \frac{\text{effective\_balance} \times \text{epochs\_since\_finality}}{2^{24}}$
- 目的：讓線上的 validator 佔比恢復到 2/3，使鏈重新 finalize
- 在 leak 期間，正確投票的 validator 不獲獎勵（零和遊戲）

Inactivity leak 是 Casper FFG 的 liveness 保證：即使大量 validator 離線，鏈最終仍能恢復 finality。

## 在 Ethereum 中的應用

### Justification/Finalization 流程

每個 epoch 結束時的處理（在 [Beacon Chain](/ethereum/consensus/beacon-chain/) state transition 中）：

```
epoch_processing:
  1. 統計所有 attestation 的 source/target vote
  2. 計算各 checkpoint 收到的投票權重
  3. 判斷 justification:
     - 如果 current epoch 的 checkpoint 獲得 > 2/3 投票 -> justify
     - 如果 previous epoch 的 checkpoint 獲得 > 2/3 投票 -> justify
  4. 判斷 finalization:
     - 檢查 Case 1 和 Case 2 條件
     - 更新 finalized_checkpoint
```

### 實際數據

正常運作時：
- 每 epoch（6.4 分鐘）產生一個 justified checkpoint
- 每 2 epoch（12.8 分鐘）finalize 一個 checkpoint
- 參與率通常 > 99%

異常情況（如客戶端 bug）：
- 2023 年 5 月曾因 Prysm bug 導致數個 epoch 未 finalize
- Inactivity leak 啟動後約 15 分鐘恢復 finality

### 對使用者的影響

| 確認等級 | 等待時間 | 安全性 |
|----------|----------|--------|
| 1 confirmation | 12 秒 | 可能被 reorg |
| Justified | ~6.4 分鐘 | 很安全，但理論上可逆 |
| Finalized | ~12.8 分鐘 | 不可逆（需攻擊者銷毀 > 1/3 質押） |

交易所通常在 finalized 後才確認存款，等同於 64-96 個 slot（約 12-19 分鐘）。

## 程式碼範例

```python
# Casper FFG justification 與 finalization 邏輯
from dataclasses import replace

JUSTIFICATION_BITS_LENGTH = 4

def process_justification_and_finalization(state):
    # 跳過 genesis 和第一個 epoch
    if state.current_epoch <= 1:
        return state

    previous_epoch = state.current_epoch - 1
    current_epoch = state.current_epoch

    # 統計投票
    previous_target_balance = get_attesting_balance(
        state, get_matching_target_attestations(state, previous_epoch)
    )
    current_target_balance = get_attesting_balance(
        state, get_matching_target_attestations(state, current_epoch)
    )
    total_active_balance = get_total_active_balance(state)

    # 更新 justification bits（左移一位）
    new_bits = (state.justification_bits << 1) & ((1 << JUSTIFICATION_BITS_LENGTH) - 1)

    # 嘗試 justify previous epoch checkpoint
    if previous_target_balance * 3 >= total_active_balance * 2:
        new_bits |= 0b0010  # 倒數第二位
        state = replace(
            state,
            previous_justified_checkpoint=state.current_justified_checkpoint,
            current_justified_checkpoint=Checkpoint(
                epoch=previous_epoch,
                root=get_block_root(state, previous_epoch),
            ),
        )

    # 嘗試 justify current epoch checkpoint
    if current_target_balance * 3 >= total_active_balance * 2:
        new_bits |= 0b0001  # 最低位
        state = replace(
            state,
            previous_justified_checkpoint=state.current_justified_checkpoint,
            current_justified_checkpoint=Checkpoint(
                epoch=current_epoch,
                root=get_block_root(state, current_epoch),
            ),
        )

    state = replace(state, justification_bits=new_bits)

    # 嘗試 finalize
    bits = state.justification_bits

    # Case k=2: epoch -3 justified, -3 -> -1 supermajority
    if bits & 0b1110 == 0b1110:  # bits 1,2,3 set
        state = try_finalize(state, state.previous_justified_checkpoint)

    # Case k=1: epoch -2 justified, -2 -> -1 supermajority
    if bits & 0b0110 == 0b0110:  # bits 1,2 set
        state = try_finalize(state, state.previous_justified_checkpoint)

    # Case k=1: epoch -1 justified, -1 -> 0 supermajority
    if bits & 0b0011 == 0b0011:  # bits 0,1 set
        state = try_finalize(state, state.current_justified_checkpoint)

    return state
```

```javascript
// 查詢 finality 狀態
async function checkFinality(beaconUrl) {
  const res = await fetch(
    `${beaconUrl}/eth/v1/beacon/states/head/finality_checkpoints`
  );
  const data = await res.json();

  const justified = data.data.current_justified;
  const finalized = data.data.finalized;

  // 計算 finality 延遲
  const headRes = await fetch(`${beaconUrl}/eth/v1/beacon/headers/head`);
  const head = await headRes.json();
  const currentEpoch = Math.floor(head.data.header.message.slot / 32);

  return {
    currentEpoch,
    justifiedEpoch: parseInt(justified.epoch),
    finalizedEpoch: parseInt(finalized.epoch),
    epochsSinceFinality: currentEpoch - parseInt(finalized.epoch),
    isInactivityLeaking: currentEpoch - parseInt(finalized.epoch) > 4,
  };
}
```

## 相關概念

- [LMD GHOST](/ethereum/consensus/lmd-ghost/) - 與 Casper FFG 搭配的 fork choice rule
- [Attestation](/ethereum/consensus/attestation/) - Source/target vote 是 Casper FFG 的輸入
- [Validators](/ethereum/consensus/validators/) - 投票的主體
- [Beacon Chain](/ethereum/consensus/beacon-chain/) - Casper FFG 的執行環境
- [Slashing](/ethereum/consensus/slashing/) - 違反 Casper 規則的懲罰
- [共識與最終性](/ethereum/transaction-lifecycle/consensus-finality/) - 交易流程中 finality 的角色
