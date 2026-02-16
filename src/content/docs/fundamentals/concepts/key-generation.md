---
title: "密鑰生成"
description: "Key generation process from entropy to address, BIP-39 mnemonics, BIP-32 HD derivation"
tags: [fundamentals, key-generation, cryptography, bip-39, bip-32, hd-wallet]
---

# 密鑰生成

## 概述

區塊鏈帳戶的建立是完全離線的密碼學操作。核心流程為：使用 [CSPRNG](/fundamentals/cryptography/csprng/) 產生高品質隨機數作為私鑰，透過[橢圓曲線密碼學](/fundamentals/cryptography/elliptic-curve-cryptography/)推導公鑰，再經雜湊函數計算地址。帳戶不需要鏈上註冊，任何人都能獨立產生。

## 核心原理

### 通用流程

所有主流區塊鏈的密鑰生成遵循相同的模式：

```
Entropy Source → 私鑰 → 橢圓曲線乘法 → 公鑰 → 雜湊函數 → 地址
```

每個步驟的細節因鏈而異（使用的曲線、雜湊函數、地址格式），但模式是通用的。

### 私鑰生成

私鑰 $k$ 是一個大整數，必須滿足：

$$1 \leq k < n$$

其中 $n$ 是所選橢圓曲線的階（order）。私鑰必須由 [CSPRNG](/fundamentals/cryptography/csprng/) 產生——使用 `Math.random()` 或其他弱隨機源將導致私鑰可預測。

#### Entropy 來源

安全的 entropy 來源包括：

- 作業系統的密碼學隨機數產生器（`/dev/urandom`、`CryptGenRandom`）
- 硬體隨機數產生器（HRNG）
- 硬體錢包的安全晶片

不安全的 entropy 來源：
- 程式語言的通用隨機函數（如 JavaScript 的 `Math.random()`）
- 可預測的 seed（時間戳、PID 等）
- Brain wallet（用密碼雜湊當私鑰）——已被證明不安全

### 公鑰推導

公鑰 $K$ 透過[橢圓曲線](/fundamentals/cryptography/elliptic-curve-cryptography/)標量乘法計算：

$$K = k \cdot G$$

其中 $G$ 是曲線的生成點（generator point）。這是一個單向函數——從公鑰無法反推私鑰。

公鑰有兩種格式：
- **非壓縮**：包含完整的 $(x, y)$ 座標
- **壓縮**：只保留 $x$ 座標和 $y$ 的奇偶性，體積約為非壓縮的一半

### 地址推導

地址通常是公鑰經一次或多次[雜湊](/fundamentals/cryptography/hash-function-overview/)後截取的結果：

| 區塊鏈 | 曲線 | 雜湊 | 地址長度 |
|---------|------|------|----------|
| Bitcoin | secp256k1 | SHA-256 + RIPEMD-160 | 20 bytes |
| Ethereum | secp256k1 | Keccak-256（取後 20 bytes） | 20 bytes |
| Solana | Ed25519 | 直接使用公鑰 | 32 bytes |

從地址無法反推公鑰（雜湊的單向性），這提供了額外的安全層。

### BIP-39 助記詞

BIP-39 定義了一種用人類可讀的單字序列表示 entropy 的標準：

1. 產生 128-256 bits 的 entropy
2. 計算 checksum（SHA-256 的前幾 bits）
3. 將 entropy + checksum 分割為 11-bit 組
4. 每組對應 BIP-39 字典中的一個單字

```
128 bits entropy → 12 個單字
256 bits entropy → 24 個單字
```

助記詞透過 PBKDF2（2048 輪 HMAC-SHA512）轉換為 512-bit seed，作為 HD 錢包的根。

### BIP-32 HD 錢包（Hierarchical Deterministic）

BIP-32 定義了從單一 seed 推導出樹狀結構密鑰對的方法：

```
Seed (512 bits)
  → HMAC-SHA512
  → Master Private Key + Chain Code
    → Child Key 0
      → Grandchild Key 0
      → Grandchild Key 1
    → Child Key 1
      → ...
```

優點：
- 只需備份一個 seed（或助記詞），即可恢復所有密鑰
- 可以建立無限數量的地址
- 支援 hardened derivation 防止子鑰洩露影響父鑰

### BIP-44 多鏈路徑

BIP-44 在 BIP-32 的基礎上定義了標準路徑結構：

```
m / purpose' / coin_type' / account' / change / address_index
```

| 區塊鏈 | coin_type | 範例路徑 |
|---------|-----------|----------|
| Bitcoin | 0 | m/44'/0'/0'/0/0 |
| Ethereum | 60 | m/44'/60'/0'/0/0 |
| Solana | 501 | m/44'/501'/0'/0' |

### Key Stretching

對於較低 entropy 的輸入（如密碼），key stretching 演算法透過大量迭代增加暴力破解的成本：

- **PBKDF2**：BIP-39 使用 2048 輪 HMAC-SHA512
- **scrypt**：記憶體密集型，增加 ASIC 攻擊成本
- **Argon2**：現代推薦的 password hashing 演算法

## 安全注意事項

- 私鑰一旦洩露，帳戶資產無法挽回。沒有「重設密碼」機制
- 私鑰的 entropy 需要完整的 256 bits
- 硬體錢包讓私鑰永遠不離開安全晶片，是目前最佳實踐
- 助記詞的保管與私鑰同等重要

## 相關概念

- [CSPRNG](/fundamentals/cryptography/csprng/) - 私鑰的隨機數來源
- [橢圓曲線密碼學](/fundamentals/cryptography/elliptic-curve-cryptography/) - 公鑰推導的數學基礎
- [公鑰密碼學](/fundamentals/cryptography/public-key-cryptography/) - 非對稱加密通用概念
- [雜湊函數概述](/fundamentals/cryptography/hash-function-overview/) - 地址推導使用的雜湊函數
- [交易簽名](/fundamentals/concepts/transaction-signing/) - 密鑰生成後的下一步：用私鑰簽署交易
