---
title: "CSPRNG"
description: "Cryptographically Secure Pseudo-Random Number Generator, 安全隨機數生成器, CSPRNG"
tags: [ethereum, cryptography, random-number, CSPRNG]
---

# CSPRNG

## 概述

CSPRNG（Cryptographically Secure Pseudo-Random Number Generator）是滿足密碼學安全要求的偽隨機數生成器。在 Ethereum 中，CSPRNG 用於生成私鑰、[ECDSA](/ethereum/cryptography/ecdsa/) 簽名的隨機數 $k$、以及任何需要不可預測性的場景。一個弱隨機數生成器可以直接導致私鑰洩漏——歷史上已有大量因此造成的資金損失案例。

## 核心原理

### PRNG vs CSPRNG

普通 PRNG（如 `Math.random()`、Mersenne Twister）追求統計均勻性，但不抵抗密碼學攻擊。CSPRNG 額外要求：

**1. Next-bit Unpredictability**

給定前 $k$ 個輸出位元，預測第 $k+1$ 個位元的機率不顯著大於 $1/2$。

**2. State Compromise Resistance**

即使內部狀態在某一時刻被洩漏，無法回推過去的輸出（forward security），且未來的輸出在 re-seeding 後仍安全。

### 形式定義

CSPRNG 的輸出序列 $\{x_1, x_2, \ldots, x_n\}$ 必須通過 next-bit test：

$$\forall i, \quad |\Pr[D(x_1, \ldots, x_i) = x_{i+1}] - \frac{1}{2}| < \text{negl}(\lambda)$$

其中 $D$ 是任何多項式時間演算法，$\text{negl}(\lambda)$ 是安全參數的 negligible function。

### 熵源（Entropy Sources）

CSPRNG 的安全性最終依賴於高品質的熵輸入：

**硬體熵源：**
- CPU 的 `RDRAND` / `RDSEED` 指令（Intel/AMD）
- 環境噪聲：磁碟 seek time、中斷時間差、滑鼠移動
- 專用硬體隨機數生成器（HRNG）

**作業系統熵池：**

| 介面 | 平台 | 特性 |
|------|------|------|
| `/dev/urandom` | Linux | 非阻塞，kernel CSPRNG，持續 re-seed |
| `/dev/random` | Linux | 早期阻塞直到足夠熵，現代 kernel 行為同 urandom |
| `getrandom()` | Linux 3.17+ | 系統呼叫，啟動初期若熵不足會阻塞 |
| `CryptGenRandom` | Windows | CSPRNG API |
| `SecRandomCopyBytes` | macOS/iOS | Apple 的 CSPRNG |

### Linux 的 CSPRNG 架構

```
硬體噪聲 ──> 熵池（entropy pool）──> ChaCha20-based CSPRNG
                    ^                         |
                    |                         v
              中斷時間差              /dev/urandom 輸出
              磁碟 I/O                getrandom() 輸出
              網路封包
              鍵盤/滑鼠
```

Linux kernel 5.6+ 使用 ChaCha20 作為核心 CSPRNG 算法，取代了舊的 SHA-1 based 設計。

### `/dev/urandom` vs `/dev/random`

長期存在的誤解：「`/dev/random` 比 `/dev/urandom` 更安全」。

事實上，在現代 Linux kernel 中：
- 兩者使用相同的 CSPRNG
- `/dev/random` 的阻塞行為不提供額外安全性
- 唯一的風險是系統啟動初期（boot time），熵池可能未完全初始化
- `getrandom()` 的 `GRND_RANDOM` flag 在熵不足時阻塞，是最佳實踐

對 Ethereum 金鑰生成的建議：用 `getrandom()` 或等效的語言層 API。

### 常見 CSPRNG 算法

**HMAC-DRBG（Deterministic Random Bit Generator）：**

NIST SP 800-90A 定義，基於 HMAC：
1. 內部狀態 $(V, K)$
2. 每次生成：$V = \text{HMAC}_K(V)$，輸出 $V$
3. 定期 re-seed

RFC 6979 使用 HMAC-DRBG 為 [ECDSA](/ethereum/cryptography/ecdsa/) 生成確定性 $k$。

**ChaCha20-based：**

Linux kernel、OpenBSD `arc4random`、Rust `rand::OsRng` 使用。

**CTR-DRBG：**

基於 AES-CTR 模式，NIST 推薦，Intel RDRAND 的底層實現使用此方案。

### 私鑰生成的安全要求

Ethereum 私鑰是 256-bit 整數 $d \in [1, n-1]$，其中 $n$ 是 [secp256k1](/ethereum/cryptography/secp256k1/) 群的階。

安全的生成方式：

```
bytes = CSPRNG(32)                    # 32 bytes = 256 bits
d = int.from_bytes(bytes, 'big')
while d == 0 or d >= n:               # 機率極低，但必須處理
    bytes = CSPRNG(32)
    d = int.from_bytes(bytes, 'big')
```

不安全的生成方式（真實攻擊案例）：
- 使用 `Math.random()` 或 `rand()`
- 使用時間戳作為種子
- 使用低熵的使用者輸入（如 brain wallet 的弱密碼）
- 使用有 bug 的 PRNG（如 Android SecureRandom 的 Java bug，2013 年導致 Bitcoin 被盜）

### ECDSA 隨機數 $k$ 的安全性

[ECDSA](/ethereum/cryptography/ecdsa/) 簽名中的 $k$ 與私鑰安全性等級相同。若 $k$ 有任何可預測性：

- $k$ 重用：直接計算出私鑰（Sony PS3 事件）
- $k$ 的部分 bit 洩漏：lattice attack 可恢復私鑰（已有對 3-bit 洩漏的實際攻擊）
- $k$ 由弱 PRNG 生成：可能被逆向推算

RFC 6979 的確定性 $k$ 是防禦措施：$k = \text{HMAC-DRBG}(\text{private\_key}, \text{message\_hash})$。

## 在 Ethereum 中的應用

- **[密鑰生成與帳戶創建](/ethereum/transaction-lifecycle/key-generation/)**：生成 secp256k1 私鑰需要 CSPRNG
- **[ECDSA](/ethereum/cryptography/ecdsa/) 簽名**：每次簽名需要隨機數 $k$（或確定性 RFC 6979）
- **BLS 金鑰生成**：[Validators](/ethereum/consensus/validators/) 的 [BLS12-381](/ethereum/cryptography/bls12-381/) 私鑰
- **[RANDAO](/ethereum/consensus/randao/)**：與鏈上隨機性相關但不直接使用 CSPRNG——鏈上無可信隨機源，使用 BLS 簽名的確定性作為替代
- **Salt 生成**：CREATE2 的 salt、commitments 的 nonce 等
- **HD Wallet**：BIP-39 助記詞的初始熵需要 CSPRNG

### 鏈上隨機數問題

EVM 中沒有 CSPRNG。`block.prevrandao`（原 `block.difficulty`）提供偽隨機性，但可被 validator 操控。對於需要安全隨機數的合約，應使用 Chainlink VRF 等 oracle 方案。

## 程式碼範例

```python
import os
import secrets
import hashlib
import hmac

# === 正確的 Ethereum 私鑰生成 ===
def generate_eth_private_key() -> bytes:
    """使用 OS CSPRNG 生成 secp256k1 私鑰"""
    n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
    while True:
        key_bytes = secrets.token_bytes(32)
        key_int = int.from_bytes(key_bytes, 'big')
        if 0 < key_int < n:
            return key_bytes

private_key = generate_eth_private_key()
print(f"Private key: 0x{private_key.hex()}")

# === Python secrets 模組（推薦）===
# secrets 使用 os.urandom()，底層是 getrandom() / CryptGenRandom
random_bytes = secrets.token_bytes(32)
random_hex = secrets.token_hex(32)
random_int = secrets.randbelow(2**256)
print(f"Random bytes: {random_bytes.hex()[:32]}...")
print(f"Random int:   {hex(random_int)[:32]}...")

# === os.urandom（也安全）===
urandom_bytes = os.urandom(32)
print(f"os.urandom:   {urandom_bytes.hex()[:32]}...")

# === 不安全的方式（永遠不要用）===
import random
# random.random()       -- Mersenne Twister, NOT cryptographically secure
# random.randint(0, n)  -- same, NOT secure
# hash(str(time.time()))-- extremely low entropy

# === RFC 6979 確定性 k 生成（簡化示意）===
def rfc6979_k(private_key: bytes, message_hash: bytes) -> int:
    """RFC 6979 確定性 k 值生成（簡化版）"""
    n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
    qlen = 256  # bits

    # 初始化
    V = b'\x01' * 32
    K = b'\x00' * 32

    # Step d
    K = hmac.new(K, V + b'\x00' + private_key + message_hash, hashlib.sha256).digest()
    V = hmac.new(K, V, hashlib.sha256).digest()

    # Step f
    K = hmac.new(K, V + b'\x01' + private_key + message_hash, hashlib.sha256).digest()
    V = hmac.new(K, V, hashlib.sha256).digest()

    # Step h
    while True:
        T = b''
        while len(T) * 8 < qlen:
            V = hmac.new(K, V, hashlib.sha256).digest()
            T += V

        k = int.from_bytes(T[:32], 'big')
        if 0 < k < n:
            return k

        K = hmac.new(K, V + b'\x00', hashlib.sha256).digest()
        V = hmac.new(K, V, hashlib.sha256).digest()

# 驗證確定性
k1 = rfc6979_k(private_key, b'\x00' * 32)
k2 = rfc6979_k(private_key, b'\x00' * 32)
assert k1 == k2
print(f"\nRFC 6979 k: {hex(k1)[:32]}...")
print(f"Deterministic: {k1 == k2}")

# 不同訊息產生不同 k
k3 = rfc6979_k(private_key, b'\x01' * 32)
assert k1 != k3
print(f"Different msg -> different k: {k1 != k3}")

# === 熵品質檢查（簡易版）===
def check_entropy(data: bytes) -> float:
    """計算 Shannon entropy（bits per byte）"""
    from collections import Counter
    import math
    counts = Counter(data)
    total = len(data)
    entropy = -sum(
        (count / total) * math.log2(count / total)
        for count in counts.values()
    )
    return entropy

sample = secrets.token_bytes(10000)
ent = check_entropy(sample)
print(f"\nEntropy of 10KB CSPRNG output: {ent:.4f} bits/byte (max: 8.0)")
```

## 相關概念

- [密鑰生成與帳戶創建](/ethereum/transaction-lifecycle/key-generation/) - CSPRNG 生成 Ethereum 私鑰
- [ECDSA](/ethereum/cryptography/ecdsa/) - 簽名隨機數 $k$ 需要 CSPRNG 或 RFC 6979
- [secp256k1](/ethereum/cryptography/secp256k1/) - 私鑰的有效範圍由群的階 $n$ 決定
- [BLS12-381](/ethereum/cryptography/bls12-381/) - BLS 私鑰也需要 CSPRNG
- [橢圓曲線密碼學](/ethereum/cryptography/elliptic-curve-cryptography/) - 私鑰是橢圓曲線群上的純量
- [公鑰密碼學](/ethereum/cryptography/public-key-cryptography/) - 金鑰對生成的基礎
- [RANDAO](/ethereum/consensus/randao/) - 鏈上偽隨機性方案（不使用 CSPRNG）
- [BLS Signatures](/ethereum/cryptography/bls-signatures/) - BLS 是確定性簽名，降低了對 CSPRNG 的依賴
