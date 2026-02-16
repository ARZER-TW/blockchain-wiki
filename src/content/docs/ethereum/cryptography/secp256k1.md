---
title: "secp256k1"
description: "secp256k1 curve"
tags: [ethereum, cryptography, elliptic-curve, secp256k1]
---

# secp256k1

> 本文聚焦 Ethereum 特定的實現細節。通用理論請參見 [secp256k1 曲線參數](/fundamentals/cryptography/secp256k1/)。

## 概述

secp256k1 是 Ethereum 執行層使用的橢圓曲線。Ethereum 的帳戶系統、交易簽名和地址推導都建立在此曲線之上。關於曲線方程 $y^2 = x^3 + 7$、域參數、GLV endomorphism 和安全強度的完整說明，請參見 [通用理論](/fundamentals/cryptography/secp256k1/)。

## 在 Ethereum 中的應用

### 帳戶系統

- 每個 [EOA](/ethereum/accounts/eoa/) 的私鑰是 $[1, n-1]$ 的整數，公鑰是 secp256k1 上的點
- [密鑰生成與帳戶創建](/ethereum/transaction-lifecycle/key-generation/) 使用 [CSPRNG](/fundamentals/cryptography/csprng/) 生成 secp256k1 私鑰

### 地址推導

Ethereum 地址從 secp256k1 公鑰推導：

$$\text{address} = \texttt{keccak256}(\text{pubkey\_64bytes})[12:]$$

公鑰取未壓縮格式的 64 bytes（不含 `0x04` 前綴），經 [Keccak-256](/ethereum/cryptography/keccak-256/) 雜湊後取最後 20 bytes。詳見 [地址推導](/ethereum/accounts/address-derivation/)。

### 交易簽名與驗證

- [ECDSA](/ethereum/cryptography/ecdsa/) 在 secp256k1 上簽名和驗證
- [ECRECOVER](/ethereum/cryptography/ecrecover/) precompile（0x01）從簽名恢復公鑰

### EVM Precompiles

- `ecrecover`（0x01）：從 [ECDSA](/ethereum/cryptography/ecdsa/) 簽名恢復公鑰
- 注意：0x06-0x08 的 ecAdd/ecMul/ecPairing 是 BN254 曲線，不是 secp256k1

### secp256r1（P-256）：EIP-7951（Fusaka 2025/12）

Fusaka 升級將引入 secp256r1 簽名驗證的 [Precompiled Contracts](/ethereum/advanced/precompiled-contracts/)（EIP-7951）。secp256r1 與 secp256k1 的比較：

| | secp256k1 | secp256r1（P-256） |
|--|-----------|-------------------|
| 曲線方程 | $y^2 = x^3 + 7$ | $y^2 = x^3 - 3x + b$ |
| 標準 | SEC/Certicom | NIST |
| 參數來源 | 透明（Koblitz） | NIST 種子（來源不明） |
| 安全等級 | ~128 bit | ~128 bit |
| 硬體支援 | 有限 | 廣泛（Secure Enclave、TPM、WebAuthn） |
| Ethereum 用途 | EOA 簽名、交易驗證 | 帳戶抽象、Passkey 錢包 |
| EVM precompile | 0x01（ecrecover） | EIP-7951（Fusaka） |

secp256r1 是 WebAuthn / FIDO2 / Passkey 標準使用的曲線。有了 EIP-7951，智能合約錢包可以直接驗證來自硬體安全金鑰、手機 Secure Enclave、或瀏覽器 Passkey 的簽名，不需要透過 Solidity 實作橢圓曲線運算（gas 成本極高）。

這對帳戶抽象（Account Abstraction）的普及是重要推動力——使用者可以用指紋或 Face ID 直接控制鏈上帳戶，不需要助記詞。

## 程式碼範例

```python
from ecdsa import SECP256k1, SigningKey
from Crypto.Hash import keccak
import secrets

# === Ethereum 地址推導完整流程 ===

# 1. 生成私鑰
n = SECP256k1.order
private_key_bytes = secrets.token_bytes(32)
private_key_int = int.from_bytes(private_key_bytes, 'big') % (n - 1) + 1
sk = SigningKey.from_secret_exponent(private_key_int, curve=SECP256k1)

# 2. 計算公鑰
vk = sk.get_verifying_key()
pubkey_bytes = vk.to_string()  # 64 bytes (x || y)，無 0x04 前綴
print(f"Private key: 0x{sk.to_string().hex()}")
print(f"Public key:  0x04{pubkey_bytes.hex()}")

# 3. 推導 Ethereum 地址
h = keccak.new(digest_bits=256)
h.update(pubkey_bytes)
address = h.digest()[-20:]
print(f"Address:     0x{address.hex()}")

# === 壓縮公鑰 ===
x = int(vk.pubkey.point.x())
y = int(vk.pubkey.point.y())
prefix = b'\x02' if y % 2 == 0 else b'\x03'
compressed = prefix + x.to_bytes(32, 'big')
print(f"Compressed:  {compressed.hex()}")
```

## 相關概念

- [secp256k1 曲線參數](/fundamentals/cryptography/secp256k1/) - 通用理論（域參數、GLV endomorphism、安全強度、曲線比較）
- [橢圓曲線密碼學](/fundamentals/cryptography/elliptic-curve-cryptography/) - ECC 的通用數學原理
- [BLS12-381](/ethereum/cryptography/bls12-381/) - 共識層使用的另一條曲線
- [ECDSA](/ethereum/cryptography/ecdsa/) - secp256k1 上的簽名演算法
- [ECRECOVER](/ethereum/cryptography/ecrecover/) - 從 secp256k1 簽名恢復公鑰
- [密鑰生成與帳戶創建](/ethereum/transaction-lifecycle/key-generation/) - 使用 secp256k1 生成 Ethereum 帳戶
- [地址推導](/ethereum/accounts/address-derivation/) - 從 secp256k1 公鑰推導地址
- [EOA](/ethereum/accounts/eoa/) - 由 secp256k1 金鑰對控制的帳戶
- [CSPRNG](/fundamentals/cryptography/csprng/) - 私鑰生成的安全隨機數來源
- [Precompiled Contracts](/ethereum/advanced/precompiled-contracts/) - ecrecover 等 precompile
