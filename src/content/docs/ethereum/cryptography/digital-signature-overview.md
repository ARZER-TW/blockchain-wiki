---
title: "數位簽章概述"
description: "Digital Signature, 數位簽名, 電子簽章"
tags: [ethereum, cryptography, digital-signature]
---

# 數位簽章概述

## 概述

數位簽章是一種密碼學原語，提供訊息的身份認證（Authentication）、完整性（Integrity）和不可否認性（Non-repudiation）。在 Ethereum 中，每筆交易都必須包含有效的數位簽章，證明發送者持有對應帳戶的私鑰。

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

### 簽名流程

通常不直接簽訊息本身，而是簽訊息的雜湊值：

$$\sigma = \text{Sign}(\text{sk}, H(m))$$

原因：
1. 雜湊值長度固定，效率更高
2. 提供 collision resistance 的額外保護
3. 避免 chosen-message attack 中的某些弱點

### Ethereum 使用的簽章方案

| 層 | 方案 | 曲線 | 特性 |
|----|------|------|------|
| 執行層 | [ECDSA](/ethereum/cryptography/ecdsa/) | [secp256k1](/ethereum/cryptography/secp256k1/) | 公鑰恢復（[ECRECOVER](/ethereum/cryptography/ecrecover/)） |
| 共識層 | [BLS Signatures](/ethereum/cryptography/bls-signatures/) | [BLS12-381](/ethereum/cryptography/bls12-381/) | 聚合簽名 |

### ECDSA vs BLS 比較

| 性質 | [ECDSA](/ethereum/cryptography/ecdsa/) | [BLS Signatures](/ethereum/cryptography/bls-signatures/) |
|------|----------|-------------------|
| 簽名大小 | 65 bytes $(r, s, v)$ | 96 bytes（$G_2$ 點） |
| 公鑰大小 | 64 bytes（未壓縮） | 48 bytes（$G_1$ 點） |
| 驗證速度 | 快 | 慢（需配對運算） |
| 聚合 | 不支援 | 原生支援 |
| 確定性 | 非確定性（需隨機 $k$） | 確定性 |
| 公鑰恢復 | 支援 | 不支援 |

### Schnorr 簽名（補充）

Schnorr 簽名比 ECDSA 更簡潔且支援原生多簽聚合，但因專利限制歷史因素，Bitcoin 和 Ethereum 當初選擇了 ECDSA。Bitcoin 後來透過 Taproot 引入 Schnorr，Ethereum 則在共識層直接跳到 BLS。

## 在 Ethereum 中的應用

- **[交易簽名](/ethereum/transaction-lifecycle/transaction-signing/)**：每筆交易必須包含 ECDSA 簽名 $(r, s, v)$
- **[交易廣播與驗證](/ethereum/transaction-lifecycle/broadcast-validation/)**：節點用 [ECRECOVER](/ethereum/cryptography/ecrecover/) 從簽名恢復發送者公鑰/地址
- **[EIP-155 重放保護](/ethereum/accounts/eip-155/)**：將 chain ID 編入簽名，防止跨鏈重放
- **[Attestation](/ethereum/consensus/attestation/)**：validator 用 BLS 簽署 attestation
- **[Casper FFG](/ethereum/consensus/casper-ffg/)**：finality 投票使用 BLS 簽名
- **合約層**：`ecrecover` precompile 允許合約驗證鏈下簽名（meta-transaction、permit 等）

## 程式碼範例

```python
from ecdsa import SigningKey, SECP256k1, BadSignatureError
from Crypto.Hash import keccak
import secrets

# === 完整的簽名/驗證流程 ===

# 1. KeyGen
sk = SigningKey.generate(curve=SECP256k1)
pk = sk.get_verifying_key()

# 2. 準備訊息（先雜湊）
message = b"Transfer 1 ETH to 0xdead..."
h = keccak.new(digest_bits=256)
h.update(message)
msg_hash = h.digest()

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
tampered = b"Transfer 100 ETH to 0xdead..."
h2 = keccak.new(digest_bits=256)
h2.update(tampered)
tampered_hash = h2.digest()

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

- [ECDSA](/ethereum/cryptography/ecdsa/) - Ethereum 執行層的簽章演算法
- [BLS Signatures](/ethereum/cryptography/bls-signatures/) - Ethereum 共識層的簽章演算法
- [ECRECOVER](/ethereum/cryptography/ecrecover/) - 從 ECDSA 簽名恢復公鑰
- [橢圓曲線密碼學](/ethereum/cryptography/elliptic-curve-cryptography/) - 簽章演算法的數學基礎
- [公鑰密碼學](/ethereum/cryptography/public-key-cryptography/) - 數位簽章是公鑰密碼學的核心應用
- [雜湊函數概述](/ethereum/cryptography/hash-function-overview/) - 簽名前先雜湊訊息
- [交易簽名](/ethereum/transaction-lifecycle/transaction-signing/) - 數位簽章在交易中的應用
- [交易廣播與驗證](/ethereum/transaction-lifecycle/broadcast-validation/) - 簽名驗證是交易驗證的一環
- [EIP-155 重放保護](/ethereum/accounts/eip-155/) - 簽名中加入 chain ID
