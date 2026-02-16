---
title: "SegWit 序列化"
description: "SegWit Serialization, BIP-141, BIP-144, witness format, txid, wtxid, block weight"
tags: [bitcoin, transactions, segwit, serialization, bip-141, bip-144, txid, wtxid, weight]
---

# SegWit 序列化

## 概述

Segregated Witness（SegWit，隔離見證）由 BIP-141/144 定義，於 2017 年 8 月啟用。它將簽名資料（witness）從交易的主體結構中分離出來，引入了一種新的序列化格式。這個改動解決了 [交易延展性](/bitcoin/transactions/transaction-malleability/) 問題、提高了區塊有效容量、並為後續升級（如 Taproot）奠定基礎。SegWit 定義了兩個交易標識符（txid 和 wtxid）以及新的區塊大小度量（weight units）。

## 核心原理

### Legacy 序列化格式

Pre-SegWit 的交易序列化：

```
[version (4B)]
[input_count (varint)]
  [txid (32B)][vout (4B)][scriptSig_len (varint)][scriptSig (var)][sequence (4B)]
  ...
[output_count (varint)]
  [value (8B)][scriptPubKey_len (varint)][scriptPubKey (var)]
  ...
[locktime (4B)]
```

所有資料都計入 txid 的計算。scriptSig 包含簽名，而簽名的可變性導致了交易延展性。

### SegWit 序列化格式

BIP-144 定義的新格式在 version 後插入 marker 和 flag，並在 outputs 後加入 witness 欄位：

```
[version (4B)]
[marker (1B) = 0x00]
[flag (1B) = 0x01]
[input_count (varint)]
  [txid (32B)][vout (4B)][scriptSig_len (varint)][scriptSig (var)][sequence (4B)]
  ...
[output_count (varint)]
  [value (8B)][scriptPubKey_len (varint)][scriptPubKey (var)]
  ...
[witness]
  [witness_item_count_for_input_0 (varint)]
    [item_len (varint)][item (var)]
    ...
  [witness_item_count_for_input_1 (varint)]
    ...
[locktime (4B)]
```

**marker = 0x00**：這也是一個合法的 varint 值（0 inputs），Legacy 解析器遇到 0 inputs 的交易會拒絕它，確保向後相容性。

**flag = 0x01**：標識這是 SegWit 序列化。

### txid vs wtxid

SegWit 引入了兩個交易標識符：

**txid（transaction ID）**：從 Legacy 序列化（不含 marker、flag、witness）計算：

$$\text{txid} = \text{SHA-256d}(\text{version} \| \text{inputs} \| \text{outputs} \| \text{locktime})$$

**wtxid（witness transaction ID）**：從完整 SegWit 序列化計算：

$$\text{wtxid} = \text{SHA-256d}(\text{version} \| \text{marker} \| \text{flag} \| \text{inputs} \| \text{outputs} \| \text{witness} \| \text{locktime})$$

txid 不包含 witness 資料，因此修改簽名不會改變 txid，解決了交易延展性問題。

coinbase 交易的 wtxid 定義為全零 `0x0000...0000`（32 bytes）。

### Witness Commitment

區塊的 coinbase 交易包含一個 witness commitment，承諾所有交易的 wtxid：

$$\text{witnessRoot} = \text{MerkleRoot}(\text{wtxid}_0, \text{wtxid}_1, ..., \text{wtxid}_n)$$

$$\text{commitment} = \text{SHA-256d}(\text{witnessRoot} \| \text{witnessNonce})$$

commitment 存放在 coinbase 交易的一個 `OP_RETURN` 輸出中，前綴為 `0xaa21a9ed`。

### Block Weight vs Block Size

SegWit 引入 weight units 取代原本的 byte-based 區塊大小限制：

$$\text{weight} = \text{baseSize} \times 3 + \text{totalSize}$$

等價地：

$$\text{weight} = \text{non-witness bytes} \times 4 + \text{witness bytes} \times 1$$

| 度量 | 定義 | 上限 |
|------|------|------|
| Legacy block size | 原始 1MB 限制 | 1,000,000 bytes |
| Block weight | weight units | 4,000,000 WU |
| Virtual size (vBytes) | $\lceil\text{weight} / 4\rceil$ | 1,000,000 vBytes |

一個完全由 Legacy 交易組成的區塊：$\text{weight} = \text{size} \times 4$，仍受限於 1MB（= 4M WU / 4）。

一個充分利用 SegWit 的區塊可以超過 1MB 的原始大小（實測最大約 2-2.5MB），因為 witness 資料的折扣使得更多資料可以塞入 4M WU 的限制。

### 費率計算

手續費率使用 virtual bytes 而非原始 bytes：

$$\text{feeRate (sat/vB)} = \frac{\text{fee (satoshis)}}{\text{vBytes}}$$

SegWit 交易的 witness 部分享受 75% 的折扣，這是使用 SegWit 比 Legacy 便宜的根本原因。

### 序列化大小比較

以 1-input-2-output P2WPKH 交易為例：

| 部分 | 大小 | Weight 貢獻 |
|------|------|-------------|
| Version | 4 B | 16 WU |
| Marker + Flag | 2 B | 2 WU |
| Input (non-witness) | 41 B | 164 WU |
| Output 1 | 31 B | 124 WU |
| Output 2 | 31 B | 124 WU |
| Locktime | 4 B | 16 WU |
| Witness | ~108 B | 108 WU |
| **Total** | ~221 B | **554 WU (~139 vB)** |

等效的 P2PKH 交易約 226 bytes = 904 WU = 226 vB。

## 程式碼範例

```javascript
const bitcoin = require('bitcoinjs-lib');

// 解析 SegWit 交易，比較 txid 和 wtxid
function analyzeTransaction(rawHex) {
  const tx = bitcoin.Transaction.fromHex(rawHex);

  const txid = tx.getId();       // from legacy serialization
  const wtxid = tx.getHash(true).reverse().toString('hex'); // from full serialization

  // 計算 weight
  const baseSize = tx.byteLength(false); // without witness
  const totalSize = tx.byteLength(true); // with witness
  const weight = baseSize * 3 + totalSize;
  const vBytes = Math.ceil(weight / 4);

  return {
    txid,
    wtxid,
    baseSize,
    totalSize,
    weight,
    vBytes,
    hasWitness: tx.hasWitnesses(),
    witnessDiscount: totalSize > baseSize
      ? ((totalSize - baseSize) / totalSize * 100).toFixed(1) + '% is witness'
      : 'no witness',
  };
}

// 手動構建並比較 Legacy vs SegWit 序列化
function compareSerialization(tx) {
  const legacySerialization = tx.__toBuffer(undefined, undefined, false);
  const segwitSerialization = tx.__toBuffer(undefined, undefined, true);

  return {
    legacySize: legacySerialization.length,
    segwitSize: segwitSerialization.length,
    witnessSize: segwitSerialization.length - legacySerialization.length,
  };
}

// Weight 計算器
function calculateWeight(nonWitnessBytes, witnessBytes) {
  const weight = nonWitnessBytes * 4 + witnessBytes;
  const vBytes = Math.ceil(weight / 4);
  return { weight, vBytes };
}

// 各類型交易的典型 weight
const txTypes = {
  'P2PKH (1-in-2-out)': calculateWeight(226, 0),
  'P2SH-P2WPKH (1-in-2-out)': calculateWeight(150, 108),
  'P2WPKH (1-in-2-out)': calculateWeight(114, 108),
  'P2TR key path (1-in-2-out)': calculateWeight(105, 66),
};

for (const [type, info] of Object.entries(txTypes)) {
  const feeAt10 = info.vBytes * 10; // 10 sat/vB
  console.log(`${type}: ${info.weight} WU, ${info.vBytes} vB, fee@10sat/vB: ${feeAt10} sat`);
}
```

```python
import hashlib
import struct
from typing import NamedTuple

class TxMetrics(NamedTuple):
    base_size: int
    total_size: int
    weight: int
    vbytes: int

def sha256d(data: bytes) -> bytes:
    """雙重 SHA-256"""
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()

def parse_segwit_tx(raw: bytes) -> dict:
    """解析 SegWit 交易的 marker/flag 並判斷格式"""
    offset = 4  # skip version
    marker = raw[offset]
    flag = raw[offset + 1]

    is_segwit = (marker == 0x00 and flag == 0x01)

    return {
        'version': struct.unpack_from('<I', raw, 0)[0],
        'is_segwit': is_segwit,
        'marker': marker,
        'flag': flag,
    }

def compute_txid_wtxid(
    legacy_serialization: bytes, full_serialization: bytes
) -> tuple[str, str]:
    """計算 txid 和 wtxid"""
    txid = sha256d(legacy_serialization)[::-1].hex()
    wtxid = sha256d(full_serialization)[::-1].hex()
    return txid, wtxid

def calculate_weight(
    non_witness_bytes: int, witness_bytes: int
) -> TxMetrics:
    """計算交易的 weight 和 virtual size"""
    total = non_witness_bytes + witness_bytes
    weight = non_witness_bytes * 4 + witness_bytes
    vbytes = (weight + 3) // 4  # ceiling division
    return TxMetrics(
        base_size=non_witness_bytes,
        total_size=total,
        weight=weight,
        vbytes=vbytes,
    )

# 範例：比較不同交易類型的 weight
types = {
    "P2PKH (legacy)":    (226, 0),
    "P2SH-P2WPKH":      (150, 108),
    "P2WPKH (native)":   (114, 108),
    "P2TR key path":     (105, 66),
}

for name, (nw, w) in types.items():
    m = calculate_weight(nw, w)
    savings = (1 - m.vbytes / 226) * 100
    print(f"{name}: weight={m.weight} WU, vBytes={m.vbytes}, "
          f"savings vs P2PKH: {savings:.0f}%")
```

## 相關概念

- [Witness Data](/bitcoin/data-structures/witness-data/) - witness 欄位的詳細結構
- [Serialization Formats](/bitcoin/data-structures/serialization-formats/) - Bitcoin 的各種序列化格式
- [Transaction Malleability](/bitcoin/transactions/transaction-malleability/) - SegWit 解決的核心問題
- [P2WPKH/P2WSH](/bitcoin/transactions/p2wpkh-p2wsh/) - 使用 SegWit 序列化的輸出類型
- [P2TR](/bitcoin/transactions/p2tr/) - SegWit v1 使用的序列化
- [Fee Estimation](/bitcoin/transactions/fee-estimation/) - weight/vByte 費率計算
- [Transaction Lifecycle](/bitcoin/transactions/transaction-lifecycle-btc/) - 序列化在交易流程中的角色
- [Merkle Tree](/fundamentals/data-structures/merkle-tree/) - witness commitment 使用 Merkle tree
- [Transaction Signing](/bitcoin/transactions/transaction-signing-btc/) - BIP-143 依賴新序列化格式
