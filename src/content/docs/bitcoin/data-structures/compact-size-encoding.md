---
title: "Compact Size Encoding"
description: "Bitcoin variable-length integer encoding: 1/3/5/9-byte formats, usage in transaction and block serialization, comparison with Ethereum RLP"
tags: [bitcoin, data-structure, compact-size, varint, serialization]
---

# Compact Size Encoding

## 概述

Compact Size（也稱為 CompactSize 或 Variable-Length Integer）是 Bitcoin 協議中用於編碼非負整數的變長格式。它根據數值大小自動選擇最短的編碼方式，從 1 byte 到 9 bytes 不等。此格式廣泛用於交易序列化中的計數和長度欄位，如 input 數量、output 數量、script 長度、witness item 數量等。

## 編碼規則

| 值範圍 | 編碼方式 | 總大小 | 前綴 |
|--------|---------|--------|------|
| $0 \le x \le 252$ | 直接 1 byte | 1 byte | 無 |
| $253 \le x \le 65535$ | `0xFD` + 2 bytes (LE) | 3 bytes | `0xFD` |
| $65536 \le x \le 2^{32}-1$ | `0xFE` + 4 bytes (LE) | 5 bytes | `0xFE` |
| $2^{32} \le x \le 2^{64}-1$ | `0xFF` + 8 bytes (LE) | 9 bytes | `0xFF` |

所有多 byte 值使用 **little-endian** 排列。

### 為何是 252 而非 255？

因為 `0xFD` (253)、`0xFE` (254)、`0xFF` (255) 這三個值被保留作為多 byte 編碼的前綴。所以單 byte 直接編碼的最大值是 252 (`0xFC`)。

### 編碼範例

| 十進位值 | Hex 編碼 |
|---------|---------|
| 0 | `00` |
| 1 | `01` |
| 252 | `fc` |
| 253 | `fd fd00` |
| 255 | `fd ff00` |
| 256 | `fd 0001` |
| 65535 | `fd ffff` |
| 65536 | `fe 00000100` |
| 1,000,000 | `fe 40420f00` |

## 在交易中的使用位置

Compact Size 在 Bitcoin 交易序列化中有以下使用場景：

```
Transaction:
  version: 4B (fixed)
  [marker: 1B]           <-- SegWit only (0x00)
  [flag: 1B]             <-- SegWit only (0x01)
  tx_in_count: COMPACT_SIZE    <-- (1)
  for each input:
    prev_txid: 32B (fixed)
    prev_vout: 4B (fixed)
    scriptSig_len: COMPACT_SIZE  <-- (2)
    scriptSig: var
    sequence: 4B (fixed)
  tx_out_count: COMPACT_SIZE    <-- (3)
  for each output:
    value: 8B (fixed)
    scriptPubKey_len: COMPACT_SIZE  <-- (4)
    scriptPubKey: var
  [witness:                     <-- SegWit only
    for each input:
      item_count: COMPACT_SIZE    <-- (5)
      for each item:
        item_len: COMPACT_SIZE    <-- (6)
        item_data: var
  ]
  locktime: 4B (fixed)
```

還用於區塊序列化中的交易計數。

## 與其他變長整數格式的比較

### Bitcoin Compact Size vs Protocol Buffers varint

| 特性 | Bitcoin Compact Size | Protobuf varint |
|------|---------------------|-----------------|
| 編碼方式 | 前綴 + 固定大小 | 每 byte 用 1 bit 作為 continuation flag |
| 小值效率 | 0-252: 1 byte | 0-127: 1 byte |
| 位元序 | Little-endian | Little-endian (7-bit groups) |
| 最大值 | $2^{64} - 1$ | $2^{64} - 1$（10 bytes） |
| 浪費 | 253-255 需要 3 bytes | 128-127 需要 2 bytes |

### Bitcoin Compact Size vs Ethereum RLP

| 特性 | Bitcoin Compact Size | [Ethereum RLP](/ethereum/data-structures/rlp-encoding/) |
|------|---------------------|------------|
| 編碼目標 | 非負整數 | 任意巢狀結構 |
| 整數編碼 | LE, 固定寬度 | BE, 最短表示 |
| 長度前綴 | 1/3/5/9 bytes | 1-9 bytes（遞迴） |
| 結構支援 | 僅數字 | 字串 + 列表 |

### Bitcoin 內部的其他整數格式

Bitcoin 協議中還有其他整數格式，不要混淆：

| 格式 | 用途 | 特點 |
|------|------|------|
| Compact Size | 計數/長度 | 變長，1-9 bytes |
| uint32_t LE | version, locktime, sequence | 固定 4 bytes |
| int64_t LE | value (satoshi) | 固定 8 bytes |
| Script number | 算術 opcode | 可變長，signed，最長 4 bytes |
| Compact target (bits) | 難度目標 | 固定 4 bytes，壓縮浮點 |

## 程式碼範例

### Python

```python
import struct

def encode_compact_size(n: int) -> bytes:
    """將整數編碼為 Bitcoin Compact Size"""
    if n < 0:
        raise ValueError("Compact size must be non-negative")
    if n <= 0xfc:
        return struct.pack('B', n)
    elif n <= 0xffff:
        return b'\xfd' + struct.pack('<H', n)
    elif n <= 0xffffffff:
        return b'\xfe' + struct.pack('<I', n)
    elif n <= 0xffffffffffffffff:
        return b'\xff' + struct.pack('<Q', n)
    else:
        raise ValueError("Value too large for compact size")

def decode_compact_size(data: bytes, offset: int = 0) -> tuple[int, int]:
    """解碼 Compact Size，返回 (value, bytes_consumed)"""
    first = data[offset]
    if first <= 0xfc:
        return first, 1
    elif first == 0xfd:
        return struct.unpack('<H', data[offset + 1:offset + 3])[0], 3
    elif first == 0xfe:
        return struct.unpack('<I', data[offset + 1:offset + 5])[0], 5
    else:  # 0xff
        return struct.unpack('<Q', data[offset + 1:offset + 9])[0], 9

# 編碼測試
test_values = [0, 1, 252, 253, 255, 256, 65535, 65536, 1_000_000, 2**32]
for v in test_values:
    encoded = encode_compact_size(v)
    decoded, size = decode_compact_size(encoded)
    assert decoded == v
    print(f"{v:>12d} -> {encoded.hex():<20s} ({size} byte{'s' if size > 1 else ''})")

# 交易解析中的使用
def parse_tx_structure(raw_hex: str) -> dict:
    """解析交易的 compact size 欄位"""
    data = bytes.fromhex(raw_hex)
    offset = 0

    version = struct.unpack('<I', data[offset:offset + 4])[0]
    offset += 4

    # 檢查 SegWit marker
    is_segwit = data[offset] == 0x00
    if is_segwit:
        offset += 2  # skip marker + flag

    # Input count
    in_count, cs = decode_compact_size(data, offset)
    in_count_bytes = data[offset:offset + cs]
    offset += cs

    print(f"Version: {version}")
    print(f"SegWit: {is_segwit}")
    print(f"Input count: {in_count} (encoded as: {in_count_bytes.hex()})")

    return {"version": version, "is_segwit": is_segwit, "in_count": in_count}
```

### JavaScript

```javascript
function encodeCompactSize(n) {
  if (n < 0) throw new Error('Must be non-negative');
  if (n <= 0xfc) {
    return Buffer.from([n]);
  } else if (n <= 0xffff) {
    const buf = Buffer.alloc(3);
    buf[0] = 0xfd;
    buf.writeUInt16LE(n, 1);
    return buf;
  } else if (n <= 0xffffffff) {
    const buf = Buffer.alloc(5);
    buf[0] = 0xfe;
    buf.writeUInt32LE(n, 1);
    return buf;
  } else {
    const buf = Buffer.alloc(9);
    buf[0] = 0xff;
    buf.writeBigUInt64LE(BigInt(n), 1);
    return buf;
  }
}

function decodeCompactSize(data, offset = 0) {
  const first = data[offset];
  if (first <= 0xfc) {
    return { value: first, size: 1 };
  } else if (first === 0xfd) {
    return { value: data.readUInt16LE(offset + 1), size: 3 };
  } else if (first === 0xfe) {
    return { value: data.readUInt32LE(offset + 1), size: 5 };
  } else {
    return { value: Number(data.readBigUInt64LE(offset + 1)), size: 9 };
  }
}

// 編碼效率分析
const testValues = [0, 1, 252, 253, 255, 256, 65535, 65536, 1_000_000];
console.log('Compact Size encoding:');
testValues.forEach(v => {
  const encoded = encodeCompactSize(v);
  const decoded = decodeCompactSize(encoded);
  console.log(
    `  ${String(v).padStart(10)} -> ${encoded.toString('hex').padEnd(20)} ` +
    `(${encoded.length} byte${encoded.length > 1 ? 's' : ''})`
  );
});

// 典型交易中的 compact size 使用量估算
function estimateCompactSizeUsage(inputCount, outputCount) {
  let total = 0;
  // tx_in_count
  total += encodeCompactSize(inputCount).length;
  // scriptSig_length per input (P2WPKH: scriptSig = 0)
  total += inputCount * encodeCompactSize(0).length;
  // tx_out_count
  total += encodeCompactSize(outputCount).length;
  // scriptPubKey_length per output (~25 bytes for P2WPKH)
  total += outputCount * encodeCompactSize(22).length;
  // witness item_count per input (P2WPKH: 2 items)
  total += inputCount * encodeCompactSize(2).length;
  // witness item lengths (sig ~72 bytes, pubkey 33 bytes)
  total += inputCount * (encodeCompactSize(72).length + encodeCompactSize(33).length);

  return total;
}

console.log(`\nCompact size overhead for 2-in/2-out P2WPKH: ${estimateCompactSizeUsage(2, 2)} bytes`);
```

## 相關概念

- [Serialization Formats](/bitcoin/data-structures/serialization-formats/) - Bitcoin 的完整序列化格式
- [RLP Encoding (ETH)](/ethereum/data-structures/rlp-encoding/) - Ethereum 的遞迴長度前綴編碼
- [Witness Data](/bitcoin/data-structures/witness-data/) - Witness 中的 compact size 使用
- [Bitcoin Block Structure](/bitcoin/data-structures/bitcoin-block-structure/) - 區塊中的交易計數編碼
- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - Script 長度的 compact size 前綴
- [UTXO Model](/bitcoin/data-structures/utxo-model/) - 交易 input/output 計數
- [SegWit Serialization](/bitcoin/transactions/segwit-serialization/) - SegWit 交易中的 compact size 位置
- [SHA-256d](/bitcoin/cryptography/sha-256d/) - 序列化後的 txid 計算
