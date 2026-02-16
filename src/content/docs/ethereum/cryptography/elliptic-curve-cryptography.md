---
title: "橢圓曲線密碼學"
description: "ECC, Elliptic Curve Cryptography, 橢圓曲線"
tags: [ethereum, cryptography, elliptic-curve, ECC]
---

# 橢圓曲線密碼學

## 概述

橢圓曲線密碼學（Elliptic Curve Cryptography, ECC）是 Ethereum 簽名系統的數學基礎。相較於 RSA，ECC 用更短的金鑰達到同等安全強度（256-bit ECC 約等於 3072-bit RSA）。Ethereum 執行層使用 [secp256k1](/ethereum/cryptography/secp256k1/) 曲線搭配 [ECDSA](/ethereum/cryptography/ecdsa/) 簽名，共識層使用 [BLS12-381](/ethereum/cryptography/bls12-381/) 曲線搭配 [BLS Signatures](/ethereum/cryptography/bls-signatures/)。

## 核心原理

### 橢圓曲線的定義

在實數域上，橢圓曲線是滿足 Weierstrass 方程的點集合：

$$y^2 = x^3 + ax + b$$

加上一個無窮遠點 $\mathcal{O}$（作為群的單位元素）。

曲線必須是非奇異的（non-singular），即判別式 $\Delta = -16(4a^3 + 27b^2) \neq 0$。

### 有限域上的橢圓曲線

密碼學使用的是定義在有限域 $\mathbb{F}_p$ 上的橢圓曲線（$p$ 為大質數）：

$$E(\mathbb{F}_p) = \{(x, y) \in \mathbb{F}_p \times \mathbb{F}_p \mid y^2 \equiv x^3 + ax + b \pmod{p}\} \cup \{\mathcal{O}\}$$

這個點集合形成一個有限阿貝爾群（Abelian group）。

### 點加法（Point Addition）

給定曲線上兩個不同的點 $P = (x_1, y_1)$ 和 $Q = (x_2, y_2)$，其和 $R = P + Q = (x_3, y_3)$：

**Case 1：$P \neq Q$（一般加法）**

$$\lambda = \frac{y_2 - y_1}{x_2 - x_1} \pmod{p}$$

$$x_3 = \lambda^2 - x_1 - x_2 \pmod{p}$$

$$y_3 = \lambda(x_1 - x_3) - y_1 \pmod{p}$$

幾何直覺：過 $P, Q$ 的直線交曲線於第三點，再對 x 軸做鏡像。

**Case 2：$P = Q$（點倍乘 / Point Doubling）**

$$\lambda = \frac{3x_1^2 + a}{2y_1} \pmod{p}$$

$$x_3 = \lambda^2 - 2x_1 \pmod{p}$$

$$y_3 = \lambda(x_1 - x_3) - y_1 \pmod{p}$$

**Case 3：逆元**

$$P + (-P) = \mathcal{O}$$

其中 $-P = (x, -y \bmod p)$。

### 純量乘法（Scalar Multiplication）

$$kP = \underbrace{P + P + \cdots + P}_{k \text{ times}}$$

使用 Double-and-Add 演算法，複雜度為 $O(\log k)$：

```
INPUT: k（純量）, P（點）
OUTPUT: Q = kP

Q = O（無窮遠點）
for i from MSB to LSB of k:
    Q = 2Q          （doubling）
    if bit_i == 1:
        Q = Q + P    （addition）
return Q
```

### 離散對數問題（ECDLP）

給定 $P$ 和 $Q = kP$，求 $k$ 是計算上不可行的。

這就是橢圓曲線密碼學的安全基礎：

- **正向**（純量乘法）：已知 $k, P$，計算 $Q = kP$ 很快（$O(\log k)$ 次群運算）
- **反向**（離散對數）：已知 $P, Q$，求 $k$ 極其困難

目前最佳攻擊（Pollard's rho）複雜度為 $O(\sqrt{n})$，其中 $n$ 是群的階。對 256-bit 曲線，這是 $O(2^{128})$。

### 金鑰生成

1. 選擇曲線參數 $(p, a, b, G, n, h)$
   - $G$：基點（generator point）
   - $n$：$G$ 的階（$nG = \mathcal{O}$）
   - $h$：cofactor = $|E(\mathbb{F}_p)| / n$
2. 隨機選取私鑰 $d \in [1, n-1]$（需要 [CSPRNG](/ethereum/cryptography/csprng/)）
3. 計算公鑰 $Q = dG$

### 公鑰表示

橢圓曲線上的點可以有兩種表示：

**未壓縮（Uncompressed）**：`0x04 || x || y`（65 bytes for secp256k1）

**壓縮（Compressed）**：`0x02/0x03 || x`（33 bytes）
- prefix `0x02` 表示 $y$ 是偶數
- prefix `0x03` 表示 $y$ 是奇數
- 從 $x$ 可以解出 $y^2 = x^3 + ax + b$，取正確的根

### 群的結構定理

由 Hasse 定理，曲線上的點數 $N = |E(\mathbb{F}_p)|$ 滿足：

$$|N - (p + 1)| \le 2\sqrt{p}$$

這保證了群的大小與 $p$ 在同一數量級，適合密碼學使用。

## 在 Ethereum 中的應用

### 執行層

- **曲線**：[secp256k1](/ethereum/cryptography/secp256k1/)（$y^2 = x^3 + 7$）
- **簽名**：[ECDSA](/ethereum/cryptography/ecdsa/) 用於交易簽名和驗證
- **密鑰與帳戶**：[密鑰生成與帳戶創建](/ethereum/transaction-lifecycle/key-generation/) 基於 ECC
- **公鑰恢復**：[ECRECOVER](/ethereum/cryptography/ecrecover/) 從簽名反推公鑰
- **Precompile**：`ecrecover`（0x01）、`ecAdd`（0x06）、`ecMul`（0x07）、`ecPairing`（0x08）

### 共識層

- **曲線**：[BLS12-381](/ethereum/cryptography/bls12-381/)（pairing-friendly curve）
- **簽名**：[BLS Signatures](/ethereum/cryptography/bls-signatures/) 用於 [Validators](/ethereum/consensus/validators/) 的 [Attestation](/ethereum/consensus/attestation/)
- **聚合**：BLS 允許將數千個簽名聚合為一個，大幅降低驗證成本

### 進階

- **zkSNARKs**：[zkSNARKs 支援](/ethereum/advanced/zksnarks/) 使用橢圓曲線配對
- **KZG**：[KZG Commitments](/ethereum/advanced/kzg-commitments/) 基於 [BLS12-381](/ethereum/cryptography/bls12-381/) 的配對運算

## 程式碼範例

```python
# 使用有限域上的橢圓曲線運算
# 以 secp256k1 為例的手動實現

# secp256k1 參數
p = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
a = 0
b = 7
Gx = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798
Gy = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8
n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141

def mod_inverse(a: int, m: int) -> int:
    """擴展歐幾里得算法求模逆元"""
    return pow(a, m - 2, m)

def point_add(P: tuple, Q: tuple) -> tuple:
    """橢圓曲線點加法"""
    if P is None:
        return Q
    if Q is None:
        return P

    x1, y1 = P
    x2, y2 = Q

    if x1 == x2 and y1 != y2:
        return None  # P + (-P) = O

    if P == Q:
        # Point doubling
        lam = (3 * x1 * x1 + a) * mod_inverse(2 * y1, p) % p
    else:
        # Point addition
        lam = (y2 - y1) * mod_inverse(x2 - x1, p) % p

    x3 = (lam * lam - x1 - x2) % p
    y3 = (lam * (x1 - x3) - y1) % p
    return (x3, y3)

def scalar_mult(k: int, P: tuple) -> tuple:
    """Double-and-Add 純量乘法"""
    result = None
    addend = P
    while k:
        if k & 1:
            result = point_add(result, addend)
        addend = point_add(addend, addend)
        k >>= 1
    return result

# 驗證生成點 G 在曲線上
G = (Gx, Gy)
assert (Gy * Gy) % p == (Gx ** 3 + 7) % p, "G not on curve"
print("[OK] G is on secp256k1")

# 金鑰生成
import secrets
private_key = secrets.randbelow(n - 1) + 1  # [1, n-1]
public_key = scalar_mult(private_key, G)
print(f"Private key: {hex(private_key)}")
print(f"Public key:  ({hex(public_key[0])}, {hex(public_key[1])})")

# 驗證公鑰在曲線上
x, y = public_key
assert (y * y) % p == (x ** 3 + 7) % p, "Public key not on curve"
print("[OK] Public key is on secp256k1")

# 使用 ecdsa 庫（較快）
from ecdsa import SigningKey, SECP256k1
sk = SigningKey.generate(curve=SECP256k1)
pk = sk.get_verifying_key()
print(f"Public key (lib): {pk.to_string().hex()}")
```

## 相關概念

- [secp256k1](/ethereum/cryptography/secp256k1/) - Ethereum 執行層使用的特定橢圓曲線
- [BLS12-381](/ethereum/cryptography/bls12-381/) - Ethereum 共識層使用的 pairing-friendly 曲線
- [ECDSA](/ethereum/cryptography/ecdsa/) - 基於 ECC 的數位簽章演算法
- [BLS Signatures](/ethereum/cryptography/bls-signatures/) - 基於配對的簽章方案
- [公鑰密碼學](/ethereum/cryptography/public-key-cryptography/) - ECC 是公鑰密碼學的一種實現
- [數位簽章概述](/ethereum/cryptography/digital-signature-overview/) - 簽章的通用概念
- [CSPRNG](/ethereum/cryptography/csprng/) - 私鑰生成需要安全隨機數
- [密鑰生成與帳戶創建](/ethereum/transaction-lifecycle/key-generation/) - ECC 金鑰生成的應用流程
- [地址推導](/ethereum/accounts/address-derivation/) - 從公鑰推導 Ethereum 地址
- [zkSNARKs 支援](/ethereum/advanced/zksnarks/) - 使用橢圓曲線配對的零知識證明
- [KZG Commitments](/ethereum/advanced/kzg-commitments/) - 基於 BLS12-381 配對的多項式承諾
