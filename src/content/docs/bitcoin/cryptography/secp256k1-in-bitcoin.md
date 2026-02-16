---
title: "secp256k1 在 Bitcoin 中的應用"
description: "secp256k1 elliptic curve in Bitcoin: compressed/uncompressed public keys, x-only keys (BIP-340), HASH-160 address derivation"
tags: [bitcoin, cryptography, secp256k1, public-key, address-derivation, bip-340]
---

# secp256k1 在 Bitcoin 中的應用

## 概述

Bitcoin 使用 [secp256k1](/fundamentals/cryptography/secp256k1/) 橢圓曲線進行所有公鑰密碼學運算。雖然 Ethereum 也使用相同的曲線，但兩者在公鑰編碼格式、地址推導流程上有顯著差異。Bitcoin 的公鑰編碼經歷了從 uncompressed（65 bytes）到 compressed（33 bytes）再到 x-only（32 bytes，BIP-340）的演進，每一步都降低了鏈上資料量。

## secp256k1 曲線參數

曲線方程式：$y^2 = x^3 + 7 \pmod{p}$

$$p = 2^{256} - 2^{32} - 977$$

生成點 $G$ 的階：

$$n = \texttt{FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141}$$

cofactor $h = 1$，意味著曲線上所有點（除了無窮遠點）都在 $G$ 生成的子群中，簡化了實作上的安全性考量。

## 公鑰編碼格式演進

### Uncompressed 格式（65 bytes）

最早的 Bitcoin 公鑰格式，以前綴 `04` 開頭：

$$\texttt{04} \| x \| y$$

其中 $x$ 和 $y$ 各 32 bytes。給定 $x$ 可以從曲線方程式計算 $y$，但有兩個解（$y$ 和 $p - y$），所以需要同時儲存 $x$ 和 $y$。

### Compressed 格式（33 bytes）

BIP-0032/BIP-0141 推動了 compressed 公鑰的普及。由於 $y^2 = x^3 + 7 \pmod{p}$ 對每個 $x$ 最多有兩個 $y$ 值（$y$ 和 $p - y$），只需一個 bit 區分：

$$\texttt{02} \| x \quad \text{if } y \text{ is even}$$
$$\texttt{03} \| x \quad \text{if } y \text{ is odd}$$

壓縮公鑰節省了 32 bytes 的鏈上空間，對於 P2PKH 交易中每個 input 都包含公鑰的情況有顯著效果。

### X-only 格式（32 bytes，BIP-340）

[Schnorr 簽名](/bitcoin/cryptography/schnorr-signatures/) (BIP-340) 引入了 x-only 公鑰，省去了前綴 byte：

$$x \text{ only (32 bytes)}$$

BIP-340 規定所有公鑰必須有偶數 $y$ 座標。若原始公鑰的 $y$ 為奇數，則對私鑰取反（$n - d$）使對應公鑰的 $y$ 為偶數。這種隱式偶數約定使得公鑰可以直接用 32 bytes 表示。

## 從公鑰到 Bitcoin 地址

### 傳統地址推導（P2PKH）

Bitcoin 使用 HASH-160 進行地址推導：

$$\text{HASH-160}(K) = \text{RIPEMD-160}(\text{SHA-256}(K))$$

其中 $K$ 是公鑰的序列化形式（compressed 或 uncompressed）。

完整流程：
1. 公鑰 $Q = dG$，序列化為 33 bytes（compressed）
2. $h = \text{HASH-160}(Q_{\text{serialized}})$，得 20 bytes
3. 加 1-byte 版本前綴（mainnet: `0x00`，testnet: `0x6f`）
4. 計算 checksum：$c = \text{SHA-256d}(\text{version} \| h)$ 的前 4 bytes
5. Base58Check 編碼：$\text{Base58}(\text{version} \| h \| c)$

### 與 Ethereum 地址推導的比較

| 步驟 | Bitcoin (P2PKH) | Ethereum |
|------|-----------------|----------|
| 公鑰格式 | Compressed (33 bytes) | Uncompressed 去掉 04 前綴 (64 bytes) |
| 雜湊函數 | RIPEMD-160(SHA-256(pubkey)) | Keccak-256(pubkey) |
| 地址長度 | 20 bytes (160 bits) | 20 bytes (160 bits) |
| 編碼方式 | Base58Check | Hex (EIP-55 checksum) |
| Checksum | SHA-256d 前 4 bytes | 大小寫混合 (EIP-55) |

兩者最終地址長度相同（20 bytes），但推導路徑完全不同。Bitcoin 額外使用 RIPEMD-160 將 SHA-256 的 32 bytes 壓縮到 20 bytes，而 Ethereum 直接截取 Keccak-256 的後 20 bytes。

### Bech32 地址（SegWit）

P2WPKH 地址使用 Bech32 編碼，但底層仍然是 HASH-160：

$$\text{witness program} = \text{HASH-160}(Q_{\text{compressed}})$$

前綴 `bc1q` 表示 witness version 0。

### Bech32m 地址（Taproot）

P2TR 地址使用 Bech32m 編碼，直接使用 x-only 公鑰（經過 key tweaking）：

$$\text{witness program} = Q_x \quad (32 \text{ bytes, x-only tweaked key})$$

前綴 `bc1p` 表示 witness version 1。注意這裡不再經過 HASH-160，因為 Taproot 的 witness program 就是 32 bytes 的公鑰。

## 程式碼範例

### Python

```python
import hashlib
import ecdsa

# secp256k1 金鑰生成
sk = ecdsa.SigningKey.generate(curve=ecdsa.SECP256k1)
vk = sk.get_verifying_key()
private_key = sk.to_string()
public_key_raw = vk.to_string()  # 64 bytes (x || y)

x = int.from_bytes(public_key_raw[:32], 'big')
y = int.from_bytes(public_key_raw[32:], 'big')

# Uncompressed: 04 || x || y
uncompressed = b'\x04' + public_key_raw
print(f"Uncompressed ({len(uncompressed)} bytes): {uncompressed.hex()}")

# Compressed: 02/03 || x
prefix = b'\x02' if y % 2 == 0 else b'\x03'
compressed = prefix + public_key_raw[:32]
print(f"Compressed ({len(compressed)} bytes): {compressed.hex()}")

# X-only (BIP-340): just x, 需要確保 y 為偶數
x_only = public_key_raw[:32]
print(f"X-only ({len(x_only)} bytes): {x_only.hex()}")

# HASH-160 地址推導
def hash160(data: bytes) -> bytes:
    sha = hashlib.sha256(data).digest()
    return hashlib.new('ripemd160', sha).digest()

def sha256d(data: bytes) -> bytes:
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()

# P2PKH 地址（使用 compressed pubkey）
h160 = hash160(compressed)
versioned = b'\x00' + h160  # mainnet
checksum = sha256d(versioned)[:4]

# Base58Check 編碼
import base58
address = base58.b58encode(versioned + checksum).decode()
print(f"P2PKH address: {address}")
```

### JavaScript

```javascript
import { createHash } from 'crypto';
import * as secp256k1 from '@noble/secp256k1';

// 金鑰生成
const privateKey = secp256k1.utils.randomPrivateKey();
const publicKeyUncompressed = secp256k1.getPublicKey(privateKey, false); // 65 bytes
const publicKeyCompressed = secp256k1.getPublicKey(privateKey, true);    // 33 bytes

console.log(`Uncompressed (${publicKeyUncompressed.length} bytes)`);
console.log(`Compressed (${publicKeyCompressed.length} bytes)`);

// 從 compressed 恢復 uncompressed
const point = secp256k1.ProjectivePoint.fromHex(publicKeyCompressed);
const xOnly = publicKeyCompressed.slice(1); // 去掉前綴，得 x-only 32 bytes
console.log(`X-only (${xOnly.length} bytes)`);

// HASH-160
function hash160(data) {
  const sha = createHash('sha256').update(data).digest();
  return createHash('ripemd160').update(sha).digest();
}

const h160 = hash160(Buffer.from(publicKeyCompressed));
console.log(`HASH-160: ${h160.toString('hex')}`);
console.log(`HASH-160 length: ${h160.length} bytes (${h160.length * 8} bits)`);

// Compressed vs Uncompressed 產生不同的地址
const h160Uncompressed = hash160(Buffer.from(publicKeyUncompressed));
console.log(`Same address? ${h160.equals(h160Uncompressed)}`); // false
```

## 相關概念

- [secp256k1](/fundamentals/cryptography/secp256k1/) - secp256k1 曲線的通用數學定義
- [橢圓曲線密碼學](/fundamentals/cryptography/elliptic-curve-cryptography/) - 橢圓曲線上的離散對數問題
- [ECDSA](/fundamentals/cryptography/ecdsa/) - 基於 secp256k1 的數位簽章演算法
- [Schnorr Signatures](/bitcoin/cryptography/schnorr-signatures/) - 使用 x-only 公鑰的 BIP-340 簽名方案
- [Taproot Key Tweaking](/bitcoin/cryptography/taproot-key-tweaking/) - x-only 公鑰在 Taproot 中的 tweaking 機制
- [Bitcoin 雜湊函數](/bitcoin/cryptography/hash-functions-in-bitcoin/) - HASH-160 和其他 Bitcoin 雜湊函數
- [P2PKH](/bitcoin/transactions/p2pkh/) - 使用 HASH-160 地址的傳統交易格式
- [P2TR](/bitcoin/transactions/p2tr/) - 使用 x-only 公鑰的 Taproot 交易格式
- [Serialization Formats](/bitcoin/data-structures/serialization-formats/) - Base58Check 和 Bech32 編碼
- [Ethereum secp256k1](/ethereum/cryptography/secp256k1/) - Ethereum 對同一曲線的不同使用方式
- [Address Derivation (ETH)](/ethereum/accounts/address-derivation/) - Ethereum 的 Keccak-256 地址推導對照
