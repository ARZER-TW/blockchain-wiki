---
title: "Bitcoin 雜湊函數總覽"
description: "Complete overview of hash functions in Bitcoin: SHA-256d, SHA-256, RIPEMD-160, HASH-160, tagged hashes, and their usage map"
tags: [bitcoin, cryptography, hash-function, sha256, ripemd160, hash160, tagged-hash, domain-separation]
---

# Bitcoin 雜湊函數總覽

## 概述

Bitcoin 協議使用多種雜湊函數，每種在不同的上下文中扮演特定角色。理解哪個雜湊函數用在哪裡，是深入理解 Bitcoin 協議的關鍵。本文是所有 Bitcoin 雜湊函數的完整索引與使用地圖。

## 雜湊函數一覽表

| 雜湊函數 | 輸出大小 | 定義 | 主要用途 |
|----------|---------|------|---------|
| SHA-256 | 32 bytes | FIPS 180-4 | 用於 HASH-160 的第一步 |
| SHA-256d | 32 bytes | SHA-256(SHA-256(x)) | Block header、txid、Merkle root |
| RIPEMD-160 | 20 bytes | RIPEMD family | 用於 HASH-160 的第二步 |
| HASH-160 | 20 bytes | RIPEMD-160(SHA-256(x)) | 地址推導 |
| Tagged Hash | 32 bytes | SHA-256(tag\_hash \|\| tag\_hash \|\| data) | Taproot/Schnorr |

## SHA-256d (Double SHA-256)

$$H(x) = \text{SHA-256}(\text{SHA-256}(x))$$

Bitcoin 最核心的雜湊函數，用於防禦 Length Extension Attack。詳見 [SHA-256d](/bitcoin/cryptography/sha-256d/)。

**使用場景：**
- **Block header hash**：挖礦的 PoW 挑戰
- **Transaction ID (txid)**：`SHA-256d(serialized_tx_without_witness)`
- **Merkle root**：交易 Merkle 樹的節點合併
- **Base58Check checksum**：地址 checksum 的前 4 bytes

## SHA-256（單次）

$$H(x) = \text{SHA-256}(x)$$

在 Bitcoin 中，單次 SHA-256 主要作為 HASH-160 的第一步使用，以及在 tagged hash 中使用。

**使用場景：**
- HASH-160 的第一步：`SHA-256(pubkey)` -> RIPEMD-160
- Tagged hash 的 tag 前處理：`SHA-256(tag_string)`
- P2WSH witness program：`SHA-256(witness_script)`（注意不是 HASH-160）

## RIPEMD-160

$$H(x) = \text{RIPEMD-160}(x)$$

RIPEMD-160 是由 Hans Dobbertin、Antoon Bosselaers 和 Bart Preneel 設計的 160-bit 雜湊函數。它在 Bitcoin 中僅作為 HASH-160 的第二步使用。

**為何選擇 RIPEMD-160？**
- 輸出 20 bytes，比 SHA-256 的 32 bytes 更短，縮減了地址長度
- 與 SHA-256 不同家族，降低了兩個函數同時被攻破的風險（defense in depth）
- 160-bit 的碰撞抗性 $O(2^{80})$ 對地址空間而言足夠

## HASH-160

$$\text{HASH-160}(x) = \text{RIPEMD-160}(\text{SHA-256}(x))$$

這是一個複合雜湊函數，將任意長度的輸入壓縮為 20 bytes (160 bits)。

**使用場景：**
- **P2PKH 地址**：`HASH-160(compressed_pubkey)`
- **P2SH 地址**：`HASH-160(redeem_script)`
- **P2WPKH witness program**：`HASH-160(compressed_pubkey)`

注意：P2WSH 和 P2TR 不使用 HASH-160。P2WSH 使用單次 SHA-256（32 bytes），P2TR 使用 x-only tweaked key（32 bytes）。

## Tagged Hash (BIP-340/341)

$$\text{TaggedHash}(\text{tag}, \text{data}) = \text{SHA-256}(\text{SHA-256}(\text{tag}) \| \text{SHA-256}(\text{tag}) \| \text{data})$$

Taproot 引入的域分離機制。重複 tag hash 兩次是為了效能最佳化：`SHA-256(tag)` 可以預計算，然後直接初始化 SHA-256 壓縮狀態（midstate optimization）。

**已定義的 Tags：**

| Tag | 用途 |
|-----|------|
| `BIP0340/challenge` | Schnorr 簽名挑戰值 |
| `BIP0340/aux` | 輔助隨機數 |
| `BIP0340/nonce` | Nonce 生成 |
| `TapTweak` | Key tweaking |
| `TapLeaf` | 腳本葉子雜湊 |
| `TapBranch` | 腳本樹分支雜湊 |
| `TapSighash` | Taproot sighash |

## 使用地圖

```
Block Header Hash:       SHA-256d(80-byte header)
Transaction ID (txid):   SHA-256d(legacy serialized tx)
Witness txid (wtxid):    SHA-256d(witness serialized tx)
Merkle Root:             SHA-256d(left || right) 遞迴
Witness Commitment:      SHA-256d(witness_root || witness_nonce)

P2PKH Address:           HASH-160(compressed pubkey)
P2SH Address:            HASH-160(redeem script)
P2WPKH Program:          HASH-160(compressed pubkey)
P2WSH Program:           SHA-256(witness script)
P2TR Program:            x-only tweaked pubkey (32 bytes, no hash)

Schnorr Challenge:       TaggedHash("BIP0340/challenge", R || P || m)
Schnorr Nonce:           TaggedHash("BIP0340/nonce", ...)
Taproot Tweak:           TaggedHash("TapTweak", P || c)
Tap Leaf:                TaggedHash("TapLeaf", version || script)
Tap Branch:              TaggedHash("TapBranch", min(l,r) || max(l,r))

Base58Check Checksum:    SHA-256d(version || payload) 取前 4 bytes
```

## 程式碼範例

### Python

```python
import hashlib

def sha256(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()

def sha256d(data: bytes) -> bytes:
    return sha256(sha256(data))

def ripemd160(data: bytes) -> bytes:
    return hashlib.new('ripemd160', data).digest()

def hash160(data: bytes) -> bytes:
    return ripemd160(sha256(data))

def tagged_hash(tag: str, data: bytes) -> bytes:
    tag_h = sha256(tag.encode())
    return sha256(tag_h + tag_h + data)

# 各雜湊函數輸出大小
test_data = b"Bitcoin hash functions"

print(f"SHA-256:     {len(sha256(test_data))} bytes -> {sha256(test_data).hex()[:32]}...")
print(f"SHA-256d:    {len(sha256d(test_data))} bytes -> {sha256d(test_data).hex()[:32]}...")
print(f"RIPEMD-160:  {len(ripemd160(test_data))} bytes -> {ripemd160(test_data).hex()}")
print(f"HASH-160:    {len(hash160(test_data))} bytes -> {hash160(test_data).hex()}")
print(f"Tagged Hash: {len(tagged_hash('TapTweak', test_data))} bytes")

# 域分離示範：同樣的資料，不同 tag 產生不同結果
data = b"same data"
h1 = tagged_hash("TapLeaf", data)
h2 = tagged_hash("TapBranch", data)
h3 = tagged_hash("BIP0340/challenge", data)
print(f"\nDomain separation demo:")
print(f"TapLeaf:           {h1.hex()[:32]}...")
print(f"TapBranch:         {h2.hex()[:32]}...")
print(f"BIP0340/challenge: {h3.hex()[:32]}...")
```

### JavaScript

```javascript
import { createHash } from 'crypto';

const sha256 = (data) => createHash('sha256').update(data).digest();
const sha256d = (data) => sha256(sha256(data));
const ripemd160 = (data) => createHash('ripemd160').update(data).digest();
const hash160 = (data) => ripemd160(sha256(data));

function taggedHash(tag, data) {
  const tagH = sha256(Buffer.from(tag));
  return sha256(Buffer.concat([tagH, tagH, data]));
}

// P2PKH vs P2WPKH vs P2WSH vs P2TR 的雜湊比較
const fakePubkey = Buffer.alloc(33, 0xab); // 33-byte compressed pubkey
const fakeScript = Buffer.alloc(64, 0xcd); // witness script
const fakeTweakedKey = Buffer.alloc(32, 0xef); // x-only key

console.log('Address program derivation:');
console.log(`P2PKH:  HASH-160 -> ${hash160(fakePubkey).length} bytes`);
console.log(`P2WPKH: HASH-160 -> ${hash160(fakePubkey).length} bytes`);
console.log(`P2WSH:  SHA-256  -> ${sha256(fakeScript).length} bytes`);
console.log(`P2TR:   x-only   -> ${fakeTweakedKey.length} bytes (no hash)`);
```

## 相關概念

- [SHA-256d](/bitcoin/cryptography/sha-256d/) - Bitcoin 的 double hashing 詳解
- [雜湊函數概述](/fundamentals/cryptography/hash-function-overview/) - 雜湊函數的安全性質分類
- [SHA-256](/fundamentals/cryptography/sha-256/) - SHA-256 的內部結構與壓縮函數
- [Schnorr Signatures](/bitcoin/cryptography/schnorr-signatures/) - 使用 tagged hash 的簽名方案
- [Taproot Key Tweaking](/bitcoin/cryptography/taproot-key-tweaking/) - 使用 tagged hash 的 key tweaking
- [secp256k1 in Bitcoin](/bitcoin/cryptography/secp256k1-in-bitcoin/) - HASH-160 在地址推導中的角色
- [Merkle Root](/bitcoin/cryptography/merkle-root/) - 使用 SHA-256d 的 Merkle 樹建構
- [Serialization Formats](/bitcoin/data-structures/serialization-formats/) - Base58Check 中的 SHA-256d checksum
- [Block Structure](/bitcoin/data-structures/bitcoin-block-structure/) - Block header hash 的計算
- [Keccak-256](/fundamentals/cryptography/keccak-256/) - Ethereum 使用的替代雜湊函數
