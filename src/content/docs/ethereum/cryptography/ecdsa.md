---
title: "ECDSA"
description: "Elliptic Curve Digital Signature Algorithm"
tags: [ethereum, cryptography, digital-signature, ECDSA]
---

# ECDSA

## 概述

ECDSA（Elliptic Curve Digital Signature Algorithm）是 Ethereum 執行層用於交易簽名的核心演算法。它在 [secp256k1](/ethereum/cryptography/secp256k1/) 曲線上運作，基於 [橢圓曲線密碼學](/ethereum/cryptography/elliptic-curve-cryptography/) 的離散對數難題。每筆 Ethereum 交易都包含一組 $(r, s, v)$ 值，構成 ECDSA 簽名。

## 核心原理

### 參數

- 曲線：[secp256k1](/ethereum/cryptography/secp256k1/)，$y^2 = x^3 + 7 \pmod{p}$
- $G$：生成點
- $n$：群的階（$nG = \mathcal{O}$）
- $d$：私鑰，$d \in [1, n-1]$
- $Q = dG$：公鑰
- $H$：雜湊函數（[Keccak-256](/ethereum/cryptography/keccak-256/)）

### 簽名演算法（Sign）

輸入：私鑰 $d$，訊息 $m$

1. 計算訊息雜湊：$z = H(m)$，取左 $L_n$ 位元（$L_n$ = 群階 $n$ 的位元長度 = 256）
2. 選擇安全隨機數 $k \in [1, n-1]$（**必須用 [CSPRNG](/ethereum/cryptography/csprng/)，且每次簽名的 $k$ 必須不同**）
3. 計算曲線上的點：$(x_1, y_1) = kG$
4. 計算 $r = x_1 \bmod n$。若 $r = 0$，回到步驟 2
5. 計算 $s = k^{-1}(z + rd) \bmod n$。若 $s = 0$，回到步驟 2
6. 簽名為 $(r, s)$

**關於 $k$ 的安全性：**

$k$ 的安全性至關重要。若兩次簽名使用相同的 $k$：

$$s_1 = k^{-1}(z_1 + rd) \bmod n$$
$$s_2 = k^{-1}(z_2 + rd) \bmod n$$

攻擊者可以計算：

$$k = \frac{z_1 - z_2}{s_1 - s_2} \bmod n$$

$$d = \frac{s_1 k - z_1}{r} \bmod n$$

私鑰就洩漏了。2010 年 Sony PS3 的 ECDSA 私鑰就是因為重用 $k$ 被破解。

**RFC 6979 確定性 $k$：**

為避免隨機數生成器的風險，RFC 6979 定義了確定性 $k$ 的生成方式：

$$k = \text{HMAC-DRBG}(d, z)$$

同樣的私鑰和訊息永遠產生同樣的 $k$，但不同訊息的 $k$ 不同。

### 驗證演算法（Verify）

輸入：公鑰 $Q$，訊息 $m$，簽名 $(r, s)$

1. 檢查 $r, s \in [1, n-1]$
2. 計算 $z = H(m)$
3. 計算 $u_1 = zs^{-1} \bmod n$
4. 計算 $u_2 = rs^{-1} \bmod n$
5. 計算點 $(x_1, y_1) = u_1 G + u_2 Q$
6. 簽名有效若且唯若 $r \equiv x_1 \pmod{n}$

**正確性證明：**

由 $s = k^{-1}(z + rd) \bmod n$，得 $k = s^{-1}(z + rd) \bmod n$。

因此：

$$kG = s^{-1}(z + rd)G = s^{-1}zG + s^{-1}rdG = u_1 G + u_2 Q$$

所以 $x_1$ 確實等於 $kG$ 的 $x$ 座標，即 $r$。

### Ethereum 的 $(r, s, v)$ 格式

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

### Low-S 正規化

secp256k1 的群具有對稱性：如果 $(r, s)$ 是有效簽名，$(r, n - s)$ 也是。Ethereum 要求 $s \le n/2$（low-S），避免 transaction malleability：

$$\text{if } s > n/2: \quad s \leftarrow n - s, \quad v \leftarrow v \oplus 1$$

### 簽名的資訊量

一個 ECDSA 簽名：
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
from ecdsa import SigningKey, SECP256k1, util
from Crypto.Hash import keccak
import secrets
import struct

# === secp256k1 參數 ===
n = SECP256k1.order

# === 從底層實現 ECDSA 簽名 ===
def ecdsa_sign(private_key_int: int, message_hash: bytes) -> tuple:
    """ECDSA 簽名，返回 (r, s, v)"""
    G = SECP256k1.generator
    z = int.from_bytes(message_hash, 'big')

    while True:
        k = secrets.randbelow(n - 1) + 1

        # kG 的 x 座標
        point = k * G
        r = int(point.x()) % n
        if r == 0:
            continue

        # s = k^{-1} * (z + r*d) mod n
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

# === 從底層實現 ECDSA 驗證 ===
def ecdsa_verify(public_key_point, message_hash: bytes, r: int, s: int) -> bool:
    """ECDSA 驗證"""
    G = SECP256k1.generator
    z = int.from_bytes(message_hash, 'big')

    if not (1 <= r < n and 1 <= s < n):
        return False

    s_inv = pow(s, n - 2, n)
    u1 = (z * s_inv) % n
    u2 = (r * s_inv) % n

    point = u1 * G + u2 * public_key_point
    return r == int(point.x()) % n

# === 完整流程 ===
# 1. 生成金鑰
sk = SigningKey.generate(curve=SECP256k1)
private_key_int = int.from_bytes(sk.to_string(), 'big')
pk = sk.get_verifying_key()
public_key_point = pk.pubkey.point

# 2. 準備 Ethereum 風格的訊息雜湊
message = b"Transfer 1 ETH"
h = keccak.new(digest_bits=256)
h.update(message)
msg_hash = h.digest()

# 3. 簽名
r, s, v = ecdsa_sign(private_key_int, msg_hash)
print(f"r = 0x{r:064x}")
print(f"s = 0x{s:064x}")
print(f"v = {v + 27}")  # Ethereum 格式

# 4. 驗證
is_valid = ecdsa_verify(public_key_point, msg_hash, r, s)
print(f"Valid: {is_valid}")

# 5. 驗證 Low-S
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

# === 演示 k 重用攻擊 ===
def demonstrate_k_reuse_attack():
    """展示 k 重用如何洩漏私鑰"""
    G = SECP256k1.generator
    d = secrets.randbelow(n - 1) + 1  # 私鑰

    # 用相同的 k 簽兩個不同的訊息
    k = secrets.randbelow(n - 1) + 1
    z1 = secrets.randbelow(n)
    z2 = secrets.randbelow(n)

    point = k * G
    r = int(point.x()) % n
    k_inv = pow(k, n - 2, n)
    s1 = (k_inv * (z1 + r * d)) % n
    s2 = (k_inv * (z2 + r * d)) % n

    # 攻擊者知道 (r, s1, z1) 和 (r, s2, z2)
    # 注意到 r 相同 => k 相同
    k_recovered = ((z1 - z2) * pow(s1 - s2, n - 2, n)) % n
    d_recovered = ((s1 * k_recovered - z1) * pow(r, n - 2, n)) % n

    print(f"Original private key:  {hex(d)}")
    print(f"Recovered private key: {hex(d_recovered)}")
    print(f"Keys match: {d == d_recovered}")

demonstrate_k_reuse_attack()
```

## 相關概念

- [橢圓曲線密碼學](/ethereum/cryptography/elliptic-curve-cryptography/) - ECDSA 的數學基礎
- [secp256k1](/ethereum/cryptography/secp256k1/) - ECDSA 使用的曲線
- [ECRECOVER](/ethereum/cryptography/ecrecover/) - 從 ECDSA 簽名恢復公鑰
- [數位簽章概述](/ethereum/cryptography/digital-signature-overview/) - 數位簽章的通用概念
- [BLS Signatures](/ethereum/cryptography/bls-signatures/) - 共識層使用的替代簽章方案
- [公鑰密碼學](/ethereum/cryptography/public-key-cryptography/) - ECDSA 是公鑰密碼學的應用
- [Keccak-256](/ethereum/cryptography/keccak-256/) - 簽名前的訊息雜湊函數
- [CSPRNG](/ethereum/cryptography/csprng/) - 隨機數 $k$ 的生成
- [交易簽名](/ethereum/transaction-lifecycle/transaction-signing/) - ECDSA 在交易中的應用
- [交易構建](/ethereum/transaction-lifecycle/transaction-construction/) - 簽名前的交易序列化
- [EIP-155 重放保護](/ethereum/accounts/eip-155/) - chain ID 編入簽名
- [EOA](/ethereum/accounts/eoa/) - 使用 ECDSA 控制的帳戶
- [Precompiled Contracts](/ethereum/advanced/precompiled-contracts/) - ecrecover precompile（0x01）
