---
title: "數位簽章概述"
description: "Digital Signature overview - definition, security model, scheme comparison"
tags: [fundamentals, cryptography, digital-signature]
---

# 數位簽章概述

## 概述

數位簽章是一種密碼學原語，提供訊息的身份認證（Authentication）、完整性（Integrity）和不可否認性（Non-repudiation）。它是 [公鑰密碼學](/fundamentals/cryptography/public-key-cryptography/) 的核心應用之一。在區塊鏈系統中，每筆交易都必須包含有效的數位簽章，證明發送者持有對應帳戶的私鑰。

## 核心原理

### 形式定義

一個數位簽章方案由三個演算法組成：

**1. KeyGen（金鑰生成）**

$$(\text{sk}, \text{pk}) \leftarrow \text{KeyGen}(1^\lambda)$$

輸入安全參數 $\lambda$，輸出私鑰 $\text{sk}$ 和公鑰 $\text{pk}$。

**2. Sign（簽名）**

$$\sigma \leftarrow \text{Sign}(\text{sk}, m)$$

使用私鑰對訊息 $m$ 產生簽名 $\sigma$。

**3. Verify（驗證）**

$$\{0, 1\} \leftarrow \text{Verify}(\text{pk}, m, \sigma)$$

使用公鑰驗證簽名，輸出 accept（1）或 reject（0）。

### 安全性質

**正確性（Correctness）：**

$$\text{Verify}(\text{pk}, m, \text{Sign}(\text{sk}, m)) = 1$$

合法簽名一定通過驗證。

**不可偽造性（EUF-CMA, Existential Unforgeability under Chosen Message Attack）：**

即使攻擊者可以取得任意訊息的合法簽名（chosen message oracle），仍無法為一個未曾請求過簽名的訊息偽造有效簽名。

EUF-CMA 是數位簽章安全性的黃金標準。正式定義：

1. 攻擊者取得公鑰 $\text{pk}$
2. 攻擊者可以多次查詢簽名 oracle，取得任意選定訊息的合法簽名
3. 攻擊者嘗試偽造一個新訊息（未曾查詢過）的有效簽名
4. 若任何 PPT（probabilistic polynomial-time）攻擊者成功的機率可忽略，則方案安全

### 簽名流程

通常不直接簽訊息本身，而是簽訊息的 [雜湊值](/fundamentals/cryptography/hash-function-overview/)：

$$\sigma = \text{Sign}(\text{sk}, H(m))$$

原因：
1. 雜湊值長度固定，效率更高
2. 提供 collision resistance 的額外保護
3. 避免 chosen-message attack 中的某些弱點

### 主要簽章方案比較

| 方案 | 基礎 | 簽名大小 | 公鑰大小 | 聚合 | 確定性 | 主要用途 |
|------|------|----------|----------|------|--------|----------|
| RSA | 因式分解 | 256-512 B | 256-512 B | 否 | 是 | TLS, PKI |
| [ECDSA](/fundamentals/cryptography/ecdsa/) | ECDLP | 64 B | 33-65 B | 否 | 否 | Bitcoin, Ethereum 執行層 |
| Schnorr | ECDLP | 64 B | 33 B | 原生多簽 | 是 | Bitcoin (Taproot) |
| [BLS](/fundamentals/cryptography/bls-signatures/) | 配對 | 48-96 B | 48-96 B | 完全聚合 | 是 | Ethereum 共識層, Zcash |
| EdDSA | ECDLP (twisted Edwards) | 64 B | 32 B | 否 | 是 | SSH, Signal, Solana |

### Schnorr 簽名

Schnorr 簽名比 ECDSA 更簡潔且支援原生多簽聚合（MuSig），但因 Claus Schnorr 的專利（2008 年到期）歷史因素，Bitcoin 和 Ethereum 當初選擇了 ECDSA。Bitcoin 後來透過 Taproot（2021）引入 Schnorr 簽名。

### 應用場景

數位簽章在分散式系統中的典型用途：

- **交易授權**：證明資產轉移的合法性
- **區塊提案**：證明區塊生產者的身份
- **共識投票**：驗證者對區塊的投票
- **訊息認證**：鏈下訊息的來源驗證（如 meta-transaction、permit）
- **身份證明**：挑戰-回應協議中的身份驗證

## 程式碼範例

```python
from ecdsa import SigningKey, SECP256k1, BadSignatureError
import hashlib

# === 完整的簽名/驗證流程 ===

# 1. KeyGen
sk = SigningKey.generate(curve=SECP256k1)
pk = sk.get_verifying_key()

# 2. 準備訊息（先雜湊）
message = b"Transfer 1 BTC to Alice"
msg_hash = hashlib.sha256(message).digest()

# 3. Sign
signature = sk.sign_digest(msg_hash)
print(f"Message: {message.decode()}")
print(f"Hash:    0x{msg_hash.hex()}")
print(f"Sig:     0x{signature.hex()}")

# 4. Verify
try:
    pk.verify_digest(signature, msg_hash)
    print("[OK] Signature valid")
except BadSignatureError:
    print("[FAIL] Invalid signature")

# 5. 篡改訊息後驗證失敗
tampered = b"Transfer 100 BTC to Alice"
tampered_hash = hashlib.sha256(tampered).digest()

try:
    pk.verify_digest(signature, tampered_hash)
    print("[FAIL] Should not verify")
except BadSignatureError:
    print("[OK] Tampered message rejected")

# 6. 錯誤公鑰驗證失敗
wrong_sk = SigningKey.generate(curve=SECP256k1)
wrong_pk = wrong_sk.get_verifying_key()

try:
    wrong_pk.verify_digest(signature, msg_hash)
    print("[FAIL] Should not verify")
except BadSignatureError:
    print("[OK] Wrong public key rejected")
```

## 相關概念

- [ECDSA](/fundamentals/cryptography/ecdsa/) - 基於橢圓曲線的簽章演算法
- [BLS Signatures](/fundamentals/cryptography/bls-signatures/) - 支援聚合的配對簽章方案
- [橢圓曲線密碼學](/fundamentals/cryptography/elliptic-curve-cryptography/) - 簽章演算法的數學基礎
- [公鑰密碼學](/fundamentals/cryptography/public-key-cryptography/) - 數位簽章是公鑰密碼學的核心應用
- [雜湊函數概述](/fundamentals/cryptography/hash-function-overview/) - 簽名前先雜湊訊息
- [secp256k1](/fundamentals/cryptography/secp256k1/) - ECDSA 常用的曲線
- [BLS12-381](/fundamentals/cryptography/bls12-381/) - BLS 簽名常用的曲線
- [CSPRNG](/fundamentals/cryptography/csprng/) - 金鑰生成的安全隨機數來源
