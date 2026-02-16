---
title: "Schnorr Signatures (BIP-340)"
description: "Schnorr signature scheme in Bitcoin: key-prefixed hashing, 64-byte fixed signatures, x-only public keys, linearity for MuSig, batch verification"
tags: [bitcoin, cryptography, schnorr, bip-340, taproot, musig, batch-verification]
---

# Schnorr Signatures (BIP-340)

## 概述

Schnorr 簽名方案是由 Claus-Peter Schnorr 於 1989 年提出的數位簽章演算法，因其數學簡潔性和可證明安全性被視為「最優雅」的簽名方案之一。Bitcoin 在 2021 年的 Taproot 升級（BIP-340/341/342）中正式引入 Schnorr 簽名，取代了 [ECDSA](/fundamentals/cryptography/ecdsa/) 作為 Taproot 交易的簽名演算法。

Schnorr 簽名的核心優勢在於**線性性（linearity）**：多個簽名可以聚合為一個簽名，多個公鑰可以聚合為一個公鑰，這使得 MuSig 等多簽方案在鏈上看起來與單簽完全相同。

## 核心原理

### 簽名方案

給定 [secp256k1](/fundamentals/cryptography/secp256k1/) 曲線參數、生成點 $G$、階 $n$：

**金鑰生成：**
- 私鑰 $d \in [1, n-1]$
- 公鑰 $P = dG$（x-only 表示，隱式偶數 $y$）

**簽名（Sign）：**

1. 選擇隨機 nonce $k$（BIP-340 使用確定性 nonce）
2. 計算 $R = kG$（若 $R$ 的 $y$ 為奇數，令 $k \leftarrow n - k$）
3. 計算挑戰值 $e = H_{\text{BIP340/challenge}}(R_x \| P_x \| m)$
4. 計算 $s = k + e \cdot d \pmod{n}$
5. 簽名為 $(R_x, s)$，共 64 bytes

**驗證（Verify）：**

計算 $e = H_{\text{BIP340/challenge}}(R_x \| P_x \| m)$，然後驗證：

$$s \cdot G = R + e \cdot P$$

**正確性：** $s \cdot G = (k + ed)G = kG + edG = R + eP$

### Key-Prefixed Hashing

BIP-340 在計算挑戰值時將公鑰 $P$ 納入雜湊輸入：

$$e = H(R_x \| P_x \| m)$$

這稱為 key-prefixed hashing，防禦了 related-key attack。若不包含 $P$，攻擊者可能為不同的公鑰偽造簽名（rogue-key attack）。

### Tagged Hash

BIP-340/341 引入了 tagged hash 機制，為不同用途的雜湊提供域分離（domain separation）：

$$\text{TaggedHash}(\text{tag}, \text{data}) = \text{SHA-256}(\text{SHA-256}(\text{tag}) \| \text{SHA-256}(\text{tag}) \| \text{data})$$

簽名使用 `BIP0340/challenge` 作為 tag，nonce 生成使用 `BIP0340/aux` 和 `BIP0340/nonce`。

## 固定 64-byte 簽名格式

Schnorr 簽名有固定大小：

| 欄位 | 大小 | 說明 |
|------|------|------|
| $R_x$ | 32 bytes | Nonce point 的 x 座標 |
| $s$ | 32 bytes | 標量值 |
| **合計** | **64 bytes** | 固定大小 |

ECDSA 使用 DER 編碼，簽名大小在 70-72 bytes 之間變化。固定大小不僅節省空間，也簡化了 fee 估算和交易大小預測。

## X-only 公鑰

BIP-340 規定公鑰僅使用 x 座標（32 bytes），隱式假設 $y$ 為偶數：

- 若公鑰 $P = dG$ 的 $y$ 為奇數，簽名時使用 $n - d$ 作為私鑰
- 驗證時從 x 座標恢復出偶數 $y$ 的點
- 節省了 1 byte 的前綴（相比 compressed 公鑰的 33 bytes）

在 [Taproot Key Tweaking](/bitcoin/cryptography/taproot-key-tweaking/) 中，x-only 公鑰的性質尤為重要，因為 tweaked key 也必須保持偶數 $y$ 的約定。

## 線性性與簽名聚合

Schnorr 簽名最重要的性質是**線性性**：

### 樸素的聚合（不安全，僅為說明）

給定兩個簽名者的公鑰 $P_1, P_2$ 和對應簽名 $(R_1, s_1), (R_2, s_2)$：

$$P_{\text{agg}} = P_1 + P_2$$
$$R_{\text{agg}} = R_1 + R_2$$
$$s_{\text{agg}} = s_1 + s_2$$

在鏈上，$(R_{\text{agg}}, s_{\text{agg}})$ 看起來就是 $P_{\text{agg}}$ 的普通單簽名。但樸素聚合容易受到 rogue-key attack，因此實際應用需要 [MuSig](/bitcoin/advanced/multisig-musig/) 協議。

### MuSig2 概述

MuSig2 是一個兩輪的多簽協議：

1. **金鑰聚合**：$P_{\text{agg}} = \sum a_i P_i$，其中 $a_i$ 是防 rogue-key 的係數
2. **Nonce 交換**（第一輪）：每個簽名者產生兩個 nonce 並廣播
3. **簽名計算**（第二輪）：每個簽名者計算 partial signature

## Batch Verification

Schnorr 簽名支援高效的批次驗證。驗證 $n$ 個簽名時，不需要逐一驗證，可以隨機線性組合：

$$\sum_{i=1}^{n} c_i \cdot s_i \cdot G = \sum_{i=1}^{n} c_i \cdot (R_i + e_i \cdot P_i)$$

其中 $c_i$ 是隨機權重（防止對消攻擊）。批次驗證只需一次 multi-scalar multiplication，效率約為逐一驗證的 $2 \times$ 到 $4 \times$。

## 程式碼範例

### Python

```python
import hashlib
import secrets

# secp256k1 參數（簡化示範）
p = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141

def tagged_hash(tag: str, data: bytes) -> bytes:
    """BIP-340 tagged hash"""
    tag_hash = hashlib.sha256(tag.encode()).digest()
    return hashlib.sha256(tag_hash + tag_hash + data).digest()

def int_from_bytes(b: bytes) -> int:
    return int.from_bytes(b, 'big')

def bytes_from_int(x: int) -> bytes:
    return x.to_bytes(32, 'big')

# 簽名流程概述（需要實際的 secp256k1 點運算庫）
def schnorr_sign_conceptual(private_key: bytes, message: bytes) -> bytes:
    """Schnorr 簽名的概念性流程（BIP-340）"""
    d = int_from_bytes(private_key)

    # 1. 確定性 nonce 生成
    aux_rand = secrets.token_bytes(32)
    t = tagged_hash("BIP0340/aux", aux_rand)
    # XOR with private key for nonce randomization
    rand = bytes(a ^ b for a, b in zip(bytes_from_int(d), t))

    # 2. 概念性：k = tagged_hash("BIP0340/nonce", rand || pubkey_x || message)
    # 3. R = kG，確保 R.y 為偶數
    # 4. e = tagged_hash("BIP0340/challenge", R_x || P_x || message)
    # 5. s = k + e * d mod n
    # 6. return R_x || s (64 bytes)

    # 實際實作需要 secp256k1 點運算
    return b'\x00' * 64  # placeholder

# 使用 bitcoin-utils 庫的實際範例
# pip install bip-utils
from hashlib import sha256

# BIP-340 tagged hash 驗證
challenge_tag = "BIP0340/challenge"
test_data = b"test message"
result = tagged_hash(challenge_tag, test_data)
print(f"Tagged hash (BIP0340/challenge): {result.hex()}")

# 域分離驗證：不同 tag 產生完全不同的結果
aux_result = tagged_hash("BIP0340/aux", test_data)
print(f"Tagged hash (BIP0340/aux):       {aux_result.hex()}")
assert result != aux_result  # 不同 tag => 不同輸出
```

### JavaScript

```javascript
import { schnorr } from '@noble/secp256k1';
import { createHash } from 'crypto';

// BIP-340 Tagged Hash
function taggedHash(tag, data) {
  const tagHash = createHash('sha256').update(tag).digest();
  return createHash('sha256')
    .update(Buffer.concat([tagHash, tagHash, data]))
    .digest();
}

// 使用 @noble/secp256k1 進行 Schnorr 簽名與驗證
async function schnorrDemo() {
  const privKey = schnorr.utils.randomPrivateKey();
  const pubKey = schnorr.getPublicKey(privKey); // 32 bytes x-only

  console.log(`Private key: ${Buffer.from(privKey).toString('hex')}`);
  console.log(`Public key (x-only, ${pubKey.length} bytes): ${Buffer.from(pubKey).toString('hex')}`);

  // 簽名
  const message = new TextEncoder().encode('Hello Schnorr');
  const sig = await schnorr.sign(message, privKey);
  console.log(`Signature (${sig.length} bytes): ${Buffer.from(sig).toString('hex')}`);

  // 驗證
  const isValid = await schnorr.verify(sig, message, pubKey);
  console.log(`Valid: ${isValid}`);

  // ECDSA 簽名大小比較（DER 編碼 ~71 bytes vs Schnorr 64 bytes）
  console.log(`Schnorr signature: fixed 64 bytes`);
  console.log(`ECDSA DER signature: ~70-72 bytes (variable)`);
}

schnorrDemo();
```

## 相關概念

- [ECDSA](/fundamentals/cryptography/ecdsa/) - Schnorr 取代的傳統簽名演算法
- [secp256k1](/fundamentals/cryptography/secp256k1/) - 底層橢圓曲線參數
- [secp256k1 in Bitcoin](/bitcoin/cryptography/secp256k1-in-bitcoin/) - x-only 公鑰編碼的演進
- [Taproot Key Tweaking](/bitcoin/cryptography/taproot-key-tweaking/) - Schnorr 公鑰的 Taproot tweaking 機制
- [P2TR](/bitcoin/transactions/p2tr/) - 使用 Schnorr 簽名的 Taproot 交易輸出
- [MuSig](/bitcoin/advanced/multisig-musig/) - 利用 Schnorr 線性性的多簽聚合協議
- [Sighash Types](/bitcoin/cryptography/sighash-types/) - BIP-341 對 sighash 的改進
- [Digital Signature Overview](/fundamentals/cryptography/digital-signature-overview/) - 數位簽章的通用理論
- [橢圓曲線密碼學](/fundamentals/cryptography/elliptic-curve-cryptography/) - 離散對數問題的數學基礎
- [Bitcoin 雜湊函數](/bitcoin/cryptography/hash-functions-in-bitcoin/) - Tagged hash 在 Bitcoin 雜湊體系中的位置
