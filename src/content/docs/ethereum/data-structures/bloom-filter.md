---
title: "Bloom Filter"
description: "Bloom Filter, Logs Bloom, logsBloom, 布隆過濾器"
tags: [ethereum, data-structure, bloom-filter, probabilistic]
---

# Bloom Filter

## 概述

Bloom Filter 是一種空間效率極高的機率型資料結構，用於判斷「某元素是否可能在集合中」。Ethereum 使用 2048-bit（256 bytes）的 Bloom filter 搭配 3 個 hash 函數，儲存在 [Receipt](/ethereum/data-structures/receipt-trie/) 和[區塊 Header](/ethereum/consensus/block-header/)中，用於快速過濾包含特定 event log 的區塊和交易，避免逐一掃描所有 log。

## 核心原理

### 基本性質

- **False positive**：可能誤報（說有但其實沒有）
- **No false negative**：不會漏報（說沒有就一定沒有）
- 所以 Bloom filter 適合做「快速排除」——如果 filter 說不包含，就一定不包含

### 數學

對一個 $m$-bit 的 Bloom filter，使用 $k$ 個 hash 函數，插入 $n$ 個元素後：

$$P(\text{false positive}) \approx \left(1 - e^{-kn/m}\right)^k$$

Ethereum 的參數：$m = 2048$, $k = 3$。

### Ethereum 的 Bloom Filter 實作

Ethereum 的 Bloom filter（定義在 Yellow Paper Section 4.3.1）：

#### 加入元素

對一個 byte sequence $b$：

1. 計算 $h = \text{keccak256}(b)$
2. 取 $h$ 的前 6 bytes（3 對），每對 2 bytes 取值模 2048，得到 3 個 bit 位置：

$$\text{bit}_i = (h[2i] \times 256 + h[2i+1]) \mod 2048, \quad i \in \{0, 1, 2\}$$

3. 在 2048-bit filter 中設置這 3 個位置為 1

#### 加入 Log

對每個 Log entry，Bloom filter 加入：
- Log 的 `address`（20 bytes）
- Log 的每個 `topic`（32 bytes each）

#### 區塊級 Bloom

區塊 header 的 `logsBloom` 是所有 Receipt 的 `logsBloom` 的 bitwise OR：

$$\text{block.logsBloom} = \bigvee_{i=0}^{n-1} \text{receipt}_i.\text{logsBloom}$$

### 查詢流程

當 DApp 查詢特定 event（例如 ERC-20 Transfer）：

1. 計算目標 topic 的 Bloom 位元位置
2. 檢查區塊的 `logsBloom`：
   - 3 個 bit 都是 1 → 可能包含，需進一步檢查
   - 任一 bit 是 0 → 確定不包含，跳過此區塊
3. 對「可能包含」的區塊，進一步檢查各 Receipt 的 `logsBloom`
4. 最後讀取實際 log 資料確認

這個三層過濾（block bloom → receipt bloom → actual log）大幅減少了 I/O。

## 在 Ethereum 中的應用

- **[區塊 Header](/ethereum/consensus/block-header/)**：`logsBloom` 欄位（256 bytes）
- **[Receipt](/ethereum/data-structures/receipt-trie/)**：每個 Receipt 有自己的 `logsBloom`
- **`eth_getLogs` RPC**：node 內部用 Bloom filter 加速 log 查詢
- **Event subscription**：WebSocket 訂閱事件時，Bloom filter 快速篩選相關區塊
- **[Event topics](/ethereum/data-structures/abi-encoding/)**：indexed event 參數存在 topics 中，被 Bloom filter 索引
- **Block explorer**：快速找到包含特定合約事件的區塊

### 效能考量

- 單一元素查詢：$O(k) = O(3)$，極快
- False positive 率隨同一區塊的 log 數量增加而上升
- 對大範圍區塊掃描（如數萬個區塊），Bloom filter 能跳過大部分不相關區塊

## 程式碼範例

### JavaScript

```javascript
import { keccak256, toUtf8Bytes, getBytes } from 'ethers';

// Ethereum Bloom filter 實作
function bloomBits(data) {
  const hash = getBytes(keccak256(data));
  const bits = [];
  for (let i = 0; i < 6; i += 2) {
    const bit = ((hash[i] << 8) | hash[i + 1]) & 0x7ff; // mod 2048
    bits.push(bit);
  }
  return bits;
}

function addToBloom(bloom, data) {
  const newBloom = new Uint8Array(bloom);
  const bits = bloomBits(data);
  for (const bit of bits) {
    // Bloom filter 是 big-endian bit ordering
    const byteIndex = 255 - Math.floor(bit / 8);
    const bitIndex = bit % 8;
    newBloom[byteIndex] |= (1 << bitIndex);
  }
  return newBloom;
}

function testBloom(bloom, data) {
  const bits = bloomBits(data);
  for (const bit of bits) {
    const byteIndex = 255 - Math.floor(bit / 8);
    const bitIndex = bit % 8;
    if ((bloom[byteIndex] & (1 << bitIndex)) === 0) {
      return false; // 確定不在
    }
  }
  return true; // 可能在
}

// 建構 Bloom filter
let bloom = new Uint8Array(256); // 2048 bits

// 加入一個 event topic
const transferSig = keccak256(
  toUtf8Bytes('Transfer(address,address,uint256)')
);
bloom = addToBloom(bloom, getBytes(transferSig));

// 加入合約地址
const contractAddr = getBytes('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
bloom = addToBloom(bloom, contractAddr);

// 測試
console.log('contains Transfer topic:', testBloom(bloom, getBytes(transferSig)));
console.log('contains contract:', testBloom(bloom, contractAddr));

// 測試不存在的 topic
const approvalSig = keccak256(
  toUtf8Bytes('Approval(address,address,uint256)')
);
console.log('contains Approval:', testBloom(bloom, getBytes(approvalSig)));
```

### Python

```python
from eth_utils import keccak

def bloom_bits(data: bytes) -> list[int]:
    """計算 3 個 bit 位置"""
    h = keccak(data)
    bits = []
    for i in range(0, 6, 2):
        bit = ((h[i] << 8) | h[i + 1]) & 0x7FF  # mod 2048
        bits.append(bit)
    return bits

def add_to_bloom(bloom: bytearray, data: bytes) -> bytearray:
    """將元素加入 Bloom filter"""
    for bit in bloom_bits(data):
        byte_idx = 255 - (bit // 8)
        bit_idx = bit % 8
        bloom[byte_idx] |= (1 << bit_idx)
    return bloom

def test_bloom(bloom: bytes, data: bytes) -> bool:
    """測試元素是否可能在 Bloom filter 中"""
    for bit in bloom_bits(data):
        byte_idx = 255 - (bit // 8)
        bit_idx = bit % 8
        if (bloom[byte_idx] & (1 << bit_idx)) == 0:
            return False
    return True

# 建構
bloom = bytearray(256)

# 加入 Transfer event signature
transfer_topic = keccak(b'Transfer(address,address,uint256)')
add_to_bloom(bloom, transfer_topic)

# 加入合約地址
contract = bytes.fromhex('A0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
add_to_bloom(bloom, contract)

# 測試
print(f"contains Transfer: {test_bloom(bloom, transfer_topic)}")
print(f"contains contract: {test_bloom(bloom, contract)}")

# 不存在的
approval_topic = keccak(b'Approval(address,address,uint256)')
print(f"contains Approval: {test_bloom(bloom, approval_topic)}")

# 計算 false positive 概率
import math
m, k, n = 2048, 3, 2
fp = (1 - math.exp(-k * n / m)) ** k
print(f"false positive rate ({n} elements): {fp:.6f}")
```

## 相關概念

- [Keccak-256](/ethereum/cryptography/keccak-256/) - Bloom filter 使用 keccak256 計算 bit 位置
- [Receipt Trie](/ethereum/data-structures/receipt-trie/) - 每個 Receipt 包含 logsBloom
- [區塊 Header](/ethereum/consensus/block-header/) - 包含區塊級 logsBloom
- [ABI 編碼](/ethereum/data-structures/abi-encoding/) - Event topic 和 log data 的編碼
- [交易生命週期](/ethereum/transaction-lifecycle/transaction-lifecycle/) - Log 在交易執行階段產生
