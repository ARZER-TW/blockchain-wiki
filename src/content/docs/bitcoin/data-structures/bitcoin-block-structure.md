---
title: "Bitcoin Block Structure"
description: "Bitcoin block structure: 80-byte header fields, block weight (SegWit), coinbase transaction, witness commitment, weight calculation"
tags: [bitcoin, data-structure, block-header, block-weight, segwit, coinbase, mining]
---

# Bitcoin Block Structure

## 概述

Bitcoin 區塊由兩部分組成：固定 80 bytes 的 block header 和一組交易（transactions）。Block header 包含了區塊的元資料（版本、前區塊雜湊、Merkle root、時間戳、難度目標、nonce），是礦工進行 [PoW](/bitcoin/consensus/pow-hashcash/) 運算的對象。SegWit 升級後，區塊大小限制從 1 MB 改為 4 MWU（Million Weight Units）。

## Block Header（80 bytes）

| 欄位 | 大小 | 說明 |
|------|------|------|
| version | 4 bytes | 區塊版本（用於 BIP-9 軟分叉信號） |
| prev_block_hash | 32 bytes | 前一區塊的 [SHA-256d](/bitcoin/cryptography/sha-256d/) 雜湊 |
| merkle_root | 32 bytes | 交易 [Merkle Root](/bitcoin/cryptography/merkle-root/) |
| timestamp | 4 bytes | Unix 時間戳（秒） |
| bits | 4 bytes | 壓縮形式的難度目標（compact target） |
| nonce | 4 bytes | 挖礦用的隨機數 |

### Block Hash

區塊的唯一識別碼是 header 的 SHA-256d：

$$\text{block\_hash} = \text{SHA-256d}(\text{header}_{80\text{bytes}})$$

注意：block hash 不在 header 中，它是從 header 推導出來的。

### Version 欄位與 BIP-9

Version 欄位不僅表示區塊格式版本，還用於 BIP-9 的軟分叉信號機制。高 3 bits 設為 `001`，剩餘 29 bits 作為各 BIP 的信號位。

### Compact Target (bits)

`bits` 欄位是一個 4-byte 的壓縮浮點數，編碼 256-bit 的難度目標：

$$\text{target} = \text{mantissa} \times 2^{8 \times (\text{exponent} - 3)}$$

例如 `bits = 0x1d00ffff`：
- exponent = `0x1d` = 29
- mantissa = `0x00ffff`
- target = `0x00ffff * 2^(8*(29-3))` = `0x00000000FFFF0000...0000`

挖礦的目標是找到 nonce 使得 $\text{SHA-256d}(\text{header}) < \text{target}$。

### Nonce 空間

Nonce 欄位只有 4 bytes（$2^{32}$ 種值），在現代 ASIC 算力下幾毫秒就能窮舉完。礦工還會修改：
- coinbase 交易的 extra nonce
- timestamp（允許的偏差範圍內）
- version bits（部分 bit 可自由使用）

## 區塊大小與 Weight

### Legacy 區塊大小限制

原始的 1 MB 區塊大小限制（`MAX_BLOCK_SIZE`）限制了 serialized block 的總 bytes。

### SegWit Weight 系統

BIP-141 引入了 weight 的概念，取代了簡單的 byte 限制：

$$\text{weight} = \text{base\_size} \times 3 + \text{total\_size}$$

或等價地：

$$\text{weight} = \text{non\_witness\_bytes} \times 4 + \text{witness\_bytes} \times 1$$

- **base_size**：不含 witness data 的交易大小
- **total_size**：含 witness data 的完整交易大小
- **區塊限制**：4,000,000 weight units (4 MWU)

Witness data 的 weight 乘數是 1（而非 4），這意味著 witness 佔用的空間只計算四分之一的 weight，有效鼓勵了 witness 資料的使用（Schnorr 簽名、Tapscript 等）。

### 理論最大區塊大小

- **純 non-witness 資料**：$4{,}000{,}000 / 4 = 1{,}000{,}000$ bytes = 1 MB（與 legacy 相同）
- **純 witness 資料**：$4{,}000{,}000 / 1 = 4{,}000{,}000$ bytes = ~4 MB
- **實際混合**：典型區塊約 1.5-2.5 MB

### Virtual Bytes (vbytes)

$$\text{vbytes} = \lceil \text{weight} / 4 \rceil$$

手續費通常以 sat/vbyte 為單位報價。一個 SegWit 交易的 vbytes 小於其實際 bytes，因為 witness 部分的折扣。

## Coinbase Transaction

每個區塊的第一筆交易是 coinbase transaction，它有特殊的規則：

- **Input**：只有一個，且 txid 為全零、vout 為 `0xFFFFFFFF`
- **scriptSig**：可以包含任意資料（礦工可自由使用），但必須包含區塊高度（BIP-34）
- **Output**：區塊獎勵 + 手續費總和
- **Extra nonce**：通常在 scriptSig 中放置額外的 nonce 以擴大挖礦搜索空間

### 區塊獎勵

$$\text{subsidy}(h) = \lfloor 50 \times 10^8 / 2^{\lfloor h / 210000 \rfloor} \rfloor \text{ satoshi}$$

每 210,000 個區塊（約 4 年）減半。2024 年 4 月第四次減半後，獎勵為 3.125 BTC。

### Witness Commitment

SegWit 區塊的 coinbase 交易包含一個特殊的 output，承諾 [witness data](/bitcoin/data-structures/witness-data/) 的 Merkle root：

$$\text{witness\_commitment} = \text{SHA-256d}(\text{witness\_root} \| \text{witness\_nonce})$$

這個 output 的 scriptPubKey 格式為：`OP_RETURN <0xaa21a9ed> <32-byte commitment>`。

## 程式碼範例

### Python

```python
import struct
import hashlib

def sha256d(data: bytes) -> bytes:
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()

def parse_block_header(raw: bytes) -> dict:
    """解析 80-byte block header"""
    assert len(raw) == 80
    return {
        'version': struct.unpack('<I', raw[0:4])[0],
        'prev_block_hash': raw[4:36][::-1].hex(),
        'merkle_root': raw[36:68][::-1].hex(),
        'timestamp': struct.unpack('<I', raw[68:72])[0],
        'bits': struct.unpack('<I', raw[72:76])[0],
        'nonce': struct.unpack('<I', raw[76:80])[0],
        'block_hash': sha256d(raw)[::-1].hex(),
    }

def compact_to_target(bits: int) -> int:
    """將 compact bits 轉換為 256-bit target"""
    exponent = bits >> 24
    mantissa = bits & 0x7fffff
    if exponent <= 3:
        return mantissa >> (8 * (3 - exponent))
    return mantissa << (8 * (exponent - 3))

def calculate_weight(base_size: int, total_size: int) -> int:
    """計算交易或區塊的 weight"""
    witness_size = total_size - base_size
    return base_size * 4 + witness_size

def calculate_subsidy(height: int) -> int:
    """計算區塊獎勵（satoshi）"""
    halvings = height // 210_000
    if halvings >= 64:
        return 0
    return 50_0000_0000 >> halvings

# 範例
print("Block subsidies:")
for era in range(6):
    h = era * 210_000
    subsidy = calculate_subsidy(h)
    btc = subsidy / 1e8
    print(f"  Height {h:>7d}: {btc:.8f} BTC")

# Weight 計算範例
base = 250   # non-witness bytes
total = 400  # total bytes (including witness)
w = calculate_weight(base, total)
vb = (w + 3) // 4
print(f"\nTransaction: base={base}B, total={total}B")
print(f"  Weight: {w} WU")
print(f"  Virtual bytes: {vb} vB")
```

### JavaScript

```javascript
import { createHash } from 'crypto';

function sha256d(data) {
  const first = createHash('sha256').update(data).digest();
  return createHash('sha256').update(first).digest();
}

function parseBlockHeader(raw) {
  if (raw.length !== 80) throw new Error('Header must be 80 bytes');
  return {
    version: raw.readUInt32LE(0),
    prevBlockHash: Buffer.from(raw.subarray(4, 36)).reverse().toString('hex'),
    merkleRoot: Buffer.from(raw.subarray(36, 68)).reverse().toString('hex'),
    timestamp: raw.readUInt32LE(68),
    bits: raw.readUInt32LE(72),
    nonce: raw.readUInt32LE(76),
    blockHash: Buffer.from(sha256d(raw)).reverse().toString('hex'),
  };
}

// Weight 計算
function calculateWeight(baseSizeBytes, totalSizeBytes) {
  const witnessBytes = totalSizeBytes - baseSizeBytes;
  const nonWitnessBytes = baseSizeBytes;
  return nonWitnessBytes * 4 + witnessBytes * 1;
}

// 最大區塊限制
const MAX_BLOCK_WEIGHT = 4_000_000;

// 不同交易類型的 weight 比較
const txTypes = [
  { name: 'P2PKH (legacy)',     base: 226, total: 226 },
  { name: 'P2SH-P2WPKH',       base: 150, total: 217 },
  { name: 'P2WPKH (native)',    base: 113, total: 195 },
  { name: 'P2TR (Taproot)',     base: 105, total: 173 },
];

console.log('Transaction weight comparison:');
txTypes.forEach(({ name, base, total }) => {
  const weight = calculateWeight(base, total);
  const vbytes = Math.ceil(weight / 4);
  console.log(`  ${name.padEnd(20)} base=${base}B total=${total}B weight=${weight}WU vbytes=${vbytes}`);
});
```

## 相關概念

- [Block Structure (ETH)](/ethereum/consensus/block-structure/) - Ethereum 的區塊結構對照
- [PoW/Hashcash](/bitcoin/consensus/pow-hashcash/) - Block header hashing 的工作量證明
- [Merkle Root](/bitcoin/cryptography/merkle-root/) - Header 中的交易 Merkle root
- [SHA-256d](/bitcoin/cryptography/sha-256d/) - Block hash 使用的雜湊函數
- [Witness Data](/bitcoin/data-structures/witness-data/) - SegWit witness 結構與 weight discount
- [Merkle Tree in Blocks](/bitcoin/data-structures/merkle-tree-in-blocks/) - txid vs wtxid Merkle 樹
- [Serialization Formats](/bitcoin/data-structures/serialization-formats/) - 區塊與交易的序列化
- [UTXO Model](/bitcoin/data-structures/utxo-model/) - 交易 input/output 的狀態模型
- [Compact Size Encoding](/bitcoin/data-structures/compact-size-encoding/) - 區塊中交易計數的編碼
- [Bitcoin 雜湊函數](/bitcoin/cryptography/hash-functions-in-bitcoin/) - 區塊中使用的所有雜湊函數
