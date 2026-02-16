---
title: "Bloom Filter（布隆過濾器）"
description: "Bloom filter: bit array theory, false positive formula, optimal parameters, counting Bloom filters, probabilistic data structures"
tags: [fundamentals, data-structures, bloom-filter, probabilistic, space-efficient]
---

# Bloom Filter

## 概述

Bloom Filter 是一種空間效率極高的機率型資料結構，由 Burton Howard Bloom 於 1970 年提出，用於判斷「某元素是否可能在集合中」。它的核心特性是：**可能誤報（false positive），但絕不漏報（no false negative）**。這使得 Bloom filter 非常適合作為「快速排除」機制——如果 filter 說不包含，就一定不包含。

Bloom filter 在區塊鏈系統中廣泛用於 log/event 過濾、transaction pool 查詢、SPV 節點的交易過濾等場景。

## 基本原理

### 結構

Bloom filter 由以下組件構成：

1. **一個 $m$-bit 的 bit array**，初始全為 0
2. **$k$ 個獨立的 hash 函數** $h_1, h_2, \ldots, h_k$，每個映射到 $\{0, 1, \ldots, m-1\}$

### 插入操作

將元素 $x$ 加入集合：對每個 $i \in \{1, \ldots, k\}$，將 bit array 的第 $h_i(x)$ 位設為 1。

### 查詢操作

檢查元素 $x$ 是否在集合中：對每個 $i \in \{1, \ldots, k\}$，檢查第 $h_i(x)$ 位：
- **任一 bit 為 0**：元素確定不在集合中
- **全部 bit 為 1**：元素可能在集合中（可能是 false positive）

### 不支援刪除

標準 Bloom filter 不支援刪除操作，因為清除一個 bit 可能影響其他元素的查詢結果。

## False Positive 分析

對一個 $m$-bit 的 Bloom filter，使用 $k$ 個 hash 函數，插入 $n$ 個元素後：

某個特定 bit 仍為 0 的機率：

$$P(\text{bit} = 0) = \left(1 - \frac{1}{m}\right)^{kn} \approx e^{-kn/m}$$

False positive 機率（所有 $k$ 個 bit 都為 1，但元素其實不在集合中）：

$$P(\text{false positive}) \approx \left(1 - e^{-kn/m}\right)^k$$

## 最佳參數選擇

### 最佳 hash 函數數量

給定 $m$ 和 $n$，最小化 false positive 的最佳 $k$：

$$k_{\text{opt}} = \frac{m}{n} \ln 2 \approx 0.693 \frac{m}{n}$$

### 最佳 bit array 大小

給定目標 false positive 率 $p$ 和元素數量 $n$：

$$m_{\text{opt}} = -\frac{n \ln p}{(\ln 2)^2}$$

### 參數範例

| 元素數 $n$ | 目標 FP 率 $p$ | bit array 大小 $m$ | hash 函數數 $k$ |
|-----------|---------------|-------------------|----------------|
| 1,000 | 1% | 9,585 bits | 7 |
| 10,000 | 0.1% | 143,776 bits | 10 |
| 1,000,000 | 0.01% | 19,170,117 bits | 13 |

## Counting Bloom Filter

標準 Bloom filter 的擴展版本，支援刪除操作：

- 每個 slot 用一個計數器取代 1 bit（通常 3-4 bits）
- 插入時計數器加 1，刪除時減 1
- 查詢時檢查計數器是否大於 0
- 代價：空間需求增加 3-4 倍

## 與其他機率型資料結構的比較

| 結構 | 支援刪除 | 空間效率 | 查詢複雜度 | 特點 |
|------|---------|---------|-----------|------|
| Bloom Filter | 否 | 最佳 | $O(k)$ | 最經典、最廣泛使用 |
| Counting Bloom Filter | 是 | 較差（3-4x） | $O(k)$ | 支援刪除 |
| Cuckoo Filter | 是 | 較好 | $O(1)$ | 支援刪除且空間更優 |
| Quotient Filter | 是 | 中等 | $O(1)$ amortized | cache-friendly |
| XOR Filter | 否 | 最佳 | $O(1)$ | 更小、更快，但構建較慢 |

## 程式碼範例

```python
import hashlib
import math

class BloomFilter:
    """通用 Bloom filter 實作"""

    def __init__(self, expected_elements: int, fp_rate: float = 0.01):
        # 計算最佳參數
        self.m = int(-expected_elements * math.log(fp_rate) / (math.log(2) ** 2))
        self.k = int((self.m / expected_elements) * math.log(2))
        self.bit_array = bytearray(self.m // 8 + 1)
        self.n = 0

    def _hashes(self, item: bytes) -> list[int]:
        """使用 double hashing 產生 k 個 hash 值"""
        h1 = int.from_bytes(hashlib.sha256(item).digest()[:8], 'big')
        h2 = int.from_bytes(hashlib.sha256(item + b'\x01').digest()[:8], 'big')
        return [(h1 + i * h2) % self.m for i in range(self.k)]

    def add(self, item: bytes) -> None:
        for pos in self._hashes(item):
            self.bit_array[pos // 8] |= (1 << (pos % 8))
        self.n += 1

    def might_contain(self, item: bytes) -> bool:
        return all(
            self.bit_array[pos // 8] & (1 << (pos % 8))
            for pos in self._hashes(item)
        )

    def false_positive_rate(self) -> float:
        return (1 - math.exp(-self.k * self.n / self.m)) ** self.k


# 使用範例
bf = BloomFilter(expected_elements=1000, fp_rate=0.01)

# 插入
for i in range(100):
    bf.add(f"item-{i}".encode())

# 查詢
print(f"'item-0' in filter: {bf.might_contain(b'item-0')}")      # True
print(f"'item-999' in filter: {bf.might_contain(b'item-999')}")   # False (probably)
print(f"Current FP rate: {bf.false_positive_rate():.6f}")
print(f"Parameters: m={bf.m}, k={bf.k}")
```

## 相關概念

- [雜湊函數概述](/fundamentals/cryptography/hash-function-overview/) - Bloom filter 依賴 hash 函數
- [Merkle Tree](/fundamentals/data-structures/merkle-tree/) - 另一種使用 hash 的資料結構
- [Keccak-256](/fundamentals/cryptography/keccak-256/) - 常用於 Bloom filter 的 hash 函數
