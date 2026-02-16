---
title: "手續費估算"
description: "Fee Estimation, sat/vByte, Mempool fee estimation, block space auction, Bitcoin 手續費機制"
tags: [bitcoin, transactions, fee, estimation, mempool, sat-per-vbyte, block-space]
---

# 手續費估算

## 概述

Bitcoin 的手續費機制是一個純市場驅動的系統：沒有協議層面的 base fee 或動態調整。手續費隱含在交易的輸入輸出差額中，以 sat/vByte（satoshis per virtual byte）為費率單位。區塊空間是有限資源（4M weight units），交易透過費率競標爭奪打包優先權。手續費估算的準確性直接影響使用者體驗：費率太低可能導致交易卡在 [Mempool](/bitcoin/network/mempool-btc/) 數小時甚至數天，費率太高則浪費資金。

## 核心原理

### 手續費計算

Bitcoin 的手續費是交易的隱含欄位，不像 Ethereum 有明確的 gas 參數：

$$\text{fee} = \sum_{i=0}^{n-1} \text{value}(\text{input}_i) - \sum_{j=0}^{m-1} \text{value}(\text{output}_j)$$

手續費率（fee rate）以 virtual bytes 為單位：

$$\text{feeRate} = \frac{\text{fee (satoshis)}}{\text{vBytes}}$$

其中 virtual bytes 的定義見 [SegWit 序列化](/bitcoin/transactions/segwit-serialization/)：

$$\text{vBytes} = \lceil \text{weight} / 4 \rceil = \lceil (\text{non-witness} \times 4 + \text{witness}) / 4 \rceil$$

### 區塊空間即拍賣

每個區塊最多 4,000,000 weight units（約 1,000,000 vBytes）。礦工理性地選擇高費率交易以最大化收益：

$$\text{minerRevenue} = \text{blockSubsidy} + \sum_{\text{tx} \in \text{block}} \text{fee}(\text{tx})$$

交易被打包的優先序取決於 fee rate 排名，而非絕對手續費金額。一筆 1000 sat 手續費但只有 100 vB 的交易（10 sat/vB），優先於 2000 sat 手續費但 400 vB 的交易（5 sat/vB）。

### Mempool 費率分布

[Mempool](/bitcoin/network/mempool-btc/) 中的交易按費率排序，可以視覺化為「費率帶」：

```
高費率  |████████████| 50+ sat/vB  - 下一個區塊
        |████████████████████| 20-50 sat/vB  - 1-3 區塊
        |████████████████████████████| 10-20 sat/vB  - 3-6 區塊
低費率  |████████████████████████████████████| 1-10 sat/vB  - 可能很久
```

### 費率估算方法

#### 1. 歷史區塊分析

觀察最近 N 個區塊中包含的交易費率分布：

$$\text{estimatedRate}(n) = \text{percentile}_{p}(\text{feeRates}(\text{recentBlocks}))$$

Bitcoin Core 的 `estimatesmartfee` 使用這個方法，並根據目標確認區塊數調整百分位數。

#### 2. Mempool 快照分析

即時分析當前 mempool 中的交易費率分布，預測在目標時間內被打包所需的費率：

假設 mempool 中費率高於 $r$ 的交易總大小為 $S(r)$，目標 $k$ 個區塊內確認：

$$\text{requiredRate} = \min \{ r : S(r) \leq k \times \text{blockCapacity} \}$$

#### 3. 費率預測模型

更複雜的模型考慮：
- 歷史費率波動模式（週末/工作日、亞洲/歐洲/美洲時段）
- 新交易到達速率
- 區塊發現間隔的隨機性

### Bitcoin Core 的 estimatesmartfee

Bitcoin Core 維護一個費率桶（fee rate bucket）統計資料，追蹤不同費率的交易在多少個區塊內被確認：

| 目標區塊數 | 含義 | 典型場景 |
|-----------|------|---------|
| 1 | 下一個區塊確認 | 緊急交易 |
| 3 | 約 30 分鐘 | 一般交易 |
| 6 | 約 1 小時 | 不緊急 |
| 144 | 約 1 天 | 低優先 |
| 1008 | 約 1 週 | 最低費率 |

### 與 Ethereum EIP-1559 的比較

| 特徵 | Bitcoin | Ethereum (EIP-1559) |
|------|---------|-------------------|
| 費用結構 | 純市場拍賣 | base fee + priority fee |
| 動態調整 | 無（純供需） | 協議自動調整 base fee |
| 燃燒機制 | 無（全歸礦工） | base fee 被燃燒 |
| 費率單位 | sat/vByte | gwei/gas |
| 可預測性 | 低（波動大） | 較高（base fee 平滑變化） |
| 超額退還 | 無（差額即手續費） | `maxFeePerGas - effectiveGasPrice` 退還 |
| 費率上限 | 無 | `maxFeePerGas` 設定上限 |

Bitcoin 的純市場模型更簡潔，但費率預測更困難。Ethereum 的 [EIP-1559](/ethereum/accounts/eip-1559/) 引入協議層面的 base fee 使費率更可預測，但增加了複雜度。

### 費率波動因素

影響 Bitcoin 手續費的主要因素：

1. **網路擁塞**：未確認交易數量和大小
2. **區塊時間變異**：實際區塊間隔偏離 10 分鐘的均值
3. **Inscription/Ordinals 活動**：大量鏈上資料嵌入推高費率
4. **減半事件**：礦工收入減少可能影響算力和出塊速度
5. **交易所大量提款/整合**：機構性 UTXO 操作

## 程式碼範例

```javascript
// 手續費計算與估算

function calculateFee(inputs, outputs) {
  const inputSum = inputs.reduce((sum, inp) => sum + inp.value, 0);
  const outputSum = outputs.reduce((sum, out) => sum + out.value, 0);
  const fee = inputSum - outputSum;

  if (fee < 0) {
    throw new Error('Invalid transaction: outputs exceed inputs');
  }

  return fee;
}

function estimateTransactionWeight(inputCount, outputCount, type = 'p2wpkh') {
  const weights = {
    p2pkh:  { inputWeight: 592, outputWeight: 136 },  // 148*4, 34*4
    p2wpkh: { inputWeight: 272, outputWeight: 124 },   // 41*4 + 108*1, 31*4
    p2tr:   { inputWeight: 230, outputWeight: 172 },   // 41*4 + 66*1, 43*4
  };

  const { inputWeight, outputWeight } = weights[type];
  const overhead = 42; // version(16) + marker(1) + flag(1) + counts(4) + locktime(16) + ...

  const weight = overhead + inputCount * inputWeight + outputCount * outputWeight;
  const vBytes = Math.ceil(weight / 4);

  return { weight, vBytes };
}

function calculateRequiredFee(feeRate, inputCount, outputCount, type = 'p2wpkh') {
  const { vBytes } = estimateTransactionWeight(inputCount, outputCount, type);
  return Math.ceil(feeRate * vBytes);
}

// 計算最大支付金額（扣除手續費後）
function maxSendAmount(utxoValues, feeRate, outputCount = 2, type = 'p2wpkh') {
  const inputCount = utxoValues.length;
  const fee = calculateRequiredFee(feeRate, inputCount, outputCount, type);
  const totalInput = utxoValues.reduce((a, b) => a + b, 0);
  return Math.max(0, totalInput - fee);
}

// 範例
const feeRate = 15; // sat/vB
const est = estimateTransactionWeight(2, 2, 'p2wpkh');
const fee = calculateRequiredFee(feeRate, 2, 2, 'p2wpkh');
console.log(`2-in-2-out P2WPKH: ${est.vBytes} vB, fee at ${feeRate} sat/vB: ${fee} sat`);
```

```python
from dataclasses import dataclass
from typing import Literal

@dataclass(frozen=True)
class WeightEstimate:
    weight: int
    vbytes: int
    fee: int

TX_TYPE = Literal['p2pkh', 'p2wpkh', 'p2tr']

# 典型 weight 參數（per-input / per-output）
WEIGHT_PARAMS: dict[TX_TYPE, dict] = {
    'p2pkh':  {'input_w': 592, 'output_w': 136},   # 148*4 / 34*4
    'p2wpkh': {'input_w': 272, 'output_w': 124},    # (41*4+108) / 31*4
    'p2tr':   {'input_w': 230, 'output_w': 172},    # (41*4+66) / 43*4
}

def estimate_fee(
    n_inputs: int,
    n_outputs: int,
    fee_rate: float,
    tx_type: TX_TYPE = 'p2wpkh'
) -> WeightEstimate:
    """估算交易手續費"""
    params = WEIGHT_PARAMS[tx_type]
    overhead = 42  # version + counts + locktime + marker/flag
    weight = (
        overhead
        + n_inputs * params['input_w']
        + n_outputs * params['output_w']
    )
    vbytes = (weight + 3) // 4
    fee = int(fee_rate * vbytes)
    return WeightEstimate(weight=weight, vbytes=vbytes, fee=fee)

def fee_from_tx(input_values: list[int], output_values: list[int]) -> int:
    """從交易的 input/output 金額計算實際手續費"""
    fee = sum(input_values) - sum(output_values)
    if fee < 0:
        raise ValueError("Invalid: outputs exceed inputs")
    return fee

def effective_fee_rate(fee: int, weight: int) -> float:
    """計算實際費率 (sat/vByte)"""
    vbytes = (weight + 3) // 4
    return fee / vbytes if vbytes > 0 else 0

# 範例：比較不同類型的手續費
for tx_type in ('p2pkh', 'p2wpkh', 'p2tr'):
    est = estimate_fee(1, 2, 20.0, tx_type)
    print(f"{tx_type}: {est.vbytes} vB, fee={est.fee} sat "
          f"({est.fee / 1e8:.8f} BTC)")

# 實際交易的手續費驗證
inputs = [50000, 30000]   # 兩個 UTXO
outputs = [70000, 8000]   # 支付 + 找零
actual_fee = fee_from_tx(inputs, outputs)
est = estimate_fee(2, 2, 0, 'p2wpkh')
actual_rate = effective_fee_rate(actual_fee, est.weight)
print(f"\nActual fee: {actual_fee} sat, rate: {actual_rate:.1f} sat/vB")
```

## 相關概念

- [Mempool BTC](/bitcoin/network/mempool-btc/) - 手續費率排序的交易池
- [RBF/CPFP](/bitcoin/transactions/rbf-cpfp/) - 交易加速手段
- [EIP-1559 (ETH)](/ethereum/accounts/eip-1559/) - Ethereum 的費用市場機制對比
- [SegWit Serialization](/bitcoin/transactions/segwit-serialization/) - weight/vByte 的定義
- [UTXO Selection](/bitcoin/transactions/utxo-selection/) - 選幣策略影響交易大小和手續費
- [UTXO Model](/bitcoin/data-structures/utxo-model/) - 手續費隱含在 UTXO 差額中
- [Transaction Lifecycle](/bitcoin/transactions/transaction-lifecycle-btc/) - 手續費在交易流程中的角色
- [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) - 礦工收益與區塊打包
- [P2WPKH/P2WSH](/bitcoin/transactions/p2wpkh-p2wsh/) - SegWit 輸出的費用節省
- [P2TR](/bitcoin/transactions/p2tr/) - Taproot 的費用特性
