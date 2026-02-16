---
title: "secp256k1"
description: "secp256k1 elliptic curve - domain parameters, GLV endomorphism, security"
tags: [fundamentals, cryptography, elliptic-curve, secp256k1]
---

# secp256k1

## 概述

secp256k1 是一條用於密碼學的 Koblitz 橢圓曲線。名稱拆解：SEC（Standards for Efficient Cryptography）+ p（prime field）+ 256（位元數）+ k（Koblitz 曲線）+ 1（序號）。它的方程 $y^2 = x^3 + 7$ 異常簡潔，且曲線參數非隨機選擇，降低了後門疑慮。Bitcoin 和 Ethereum 均選擇此曲線作為 [ECDSA](/fundamentals/cryptography/ecdsa/) 的底層曲線。

## 核心原理

### 曲線方程

$$y^2 \equiv x^3 + 7 \pmod{p}$$

這是 [橢圓曲線密碼學](/fundamentals/cryptography/elliptic-curve-cryptography/) 中 Weierstrass 形式 $y^2 = x^3 + ax + b$ 的特例，其中 $a = 0$, $b = 7$。

### 域參數（Domain Parameters）

完整的 secp256k1 參數組 $(p, a, b, G, n, h)$：

**質數域 $p$：**

$$p = 2^{256} - 2^{32} - 2^9 - 2^8 - 2^7 - 2^6 - 2^4 - 1$$

$$= 2^{256} - 2^{32} - 977$$

$$= \texttt{FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F}$$

這個特殊形式使模運算可以高效實現。

**曲線係數：**

$$a = 0, \quad b = 7$$

$a = 0$ 使得 point doubling 公式簡化（沒有 $3x^2 + a$ 中的 $a$ 項），$\lambda = 3x_1^2 / (2y_1)$。

**生成點 $G$（未壓縮）：**

$$G_x = \texttt{79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798}$$
$$G_y = \texttt{483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8}$$

**群的階 $n$：**

$$n = \texttt{FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141}$$

$n$ 是質數，約為 $2^{256}$。這意味著群 $\langle G \rangle$ 的每個非零元素都可以做生成元。

**Cofactor $h$：**

$$h = 1$$

$h = 1$ 表示曲線上所有點都在 $G$ 生成的子群中，即 $|E(\mathbb{F}_p)| = n$。這避免了 small subgroup attack。

### 為什麼選 secp256k1

**安全性考量：**

- $a = 0, b = 7$ 不是隨機選擇，是最小的滿足條件的 Koblitz 曲線參數
- 比 NIST 曲線（如 P-256）更透明——NIST 曲線的種子來源不明，有「nothing up my sleeve」疑慮
- $h = 1$ 消除 small subgroup attack
- 群的階 $n$ 接近 $p$（Hasse bound 的上限附近）

**性能考量：**

- $a = 0$ 加速 point doubling
- $p$ 的特殊形式（接近 $2^{256}$）使模約簡高效
- Endomorphism 加速：secp256k1 具有高效的 GLV endomorphism $\phi(x, y) = (\beta x, y)$，可以將純量乘法加速約 33%

### GLV Endomorphism

secp256k1 存在一個非平凡的 endomorphism：

$$\phi: (x, y) \mapsto (\beta x, y)$$

其中 $\beta$ 是 $\mathbb{F}_p$ 中 $x^2 + x + 1 = 0$ 的根：

$$\beta = \texttt{7AE96A2B657C07106E64479EAC3434E99CF0497512F58995C1396C28719501EE}$$

且 $\phi(P) = \lambda_G \cdot P$，其中 $\lambda_G$ 是 $n$ 的一個立方根 modulo $n$。

這允許將 $kP$ 分解為 $k_1 P + k_2 \phi(P)$，其中 $k_1, k_2$ 各約 128 bit，大幅減少 double-and-add 的迭代次數。

### 安全強度

| 攻擊方法 | 複雜度 |
|----------|--------|
| Brute force | $O(2^{256})$ |
| Baby-step Giant-step | $O(2^{128})$ |
| Pollard's rho | $O(2^{128})$ |
| MOV attack | 不適用（embedding degree 太大） |
| Anomalous attack | 不適用（$n \neq p$） |

等效安全強度：128 bit（與 AES-128 相當）。

### 與其他曲線的比較

| | secp256k1 | secp256r1（P-256） | Curve25519 |
|--|-----------|-------------------|------------|
| 曲線方程 | $y^2 = x^3 + 7$ | $y^2 = x^3 - 3x + b$ | Montgomery 曲線 |
| 標準 | SEC/Certicom | NIST | Bernstein |
| 參數來源 | 透明（Koblitz） | NIST 種子（來源不明） | 透明 |
| 安全等級 | ~128 bit | ~128 bit | ~128 bit |
| 主要用途 | Bitcoin, Ethereum | TLS, WebAuthn, FIDO2 | SSH, Signal, WireGuard |
| 硬體支援 | 有限 | 廣泛（Secure Enclave、TPM） | 中等 |

## 程式碼範例

```python
from ecdsa import SECP256k1, SigningKey
import secrets

# === 曲線參數驗證 ===
curve = SECP256k1.curve
p = curve.p()
a = curve.a()
b = curve.b()
G = SECP256k1.generator
n = SECP256k1.order

print(f"p = {hex(p)}")
print(f"a = {a}")
print(f"b = {b}")
print(f"n = {hex(n)}")
print(f"p == 2^256 - 2^32 - 977: {p == 2**256 - 2**32 - 977}")

# 驗證 G 在曲線上
Gx = int(G.x())
Gy = int(G.y())
assert (Gy * Gy - Gx ** 3 - 7) % p == 0
print("[OK] Generator G is on curve")

# === 金鑰生成 ===
private_key_bytes = secrets.token_bytes(32)
private_key_int = int.from_bytes(private_key_bytes, 'big') % (n - 1) + 1
sk = SigningKey.from_secret_exponent(private_key_int, curve=SECP256k1)

# 計算公鑰
vk = sk.get_verifying_key()
pubkey_bytes = vk.to_string()  # 64 bytes (x || y)
print(f"Private key: 0x{sk.to_string().hex()}")
print(f"Public key:  0x04{pubkey_bytes.hex()}")

# === 驗證 n*G = O（無窮遠點）===
from ecdsa.ellipticcurve import INFINITY
nG = (n - 1) * G + G
assert nG == INFINITY
print("[OK] n * G = O (point at infinity)")

# === 壓縮公鑰 ===
x = int(vk.pubkey.point.x())
y = int(vk.pubkey.point.y())
prefix = b'\x02' if y % 2 == 0 else b'\x03'
compressed = prefix + x.to_bytes(32, 'big')
print(f"Compressed:  {compressed.hex()}")
```

## 相關概念

- [橢圓曲線密碼學](/fundamentals/cryptography/elliptic-curve-cryptography/) - ECC 的通用數學原理
- [ECDSA](/fundamentals/cryptography/ecdsa/) - secp256k1 上的簽名演算法
- [公鑰密碼學](/fundamentals/cryptography/public-key-cryptography/) - 非對稱密碼學的通用概念
- [CSPRNG](/fundamentals/cryptography/csprng/) - 私鑰生成的安全隨機數來源
- [數位簽章概述](/fundamentals/cryptography/digital-signature-overview/) - 數位簽章方案總覽
