---
title: "ECDSA"
description: "Elliptic Curve Digital Signature Algorithm"
tags: [ethereum, cryptography, digital-signature, ECDSA]
---

# ECDSA

> 本文聚焦 Ethereum 特定的實現細節。通用理論請參見 [ECDSA 原理](/fundamentals/cryptography/ecdsa/)。

## 概述

ECDSA 是 Ethereum 執行層用於交易簽名的核心演算法。它在 [secp256k1](/ethereum/cryptography/secp256k1/) 曲線上運作，使用 [Keccak-256](/ethereum/cryptography/keccak-256/) 作為雜湊函數。每筆 Ethereum 交易都包含一組 $(r, s, v)$ 值，構成 ECDSA 簽名。

## Ethereum 的 $(r, s, v)$ 格式

Ethereum 交易簽名由三個值組成：

- **$r$**（32 bytes）：簽名點 $kG$ 的 $x$ 座標
- **$s$**（32 bytes）：簽名的第二部分
- **$v$**（1 byte）：recovery identifier

**$v$ 的值：**

- 原始 ECDSA：$v \in \{0, 1\}$（$y$ 座標的奇偶性）
- Pre-EIP-155：$v \in \{27, 28\}$（$= 27 + \text{recovery\_id}$）
- [EIP-155 重放保護](/ethereum/accounts/eip-155/)：$v = \text{chain\_id} \times 2 + 35 + \text{recovery\_id}$
  - Ethereum mainnet（chain_id = 1）：$v \in \{37, 38\}$

$v$ 值的存在使得 [ECRECOVER](/ethereum/cryptography/ecrecover/) 成為可能——不需要公鑰就能驗證交易。

## Low-S 正規化

secp256k1 的群具有對稱性：如果 $(r, s)$ 是有效簽名，$(r, n - s)$ 也是。Ethereum 要求 $s \le n/2$（low-S），避免 transaction malleability：

$$\text{if } s > n/2: \quad s \leftarrow n - s, \quad v \leftarrow v \oplus 1$$

## 簽名大小

一個 Ethereum ECDSA 簽名：
- $r$：32 bytes
- $s$：32 bytes
- $v$：1 byte
- 總計：65 bytes

加上 [EIP-155 重放保護](/ethereum/accounts/eip-155/) 後，$v$ 可能用 2 bytes（chain_id 很大時）。

## 在 Ethereum 中的應用

- **[交易簽名](/ethereum/transaction-lifecycle/transaction-signing/)**：所有 [EOA](/ethereum/accounts/eoa/) 發起的交易都需要 ECDSA 簽名
- **[ECRECOVER](/ethereum/cryptography/ecrecover/)**：precompile（0x01）從簽名恢復公鑰/地址
- **[交易構建](/ethereum/transaction-lifecycle/transaction-construction/)**：先 [RLP 編碼](/ethereum/data-structures/rlp-encoding/) 交易欄位，再用 [Keccak-256](/ethereum/cryptography/keccak-256/) 雜湊，最後 ECDSA 簽名
- **[交易廣播與驗證](/ethereum/transaction-lifecycle/broadcast-validation/)**：節點驗證簽名以確認交易合法性
- **[EIP-155 重放保護](/ethereum/accounts/eip-155/)**：chain ID 編入簽名雜湊中
- **EIP-712**：typed structured data signing，改善使用者體驗但底層仍是 ECDSA
- **Meta-transaction**：合約用 `ecrecover` 驗證鏈下 ECDSA 簽名

## 程式碼範例

```python
from ecdsa import SigningKey, SECP256k1
from Crypto.Hash import keccak
import secrets

n = SECP256k1.order
G = SECP256k1.generator

def ecdsa_sign_ethereum(private_key_int: int, message_hash: bytes) -> tuple:
    """Ethereum 風格的 ECDSA 簽名，返回 (r, s, v)"""
    z = int.from_bytes(message_hash, 'big')

    while True:
        k = secrets.randbelow(n - 1) + 1
        point = k * G
        r = int(point.x()) % n
        if r == 0:
            continue

        k_inv = pow(k, n - 2, n)
        s = (k_inv * (z + r * private_key_int)) % n
        if s == 0:
            continue

        # recovery id
        v = 0 if int(point.y()) % 2 == 0 else 1

        # Low-S 正規化
        if s > n // 2:
            s = n - s
            v ^= 1

        return (r, s, v)

# === 完整 Ethereum 簽名流程 ===
sk = SigningKey.generate(curve=SECP256k1)
private_key_int = int.from_bytes(sk.to_string(), 'big')

# Ethereum 使用 Keccak-256
message = b"Transfer 1 ETH"
h = keccak.new(digest_bits=256)
h.update(message)
msg_hash = h.digest()

r, s, v = ecdsa_sign_ethereum(private_key_int, msg_hash)
print(f"r = 0x{r:064x}")
print(f"s = 0x{s:064x}")
print(f"v = {v + 27}")  # Ethereum pre-EIP-155 格式

# 驗證 Low-S
assert s <= n // 2, "s should be in low half"
print(f"Low-S: {s <= n // 2}")

# === Ethereum 交易簽名（使用 eth_account 庫）===
# from eth_account import Account
# account = Account.create()
# signed = account.sign_transaction({
#     'nonce': 0,
#     'gasPrice': 20_000_000_000,
#     'gas': 21000,
#     'to': '0x' + '00' * 20,
#     'value': 10**18,
#     'chainId': 1,
# })
# print(f"r: {hex(signed.r)}")
# print(f"s: {hex(signed.s)}")
# print(f"v: {signed.v}")
```

## 相關概念

- [ECDSA 原理](/fundamentals/cryptography/ecdsa/) - 通用 ECDSA 理論（簽名/驗證數學、正確性證明、k-reuse 攻擊、RFC 6979）
- [secp256k1](/ethereum/cryptography/secp256k1/) - ECDSA 使用的曲線
- [ECRECOVER](/ethereum/cryptography/ecrecover/) - 從 ECDSA 簽名恢復公鑰
- [數位簽章概述](/ethereum/cryptography/digital-signature-overview/) - Ethereum 的雙簽章系統
- [BLS Signatures](/ethereum/cryptography/bls-signatures/) - 共識層使用的替代簽章方案
- [Keccak-256](/ethereum/cryptography/keccak-256/) - 簽名前的訊息雜湊函數
- [交易簽名](/ethereum/transaction-lifecycle/transaction-signing/) - ECDSA 在交易中的應用
- [交易構建](/ethereum/transaction-lifecycle/transaction-construction/) - 簽名前的交易序列化
- [EIP-155 重放保護](/ethereum/accounts/eip-155/) - chain ID 編入簽名
- [EOA](/ethereum/accounts/eoa/) - 使用 ECDSA 控制的帳戶
- [Precompiled Contracts](/ethereum/advanced/precompiled-contracts/) - ecrecover precompile（0x01）
