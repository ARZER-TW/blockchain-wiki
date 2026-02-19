---
title: "SSZ 編碼"
description: "SSZ, Simple Serialize, SSZ Encoding"
tags: [ethereum, serialization, data-structure, ssz, beacon-chain]
sidebar:
  order: 2
---

# SSZ 編碼

## 概述

SSZ（Simple Serialize）是 Ethereum 共識層（Beacon Chain）使用的序列化格式，取代了 [RLP 編碼](/ethereum/data-structures/rlp-encoding/) 的角色。SSZ 的核心優勢在於：確定性編碼、支援高效 Merkleization、固定大小型別可直接 offset 存取，且在規格上比 RLP 嚴格得多。

## 核心原理

### 與 RLP 的關鍵差異

| 特性 | RLP | SSZ |
|------|-----|-----|
| 型別系統 | 只有 string 和 list | 完整型別（uint, bool, vector, container...） |
| Schema | 無 schema | 需要 schema 定義 |
| Merkleization | 不支援 | 原生支援 |
| 固定長度存取 | 需逐一解碼 | O(1) offset 存取 |
| 使用層 | 執行層 | 共識層 |

### 型別分類

SSZ 的型別分為 **fixed-size** 和 **variable-size** 兩大類：

#### Fixed-size types

| 型別 | 大小（bytes） |
|------|---------------|
| `uint8` | 1 |
| `uint16` | 2 |
| `uint32` | 4 |
| `uint64` | 8 |
| `uint128` | 16 |
| `uint256` | 32 |
| `boolean` | 1 |
| `Vector[T, N]`（T 是 fixed） | `N * size(T)` |
| `Container`（所有欄位 fixed） | 各欄位大小之和 |

#### Variable-size types

- `List[T, N]` — 最多 N 個元素的動態列表
- `Bitlist[N]` — 最多 N bits 的動態位元列表
- `Vector[T, N]`（T 是 variable）
- `Container`（含任何 variable 欄位）
- `Union`

### 編碼規則

#### Fixed-size 型別
直接以 **little-endian** byte 順序串接：

```
uint64(256) → 0x0001000000000000
boolean(true) → 0x01
```

#### Variable-size 型別
使用 **offset** 機制：

1. 固定部分（fixed part）：fixed 欄位直接寫入；variable 欄位寫入 4-byte little-endian offset
2. 變動部分（variable part）：按順序串接各 variable 欄位的實際資料

```
Container {
  a: uint64      # fixed, 8 bytes
  b: List[uint8] # variable, 寫 offset
  c: uint32      # fixed, 4 bytes
}

fixed part:  [a: 8 bytes][b_offset: 4 bytes][c: 4 bytes]
variable part: [b_data: N bytes]

b_offset = 8 + 4 + 4 = 16 (指向 variable part 起始位置)
```

### Merkleization

SSZ 的核心能力——每個型別都能計算出一個 `hash_tree_root`：

1. 將序列化資料切成 32-byte chunks
2. 不足 32 bytes 的 chunk 補零
3. 以這些 chunks 為葉子建立 [Merkle Tree](/fundamentals/data-structures/merkle-tree/)
4. 根節點即為 `hash_tree_root`

對 Container 來說，每個欄位的 `hash_tree_root` 作為葉子：

$$\text{hash\_tree\_root}(container) = \text{merkle\_root}([h(f_0), h(f_1), \ldots, h(f_n)])$$

List 額外混入長度資訊：

$$\text{hash\_tree\_root}(list) = H(\text{merkle\_root}(elements) \| \text{length})$$

其中 $H$ 是 [SHA-256](/ethereum/cryptography/sha-256/)。

## 在 Ethereum 中的應用

- **[Beacon Chain](/ethereum/consensus/beacon-chain/)** 的所有資料結構：BeaconState、BeaconBlock、Attestation 等
- **[驗證者](/ethereum/consensus/validators/)** 狀態序列化
- **Light client** 的 Merkle proof 生成與驗證
- **[EIP-4844 Proto-Danksharding](/ethereum/advanced/eip-4844/)** 的 blob sidecar 資料
- 未來可能延伸到執行層（取代 RLP）

## 程式碼範例

### JavaScript（@chainsafe/ssz）

```javascript
import { ContainerType, UintNumberType, ListBasicType, ByteVectorType } from '@chainsafe/ssz';

// 定義型別
const uint64 = new UintNumberType(8);
const uint32 = new UintNumberType(4);

// 定義 Container
const ExecutionPayloadHeader = new ContainerType({
  parentHash: new ByteVectorType(32),
  timestamp: uint64,
  gasLimit: uint64,
  gasUsed: uint64,
  baseFeePerGas: new UintNumberType(32),
});

// 序列化
const header = {
  parentHash: new Uint8Array(32).fill(0xab),
  timestamp: 1700000000,
  gasLimit: 30000000,
  gasUsed: 15000000,
  baseFeePerGas: 30000000000n,
};

const serialized = ExecutionPayloadHeader.serialize(header);
console.log('serialized length:', serialized.length);

// hash_tree_root
const root = ExecutionPayloadHeader.hashTreeRoot(header);
console.log('hash_tree_root:', Buffer.from(root).toString('hex'));

// 反序列化
const deserialized = ExecutionPayloadHeader.deserialize(serialized);
console.log('timestamp:', deserialized.timestamp);
```

### Python（ssz）

```python
from ssz.sedes import (
    uint64, uint32, boolean,
    List, Vector, Container, Bytes32
)
import ssz

# 定義 Container
class Checkpoint(Container):
    fields = [
        ('epoch', uint64),
        ('root', Bytes32),
    ]

# 編碼
checkpoint = Checkpoint(
    epoch=100,
    root=b'\xab' * 32,
)

encoded = ssz.encode(checkpoint)
print(f"encoded: {encoded.hex()}")

# hash_tree_root
root = checkpoint.hash_tree_root
print(f"hash_tree_root: {root.hex()}")

# 解碼
decoded = ssz.decode(encoded, Checkpoint)
print(f"epoch: {decoded.epoch}")
```

## 相關概念

- [RLP 編碼](/ethereum/data-structures/rlp-encoding/) - 執行層序列化格式，SSZ 在共識層取代了它
- [Merkle Tree](/fundamentals/data-structures/merkle-tree/) - SSZ Merkleization 的基礎結構
- [SHA-256](/ethereum/cryptography/sha-256/) - SSZ Merkleization 使用的 hash 函數（非 Keccak）
- [Beacon Chain](/ethereum/consensus/beacon-chain/) - SSZ 的主要使用場景
- [Validators](/ethereum/consensus/validators/) - 驗證者狀態以 SSZ 格式儲存
- [EIP-4844 Proto-Danksharding](/ethereum/advanced/eip-4844/) - Blob sidecar 使用 SSZ 編碼
