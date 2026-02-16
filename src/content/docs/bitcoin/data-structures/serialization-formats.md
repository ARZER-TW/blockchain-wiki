---
title: "Serialization Formats（序列化格式）"
description: "Bitcoin serialization formats: legacy vs SegWit transaction serialization, block serialization, Base58Check, Bech32/Bech32m, comparison with Ethereum RLP/SSZ"
tags: [bitcoin, data-structure, serialization, base58check, bech32, bech32m, bip-173, bip-350]
---

# Serialization Formats

## 概述

Bitcoin 使用多種序列化格式來編碼交易、區塊和地址。交易序列化有 legacy 和 SegWit 兩種格式；地址編碼從 Base58Check 演進到 Bech32/Bech32m。理解這些格式是解析 Bitcoin 原始資料的基礎，也是理解 SegWit 向後相容設計的關鍵。

## Legacy 交易序列化

```
[version: 4B]
[tx_in_count: compact_size]
  [tx_in[0]:
    [prev_txid: 32B]
    [prev_vout: 4B]
    [scriptSig_length: compact_size]
    [scriptSig: var]
    [sequence: 4B]
  ]
  ...
[tx_out_count: compact_size]
  [tx_out[0]:
    [value: 8B]
    [scriptPubKey_length: compact_size]
    [scriptPubKey: var]
  ]
  ...
[locktime: 4B]
```

所有整數使用 **little-endian** 編碼。計數欄位使用 [Compact Size Encoding](/bitcoin/data-structures/compact-size-encoding/)。

### txid 計算

$$\text{txid} = \text{SHA-256d}(\text{legacy\_serialized\_tx})$$

顯示時以 **big-endian**（byte-reversed）呈現。

## SegWit 交易序列化

BIP-141 在 version 和 inputs 之間插入了 marker 和 flag，並在 outputs 和 locktime 之間插入 witness：

```
[version: 4B]
[marker: 1B (0x00)]
[flag: 1B (0x01)]
[tx_in_count: compact_size]
  [tx_in[0]: same as legacy]
  ...
[tx_out_count: compact_size]
  [tx_out[0]: same as legacy]
  ...
[witness:
  [input_0_witness:
    [item_count: compact_size]
    [item_0_length: compact_size]
    [item_0_data: var]
    ...
  ]
  [input_1_witness: ...]
  ...
]
[locktime: 4B]
```

### wtxid 計算

$$\text{wtxid} = \text{SHA-256d}(\text{segwit\_serialized\_tx})$$

### marker/flag 的向後相容性

`marker = 0x00` 在 legacy 解析中會被視為 `tx_in_count = 0`，這是一個無效的交易（零 input），因此舊節點能夠區分 legacy 和 SegWit 交易。

## 區塊序列化

```
[block_header: 80B]
  [version: 4B]
  [prev_block_hash: 32B]
  [merkle_root: 32B]
  [timestamp: 4B]
  [bits: 4B]
  [nonce: 4B]
[tx_count: compact_size]
[transactions: var]
```

## Base58Check 地址編碼

用於 P2PKH 和 P2SH 的 legacy 地址。

### 編碼流程

1. 準備 payload：`version_byte || hash_data`
2. 計算 checksum：`SHA-256d(payload)` 的前 4 bytes
3. Base58 編碼：`Base58(payload || checksum)`

### Base58 字母表

```
123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
```

刻意排除了 `0`, `O`, `I`, `l`（容易混淆的字元）。

### Version Bytes

| Version | 前綴 | 用途 |
|---------|------|------|
| 0x00 | 1 | Mainnet P2PKH |
| 0x05 | 3 | Mainnet P2SH |
| 0x6f | m/n | Testnet P2PKH |
| 0xc4 | 2 | Testnet P2SH |
| 0x80 | 5/K/L | WIF 私鑰 (Mainnet) |

### Base58Check 的缺點

- 大小寫混合，不便口述
- Checksum 只有 4 bytes（$2^{32}$ 種），錯誤偵測能力有限
- 編碼/解碼需要大數除法，效率較低
- 不支援 SegWit witness program

## Bech32 地址編碼（BIP-173）

用於 SegWit v0 地址（P2WPKH、P2WSH）。

### 結構

```
bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4
|  | |                                    |
hrp sep data (witness version + program)  checksum(6 chars)
```

- **HRP**（Human-Readable Part）：`bc`（mainnet）或 `tb`（testnet）
- **Separator**：固定 `1`
- **Data**：witness version（0-16）+ witness program（Base32 編碼）
- **Checksum**：BCH code，6 個字元

### 字母表

```
qpzry9x8gf2tvdw0s3jn54khce6mua7l
```

全小寫，排除了 `1`, `b`, `i`, `o`。支援全大寫或全小寫（但不混合）。

### 優勢

- **錯誤偵測**：BCH code 保證能偵測任意 1 個字元的替換
- **更好的 QR code**：全小寫可使用 alphanumeric mode，QR code 更小
- **效率**：Base32 編碼不需要大數運算

## Bech32m 地址編碼（BIP-350）

用於 SegWit v1+（P2TR 及未來版本）。

### 與 Bech32 的差異

Bech32 有一個已知弱點：在特定條件下（最後一個字元為 `p`），插入或刪除 `q` 不會改變 checksum。Bech32m 修改了 checksum 常數來修復此問題。

```
Bech32:  checksum constant = 1
Bech32m: checksum constant = 0x2bc830a3
```

| 地址類型 | 前綴 | 編碼 | 範例開頭 |
|----------|------|------|---------|
| P2WPKH | bc1q | Bech32 | bc1q... |
| P2WSH | bc1q | Bech32 | bc1q... |
| P2TR | bc1p | Bech32m | bc1p... |

## 與 Ethereum 序列化的比較

| 特性 | Bitcoin | Ethereum |
|------|---------|----------|
| 交易序列化 | 自訂 binary | [RLP Encoding](/ethereum/data-structures/rlp-encoding/) |
| 整數編碼 | Little-endian, fixed-width | Big-endian, variable-width (RLP) |
| Beacon Chain | N/A | [SSZ Encoding](/ethereum/data-structures/ssz-encoding/) |
| 長度前綴 | [Compact Size](/bitcoin/data-structures/compact-size-encoding/) | RLP length prefix |
| 地址編碼 | Base58Check / Bech32 / Bech32m | Hex + EIP-55 checksum |
| 可讀性 | Bech32 較友好 | Hex 不太友好 |

## 程式碼範例

### Python

```python
import hashlib

# Base58Check 編碼
BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

def base58_encode(data: bytes) -> str:
    """Base58 編碼"""
    num = int.from_bytes(data, 'big')
    result = []
    while num > 0:
        num, remainder = divmod(num, 58)
        result.append(BASE58_ALPHABET[remainder])
    # 前導零 bytes 對應前導 '1'
    for byte in data:
        if byte == 0:
            result.append('1')
        else:
            break
    return ''.join(reversed(result))

def base58check_encode(version: int, payload: bytes) -> str:
    """Base58Check 編碼"""
    versioned = bytes([version]) + payload
    checksum = hashlib.sha256(
        hashlib.sha256(versioned).digest()
    ).digest()[:4]
    return base58_encode(versioned + checksum)

# P2PKH 地址
pubkey_hash = bytes.fromhex("89abcdefabbaabbaabbaabbaabbaabbaabbaabba")
address = base58check_encode(0x00, pubkey_hash)
print(f"P2PKH address: {address}")

# P2SH 地址
script_hash = bytes.fromhex("aabbccddeeff00112233445566778899aabbccdd")
address = base58check_encode(0x05, script_hash)
print(f"P2SH address: {address}")

# Bech32 編碼（簡化）
BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"

def bech32_hrp_expand(hrp: str) -> list[int]:
    return [ord(c) >> 5 for c in hrp] + [0] + [ord(c) & 31 for c in hrp]

def bech32_polymod(values: list[int]) -> int:
    GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
    chk = 1
    for v in values:
        top = chk >> 25
        chk = ((chk & 0x1ffffff) << 5) ^ v
        for i in range(5):
            chk ^= GEN[i] if ((top >> i) & 1) else 0
    return chk

def bech32_encode(hrp: str, data: list[int], is_bech32m: bool = False) -> str:
    """Bech32/Bech32m 編碼"""
    const = 0x2bc830a3 if is_bech32m else 1
    values = bech32_hrp_expand(hrp) + data
    polymod = bech32_polymod(values + [0, 0, 0, 0, 0, 0]) ^ const
    checksum = [(polymod >> 5 * (5 - i)) & 31 for i in range(6)]
    return hrp + '1' + ''.join(BECH32_CHARSET[d] for d in data + checksum)

# Bech32 P2WPKH 地址
witness_program = [0] + [int(b) for b in pubkey_hash]  # 簡化，實際需要 5-bit 轉換
print(f"Bech32 encoding demo (conceptual)")
```

### JavaScript

```javascript
import { createHash } from 'crypto';

// Base58Check
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(data) {
  let num = BigInt('0x' + data.toString('hex'));
  const chars = [];
  while (num > 0n) {
    const [div, mod] = [num / 58n, num % 58n];
    chars.push(BASE58[Number(mod)]);
    num = div;
  }
  for (const byte of data) {
    if (byte === 0) chars.push('1');
    else break;
  }
  return chars.reverse().join('');
}

function base58CheckEncode(version, payload) {
  const versioned = Buffer.concat([Buffer.from([version]), payload]);
  const hash1 = createHash('sha256').update(versioned).digest();
  const hash2 = createHash('sha256').update(hash1).digest();
  const checksum = hash2.subarray(0, 4);
  return base58Encode(Buffer.concat([versioned, checksum]));
}

// P2PKH address
const pkh = Buffer.from('89abcdefabbaabbaabbaabbaabbaabbaabbaabba', 'hex');
console.log(`P2PKH: ${base58CheckEncode(0x00, pkh)}`);
console.log(`P2SH:  ${base58CheckEncode(0x05, pkh)}`);

// 地址前綴對照表
const prefixes = [
  { version: 0x00, prefix: '1',   network: 'mainnet', type: 'P2PKH' },
  { version: 0x05, prefix: '3',   network: 'mainnet', type: 'P2SH' },
  { version: 0x6f, prefix: 'm/n', network: 'testnet', type: 'P2PKH' },
  { version: 0xc4, prefix: '2',   network: 'testnet', type: 'P2SH' },
];

console.log('\nAddress prefixes:');
prefixes.forEach(p => {
  console.log(`  Version 0x${p.version.toString(16).padStart(2, '0')} -> prefix '${p.prefix}' (${p.network} ${p.type})`);
});
```

## 相關概念

- [RLP Encoding (ETH)](/ethereum/data-structures/rlp-encoding/) - Ethereum 的遞迴長度前綴編碼
- [SSZ Encoding (ETH)](/ethereum/data-structures/ssz-encoding/) - Ethereum Beacon Chain 的 Simple Serialize
- [SegWit Serialization](/bitcoin/transactions/segwit-serialization/) - SegWit 交易的完整序列化規範
- [Compact Size Encoding](/bitcoin/data-structures/compact-size-encoding/) - 交易中的變長整數編碼
- [Witness Data](/bitcoin/data-structures/witness-data/) - Witness 在序列化中的位置
- [Bitcoin Block Structure](/bitcoin/data-structures/bitcoin-block-structure/) - 區塊的序列化結構
- [SHA-256d](/bitcoin/cryptography/sha-256d/) - txid/wtxid 和 checksum 使用的雜湊函數
- [secp256k1 in Bitcoin](/bitcoin/cryptography/secp256k1-in-bitcoin/) - 公鑰序列化與地址推導
- [Bitcoin 雜湊函數](/bitcoin/cryptography/hash-functions-in-bitcoin/) - HASH-160 在地址生成中的角色
- [UTXO Model](/bitcoin/data-structures/utxo-model/) - 交易 input/output 引用的序列化
