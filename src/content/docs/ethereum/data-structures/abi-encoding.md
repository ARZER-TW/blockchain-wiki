---
title: "ABI 編碼"
description: "ABI, ABI Encoding, Contract ABI, Application Binary Interface"
tags: [ethereum, serialization, data-structure, abi, solidity]
---

# ABI 編碼

## 概述

ABI（Application Binary Interface）是 Ethereum 智能合約的函數呼叫與回傳值編碼標準。不同於 [RLP 編碼](/ethereum/data-structures/rlp-encoding/) 的通用序列化，ABI 編碼專門處理 Solidity 型別系統，將 function call 轉為 EVM 可執行的 calldata。

## 核心原理

### Function Selector

每個函數呼叫的前 4 bytes 是 function selector：

$$\text{selector} = \text{keccak256}(\text{signature})[0:4]$$

signature 的格式為函數名加上參數型別，不含空格和參數名：

```
transfer(address,uint256) → keccak256 → 0xa9059cbb
balanceOf(address)        → keccak256 → 0x70a08231
approve(address,uint256)  → keccak256 → 0x095ea7b3
```

### 型別分類

ABI 將型別分為 **static**（靜態）和 **dynamic**（動態）：

**靜態型別**（固定 32 bytes slot）：
- `uint<M>` / `int<M>`（M = 8, 16, ..., 256）
- `address`（左補零到 32 bytes）
- `bool`
- `bytes<M>`（M = 1..32，右補零）
- `(T1, T2, ...)` tuple（所有 Ti 皆為 static）
- `T[N]` fixed-size array（T 為 static）

**動態型別**（透過 offset 間接引用）：
- `bytes`
- `string`
- `T[]` dynamic array
- `T[N]` 其中 T 為 dynamic
- tuple 含任何 dynamic 欄位

### 編碼規則

#### 靜態型別

每個參數佔 32 bytes（256 bits），右對齊（數字類）或左對齊（bytes 類）：

```
uint256(256)   → 0x0000000000000000000000000000000000000000000000000000000000000100
address(0xABC) → 0x0000000000000000000000000000000000000000000000000000000000000ABC
bool(true)     → 0x0000000000000000000000000000000000000000000000000000000000000001
bytes4(0xDEAD) → 0xDEAD0000000000000000000000000000000000000000000000000000000000
```

#### 動態型別

使用 head-tail 編碼：

1. **Head 區**：靜態參數直接編碼；動態參數寫入 offset（指向 tail 區的起始位置）
2. **Tail 區**：動態參數的實際資料（length + data）

#### 完整範例

`function foo(uint256 a, string b, uint256 c)` 呼叫 `foo(256, "hello", 512)`：

```
0x          (offset)
selector:   xxxxxxxx
            0x00: 0000...0100                    # a = 256 (static)
            0x20: 0000...0060                    # offset of b = 96 (0x60)
            0x40: 0000...0200                    # c = 512 (static)
            0x60: 0000...0005                    # b.length = 5
            0x80: 68656c6c6f00...0000            # b.data = "hello" (右補零至 32 bytes)
```

offset 計算：head 區有 3 個 slot = 96 bytes = 0x60，所以 `b` 的 offset 是 0x60。

### 巢狀動態型別

`function bar(uint256[], string)` 呼叫 `bar([1,2,3], "abc")`：

```
0x00: offset of uint256[] = 0x40
0x20: offset of string    = 0xc0
0x40: length of array     = 3
0x60: array[0]            = 1
0x80: array[1]            = 2
0xa0: array[2]            = 3
0xc0: length of string    = 3
0xe0: "abc" padded to 32 bytes
```

### ABI Encoding 四種模式

| 函數 | 用途 |
|------|------|
| `abi.encode(...)` | 標準編碼，每個值佔 32 bytes |
| `abi.encodePacked(...)` | 緊湊編碼，不補零（用於 hash 時小心碰撞） |
| `abi.encodeWithSelector(selector, ...)` | selector + encode |
| `abi.encodeWithSignature(sig, ...)` | 自動算 selector + encode |

`encodePacked` 的碰撞風險：

```solidity
// 這兩個會產生相同結果
abi.encodePacked("ab", "c")  // 0x616263
abi.encodePacked("a", "bc")  // 0x616263
```

## 在 Ethereum 中的應用

- **合約呼叫**：每筆送到合約的交易，data 欄位就是 ABI 編碼的 calldata
- **事件 Log**：indexed 參數存在 topics（經 [Keccak-256](/ethereum/cryptography/keccak-256/) hash），非 indexed 參數 ABI 編碼存在 data
- **[Bloom Filter](/ethereum/data-structures/bloom-filter/)**：Log 的 topics 用於 Bloom filter 快速過濾
- **跨合約呼叫**：`call`、`delegatecall`、`staticcall` 都用 ABI 編碼
- **Offchain 解碼**：前端/後端解析合約回傳值和事件

## 程式碼範例

### JavaScript（ethers.js）

```javascript
import { AbiCoder, keccak256, toUtf8Bytes, Interface } from 'ethers';

const coder = AbiCoder.defaultAbiCoder();

// 基本編碼
const encoded = coder.encode(
  ['uint256', 'address', 'bool'],
  [100n, '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', true]
);
console.log('encoded:', encoded);

// 解碼
const decoded = coder.decode(
  ['uint256', 'address', 'bool'],
  encoded
);
console.log('decoded:', decoded);

// Function selector 計算
const sig = 'transfer(address,uint256)';
const selector = keccak256(toUtf8Bytes(sig)).slice(0, 10);
console.log('selector:', selector); // 0xa9059cbb

// 使用 Interface 做完整編碼
const iface = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)'
]);

const calldata = iface.encodeFunctionData('transfer', [
  '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  1000000n
]);
console.log('calldata:', calldata);

// 解碼 calldata
const parsed = iface.decodeFunctionData('transfer', calldata);
console.log('to:', parsed.to, 'amount:', parsed.amount);
```

### Python（eth-abi）

```python
from eth_abi import encode, decode
from eth_utils import keccak, to_checksum_address

# 編碼
encoded = encode(
    ['uint256', 'address', 'bool'],
    [100, '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', True]
)
print(f"encoded: 0x{encoded.hex()}")

# 解碼
decoded = decode(['uint256', 'address', 'bool'], encoded)
print(f"decoded: {decoded}")

# Function selector
sig = b'transfer(address,uint256)'
selector = keccak(sig)[:4]
print(f"selector: 0x{selector.hex()}")  # 0xa9059cbb

# 完整 calldata
calldata = selector + encode(
    ['address', 'uint256'],
    ['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 1000000]
)
print(f"calldata: 0x{calldata.hex()}")
```

## 相關概念

- [RLP 編碼](/ethereum/data-structures/rlp-encoding/) - 交易序列化用 RLP，calldata 內容用 ABI 編碼
- [Keccak-256](/ethereum/cryptography/keccak-256/) - 計算 function selector 和 event topic
- [Bloom Filter](/ethereum/data-structures/bloom-filter/) - ABI 編碼的 event log 透過 Bloom filter 索引
- [Receipt Trie](/ethereum/data-structures/receipt-trie/) - 交易收據中包含 ABI 編碼的 event data
- [交易構建](/ethereum/transaction-lifecycle/transaction-construction/) - calldata 欄位即為 ABI 編碼後的資料
