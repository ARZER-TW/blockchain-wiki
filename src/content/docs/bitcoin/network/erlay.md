---
title: "Erlay"
description: "Erlay, BIP-330, set reconciliation, Minisketch, bandwidth"
tags: [bitcoin, network, erlay, bip-330, minisketch, set-reconciliation]
---

# Erlay

## 概述

Erlay（BIP-330）是 Bitcoin 的交易傳播頻寬最佳化協議，使用基於 set reconciliation 的方法取代傳統的 flooding。目前 Bitcoin 節點透過向所有連線的 peer 發送每筆交易的 `inv`（inventory）訊息來傳播交易，這導致大量重複資料。Erlay 將傳播分為兩個階段：有限的 flooding（只向少數 peer 推送）加上定期的 set reconciliation（使用 Minisketch 程式庫），預計可減少約 40% 的交易傳播頻寬，同時支援更多的節點連線而不增加頻寬壓力。

## 核心原理

### 傳統 Flooding 的問題

當前 Bitcoin 的交易傳播使用 flooding 機制：

```
Node A 收到新交易 tx_1:
  -> 向 Peer B 發送 inv(tx_1)
  -> 向 Peer C 發送 inv(tx_1)
  -> 向 Peer D 發送 inv(tx_1)
  -> ...向所有連線的 peer 發送
```

每個節點平均連線 ~10 個 outbound peer。每筆交易的 `inv` 訊息為 36 bytes（txid hash + type）。對於一個有 8 個 outbound 的節點：

$$\text{inv\_bandwidth} = \text{num\_txs/sec} \times 36 \times \text{num\_peers} \times 2 \quad (\text{發送 + 接收})$$

在正常負載下，一個節點每天收到和發送約 50 GB 的 `inv` 訊息，其中大部分是重複的（因為多個 peer 通知同一筆交易）。

### Erlay 的兩階段傳播

**Phase 1: Limited Flooding（有限 flooding）**

只向少數 peer（預設 8 個中的 ~4 個）進行傳統的 `inv` 推送，確保交易快速傳播到部分網路。

**Phase 2: Set Reconciliation（集合和解）**

定期（每幾秒）與其他 peer 進行 set reconciliation，找出雙方 mempool 的差異並交換缺少的交易。

```
Node A                              Node B
   |                                    |
   |   [each maintains a "sketch" of    |
   |    recently learned tx hashes]     |
   |                                    |
   |--- reqrecon(sketch_A) ------------>|
   |                                    |
   |         [compute difference]       |
   |         sketch_diff = sketch_B XOR sketch_A
   |         [decode: txids only in A or only in B]
   |                                    |
   |<-- reconcildiff(only_in_A, only_in_B) -|
   |                                    |
   |--- getdata(only_in_B) ----------->|
   |<-- tx(missing_txs) ---------------|
```

### Minisketch: Set Reconciliation 程式庫

Minisketch 是 Pieter Wuille 開發的高效 set reconciliation 程式庫，基於 BCH（Bose-Chaudhuri-Hocquenghem）碼：

**核心概念**：將集合元素（txid 的 short hash）編碼為一個「sketch」（摘要）。兩個 sketch 的 XOR 產生差異的 sketch，從中可以解碼出對稱差異。

$$\text{sketch}(S) = \text{BCH\_encode}(\{h(x) : x \in S\})$$

$$\text{sketch}(S_A) \oplus \text{sketch}(S_B) = \text{sketch}(S_A \triangle S_B)$$

其中 $S_A \triangle S_B$ 是對稱差異（只在 A 或只在 B 中的元素）。

**Sketch 大小**：與**差異數量** $d$ 成正比，而非集合大小：

$$|\text{sketch}| = d \times b \text{ bits}$$

其中 $b$ 是每個元素的位元數（通常 32-64 bits）。如果兩個 mempool 幾乎相同（差異很小），sketch 極為緊湊。

### 頻寬分析

假設節點有 $c$ 個連線，flooding 推送給 $f$ 個 peer，其餘 $c - f$ 個使用 reconciliation：

**傳統 Flooding 頻寬**：

$$B_{\text{flood}} = n \times 36 \times c \quad \text{bytes/interval}$$

**Erlay 頻寬**：

$$B_{\text{erlay}} = n \times 36 \times f + (c - f) \times d \times b$$

其中 $n$ 是交易數量，$d$ 是預期差異數量。

對於典型參數（$c = 8$, $f = 4$, $n = 7000$, $d \approx 100$）：

$$\text{savings} \approx 1 - \frac{B_{\text{erlay}}}{B_{\text{flood}}} \approx 40\%$$

### 啟用更多連線

Erlay 的另一個重要效益是降低增加連線數所帶來的頻寬成本。目前 Bitcoin Core 限制 outbound 為 8 + 2 是因為頻寬考量。有了 Erlay，增加更多連線變得可行：

| Outbound 連線數 | Flooding 頻寬 | Erlay 頻寬 | 安全性提升 |
|-----------------|--------------|-----------|-----------|
| 8 | 基準 | -40% | 基準 |
| 12 | +50% | -20% | 更抗 eclipse |
| 16 | +100% | 基準 | 顯著更安全 |

更多連線意味著 [eclipse attack](/bitcoin/network/peer-discovery/) 更難成功。

### 實施狀態

截至 2024 年，Erlay 仍在開發中：

- Minisketch 程式庫已合併至 Bitcoin Core
- BIP-330 已發布
- P2P 協議變更仍在審查中
- 預計在未來的 Bitcoin Core 版本中啟用

## 程式碼範例

```python
# Minisketch-based Set Reconciliation 概念演示
import hashlib

class SimpleSketch:
    """
    簡化的 sketch 實現（教學用途）。
    實際的 Minisketch 使用 GF(2^b) 上的 BCH 碼。
    """

    def __init__(self, capacity: int, element_bits: int = 32):
        self.capacity = capacity
        self.element_bits = element_bits
        self.elements = set()

    def add(self, element: int) -> 'SimpleSketch':
        """新增元素到 sketch（不可變風格回傳新物件）"""
        new_sketch = SimpleSketch(self.capacity, self.element_bits)
        new_sketch.elements = self.elements | {element}
        return new_sketch

    def serialize(self) -> bytes:
        """序列化 sketch（簡化版本，實際用 BCH 碼編碼）"""
        # 實際的 Minisketch 會將所有元素編碼為緊湊的 sketch
        # 這裡簡化為排序的元素列表
        sorted_elements = sorted(self.elements)
        return b"".join(e.to_bytes(4, "little") for e in sorted_elements)

    def reconcile(self, other: 'SimpleSketch') -> dict:
        """與另一個 sketch 進行 reconciliation"""
        only_local = self.elements - other.elements
        only_remote = other.elements - self.elements
        return {
            "only_local": only_local,
            "only_remote": only_remote,
            "difference_size": len(only_local) + len(only_remote),
        }


def short_txid(txid_hex: str, nonce: int = 0) -> int:
    """將完整 txid 轉換為 32-bit short hash"""
    data = bytes.fromhex(txid_hex) + nonce.to_bytes(4, "little")
    h = hashlib.sha256(data).digest()
    return int.from_bytes(h[:4], "little")


def simulate_erlay_round(
    local_txids: list[str],
    remote_txids: list[str],
    capacity: int = 100,
) -> dict:
    """模擬一輪 Erlay reconciliation"""
    nonce = 42

    local_sketch = SimpleSketch(capacity)
    for txid in local_txids:
        local_sketch = local_sketch.add(short_txid(txid, nonce))

    remote_sketch = SimpleSketch(capacity)
    for txid in remote_txids:
        remote_sketch = remote_sketch.add(short_txid(txid, nonce))

    result = local_sketch.reconcile(remote_sketch)

    # 頻寬比較
    flooding_bytes = len(local_txids) * 36  # inv message per tx
    # Minisketch: capacity * element_size bytes for sketch
    sketch_bytes = result["difference_size"] * 4  # 4 bytes per element

    return {
        "local_count": len(local_txids),
        "remote_count": len(remote_txids),
        "differences": result["difference_size"],
        "flooding_bytes": flooding_bytes,
        "reconciliation_bytes": sketch_bytes,
        "savings_percent": (1 - sketch_bytes / flooding_bytes) * 100 if flooding_bytes > 0 else 0,
    }
```

```javascript
// Erlay 頻寬分析
function analyzeErlayBenefit({ numPeers = 8, floodPeers = 4, txPerSec = 7, interval = 2, avgDiff = 10 }) {
  const txPerInterval = txPerSec * interval;
  const invSize = 36; // type(4) + hash(32)

  const floodBW = txPerInterval * invSize * numPeers * 2;
  const erlayBW = txPerInterval * invSize * floodPeers * 2 + (numPeers - floodPeers) * avgDiff * 4 * 2;
  const perDay = (bw) => ((bw * (86400 / interval)) / 1e9).toFixed(2) + " GB";

  return {
    traditionalPerDay: perDay(floodBW),
    erlayPerDay: perDay(erlayBW),
    savings: (((floodBW - erlayBW) / floodBW) * 100).toFixed(1) + "%",
  };
}
```

## 相關概念

- [節點發現](/bitcoin/network/peer-discovery/) - Erlay 允許更多連線，增強節點多樣性
- [Mempool (BTC)](/bitcoin/network/mempool-btc/) - Set reconciliation 比較的對象
- [區塊中繼](/bitcoin/network/block-relay/) - 區塊傳播的頻寬（Erlay 針對交易傳播）
- [Compact Blocks](/bitcoin/network/compact-blocks/) - 互補技術：區塊壓縮 vs 交易傳播壓縮
- [自私挖礦](/bitcoin/consensus/selfish-mining/) - 更好的交易傳播改善網路公平性
- [SPV 輕節點](/bitcoin/network/spv-light-clients/) - 不同層級的頻寬最佳化
- [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) - 網路效率影響共識品質
- [Hash Function 概述](/fundamentals/cryptography/hash-function-overview/) - Short txid 雜湊的基礎
- [Bloom Filter](/fundamentals/data-structures/bloom-filter/) - 另一種機率性集合比較方法
