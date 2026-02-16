---
title: "ECRECOVER"
description: "ecrecover, 公鑰恢復"
tags: [ethereum, cryptography, ECDSA, ecrecover]
---

# ECRECOVER

## 概述

ECRECOVER 是從 [ECDSA](/ethereum/cryptography/ecdsa/) 簽名中恢復簽名者公鑰的操作。在 Ethereum 中，它是 precompiled contract（地址 0x01），使得交易不需要附帶公鑰——節點從 $(r, s, v)$ 直接恢復出公鑰，再推導出發送者地址。這節省了每筆交易 64 bytes 的空間。

## 核心原理

### 問題定義

已知：
- 訊息雜湊 $z = H(m)$
- 簽名 $(r, s)$
- Recovery ID $v$（0 或 1）

求：公鑰 $Q$

### 恢復演算法

**Step 1：從 $r$ 恢復點 $R$**

$r$ 是某個曲線點 $R = kG$ 的 $x$ 座標。從 $x$ 座標恢復曲線上的點：

$$y^2 = r^3 + 7 \pmod{p}$$

解出 $y$（使用 Tonelli-Shanks 或直接 $y = r^{(p+1)/4} \bmod p$，因為 $p \equiv 3 \pmod{4}$）。

取得兩個候選 $y$ 值（$y$ 和 $p - y$），根據 $v$ 的奇偶性選擇正確的一個：

$$R = \begin{cases} (r, y) & \text{if } v = 0 \text{ and } y \text{ is even} \\ (r, p - y) & \text{if } v = 1 \text{ and } y \text{ is odd} \end{cases}$$

實際上 $v$ 直接指示 $y$ 的奇偶性：$v = 0$ 對應偶數 $y$，$v = 1$ 對應奇數 $y$。

**Step 2：計算公鑰 $Q$**

回顧 ECDSA 簽名公式：

$$s = k^{-1}(z + rd) \bmod n$$

$$sk = z + rd \bmod n$$

$$skG = zG + rdG$$

$$sR = zG + rQ$$

$$Q = r^{-1}(sR - zG) \bmod n$$

即：

$$Q = r^{-1}(sR - zG)$$

展開為橢圓曲線點運算：

$$Q = r^{-1} \cdot s \cdot R + r^{-1} \cdot (-z) \cdot G$$

### 為什麼需要 $v$

一個 $r$ 值最多對應 4 個候選公鑰（2 個 $y$ 值 $\times$ 2 個 $x$ 值——$r$ 和 $r + n$ 都可能是有效的 $x$ 座標）。在 secp256k1 上，因為 $n$ 非常接近 $p$（$p - n \approx 2^{128}$），$r + n > p$ 的機率極高，所以實際上幾乎只有 2 個候選。$v$ 的一個 bit 足以消歧。

Ethereum 的 $v$ 值演變：
- 原始：$v \in \{0, 1\}$
- Yellow Paper：$v \in \{27, 28\}$（加 27 的歷史原因來自 Bitcoin）
- [EIP-155 重放保護](/ethereum/accounts/eip-155/)：$v = 2 \times \text{chain\_id} + 35 + \text{recovery\_id}$

### 安全性分析

ECRECOVER 本身不驗證「簽名者是否是預期的人」，它只是數學上恢復公鑰。安全性依賴於：

1. [ECDSA](/ethereum/cryptography/ecdsa/) 的不可偽造性——不知道私鑰無法產生有效簽名
2. 呼叫者必須自行檢查恢復出的地址是否符合預期
3. 若傳入無效的 $(r, s, v)$，可能恢復出任意地址

### Precompile 規格

地址：`0x0000000000000000000000000000000000000001`

輸入（128 bytes）：

| 偏移 | 長度 | 欄位 |
|------|------|------|
| 0 | 32 | 訊息雜湊 $z$ |
| 32 | 32 | $v$（27 或 28，左填充至 32 bytes） |
| 64 | 32 | $r$（左填充至 32 bytes） |
| 96 | 32 | $s$（左填充至 32 bytes） |

輸出（32 bytes）：恢復出的地址（左填充至 32 bytes），若失敗返回空。

Gas：3000（固定）

## 在 Ethereum 中的應用

### 交易驗證

每筆交易到達節點時：

1. 從交易 payload 提取 $(r, s, v)$
2. 對 [RLP 編碼](/ethereum/data-structures/rlp-encoding/) 的交易欄位做 [Keccak-256](/ethereum/cryptography/keccak-256/) 得到雜湊
3. 呼叫 ECRECOVER 恢復公鑰
4. 對公鑰做 Keccak-256 取後 20 bytes 得到 sender 地址
5. 用 sender 地址查 [State Trie](/ethereum/data-structures/state-trie/) 取得 [Nonce](/ethereum/accounts/nonce/) 和餘額

這就是為什麼交易中沒有 `from` 欄位——它是從簽名推導出來的。

### 合約內簽名驗證

```solidity
// Solidity 中使用 ecrecover
function verify(
    bytes32 hash,
    uint8 v,
    bytes32 r,
    bytes32 s
) public pure returns (address) {
    address signer = ecrecover(hash, v, r, s);
    require(signer != address(0), "Invalid signature");
    return signer;
}

// EIP-712 風格的鏈下簽名驗證
function verifyPermit(
    address owner,
    address spender,
    uint256 value,
    uint256 deadline,
    uint8 v, bytes32 r, bytes32 s
) external {
    bytes32 digest = keccak256(abi.encodePacked(
        "\x19\x01",
        DOMAIN_SEPARATOR,
        keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonces[owner]++, deadline))
    ));
    address recoveredAddress = ecrecover(digest, v, r, s);
    require(recoveredAddress == owner, "Invalid signature");
}
```

### 常見用途

- **Meta-transaction**：gasless 交易，relayer 代付 gas
- **ERC-2612 Permit**：免 approve 的 token 授權
- **EIP-712**：typed structured data 簽名
- **Gnosis Safe**：多簽錢包的簽名驗證

## 程式碼範例

```python
from ecdsa import SECP256k1, VerifyingKey
from ecdsa.ellipticcurve import Point
from Crypto.Hash import keccak
import secrets

# secp256k1 參數
curve = SECP256k1.curve
G = SECP256k1.generator
n = SECP256k1.order
p = curve.p()

def ecrecover(msg_hash: bytes, v: int, r: int, s: int) -> bytes:
    """
    從 ECDSA 簽名恢復公鑰
    返回 uncompressed public key（64 bytes）
    """
    # v 轉換為 recovery_id
    if v >= 27:
        v -= 27
    assert v in (0, 1), f"Invalid v: {v}"

    # Step 1: 從 r 恢復點 R
    # 計算 y^2 = x^3 + 7 mod p
    x = r
    y_squared = (pow(x, 3, p) + 7) % p

    # 求平方根（p ≡ 3 mod 4，所以 y = y_squared^((p+1)/4) mod p）
    y = pow(y_squared, (p + 1) // 4, p)
    assert (y * y) % p == y_squared, "x is not on curve"

    # 根據 v 選擇 y 的奇偶性
    if y % 2 != v:
        y = p - y

    R = Point(curve, x, y)

    # Step 2: Q = r^{-1} * (s*R - z*G)
    z = int.from_bytes(msg_hash, 'big')
    r_inv = pow(r, n - 2, n)

    # u1 = -z * r^{-1} mod n
    u1 = (-z * r_inv) % n
    # u2 = s * r^{-1} mod n
    u2 = (s * r_inv) % n

    # Q = u1*G + u2*R
    Q = u1 * G + u2 * R

    # 輸出 64 bytes 公鑰
    x_bytes = int(Q.x()).to_bytes(32, 'big')
    y_bytes = int(Q.y()).to_bytes(32, 'big')
    return x_bytes + y_bytes

def pubkey_to_address(pubkey: bytes) -> str:
    """從公鑰推導 Ethereum 地址"""
    h = keccak.new(digest_bits=256)
    h.update(pubkey)
    return '0x' + h.digest()[-20:].hex()

# === 完整示範 ===
from ecdsa import SigningKey

# 生成金鑰
sk = SigningKey.generate(curve=SECP256k1)
pk = sk.get_verifying_key()
pubkey_bytes = pk.to_string()  # 64 bytes

# 計算地址
original_address = pubkey_to_address(pubkey_bytes)
print(f"Original address: {original_address}")

# 簽名
message = b"hello ethereum"
h = keccak.new(digest_bits=256)
h.update(message)
msg_hash = h.digest()

# 用 ecdsa 庫簽名（需要取得 r, s, v）
private_key_int = int.from_bytes(sk.to_string(), 'big')
k = secrets.randbelow(n - 1) + 1
R_point = k * G
r = int(R_point.x()) % n
k_inv = pow(k, n - 2, n)
z = int.from_bytes(msg_hash, 'big')
s = (k_inv * (z + r * private_key_int)) % n
v = 0 if int(R_point.y()) % 2 == 0 else 1

# Low-S 正規化
if s > n // 2:
    s = n - s
    v ^= 1

print(f"r = 0x{r:064x}")
print(f"s = 0x{s:064x}")
print(f"v = {v + 27}")

# ECRECOVER
recovered_pubkey = ecrecover(msg_hash, v + 27, r, s)
recovered_address = pubkey_to_address(recovered_pubkey)
print(f"Recovered address: {recovered_address}")
print(f"Match: {original_address == recovered_address}")
```

## 相關概念

- [ECDSA](/ethereum/cryptography/ecdsa/) - ECRECOVER 是 ECDSA 驗證的反向操作
- [secp256k1](/ethereum/cryptography/secp256k1/) - ECRECOVER 在此曲線上運算
- [橢圓曲線密碼學](/fundamentals/cryptography/elliptic-curve-cryptography/) - 底層數學原理
- [數位簽章概述](/ethereum/cryptography/digital-signature-overview/) - 數位簽章的通用概念
- [Keccak-256](/ethereum/cryptography/keccak-256/) - 訊息雜湊和地址推導
- [地址推導](/ethereum/accounts/address-derivation/) - 從恢復的公鑰推導地址
- [交易簽名](/ethereum/transaction-lifecycle/transaction-signing/) - ECRECOVER 驗證交易簽名
- [交易廣播與驗證](/ethereum/transaction-lifecycle/broadcast-validation/) - 節點使用 ECRECOVER 確認發送者
- [EIP-155 重放保護](/ethereum/accounts/eip-155/) - 影響 $v$ 值的計算
- [Precompiled Contracts](/ethereum/advanced/precompiled-contracts/) - ECRECOVER 是 precompile 0x01
- [EOA](/ethereum/accounts/eoa/) - ECRECOVER 恢復的是 EOA 的地址
