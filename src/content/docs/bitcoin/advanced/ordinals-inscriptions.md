---
title: "Ordinals & Inscriptions"
description: "Ordinal Theory 序數理論與銘文：satoshi 編號系統、稀有度分級、Taproot witness 資料刻印機制"
tags: [bitcoin, advanced, ordinals, inscriptions, taproot, nft, digital-artifacts]
---

# Ordinals & Inscriptions

## 概述

Ordinal Theory（序數理論）由 Casey Rodarmor 於 2023 年 1 月提出，為每一個 satoshi（Bitcoin 的最小單位，$1 \text{ BTC} = 10^8 \text{ sats}$）賦予唯一的序號。這個編號系統完全基於 Bitcoin 現有的協議規則推導，不需要任何軟分叉或硬分叉。

Inscriptions（銘文）則是利用 Taproot（[P2TR](/bitcoin/transactions/p2tr/)）的 witness 空間將任意資料「刻印」到特定的 satoshi 上，使 Bitcoin 區塊鏈成為不可變的資料儲存層。Inscriptions 的出現在 2023 年引發了 Bitcoin 區塊空間使用模式的根本轉變。

## Ordinal Theory：Satoshi 編號系統

### 編號規則

每個 satoshi 依據其被挖出的順序獲得一個從 0 開始的序號。Bitcoin 總量為 $21 \times 10^6$ BTC，即 $2.1 \times 10^{15}$ 個 satoshi，每個都有唯一的 ordinal number。

每個區塊的 coinbase 交易產生新的 satoshis。第 $b$ 個區塊的第一個 sat 編號為：

$$\text{ord}_{\text{first}}(b) = \sum_{i=0}^{b-1} \text{subsidy}(i)$$

其中 $\text{subsidy}(i)$ 是第 $i$ 個區塊的出塊獎勵。

### 轉移規則（First-In-First-Out）

當一筆交易消耗 UTXO 時，其中的 satoshis 按 FIFO 規則分配到輸出中：

```
Inputs:                    Outputs:
  UTXO_1: sats [0..99]      Output_1: sats [0..69]
  UTXO_2: sats [100..149]   Output_2: sats [70..149]
```

輸入中的 sats 按順序填入輸出，先填滿第一個輸出再填第二個。

### 稀有度分級

Ordinal Theory 定義了六個稀有度等級，基於 Bitcoin 的週期性事件：

| 等級 | 英文 | 條件 | 估計數量 |
|------|------|------|----------|
| Common | common | 任何非特殊 sat | ~$2.1 \times 10^{15}$ |
| Uncommon | uncommon | 每個區塊的第一個 sat | ~6,929,999 |
| Rare | rare | 每次難度調整的第一個 sat | ~3,437 |
| Epic | epic | 每次 halving 的第一個 sat | 32 |
| Legendary | legendary | 每個 halving cycle 的第一個 sat（cycle = halving 與難度調整重合） | 5 |
| Mythic | mythic | Genesis block 的第一個 sat | 1 |

稀有度遵循嚴格的包含關係：

$$\text{Mythic} \subset \text{Legendary} \subset \text{Epic} \subset \text{Rare} \subset \text{Uncommon} \subset \text{Common}$$

## Inscription 機制

### Taproot Witness Envelope

Inscriptions 利用 Taproot [witness data](/bitcoin/data-structures/witness-data/) 空間，將任意資料嵌入一個特殊的 script-path spend 中。資料被包裹在一個不會被執行的 envelope 結構中：

```
OP_FALSE
OP_IF
  OP_PUSH "ord"
  OP_PUSH 1          # content-type tag
  OP_PUSH "text/plain"
  OP_PUSH 0          # body separator
  OP_PUSH <data>     # actual content
OP_ENDIF
```

`OP_FALSE OP_IF ... OP_ENDIF` 構成一個永遠不會執行的區塊（因為 `OP_FALSE` 使得 `OP_IF` 分支被跳過），但資料仍然存在於 witness 中並被永久記錄在區塊鏈上。

### 資料大小限制

Taproot witness 的折扣（每 byte 僅計 0.25 weight units）使得 inscription 的鏈上成本相對較低。單個 inscription 的理論大小上限約為：

$$\text{max\_size} \approx \frac{4{,}000{,}000 \text{ WU} - \text{overhead}}{1 \text{ WU/byte}} \approx 400 \text{ KB}$$

但實際上受到 standardness rules 的限制，典型的 inscription 在數十 KB 到數百 KB 之間。

### 內容類型

Inscriptions 支援任意 MIME type：

| 類型 | MIME | 典型大小 |
|------|------|----------|
| 文字 | text/plain | < 1 KB |
| JSON | application/json | < 5 KB |
| 圖片 | image/png, image/webp | 10-200 KB |
| SVG | image/svg+xml | 1-50 KB |
| HTML | text/html | 1-100 KB |
| 影片 | video/mp4 | 50-400 KB |

### Recursive Inscriptions

Recursive inscriptions 可以引用其他已存在的 inscription，使用相對路徑：

```html
<img src="/content/<inscription_id>">
<script src="/content/<inscription_id>"></script>
```

這使得大型複雜內容可以被拆分為多個 inscription，並透過引用組合，實現鏈上的模組化資料結構。

## 對區塊空間的影響

### Fee Market 衝擊

Inscriptions 大幅增加了對 witness 空間的需求。在 2023 年 inscription 熱潮期間，平均區塊大小從約 1.5 MB 增長到接近 4 MB 上限，交易手續費出現顯著飆升。

區塊空間利用率可表示為：

$$\text{utilization} = \frac{\text{block\_weight}}{\text{max\_weight}} = \frac{\text{block\_weight}}{4{,}000{,}000 \text{ WU}}$$

### UTXO Set 膨脹

每個 inscription 至少產生一個新的 UTXO（包含銘文的 satoshi），增加了 UTXO set 的體積。這引發了 Bitcoin 社群關於區塊空間應如何使用的爭論。

## 程式碼範例

### JavaScript（Ordinal 編號計算）

```javascript
function getBlockSubsidy(height) {
  const halvings = Math.floor(height / 210_000);
  if (halvings >= 64) return 0;
  return Math.floor(50_0000_0000 / Math.pow(2, halvings));
}

function getFirstOrdinalInBlock(height) {
  let total = 0n;
  for (let h = 0; h < height; h++) {
    total += BigInt(getBlockSubsidy(h));
  }
  return total;
}

function classifyRarity(ordinal, height) {
  const isFirstInBlock = ordinal === getFirstOrdinalInBlock(height);
  const isDifficultyAdjust = height % 2016 === 0;
  const isHalving = height % 210_000 === 0;
  const isCycleStart = isDifficultyAdjust && isHalving;

  if (height === 0 && isFirstInBlock) return 'mythic';
  if (isCycleStart && isFirstInBlock) return 'legendary';
  if (isHalving && isFirstInBlock) return 'epic';
  if (isDifficultyAdjust && isFirstInBlock) return 'rare';
  if (isFirstInBlock) return 'uncommon';
  return 'common';
}

// 測試稀有度
console.log('Block 0:', classifyRarity(0n, 0));
console.log('Block 210000:', classifyRarity(getFirstOrdinalInBlock(210_000), 210_000));
console.log('Block 2016:', classifyRarity(getFirstOrdinalInBlock(2016), 2016));
```

### Python（Inscription envelope 解析）

```python
def parse_inscription_envelope(witness_data: bytes) -> dict:
    """解析 inscription 的 witness envelope（簡化版）"""
    # 尋找 OP_FALSE OP_IF 模式
    marker = b'\x00\x63'  # OP_FALSE OP_IF
    idx = witness_data.find(marker)
    if idx == -1:
        return {'found': False}

    # 尋找 'ord' 標記
    ord_marker = b'\x03ord'
    ord_idx = witness_data.find(ord_marker, idx)
    if ord_idx == -1:
        return {'found': False}

    return {
        'found': True,
        'envelope_offset': idx,
        'data_offset': ord_idx,
        'raw_size': len(witness_data),
    }

def calculate_inscription_cost(data_size: int, fee_rate: float) -> dict:
    """計算 inscription 的鏈上成本"""
    # witness data 的 weight 折扣: 1 byte = 1 WU (vs 4 WU for non-witness)
    witness_weight = data_size  # 1 WU per byte
    overhead_weight = 200 * 4   # ~200 bytes non-witness overhead
    total_weight = witness_weight + overhead_weight
    vbytes = total_weight / 4
    fee_sats = int(vbytes * fee_rate)

    return {
        'data_size_bytes': data_size,
        'total_weight_wu': total_weight,
        'virtual_bytes': vbytes,
        'fee_rate_sat_vb': fee_rate,
        'total_fee_sats': fee_sats,
        'total_fee_btc': fee_sats / 1e8,
    }

# 計算不同大小 inscription 的成本
for size in [1_000, 50_000, 200_000, 400_000]:
    cost = calculate_inscription_cost(size, fee_rate=20.0)
    print(f"{size:>7,} bytes -> {cost['total_fee_sats']:>10,} sats "
          f"({cost['total_fee_btc']:.6f} BTC)")
```

## 相關概念

- [Witness Data](/bitcoin/data-structures/witness-data/) - inscription 資料儲存的 witness 空間
- [P2TR](/bitcoin/transactions/p2tr/) - Taproot 交易格式，inscription 的載體
- [BRC-20/Runes](/bitcoin/advanced/brc20-runes/) - 基於 ordinals 的 fungible token 標準
- [Tapscript](/bitcoin/advanced/tapscript/) - inscription envelope 使用的腳本環境
- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - OP_FALSE OP_IF 結構的底層語言
- [UTXO Model](/bitcoin/data-structures/utxo-model/) - inscription 對 UTXO set 的影響
- [SHA-256d](/bitcoin/cryptography/sha-256d/) - inscription ID 的雜湊計算
- [Transaction Signing BTC](/bitcoin/transactions/transaction-signing-btc/) - inscription 交易的簽名
- [Schnorr Signatures](/bitcoin/cryptography/schnorr-signatures/) - Taproot key-path 的簽名方案
- [Merkle Tree](/fundamentals/data-structures/merkle-tree/) - 區塊中包含 inscription 交易的 Merkle 結構
