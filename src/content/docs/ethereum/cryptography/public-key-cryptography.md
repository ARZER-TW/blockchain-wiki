---
title: "公鑰密碼學"
description: "Public Key Cryptography, 非對稱加密, Asymmetric Cryptography"
tags: [ethereum, cryptography, public-key-cryptography]
---

# 公鑰密碼學

## 概述

公鑰密碼學（Public Key Cryptography）是使用一對金鑰（公鑰與私鑰）的密碼學系統。私鑰保密、公鑰公開。在 Ethereum 中，公鑰密碼學有兩個核心用途：[數位簽章](/ethereum/cryptography/digital-signature-overview/)（證明交易發送者身份）和金鑰協商（如 ECIES 加密用於 devp2p 通訊）。所有 [EOA](/ethereum/accounts/eoa/) 帳戶的安全性都建立在公鑰密碼學之上。

## 核心原理

### 與對稱加密的對比

| 性質 | 對稱加密 | 公鑰密碼學 |
|------|---------|-----------|
| 金鑰 | 共享一把 | 公鑰 + 私鑰 |
| 金鑰分發 | 需要安全通道 | 公鑰可公開 |
| 速度 | 快 | 慢 |
| 用途 | 資料加密 | 簽名、金鑰交換 |
| 例子 | AES, ChaCha20 | RSA, ECC |

### 數學基礎：單向函數（One-Way Function）

公鑰密碼學的核心是單向函數——正向計算容易、反向計算困難的函數：

**整數分解（RSA）：**
- 正向：$n = p \times q$（兩個大質數相乘）很快
- 反向：從 $n$ 分解出 $p, q$ 極慢

**離散對數（ECC）：**
- 正向：$Q = dG$（純量乘法）很快
- 反向：從 $Q, G$ 求 $d$（[ECDLP](/ethereum/cryptography/elliptic-curve-cryptography/)）極慢

Ethereum 使用的是橢圓曲線離散對數問題。

### Trapdoor Function

私鑰就是 trapdoor（陷門）。知道陷門可以高效地「反轉」單向函數：

- 知道 $d$（私鑰）：可以對任何訊息產生簽名
- 不知道 $d$：只能驗證簽名，無法偽造

### 金鑰對的生成

在 Ethereum 中（使用 [secp256k1](/ethereum/cryptography/secp256k1/)）：

1. 用 [CSPRNG](/ethereum/cryptography/csprng/) 生成 256-bit 隨機數 $d$，檢查 $1 \le d < n$
2. 計算公鑰 $Q = dG$（橢圓曲線純量乘法）
3. 從公鑰推導地址：`address = keccak256(Q)[12:]`

$$\text{私鑰} \xrightarrow{\text{ECC}} \text{公鑰} \xrightarrow{\text{Keccak-256}} \text{地址}$$

每一步都是單向的——無法從地址反推公鑰，無法從公鑰反推私鑰。

### 公鑰密碼學的三大應用

**1. 數位簽章（Ethereum 核心用途）**

$$\sigma = \text{Sign}(d, H(m))$$
$$\text{Verify}(Q, H(m), \sigma) \rightarrow \{0, 1\}$$

見 [ECDSA](/ethereum/cryptography/ecdsa/) 和 [BLS Signatures](/ethereum/cryptography/bls-signatures/)。

**2. 金鑰交換（ECDH）**

Alice 和 Bob 各有金鑰對 $(d_A, Q_A)$ 和 $(d_B, Q_B)$：

$$\text{shared\_secret} = d_A \cdot Q_B = d_B \cdot Q_A = d_A d_B G$$

Ethereum 的 devp2p（RLPx）協議使用 ECDH 建立加密通道。

**3. 加密（ECIES）**

Ethereum 的 devp2p 使用 ECIES（Elliptic Curve Integrated Encryption Scheme）：

1. 生成臨時金鑰對 $(r, R = rG)$
2. 共享秘密 $S = rQ_{\text{recipient}}$
3. 從 $S$ 推導對稱金鑰
4. 用對稱金鑰加密訊息
5. 發送 $(R, \text{ciphertext}, \text{MAC})$

### 安全強度比較

| 對稱金鑰長度 | RSA 金鑰長度 | ECC 金鑰長度 |
|-------------|-------------|-------------|
| 80 bit | 1024 bit | 160 bit |
| 128 bit | 3072 bit | 256 bit |
| 256 bit | 15360 bit | 512 bit |

ECC 的金鑰遠短於 RSA，這是 Ethereum 選擇 ECC 的原因之一。

### 量子計算威脅

Shor's algorithm 可以在量子電腦上高效解決離散對數問題和整數分解：

- ECDLP：$O(n^3)$ quantum gates（$n$ 是金鑰位元數）
- 意味著 256-bit ECC 可被足夠大的量子電腦破解

Ethereum 的應對：
- 目前量子電腦尚不足以威脅 256-bit ECC
- 地址是公鑰的雜湊，在交易廣播前公鑰不公開，提供一層額外保護
- 長期需要遷移至 post-quantum 密碼學（lattice-based 等）

## 在 Ethereum 中的應用

- **[密鑰生成與帳戶創建](/ethereum/transaction-lifecycle/key-generation/)**：每個 [EOA](/ethereum/accounts/eoa/) 由一對 secp256k1 金鑰定義
- **[交易簽名](/ethereum/transaction-lifecycle/transaction-signing/)**：私鑰簽名、公鑰驗證
- **[ECRECOVER](/ethereum/cryptography/ecrecover/)**：從簽名恢復公鑰
- **[地址推導](/ethereum/accounts/address-derivation/)**：公鑰 -> Keccak-256 -> 地址
- **devp2p 通訊**：ECDH 金鑰交換 + ECIES 加密
- **[Validators](/ethereum/consensus/validators/)**：BLS 金鑰對用於共識層

## 程式碼範例

```python
from ecdsa import SigningKey, SECP256k1, ECDH
from Crypto.Hash import keccak
import secrets

# === 金鑰對生成 ===
private_key = SigningKey.generate(curve=SECP256k1)
public_key = private_key.get_verifying_key()

print("=== Key Generation ===")
print(f"Private key: 0x{private_key.to_string().hex()}")
print(f"Public key:  0x04{public_key.to_string().hex()}")

# 推導地址
h = keccak.new(digest_bits=256)
h.update(public_key.to_string())
address = h.digest()[-20:]
print(f"Address:     0x{address.hex()}")

# === 數位簽章 ===
print("\n=== Digital Signature ===")
message = b"Transfer 1 ETH"
msg_hash = keccak.new(digest_bits=256, data=message).digest()

signature = private_key.sign_digest(msg_hash)
print(f"Signature: 0x{signature.hex()}")

is_valid = public_key.verify_digest(signature, msg_hash)
print(f"Valid: {is_valid}")

# === ECDH 金鑰交換 ===
print("\n=== ECDH Key Exchange ===")
# Alice
alice_sk = SigningKey.generate(curve=SECP256k1)
alice_pk = alice_sk.get_verifying_key()

# Bob
bob_sk = SigningKey.generate(curve=SECP256k1)
bob_pk = bob_sk.get_verifying_key()

# 共享秘密（使用橢圓曲線點乘）
alice_private_int = int.from_bytes(alice_sk.to_string(), 'big')
bob_private_int = int.from_bytes(bob_sk.to_string(), 'big')

# Alice: shared = alice_sk * bob_pk
alice_shared = alice_private_int * bob_pk.pubkey.point
# Bob: shared = bob_sk * alice_pk
bob_shared = bob_private_int * alice_pk.pubkey.point

assert int(alice_shared.x()) == int(bob_shared.x())
print(f"Alice's shared secret x: {hex(int(alice_shared.x()))[:40]}...")
print(f"Bob's shared secret x:   {hex(int(bob_shared.x()))[:40]}...")
print(f"Match: {int(alice_shared.x()) == int(bob_shared.x())}")

# === 私鑰的熵 ===
print("\n=== Key Space ===")
n = SECP256k1.order
print(f"Key space size: 2^{n.bit_length()} (~{n.bit_length()}-bit security)")
print(f"Equivalent AES security: ~{n.bit_length() // 2}-bit")
print(f"Number of possible keys: {n}")
```

## 相關概念

- [橢圓曲線密碼學](/ethereum/cryptography/elliptic-curve-cryptography/) - Ethereum 使用的公鑰密碼學類型
- [secp256k1](/ethereum/cryptography/secp256k1/) - 執行層的橢圓曲線
- [BLS12-381](/ethereum/cryptography/bls12-381/) - 共識層的橢圓曲線
- [數位簽章概述](/ethereum/cryptography/digital-signature-overview/) - 公鑰密碼學的核心應用
- [ECDSA](/ethereum/cryptography/ecdsa/) - 執行層的簽章演算法
- [BLS Signatures](/ethereum/cryptography/bls-signatures/) - 共識層的簽章演算法
- [ECRECOVER](/ethereum/cryptography/ecrecover/) - 從簽名恢復公鑰
- [CSPRNG](/ethereum/cryptography/csprng/) - 私鑰生成需要安全隨機數
- [密鑰生成與帳戶創建](/ethereum/transaction-lifecycle/key-generation/) - 金鑰對的實際生成流程
- [地址推導](/ethereum/accounts/address-derivation/) - 從公鑰到地址
- [EOA](/ethereum/accounts/eoa/) - 由金鑰對控制的帳戶
