---
title: "LMD GHOST"
description: "LMD GHOST, LMD-GHOST, Fork Choice Rule, GHOST"
tags: [ethereum, consensus, pos, fork-choice, ghost]
---

# LMD GHOST

## 概述

LMD GHOST（Latest Message Driven Greedy Heaviest Observed SubTree）是 Ethereum PoS 的 fork choice rule，決定哪條鏈分支是 canonical head。它從最新的 [Casper FFG](/ethereum/consensus/casper-ffg/) justified checkpoint 出發，在每個分叉點選擇累積 [Attestation](/ethereum/consensus/attestation/) weight 最大的子樹。LMD 的 "Latest Message" 指的是每個 validator 只計算其最新一次的 head vote。

## 核心原理

### GHOST 基礎

原始 GHOST（Greedy Heaviest Observed SubTree）由 Sompolinsky 和 Zohar 提出，核心想法：在分叉點不選最長鏈，而是選包含最多區塊的子樹。

Ethereum 的變體用 validator attestation 的權重取代區塊數量。

### LMD（Latest Message Driven）

"Latest Message" 規則：對每個 validator，只計算其最近一次的 attestation（head vote），忽略所有舊的投票。

$$\text{latest\_message}(v) = \text{argmax}_{a \in \text{attestations}(v)} a.\text{slot}$$

這避免了 validator 的歷史投票對當前 fork choice 產生不合理的影響。

### Fork Choice 演算法

從 justified checkpoint 開始，逐步向下選擇：

```
function get_head(store):
    justified = store.justified_checkpoint
    head = justified.root

    while True:
        children = get_children(head)
        if len(children) == 0:
            return head

        # 對每個子節點計算 weight
        head = max(children, key=lambda c: (get_weight(store, c), c))
```

### Weight 計算

每個區塊的 weight 是所有指向它或其後代的 latest message 的有效餘額總和：

$$\text{weight}(B) = \sum_{\substack{v \in \text{active\_validators} \\ \text{is\_descendant}(\text{latest\_message}(v).\text{root}, B)}} \text{effective\_balance}(v)$$

只計算未被 slashed 的 active validator。

### 完整 Fork Choice Store

Fork choice 維護一個 `Store` 結構：

| 欄位 | 說明 |
|------|------|
| `time` | 當前 Unix time |
| `genesis_time` | Genesis timestamp |
| `justified_checkpoint` | 當前 justified checkpoint |
| `finalized_checkpoint` | 當前 finalized checkpoint |
| `blocks` | 已知區塊的 mapping |
| `block_states` | 區塊對應的 state |
| `latest_messages` | 每個 validator 的最新 attestation |
| `unrealized_justifications` | 尚未 realize 的 justification |

### Proposer Boost

EIP-7716 / EIP-0261（proposer boost）：proposer 提議的區塊在 attestation deadline（4 秒）前額外獲得相當於 40% committee weight 的 boost。這防止了 ex-ante reorg 攻擊（攻擊者在 slot 開始時就準備好替代區塊）。

$$\text{weight}(B) = \text{attestation\_weight}(B) + \begin{cases} \text{proposer\_boost\_weight} & \text{if } B = \text{current\_slot\_proposal} \\ 0 & \text{otherwise} \end{cases}$$

$$\text{proposer\_boost\_weight} = \frac{\text{committee\_weight} \times 40}{100}$$

Boost 只在當前 slot 有效，下一個 slot 開始就消失。

### Equivocation 處理

如果 validator 被發現 equivocation（同一 slot 投了兩個不同的 head），fork choice 會：

1. 將該 validator 的 weight 從所有候選區塊中移除
2. 而非加到任一邊

這確保 equivocating validator 無法操縱 fork choice。

### 與 Casper FFG 的互動

LMD GHOST 和 [Casper FFG](/ethereum/consensus/casper-ffg/) 組成 Gasper 共識協議：

- **Casper FFG**：決定 finality（哪些區塊不可逆轉）
- **LMD GHOST**：決定 chain head（下一個區塊應建立在哪裡）
- LMD GHOST 的起點是 Casper FFG 的 justified checkpoint
- Finalized 的區塊永遠在 canonical chain 上

```
Finalized -> Justified -> ... -> Head
   (FFG)       (FFG)      (GHOST)
```

### 安全性分析

LMD GHOST 的安全性依賴幾個假設：

- **誠實多數**：> 50% 的 stake 由誠實 validator 控制
- **同步性**：誠實 validator 的 attestation 在 1 slot 內能到達其他 validator
- **Proposer boost**：防止 balancing attack（攻擊者在兩個分支之間平衡 weight）

已知攻擊向量：
- **Balancing attack**：攻擊者控制 proposer 時交替 withhold/release 區塊（proposer boost 緩解）
- **Avalanche attack**：利用網路延遲製造持續的 reorg（需要 > 1/3 stake）

## 在 Ethereum 中的應用

### Reorg 頻率

正常情況下 reorg 很少：
- 1 slot reorg 偶爾發生（proposer 延遲廣播）
- 2+ slot reorg 極其罕見
- Finalized 區塊永遠不會 reorg

### 對 DApp 的影響

- 單個 confirmation：可能被 reorg
- 等待 justified：幾乎不可能被 reorg
- 等待 finalized：cryptoeconomic 保證不可逆

### 實作優化

實際的 CL 客戶端用 proto-array 或 fork-choice-store 優化：
- 不用每次都從 justified 遍歷
- 增量更新 weight
- 維護 best child / best descendant 索引

## 程式碼範例

```python
# LMD GHOST fork choice（簡化版）
from dataclasses import dataclass
from typing import Dict, Optional

@dataclass(frozen=True)
class LatestMessage:
    epoch: int
    root: bytes  # block root

def get_head(store) -> bytes:
    """從 justified checkpoint 開始，用 LMD GHOST 找 head。"""
    head = store.justified_checkpoint.root

    while True:
        children = get_children(store, head)
        if not children:
            return head

        # 選 weight 最大的子節點（tie-break 用 root 的字典序）
        head = max(children, key=lambda c: (get_weight(store, c), c))

def get_weight(store, block_root: bytes) -> int:
    """計算某區塊子樹的 attestation weight。"""
    state = store.checkpoint_states[store.justified_checkpoint]
    weight = 0

    for i, validator in enumerate(state.validators):
        # 只計算 active 且未 slashed 的 validator
        if not is_active(validator, state.current_epoch):
            continue
        if validator.slashed:
            continue

        # 檢查 latest message 是否指向此區塊或其後代
        if i in store.latest_messages:
            msg = store.latest_messages[i]
            if is_ancestor(store, block_root, msg.root):
                weight += validator.effective_balance

    # Proposer boost
    if should_apply_boost(store, block_root):
        committee_weight = get_total_active_balance(state) // 32
        weight += (committee_weight * 40) // 100

    return weight

def is_ancestor(store, ancestor: bytes, descendant: bytes) -> bool:
    """檢查 ancestor 是否是 descendant 的祖先。"""
    current = descendant
    while current != ancestor:
        parent = store.blocks[current].parent_root
        if parent == current:  # reached genesis
            return False
        current = parent
    return True
```

```javascript
// 用 Beacon API 觀察 fork choice
async function getForkChoice(beaconUrl) {
  const res = await fetch(`${beaconUrl}/eth/v1/debug/fork_choice`);
  const data = await res.json();

  // fork_choice_nodes 包含所有已知區塊的 weight
  const nodes = data.data.fork_choice_nodes;

  // 找到 head
  const head = nodes.find((n) => n.block_root === data.data.head_root);

  // 找有競爭的 fork point
  const forkPoints = nodes.filter((n) => {
    const children = nodes.filter((c) => c.parent_root === n.block_root);
    return children.length > 1;
  });

  return {
    headSlot: head.slot,
    headRoot: head.block_root,
    headWeight: head.weight,
    justifiedEpoch: data.data.justified_checkpoint.epoch,
    finalizedEpoch: data.data.finalized_checkpoint.epoch,
    activeForkPoints: forkPoints.length,
  };
}
```

## 相關概念

- [Casper FFG](/ethereum/consensus/casper-ffg/) - 與 LMD GHOST 組成 Gasper 共識協議
- [Attestation](/ethereum/consensus/attestation/) - Head vote 是 LMD GHOST 的輸入
- [Validators](/ethereum/consensus/validators/) - 投票的主體
- [Beacon Chain](/ethereum/consensus/beacon-chain/) - Fork choice 的執行環境
- [區塊結構](/ethereum/consensus/block-structure/) - Fork choice 決定哪個區塊是 canonical head
- [Slashing](/ethereum/consensus/slashing/) - Equivocation 會影響 fork choice weight 計算
- [共識與最終性](/ethereum/transaction-lifecycle/consensus-finality/) - 交易流程中 fork choice 的角色
