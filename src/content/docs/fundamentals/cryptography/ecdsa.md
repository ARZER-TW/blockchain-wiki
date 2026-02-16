---
title: "ECDSA"
description: "Elliptic Curve Digital Signature Algorithm - chain-agnostic theory"
tags: [fundamentals, cryptography, digital-signature, ECDSA]
---

# ECDSA

## 概述

ECDSA（Elliptic Curve Digital Signature Algorithm）是基於 [橢圓曲線密碼學](/fundamentals/cryptography/elliptic-curve-cryptography/) 離散對數難題的 [數位簽章](/fundamentals/cryptography/digital-signature-overview/) 演算法。它是 DSA（Digital Signature Algorithm）的橢圓曲線版本，由 Scott Vanstone 於 1992 年提出，後納入 ANSI X9.62、FIPS 186-4 等標準。Bitcoin、Ethereum 的交易簽名均使用 ECDSA（搭配 [secp256k1](/fundamentals/cryptography/secp256k1/) 曲線）。

## 核心原理

### 參數

- 曲線 $E$：一條橢圓曲線（如 [secp256k1](/fundamentals/cryptography/secp256k1/)、P-256 等）
- $G$：生成點
- $n$：群的階（$nG = \mathcal{O}$）
- $d$：私鑰，$d \in [1, n-1]$
- $Q = dG$：公鑰
- $H$：密碼學雜湊函數（如 SHA-256、Keccak-256 等）

### 簽名演算法（Sign）

輸入：私鑰 $d$，訊息 $m$

1. 計算訊息雜湊：$z = H(m)$，取左 $L_n$ 位元（$L_n$ = 群階 $n$ 的位元長度）
2. 選擇安全隨機數 $k \in [1, n-1]$（**必須用 [CSPRNG](/fundamentals/cryptography/csprng/)，且每次簽名的 $k$ 必須不同**）
3. 計算曲線上的點：$(x_1, y_1) = kG$
4. 計算 $r = x_1 \bmod n$。若 $r = 0$，回到步驟 2
5. 計算 $s = k^{-1}(z + rd) \bmod n$。若 $s = 0$，回到步驟 2
6. 簽名為 $(r, s)$

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

### $k$ 重用攻擊

$k$ 的安全性至關重要。若兩次簽名使用相同的 $k$：

$$s_1 = k^{-1}(z_1 + rd) \bmod n$$
$$s_2 = k^{-1}(z_2 + rd) \bmod n$$

攻擊者可以計算：

$$k = \frac{z_1 - z_2}{s_1 - s_2} \bmod n$$

$$d = \frac{s_1 k - z_1}{r} \bmod n$$

私鑰就洩漏了。2010 年 Sony PS3 的 ECDSA 私鑰就是因為重用 $k$ 被破解。

### RFC 6979 確定性 $k$

為避免隨機數生成器的風險，RFC 6979 定義了確定性 $k$ 的生成方式：

$$k = \text{HMAC-DRBG}(d, z)$$

同樣的私鑰和訊息永遠產生同樣的 $k$，但不同訊息的 $k$ 不同。這消除了對 [CSPRNG](/fundamentals/cryptography/csprng/) 品質的依賴，是現代 ECDSA 實作的推薦做法。

### 安全性分析

ECDSA 的安全性依賴於：

- **ECDLP（Elliptic Curve Discrete Logarithm Problem）**：給定 $Q = dG$，計算 $d$ 不可行
- **雜湊函數的抗碰撞性**：不同訊息應產生不同雜湊值

已知攻擊及防護：

| 攻擊 | 原理 | 防護 |
|------|------|------|
| $k$ 重用 | 相同 $k$ 洩漏私鑰 | RFC 6979 確定性 $k$ |
| Biased $k$ | $k$ 的分佈偏差可被利用 | 使用高品質 CSPRNG 或 RFC 6979 |
| Fault attack | 計算錯誤洩漏資訊 | 簽名後驗證 |
| Side-channel | 時序/功耗分析 | 常數時間實作 |

### Low-S 正規化

橢圓曲線群具有對稱性：如果 $(r, s)$ 是有效簽名，$(r, n - s)$ 也是。這導致 transaction malleability（同一交易可以有兩個不同但都有效的簽名表示）。解決方案是要求 $s \le n/2$（low-S）：

$$\text{if } s > n/2: \quad s \leftarrow n - s$$

Bitcoin（BIP-62）和 Ethereum 都採用了此正規化。

### 簽名大小

一個標準 ECDSA 簽名（256-bit 曲線）：
- $r$：32 bytes
- $s$：32 bytes
- 總計：64 bytes（DER 編碼可能略長）

## 程式碼範例

```python
from ecdsa import SigningKey, SECP256k1
import hashlib
import secrets

# === secp256k1 參數 ===
n = SECP256k1.order
G = SECP256k1.generator

# === 從底層實現 ECDSA 簽名 ===
def ecdsa_sign(private_key_int: int, message_hash: bytes) -> tuple:
    """ECDSA 簽名，返回 (r, s)"""
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

        # Low-S 正規化
        if s > n // 2:
            s = n - s

        return (r, s)

# === 從底層實現 ECDSA 驗證 ===
def ecdsa_verify(public_key_point, message_hash: bytes, r: int, s: int) -> bool:
    """ECDSA 驗證"""
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

# 2. 準備訊息雜湊
message = b"Hello, ECDSA!"
msg_hash = hashlib.sha256(message).digest()

# 3. 簽名
r, s = ecdsa_sign(private_key_int, msg_hash)
print(f"r = 0x{r:064x}")
print(f"s = 0x{s:064x}")

# 4. 驗證
is_valid = ecdsa_verify(public_key_point, msg_hash, r, s)
print(f"Valid: {is_valid}")

# 5. 驗證 Low-S
assert s <= n // 2, "s should be in low half"

# === 演示 k 重用攻擊 ===
def demonstrate_k_reuse_attack():
    """展示 k 重用如何洩漏私鑰"""
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

- [橢圓曲線密碼學](/fundamentals/cryptography/elliptic-curve-cryptography/) - ECDSA 的數學基礎
- [secp256k1](/fundamentals/cryptography/secp256k1/) - Bitcoin/Ethereum 使用的曲線
- [數位簽章概述](/fundamentals/cryptography/digital-signature-overview/) - 數位簽章的通用概念
- [公鑰密碼學](/fundamentals/cryptography/public-key-cryptography/) - ECDSA 是公鑰密碼學的應用
- [CSPRNG](/fundamentals/cryptography/csprng/) - 隨機數 $k$ 的生成
- [雜湊函數概述](/fundamentals/cryptography/hash-function-overview/) - 簽名前的訊息雜湊
