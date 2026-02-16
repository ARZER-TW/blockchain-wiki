---
title: "Selfish Mining"
description: "Selfish Mining, 自私挖礦, block withholding, Eyal Sirer"
tags: [bitcoin, consensus, selfish-mining, attack, game-theory]
---

# Selfish Mining

## 概述

Selfish Mining 是 Ittay Eyal 和 Emin Gun Sirer 於 2014 年提出的攻擊策略，證明持有超過約 33% 算力（而非傳統認為的 50%）的礦工即可獲得超過其算力比例的收益。攻擊者透過策略性地隱藏已挖出的區塊，在適當時機發布以浪費誠實礦工的算力。這項發現挑戰了 [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) 的安全性假設，引發了對 Bitcoin 協議激勵相容性的深入討論。

## 核心原理

### 攻擊策略

自私礦工的核心策略是**不立即發布找到的區塊**，而是建立一條私有鏈。當誠實礦工在公共鏈上找到新區塊時，自私礦工根據私有鏈的長度優勢決定發布時機：

1. **挖到區塊**：不發布，繼續在私有鏈上挖礦
2. **私有鏈領先 1**：如果誠實礦工也找到區塊，立即發布自己的區塊造成競爭
3. **私有鏈領先 2+**：安全領先，繼續隱藏
4. **私有鏈被追上**：發布所有隱藏的區塊搶先

### State Machine 模型

自私挖礦可以用有限狀態機描述。狀態 $s$ 代表自私礦工的私有鏈領先區塊數：

```
State 0 (無領先):
  - 自私礦工找到區塊 (機率 q) -> State 1
  - 誠實礦工找到區塊 (機率 p) -> State 0 (正常行為)

State 1 (領先 1 塊):
  - 自私礦工找到區塊 (機率 q) -> State 2
  - 誠實礦工找到區塊 (機率 p) -> State 0' (競爭發布)

State 0' (競爭狀態):
  - 自私礦工的區塊被選中 (機率 gamma) -> State 0, 自私礦工得 1 block reward
  - 誠實礦工的區塊被選中 (機率 1-gamma) -> State 0, 誠實礦工得 1 block reward

State k >= 2 (領先 k 塊):
  - 自私礦工找到區塊 (機率 q) -> State k+1
  - 誠實礦工找到區塊 (機率 p) -> State k-1, 自私礦工發布一個區塊
```

其中 $p = 1 - q$ 是誠實礦工的算力佔比，$\gamma$ 是在競爭狀態下自私礦工的區塊被選中的機率（取決於網路拓撲）。

### 收益分析

自私礦工的 revenue ratio（收益佔比）：

$$R_{\text{selfish}} = \frac{q(1 - q)^2(4q + \gamma(1 - 2q)) - q^3}{1 - q(1 + (2 - q)q)}$$

當 $\gamma = 0$（最不利情況，誠實礦工總是贏得競爭）時，自私挖礦在以下條件下有利可圖：

$$q > \frac{1}{3} \approx 33.3\%$$

當 $\gamma = 1$（最有利情況，自私礦工總是贏得競爭）時：

$$q > 0 \quad (\text{任何算力都有利可圖，但收益極微})$$

更實際的閾值，假設 $\gamma = 0.5$：

$$q > \frac{1}{4} = 25\%$$

### 與誠實挖礦的比較

| 算力 $q$ | 誠實挖礦收益 | 自私挖礦收益 ($\gamma=0.5$) | 差異 |
|----------|-------------|---------------------------|------|
| 0.10 | 10% | ~8% | 不划算 |
| 0.25 | 25% | ~25% | 臨界點 |
| 0.33 | 33% | ~38% | 有利可圖 |
| 0.40 | 40% | ~51% | 顯著優勢 |

### 為什麼有效

自私挖礦的本質是讓誠實礦工**浪費算力**在注定會被拋棄的區塊上。當自私礦工隱藏區塊時，誠實礦工不知道已有更長的鏈存在，繼續在較短的公共鏈上挖礦。當自私礦工最終發布時，依照 [最長鏈規則](/bitcoin/consensus/longest-chain-rule/)，誠實礦工的區塊被拋棄，他們投入的所有算力都被浪費了。

### 緩解措施

**Random tie-breaking**（Eyal & Sirer 提出）：
- 當兩個競爭區塊同時出現時，節點隨機選擇而非總是選擇先收到的
- 這降低了 $\gamma$ 的值，提高了攻擊閾值

**Freshness preferred**：
- 優先選擇 timestamp 更新的區塊
- 減少自私礦工在競爭狀態下的優勢

**網路傳播改善**：
- 更快的 [區塊中繼](/bitcoin/network/block-relay/) 減少自然 fork
- [Compact Blocks](/bitcoin/network/compact-blocks/) 加速區塊傳播

**實際限制**：
- 維持穩定的網路位置需要大量基礎設施
- 被偵測的風險（統計分析可識別異常出塊模式）
- 高度波動的風險：短期內可能損失大量區塊獎勵

## 程式碼範例

```python
# 自私挖礦收益模擬
import random

def simulate_selfish_mining(q, gamma, num_rounds=1_000_000):
    """
    模擬自私挖礦策略，計算收益比。
    q: 自私礦工算力佔比
    gamma: 競爭時自私礦工勝出的機率
    num_rounds: 模擬回合數
    """
    selfish_blocks = 0
    honest_blocks = 0
    private_lead = 0

    for _ in range(num_rounds):
        selfish_finds = random.random() < q

        if private_lead == 0:
            if selfish_finds:
                private_lead = 1
            else:
                honest_blocks += 1

        elif private_lead == 1:
            if selfish_finds:
                private_lead = 2
            else:
                # 競爭狀態
                if random.random() < gamma:
                    selfish_blocks += 1
                else:
                    honest_blocks += 1
                private_lead = 0

        else:  # private_lead >= 2
            if selfish_finds:
                private_lead += 1
            else:
                # 發布一個區塊，保持領先
                selfish_blocks += 1
                private_lead -= 1

    # 結算剩餘的私有鏈
    selfish_blocks += private_lead
    total = selfish_blocks + honest_blocks

    return {
        "selfish_ratio": selfish_blocks / total if total > 0 else 0,
        "honest_ratio": honest_blocks / total if total > 0 else 0,
        "selfish_blocks": selfish_blocks,
        "honest_blocks": honest_blocks,
    }


def analytical_revenue(q, gamma):
    """自私挖礦的理論收益公式"""
    p = 1 - q
    numerator = q * (p ** 2) * (4 * q + gamma * (1 - 2 * q)) - q ** 3
    denominator = 1 - q * (1 + (2 - q) * q)
    if denominator == 0:
        return 0
    return numerator / denominator


# 比較理論與模擬結果
for q in [0.10, 0.20, 0.25, 0.33, 0.40]:
    sim = simulate_selfish_mining(q, gamma=0.5)
    theory = analytical_revenue(q, gamma=0.5)
    print(f"q={q:.2f}: sim={sim['selfish_ratio']:.4f}, theory={theory:.4f}, honest={q:.4f}")
```

```javascript
// 自私挖礦偵測：分析區塊到達模式
function analyzeBlockPatterns(blocks) {
  const intervals = [];
  const orphanRates = [];

  for (let i = 1; i < blocks.length; i++) {
    const interval = blocks[i].timestamp - blocks[i - 1].timestamp;
    intervals.push(interval);

    // 偵測異常短間隔（可能是隱藏區塊批量發布）
    if (interval < 60) {
      orphanRates.push({
        height: blocks[i].height,
        interval,
        suspicious: true,
      });
    }
  }

  // 計算統計指標
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance =
    intervals.reduce((sum, i) => sum + (i - avgInterval) ** 2, 0) /
    intervals.length;
  const stdDev = Math.sqrt(variance);

  // Poisson 分佈下 stdDev 應約等於 mean
  // 自私挖礦會導致 stdDev 顯著高於 mean
  const poissonRatio = stdDev / avgInterval;

  return {
    avgBlockTime: avgInterval,
    stdDev,
    poissonRatio,
    suspiciousPatterns: orphanRates.length,
    possibleSelfishMining: poissonRatio > 1.5,
  };
}
```

## 相關概念

- [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) - 自私挖礦挑戰的安全性假設
- [最長鏈規則](/bitcoin/consensus/longest-chain-rule/) - 攻擊利用的 fork choice rule
- [Proof-of-Work](/bitcoin/consensus/pow-hashcash/) - 攻擊的算力基礎
- [區塊中繼](/bitcoin/network/block-relay/) - 傳播延遲影響攻擊效果
- [Compact Blocks](/bitcoin/network/compact-blocks/) - 降低傳播延遲的協議改善
- [區塊驗證](/bitcoin/consensus/block-validation/) - 驗證不會被自私挖礦繞過
- [難度調整](/bitcoin/consensus/difficulty-adjustment/) - 長期自私挖礦影響 difficulty
- [Mempool (BTC)](/bitcoin/network/mempool-btc/) - 被拋棄區塊中的交易回到 mempool
- [Beacon Chain (ETH)](/ethereum/consensus/beacon-chain/) - PoS 下自私挖礦不適用
- [LMD GHOST (ETH)](/ethereum/consensus/lmd-ghost/) - 不同 fork choice 對類似攻擊的抵抗力
