---
title: "Halving"
description: "Halving, 減半, block subsidy, supply schedule, 21 million"
tags: [bitcoin, consensus, halving, supply, monetary-policy, block-reward]
---

# Halving

## 概述

Bitcoin 的 halving（減半）是每 210,000 個區塊（約四年）將區塊補貼（block subsidy）減半的機制。從最初的 50 BTC 開始，歷經多次減半：50 -> 25 -> 12.5 -> 6.25 -> 3.125 BTC。這個預定的發行曲線確保 Bitcoin 的總供應量漸近收斂至 21,000,000 BTC，成為數位世界中第一個具有可驗證稀缺性的資產。減半機制與 [PoW](/bitcoin/consensus/pow-hashcash/) 和 [難度調整](/bitcoin/consensus/difficulty-adjustment/) 共同構成 Bitcoin 的貨幣政策。

## 核心原理

### 供應量計算

每個 halving epoch 包含 210,000 個區塊，第 $i$ 個 epoch（從 $i=0$ 開始）的 block subsidy 為：

$$\text{subsidy}_i = \frac{50}{2^i} \text{ BTC}$$

總供應量是所有 epoch 的產出之和：

$$\text{total\_supply} = \sum_{i=0}^{32} 210{,}000 \times \frac{50}{2^i} = 210{,}000 \times 50 \times \sum_{i=0}^{32} \frac{1}{2^i}$$

幾何級數的極限：

$$\sum_{i=0}^{\infty} \frac{1}{2^i} = 2$$

因此：

$$\text{total\_supply} \approx 210{,}000 \times 50 \times 2 = 21{,}000{,}000 \text{ BTC}$$

由於 Bitcoin 使用整數（satoshi）運算，實際上最後幾個 epoch 的 subsidy 會因為整除而略少，精確總量為 20,999,999.9769 BTC。

### 減半時間表

| Epoch | 區塊範圍 | 時間（約） | Subsidy | 累計供應量 |
|-------|----------|-----------|---------|-----------|
| 0 | 0 - 209,999 | 2009-2012 | 50 BTC | 10,500,000 |
| 1 | 210,000 - 419,999 | 2012-2016 | 25 BTC | 15,750,000 |
| 2 | 420,000 - 629,999 | 2016-2020 | 12.5 BTC | 18,375,000 |
| 3 | 630,000 - 839,999 | 2020-2024 | 6.25 BTC | 19,687,500 |
| 4 | 840,000 - 1,049,999 | 2024-2028 | 3.125 BTC | 20,343,750 |
| ... | ... | ... | ... | ... |
| 32 | 6,720,000 - 6,929,999 | ~2136-2140 | 1 sat | ~21,000,000 |

### Subsidy 與 Satoshi 精度

Bitcoin 的最小單位是 1 satoshi = $10^{-8}$ BTC。Subsidy 在程式碼中以 satoshi 為單位計算：

$$\text{subsidy\_sats} = \lfloor 50 \times 10^8 / 2^{\text{epoch}} \rfloor$$

當 $\text{epoch} = 33$ 時：

$$\lfloor 5{,}000{,}000{,}000 / 2^{33} \rfloor = \lfloor 0.582 \rfloor = 0$$

即第 34 個 epoch（約 2140 年後）開始，block subsidy 降為零。此後礦工完全依賴交易手續費維持運營。

### 通膨率

Bitcoin 的年通膨率隨每次減半而遞減：

$$\text{inflation\_rate}_i = \frac{210{,}000 \times \text{subsidy}_i}{\text{cumulative\_supply}_i} \times \frac{365.25 \times 24 \times 6}{210{,}000}$$

| 時期 | 年通膨率（約） |
|------|-------------|
| 2009-2012 | ~25-50% |
| 2012-2016 | ~8-12% |
| 2016-2020 | ~4% |
| 2020-2024 | ~1.8% |
| 2024-2028 | ~0.8% |

到 2028 年後，Bitcoin 的通膨率將低於大多數央行的目標通膨率（2%）。

### Fee Market 轉型

隨著 block subsidy 遞減，交易手續費在礦工收入中的佔比持續增加。這引發了長期安全性的討論：

**樂觀觀點**：
- Bitcoin 的價值增長將補償 subsidy 下降
- 隨著使用量增加，手續費總量將足以維持安全性
- Layer 2（如 Lightning Network）的結算交易提供持續的 fee 需求

**悲觀觀點**：
- 純手續費安全性模型尚未被驗證
- 手續費波動性可能導致算力不穩定
- 可能出現 fee sniping（礦工重新挖前一個高手續費區塊）

Fee-to-subsidy 比率趨勢：

$$\text{fee\_ratio} = \frac{\sum \text{tx\_fees}}{\text{block\_subsidy} + \sum \text{tx\_fees}}$$

在 Ordinals/BRC-20 高峰期，部分區塊的 fee ratio 曾超過 50%。

### 與「Stock-to-Flow」模型

Stock-to-Flow (S2F) 模型利用減半事件量化稀缺性：

$$\text{S2F} = \frac{\text{existing\_supply}}{\text{annual\_production}}$$

每次減半使 annual production 減半，S2F 比率翻倍。然而，S2F 模型作為價格預測工具已被廣泛質疑，因為它忽略了需求面的變化。

## 程式碼範例

```python
# Bitcoin halving 時間表與供應量計算
SUBSIDY_HALVING_INTERVAL = 210_000
INITIAL_SUBSIDY_SATS = 50 * 100_000_000  # 50 BTC in satoshis
TOTAL_EPOCHS = 34  # subsidy 降為 0 的 epoch

def get_block_subsidy(height: int) -> int:
    """計算指定高度的 block subsidy（satoshis）"""
    epoch = height // SUBSIDY_HALVING_INTERVAL
    if epoch >= 64:  # 右移超過 63 bits 在某些實作會出問題
        return 0
    return INITIAL_SUBSIDY_SATS >> epoch


def calculate_supply_at_height(height: int) -> int:
    """計算到指定高度的累計供應量（satoshis）"""
    total = 0
    current_height = 0

    while current_height <= height:
        subsidy = get_block_subsidy(current_height)
        if subsidy == 0:
            break

        epoch_end = ((current_height // SUBSIDY_HALVING_INTERVAL) + 1) * SUBSIDY_HALVING_INTERVAL
        blocks_in_range = min(epoch_end, height + 1) - current_height
        total += subsidy * blocks_in_range
        current_height = epoch_end

    return total


def print_halving_schedule():
    """列印完整的減半時間表"""
    for epoch in range(TOTAL_EPOCHS):
        start = epoch * SUBSIDY_HALVING_INTERVAL
        subsidy_sats = get_block_subsidy(start)
        if subsidy_sats == 0:
            break

        supply = calculate_supply_at_height(
            min((epoch + 1) * SUBSIDY_HALVING_INTERVAL - 1,
                TOTAL_EPOCHS * SUBSIDY_HALVING_INTERVAL)
        )
        subsidy_btc = subsidy_sats / 1e8

        print(
            f"Epoch {epoch}: blocks {start:>9,}-{start + SUBSIDY_HALVING_INTERVAL - 1:>9,}, "
            f"subsidy={subsidy_btc:>12.8f} BTC, "
            f"supply={supply / 1e8:>15,.8f} BTC"
        )


print_halving_schedule()
```

```javascript
// 查詢當前減半狀態與倒計時
async function getHalvingInfo(rpcUrl) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getblockchaininfo",
      params: [],
    }),
  });
  const data = await res.json();
  const height = data.result.blocks;

  const HALVING_INTERVAL = 210000;
  const currentEpoch = Math.floor(height / HALVING_INTERVAL);
  const nextHalvingHeight = (currentEpoch + 1) * HALVING_INTERVAL;
  const blocksUntilHalving = nextHalvingHeight - height;

  // 目前的 subsidy
  const subsidySats = Math.floor(5000000000 / Math.pow(2, currentEpoch));
  const subsidyBtc = subsidySats / 1e8;

  // 估計時間（平均 10 分鐘/區塊）
  const estimatedDays = (blocksUntilHalving * 10) / (60 * 24);

  // 計算已發行的供應量
  let totalSupply = 0;
  for (let e = 0; e <= currentEpoch; e++) {
    const epochSubsidy = Math.floor(5000000000 / Math.pow(2, e));
    if (epochSubsidy === 0) break;
    const blocksInEpoch =
      e < currentEpoch ? HALVING_INTERVAL : height - e * HALVING_INTERVAL;
    totalSupply += epochSubsidy * blocksInEpoch;
  }

  return {
    currentHeight: height,
    currentEpoch,
    currentSubsidy: `${subsidyBtc} BTC`,
    nextHalvingHeight,
    blocksUntilHalving,
    estimatedDaysUntilHalving: estimatedDays.toFixed(1),
    circulatingSupplyBtc: (totalSupply / 1e8).toFixed(8),
    percentMined: ((totalSupply / 1e8 / 21000000) * 100).toFixed(4) + "%",
  };
}
```

## 相關概念

- [Proof-of-Work](/bitcoin/consensus/pow-hashcash/) - 礦工透過 PoW 獲取 block subsidy
- [難度調整](/bitcoin/consensus/difficulty-adjustment/) - 與減半共同決定出塊節奏
- [Fee Estimation](/bitcoin/transactions/fee-estimation/) - 減半後手續費重要性增加
- [區塊結構](/bitcoin/data-structures/bitcoin-block-structure/) - Coinbase 交易中的 subsidy
- [區塊驗證](/bitcoin/consensus/block-validation/) - 驗證 coinbase 金額不超過 subsidy + fees
- [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) - 減半是經濟激勵設計的核心
- [Mempool (BTC)](/bitcoin/network/mempool-btc/) - 手續費市場的運作
- [RBF/CPFP](/bitcoin/transactions/rbf-cpfp/) - 手續費加速機制
- [Beacon Chain (ETH)](/ethereum/consensus/beacon-chain/) - Ethereum 的不同發行機制（PoS 獎勵）
