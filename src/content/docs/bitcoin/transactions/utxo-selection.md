---
title: "UTXO 選擇"
description: "UTXO Selection, Coin Selection, 選幣演算法, Branch and Bound, Knapsack"
tags: [bitcoin, transactions, utxo, coin-selection, privacy, optimization]
---

# UTXO 選擇

## 概述

UTXO 選擇（Coin Selection）是 Bitcoin 交易構建的第一步：從錢包擁有的 [UTXO](/bitcoin/data-structures/utxo-model/) 集合中挑選子集，使其總額足以覆蓋支付金額和 [手續費](/bitcoin/transactions/fee-estimation/)。這本質上是一個帶約束的子集和問題（subset-sum problem），且解的品質直接影響手續費成本、隱私保護和未來可花費性。Bitcoin Core 實作了多種演算法來處理這個 NP-hard 問題。

## 核心原理

### 問題定義

給定：
- UTXO 集合 $U = \{u_1, u_2, ..., u_n\}$，每個 $u_i$ 有值 $v_i$
- 目標金額 $t$（支付金額 + 手續費）
- 費率 $r$（sat/vByte）
- 每個 UTXO 的花費成本 $c_i = r \times \text{inputSize}(u_i)$

目標：找到子集 $S \subseteq U$ 使得：

$$\sum_{u_i \in S} v_i \geq t + \sum_{u_i \in S} c_i$$

最小化多餘金額（waste）：

$$\text{waste} = \sum_{u_i \in S} v_i - t - \sum_{u_i \in S} c_i$$

### 有效值（Effective Value）

每個 UTXO 花費時需要提供 input 資料，這會增加交易大小和手續費。因此實際可用金額是扣除花費成本後的「有效值」：

$$\text{effectiveValue}(u_i) = v_i - r \times \text{inputSize}(u_i)$$

若有效值為負，該 UTXO 在當前費率下不值得花費（稱為 dust）。

### Branch and Bound 演算法

Bitcoin Core（自 0.17 起）優先使用 Branch and Bound（BnB）搜尋精確匹配，即找到 waste 為零的子集：

$$\sum_{u_i \in S} \text{effectiveValue}(u_i) = t$$

精確匹配的優勢是不需要找零輸出（change output），節省了找零輸出的空間（約 34 bytes）和未來花費該找零 UTXO 的成本。

演算法以深度優先搜尋遍歷 UTXO 子集，利用以下剪枝規則：

1. **上界剪枝**：若當前累計值超過 $t + \text{costOfChange}$，剪枝
2. **下界剪枝**：若當前累計值加上所有剩餘 UTXO 的有效值仍小於 $t$，剪枝
3. **迭代上限**：避免指數爆炸，設定最大迭代次數（100,000）

### Knapsack 求解器（後備方案）

若 BnB 找不到精確匹配，退回到隨機化 Knapsack 演算法：

1. 將 UTXO 按有效值降序排列
2. 隨機嘗試組合，目標是最小化超額
3. 多次隨機迭代，保留最佳解
4. 確保產生合理的找零輸出

### Waste Metric

Bitcoin Core 使用 waste metric 來比較不同選幣方案的品質：

$$\text{waste} = \text{selectionWaste} + \text{changeWaste}$$

其中：

$$\text{selectionWaste} = \sum_{u_i \in S} (r_{\text{current}} - r_{\text{long\_term}}) \times \text{inputSize}(u_i)$$

$$\text{changeWaste} = \begin{cases} \text{changeCost} + \text{changeSpendCost} & \text{if change output} \\ \text{excess} & \text{if no change} \end{cases}$$

$r_{\text{long\_term}}$ 是長期平均費率估計值，用於評估「現在花費 vs 未來花費」的時間偏好。

## 隱私影響

UTXO 選擇對隱私有深遠影響：

### UTXO 群聚分析

鏈分析公司利用 **common-input-ownership heuristic**：同一交易的所有 input 被假設屬於同一實體。不良的選幣策略會將不同來源的 UTXO 聚合，洩漏關聯性。

### 找零輸出辨識

找零輸出通常可被辨識：
- 金額非整數（非 round number）
- 地址類型與支付輸出不同
- 在同一錢包中被後續交易花費

### 隱私最佳實踐

1. **避免不必要的 UTXO 合併**：減少 common-input 關聯
2. **匹配輸出類型**：找零地址與支付地址使用相同腳本類型
3. **避免 dust 整合**：大量小額 UTXO 合併交易明顯異常

## 找零輸出最佳化

找零輸出的處理策略影響未來的交易效率：

1. **精確匹配優先**（BnB）：消除找零輸出
2. **合理找零金額**：避免產生 dust（低於 546 satoshis 的 P2PKH 輸出）
3. **找零到 SegWit 地址**：降低未來花費成本
4. **UTXO 池管理**：維持適當數量和面額的 UTXO，減少未來的選幣困難

## 程式碼範例

```javascript
// Branch and Bound UTXO 選擇演算法（簡化版）
function branchAndBound(utxos, target, costOfChange, maxIterations = 100000) {
  // 按有效值降序排列
  const sorted = [...utxos]
    .filter(u => u.effectiveValue > 0)
    .sort((a, b) => b.effectiveValue - a.effectiveValue);

  const totalAvailable = sorted.reduce((sum, u) => sum + u.effectiveValue, 0);
  if (totalAvailable < target) return null; // 餘額不足

  let bestSelection = null;
  let bestWaste = Infinity;
  let iterations = 0;

  function search(index, currentValue, selected) {
    if (iterations++ > maxIterations) return;

    // 找到精確匹配
    if (currentValue >= target && currentValue <= target + costOfChange) {
      const waste = currentValue - target;
      if (waste < bestWaste) {
        bestWaste = waste;
        bestSelection = [...selected];
      }
      return;
    }

    if (index >= sorted.length) return;

    // 上界剪枝：超過目標加找零成本
    if (currentValue > target + costOfChange) return;

    // 下界剪枝：加上所有剩餘也不夠
    const remaining = sorted.slice(index).reduce((s, u) => s + u.effectiveValue, 0);
    if (currentValue + remaining < target) return;

    // 包含當前 UTXO
    selected.push(sorted[index]);
    search(index + 1, currentValue + sorted[index].effectiveValue, selected);
    selected.pop();

    // 不包含當前 UTXO
    search(index + 1, currentValue, selected);
  }

  search(0, 0, []);
  return bestSelection;
}

// 範例使用
const utxos = [
  { txid: 'abc...', vout: 0, value: 50000, effectiveValue: 49890 },
  { txid: 'def...', vout: 1, value: 30000, effectiveValue: 29890 },
  { txid: 'ghi...', vout: 0, value: 20000, effectiveValue: 19890 },
  { txid: 'jkl...', vout: 2, value: 10000, effectiveValue: 9890 },
];

const target = 49780; // 精確匹配 30000 + 20000 的有效值
const result = branchAndBound(utxos, target, 500);
```

```python
import random
from dataclasses import dataclass
from typing import Optional

@dataclass(frozen=True)
class UTXO:
    txid: str
    vout: int
    value: int       # satoshis
    input_size: int  # bytes (depends on script type)

def effective_value(utxo: UTXO, fee_rate: float) -> float:
    """扣除花費成本後的有效值"""
    return utxo.value - fee_rate * utxo.input_size

def knapsack_selection(
    utxos: list[UTXO],
    target: int,
    fee_rate: float,
    iterations: int = 1000
) -> Optional[list[UTXO]]:
    """Knapsack 隨機化選幣（簡化版）"""
    viable = [u for u in utxos if effective_value(u, fee_rate) > 0]
    viable.sort(key=lambda u: effective_value(u, fee_rate), reverse=True)

    best_selection = None
    best_excess = float('inf')

    for _ in range(iterations):
        selected = []
        total = 0

        # 隨機選取 UTXO
        shuffled = viable[:]
        random.shuffle(shuffled)

        for utxo in shuffled:
            ev = effective_value(utxo, fee_rate)
            selected.append(utxo)
            total += ev

            if total >= target:
                excess = total - target
                if excess < best_excess:
                    best_excess = excess
                    best_selection = selected[:]
                break

    return best_selection

# 範例
utxos = [
    UTXO("aabb...", 0, 100000, 68),  # P2WPKH input ~68 vBytes
    UTXO("ccdd...", 1, 50000, 68),
    UTXO("eeff...", 0, 25000, 148),  # P2PKH input ~148 vBytes
    UTXO("1122...", 2, 10000, 68),
]

fee_rate = 10.0  # sat/vByte
target_amount = 120000  # 要支付的金額（含手續費）

result = knapsack_selection(utxos, target_amount, fee_rate)
if result:
    total_value = sum(u.value for u in result)
    total_eff = sum(effective_value(u, fee_rate) for u in result)
    print(f"Selected {len(result)} UTXOs, total: {total_value} sat")
    print(f"Effective total: {total_eff:.0f} sat, excess: {total_eff - target_amount:.0f} sat")
```

## 相關概念

- [UTXO Model](/bitcoin/data-structures/utxo-model/) - UTXO 模型的基礎概念
- [Fee Estimation](/bitcoin/transactions/fee-estimation/) - 費率估算影響 effective value
- [Transaction Lifecycle](/bitcoin/transactions/transaction-lifecycle-btc/) - UTXO 選擇是交易流程第一步
- [P2WPKH/P2WSH](/bitcoin/transactions/p2wpkh-p2wsh/) - SegWit 輸入的花費成本較低
- [P2TR](/bitcoin/transactions/p2tr/) - Taproot 輸入尺寸統一
- [P2PKH](/bitcoin/transactions/p2pkh/) - Legacy 輸入的花費成本較高
- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - 不同腳本類型影響 input size
- [RBF/CPFP](/bitcoin/transactions/rbf-cpfp/) - fee bumping 可能需要重新選幣
- [Mempool](/bitcoin/network/mempool-btc/) - 費率波動影響選幣策略
