---
title: "RLP 編碼"
description: "RLP, Recursive Length Prefix, RLP Encoding"
tags: [ethereum, serialization, data-structure, rlp]
sidebar:
  order: 1
---

# RLP 編碼

## 概述

RLP（Recursive Length Prefix）是 Ethereum 執行層的主要序列化格式，用於編碼任意巢狀的二進位資料結構。RLP 只處理兩種資料型別：byte string 和 list，不關心資料的語義——這讓它成為一個極度精簡的編碼協定。

## 核心原理

### 編碼規則

RLP 把所有資料歸為兩類：**string**（byte array）和 **list**（巢狀結構）。

#### String 編碼

| 條件 | 編碼方式 |
|------|----------|
| 單一 byte，值在 `[0x00, 0x7f]` | 直接輸出該 byte |
| 長度 0-55 bytes | `(0x80 + len)` + data |
| 長度 > 55 bytes | `(0xb7 + len_of_len)` + `len` (big-endian) + data |

#### List 編碼

| 條件 | 編碼方式 |
|------|----------|
| payload 總長 0-55 bytes | `(0xc0 + payload_len)` + payload |
| payload 總長 > 55 bytes | `(0xf7 + len_of_len)` + `payload_len` (big-endian) + payload |

#### 前綴範圍總表

| 範圍 | 意義 |
|------|------|
| `[0x00, 0x7f]` | 單一 byte string |
| `[0x80, 0xb7]` | 0-55 bytes string |
| `[0xb8, 0xbf]` | >55 bytes string |
| `[0xc0, 0xf7]` | payload 0-55 bytes list |
| `[0xf8, 0xff]` | payload >55 bytes list |

### 手動編碼範例

**空 string** `""`:
- 長度 0，屬於 0-55 bytes string → `0x80`

**"dog"** (`0x64 0x6f 0x67`):
- 長度 3，屬於 0-55 bytes string → `0x83 0x64 0x6f 0x67`

**空 list** `[]`:
- payload 長度 0 → `0xc0`

**`["cat", "dog"]`**:
- "cat" → `0x83 0x63 0x61 0x74`（4 bytes）
- "dog" → `0x83 0x64 0x6f 0x67`（4 bytes）
- payload 總長 8 → `0xc8 0x83 0x63 0x61 0x74 0x83 0x64 0x6f 0x67`

**整數 0**:
- 編碼為空 byte string → `0x80`

**整數 15** (`0x0f`):
- 單一 byte，值在 `[0x00, 0x7f]` → `0x0f`

**整數 1024** (`0x04 0x00`):
- 長度 2 → `0x82 0x04 0x00`

### 關鍵規則

1. 整數必須以 big-endian、無前導零的形式表示
2. 整數 0 編碼為空 byte string `0x80`，不是 `0x00`
3. 解碼時根據第一個 byte 的範圍判斷型別和長度

## 在 Ethereum 中的應用

RLP 是 Ethereum 執行層的核心編碼：

- **交易序列化**：Legacy transaction（Type 0）使用 RLP 編碼全部欄位
- **[Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/)** 中的節點序列化
- **[區塊 Header](/ethereum/consensus/block-structure/)** 的序列化
- **網路協定**：devp2p 通訊的資料編碼
- **帳戶狀態**：`[nonce, balance, storageRoot, codeHash]` 四元組
- **[合約地址](/ethereum/accounts/address-derivation/)** 計算：`keccak256(rlp([sender, nonce]))`

EIP-2718 之後，新交易類型改用 `type || payload` 格式，payload 內部仍然用 RLP 編碼。

## 程式碼範例

### JavaScript（ethers.js）

```javascript
import { encodeRlp, decodeRlp } from 'ethers';

// 編碼 string
const encoded1 = encodeRlp('0x636174'); // "cat"
console.log(encoded1); // 0x83636174

// 編碼 list
const encoded2 = encodeRlp(['0x636174', '0x646f67']); // ["cat", "dog"]
console.log(encoded2); // 0xc88363617483646f67

// 編碼巢狀結構
const encoded3 = encodeRlp([[], ['0x636174'], ['0x636174', '0x646f67']]]);
console.log(encoded3);

// 解碼
const decoded = decodeRlp(encoded2);
console.log(decoded); // ['0x636174', '0x646f67']
```

### Python

```python
import rlp

# 編碼基本型別
assert rlp.encode(b'') == b'\x80'
assert rlp.encode(b'dog') == b'\x83dog'
assert rlp.encode(b'\x0f') == b'\x0f'  # 單 byte [0x00, 0x7f]

# 編碼 list
assert rlp.encode([b'cat', b'dog']) == b'\xc8\x83cat\x83dog'

# 編碼整數（需轉為 bytes）
def encode_int(n):
    if n == 0:
        return b''
    return n.to_bytes((n.bit_length() + 7) // 8, 'big')

assert rlp.encode(encode_int(0)) == b'\x80'
assert rlp.encode(encode_int(1024)) == b'\x82\x04\x00'

# 手動實作 RLP encoder
def rlp_encode(input):
    if isinstance(input, bytes):
        if len(input) == 1 and input[0] < 0x80:
            return input
        elif len(input) <= 55:
            return bytes([0x80 + len(input)]) + input
        else:
            len_bytes = len(input).to_bytes(
                (len(input).bit_length() + 7) // 8, 'big'
            )
            return bytes([0xb7 + len(len_bytes)]) + len_bytes + input
    elif isinstance(input, list):
        payload = b''.join(rlp_encode(item) for item in input)
        if len(payload) <= 55:
            return bytes([0xc0 + len(payload)]) + payload
        else:
            len_bytes = len(payload).to_bytes(
                (len(payload).bit_length() + 7) // 8, 'big'
            )
            return bytes([0xf7 + len(len_bytes)]) + len_bytes + payload
```

## 相關概念

- [SSZ 編碼](/ethereum/data-structures/ssz-encoding/) - Beacon Chain 使用的替代序列化格式，解決 RLP 不支援 Merkleization 的問題
- [ABI 編碼](/ethereum/data-structures/abi-encoding/) - Solidity function call 的編碼，與 RLP 用途不同
- [Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/) - 節點資料以 RLP 序列化儲存
- [地址推導](/ethereum/accounts/address-derivation/) - 合約地址透過 `rlp([sender, nonce])` 計算
- [交易生命週期](/ethereum/transaction-lifecycle/transaction-lifecycle/) - Legacy 交易使用 RLP 序列化
- [Keccak-256](/ethereum/cryptography/keccak-256/) - 常與 RLP 編碼搭配使用（先 RLP 再 hash）
