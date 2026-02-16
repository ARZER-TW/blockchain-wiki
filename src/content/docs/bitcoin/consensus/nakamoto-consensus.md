---
title: "Nakamoto Consensus"
description: "Nakamoto Consensus, 中本聰共識, Byzantine Fault Tolerance"
tags: [bitcoin, consensus, nakamoto, bft, probabilistic-finality]
---

# Nakamoto Consensus

## 概述

Nakamoto Consensus 是 Satoshi Nakamoto 在 2008 年白皮書中提出的共識機制，首次在 permissionless（無許可）環境下解決了 Byzantine Generals Problem。與傳統 BFT 協議（如 PBFT）不同，它不需要已知的參與者集合，任何人都可以自由加入或離開網路。其核心由三大支柱組成：[Proof-of-Work](/bitcoin/consensus/pow-hashcash/)、[最長鏈規則](/bitcoin/consensus/longest-chain-rule/)（實為最大累計工作量）、以及 [難度調整](/bitcoin/consensus/difficulty-adjustment/)。這三者共同確保 Bitcoin 網路在去中心化環境中維持一致性與安全性。

## 核心原理

### Byzantine Generals Problem

在分散式系統中，節點可能故障或惡意行為，如何在不信任的環境下達成共識是經典的 Byzantine Generals Problem。傳統解法（如 Lamport 1982）要求 $n \geq 3f + 1$ 個已知節點才能容忍 $f$ 個惡意節點，且需要同步通訊。

Nakamoto Consensus 的突破在於：
1. 不需要已知的節點集合（permissionless）
2. 用 PoW 作為 Sybil resistance 機制
3. 提供**機率性最終性**（probabilistic finality）而非確定性最終性

### 三大支柱

| 支柱 | 功能 | 參考 |
|------|------|------|
| **Proof-of-Work** | Sybil resistance，將投票權綁定到算力 | [PoW](/bitcoin/consensus/pow-hashcash/) |
| **Longest Chain Rule** | Fork choice rule，選擇累計工作量最大的鏈 | [最長鏈規則](/bitcoin/consensus/longest-chain-rule/) |
| **Difficulty Adjustment** | 維持穩定的出塊間隔（~10 分鐘） | [難度調整](/bitcoin/consensus/difficulty-adjustment/) |

### 機率性最終性

Nakamoto Consensus 不提供絕對的 finality。一筆交易被確認的安全性隨著後續區塊的增加而指數級增長。攻擊者持有全網 $q$ 比例的算力，誠實節點持有 $p = 1 - q$ 比例，交易後已有 $z$ 個確認區塊時，攻擊者成功追上的機率為：

$$P(\text{attacker catches up}) = \begin{cases} 1 & \text{if } q \geq p \\ (q/p)^z & \text{if } q < p \end{cases}$$

白皮書中給出的精確計算（考慮 Poisson 分佈）：

$$P = 1 - \sum_{k=0}^{z} \frac{e^{-\lambda} \lambda^k}{k!} \left(1 - (q/p)^{z-k}\right), \quad \lambda = z \cdot \frac{q}{p}$$

以 $q = 0.1$（10% 算力攻擊者）為例：

| 確認數 $z$ | 攻擊成功機率 |
|------------|-------------|
| 1 | 0.2045873 |
| 3 | 0.0131722 |
| 6 | 0.0002428 |
| 10 | 0.0000012 |

這就是「6 confirmations」慣例的由來：6 個確認後攻擊成功的機率已低於 0.1%。

### 與 Ethereum 確定性最終性的對比

| 特性 | Nakamoto (Bitcoin) | Casper FFG (Ethereum) |
|------|-------------------|----------------------|
| 最終性類型 | 機率性 | 確定性 |
| 確認時間 | ~60 分鐘（6 塊） | ~12.8 分鐘（2 epoch） |
| 逆轉成本 | 51% 算力持續攻擊 | 銷毀 >1/3 質押量 |
| Sybil resistance | PoW（算力） | PoS（質押） |
| 能量消耗 | 高 | 低（~99.95% 節省） |

[Casper FFG](/ethereum/consensus/casper-ffg/) 一旦 finalize 了某個 checkpoint，除非超過 1/3 的 validator 被 slashed，否則不可逆轉。

### 經濟安全模型

51% 攻擊的成本可以從兩個維度估算：

**硬體成本**：取得全網 >50% 的 hashrate 需要的 ASIC 購買成本。

$$C_{\text{hardware}} = \frac{H_{\text{network}}}{H_{\text{per\_unit}}} \times P_{\text{unit}}$$

**營運成本**：持續攻擊的電力消耗。

$$C_{\text{electricity}} = \frac{H_{\text{network}}}{E_{\text{efficiency}}} \times P_{\text{kWh}} \times T_{\text{hours}}$$

截至 2024 年，估計的 51% 攻擊成本超過數十億美元的硬體投資加上每小時數百萬美元的電力支出，使得攻擊在經濟上不可行。

## 程式碼範例

```python
# Nakamoto Consensus 機率性最終性計算
import math

def attacker_success_probability(q, z):
    """
    計算攻擊者成功逆轉 z 個確認區塊的機率。
    q: 攻擊者的算力佔比 (0 < q < 0.5)
    z: 確認區塊數
    """
    if q >= 0.5:
        return 1.0

    p = 1.0 - q
    lam = z * (q / p)

    total = 0.0
    for k in range(z + 1):
        poisson = math.exp(-lam) * (lam ** k) / math.factorial(k)
        total += poisson * (1.0 - (q / p) ** (z - k))

    return 1.0 - total


def required_confirmations(q, threshold=1e-6):
    """
    計算達到指定安全閾值所需的確認數。
    """
    z = 0
    while True:
        prob = attacker_success_probability(q, z)
        if prob < threshold:
            return z
        z += 1


# 不同攻擊者算力下的安全性
for q in [0.01, 0.05, 0.10, 0.25, 0.30, 0.45]:
    confs = required_confirmations(q, threshold=1e-4)
    prob_6 = attacker_success_probability(q, 6)
    print(f"q={q:.2f}: 6-conf prob={prob_6:.2e}, need {confs} confs for 1e-4")
```

```javascript
// 查詢 Bitcoin 區塊確認狀態
async function getConfirmationSafety(txid, rpcUrl) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getrawtransaction",
      params: [txid, true],
    }),
  });
  const data = await response.json();

  if (!data.result || !data.result.confirmations) {
    return { confirmed: false, confirmations: 0, safetyLevel: "unconfirmed" };
  }

  const confirmations = data.result.confirmations;
  const q = 0.1; // 假設攻擊者佔 10% 算力
  const p = 1 - q;

  // 簡化的攻擊成功機率
  const attackProb = Math.pow(q / p, confirmations);

  const safetyLevel =
    confirmations >= 6
      ? "safe"
      : confirmations >= 3
        ? "moderate"
        : "low";

  return {
    confirmed: true,
    confirmations,
    attackProbability: attackProb,
    safetyLevel,
  };
}
```

## 相關概念

- [Proof-of-Work (Hashcash)](/bitcoin/consensus/pow-hashcash/) - Nakamoto Consensus 的 Sybil resistance 機制
- [最長鏈規則](/bitcoin/consensus/longest-chain-rule/) - Fork choice rule，選擇累計工作量最大的鏈
- [難度調整](/bitcoin/consensus/difficulty-adjustment/) - 維持 10 分鐘出塊間隔的自動調節機制
- [自私挖礦](/bitcoin/consensus/selfish-mining/) - 挑戰 Nakamoto Consensus 安全假設的攻擊策略
- [區塊驗證](/bitcoin/consensus/block-validation/) - 全節點驗證區塊的完整流程
- [Beacon Chain (ETH)](/ethereum/consensus/beacon-chain/) - Ethereum 的共識層，採用 PoS 替代 PoW
- [Casper FFG (ETH)](/ethereum/consensus/casper-ffg/) - Ethereum 的確定性最終性機制，與 Bitcoin 的機率性最終性形成對比
- [LMD GHOST (ETH)](/ethereum/consensus/lmd-ghost/) - Ethereum 的 fork choice rule，與 Bitcoin 最長鏈規則的比較
- [Hash Function 概述](/fundamentals/cryptography/hash-function-overview/) - PoW 依賴的密碼學基礎
- [Merkle Tree](/fundamentals/data-structures/merkle-tree/) - 區塊內交易的組織結構
