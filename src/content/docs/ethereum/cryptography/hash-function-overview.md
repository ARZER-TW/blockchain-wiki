---
title: "雜湊函數概述"
description: "Hash Function, 哈希函數, 雜湊"
tags: [ethereum, cryptography, hash-function]
---

# 雜湊函數概述

## 概述

雜湊函數（Hash Function）是一種將任意長度輸入映射到固定長度輸出的確定性函數。在 Ethereum 中，雜湊函數是地址推導、交易驗證、資料結構（Merkle Tree）、共識機制等幾乎所有環節的基礎元件。

## 核心原理

### 形式定義

雜湊函數 $H$ 定義為：

$$H: \{0, 1\}^* \rightarrow \{0, 1\}^n$$

其中 $n$ 為輸出位元長度（如 256 bit）。

### 安全性質

一個密碼學安全的雜湊函數必須滿足三個性質：

**1. Preimage Resistance（抗原像攻擊）**

給定 $h = H(m)$，找到 $m$ 在計算上不可行。攻擊複雜度應為 $O(2^n)$。

**2. Second Preimage Resistance（抗第二原像攻擊）**

給定 $m_1$，找到 $m_2 \neq m_1$ 使得 $H(m_1) = H(m_2)$ 在計算上不可行。

**3. Collision Resistance（抗碰撞攻擊）**

找到任意一對 $(m_1, m_2)$ 使得 $m_1 \neq m_2$ 且 $H(m_1) = H(m_2)$ 在計算上不可行。由生日攻擊（Birthday Attack），碰撞攻擊的複雜度為 $O(2^{n/2})$。

### Avalanche Effect（雪崩效應）

輸入改變 1 bit，輸出應改變約 50% 的 bit。這保證雜湊值的分佈均勻且不可預測。

### Merkle-Damgard 結構

[SHA-256](/ethereum/cryptography/sha-256/) 採用的經典結構：

1. 將訊息填充至區塊大小的整數倍
2. 設定初始向量 $IV$
3. 逐區塊通過壓縮函數 $f$：$H_i = f(H_{i-1}, M_i)$
4. 最終 $H_n$ 即為雜湊值

此結構存在 Length Extension Attack 弱點，這也是 [Keccak-256](/ethereum/cryptography/keccak-256/) 採用 Sponge Construction 的原因之一。

### Sponge Construction

[Keccak-256](/ethereum/cryptography/keccak-256/) 採用的結構，將狀態分為 rate（$r$）和 capacity（$c$）兩部分，透過 absorb 和 squeeze 兩個階段處理輸入輸出，天然免疫 Length Extension Attack。

## Ethereum 中常用雜湊函數比較

| 性質 | [Keccak-256](/ethereum/cryptography/keccak-256/) | [SHA-256](/ethereum/cryptography/sha-256/) |
|------|------------|---------|
| 輸出長度 | 256 bit | 256 bit |
| 結構 | Sponge | Merkle-Damgard |
| Ethereum 用途 | EVM、地址推導、狀態樹 | 極少（主要在 Bitcoin 相容場景） |
| Gas 成本（precompile） | 30 + 6/word | 60 + 12/word |
| Length Extension Attack | 免疫 | 易受攻擊 |

## 在 Ethereum 中的應用

- **地址推導**：[地址推導](/ethereum/accounts/address-derivation/) 使用 Keccak-256 對公鑰做雜湊，取後 20 bytes
- **交易雜湊**：[交易生命週期](/ethereum/transaction-lifecycle/transaction-lifecycle/) 中，每筆交易的 ID 是其 [RLP 編碼](/ethereum/data-structures/rlp-encoding/) 後的 Keccak-256 雜湊
- **狀態樹**：[Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/) 使用 Keccak-256 作為節點雜湊
- **Solidity 內建**：`keccak256()` 是 EVM 最常用的 opcode 之一
- **共識層**：[Beacon Chain](/ethereum/consensus/beacon-chain/) 使用 SHA-256 進行部分雜湊運算

## 程式碼範例

```python
import hashlib
from Crypto.Hash import keccak

# SHA-256
message = b"ethereum"
sha256_hash = hashlib.sha256(message).hexdigest()
print(f"SHA-256: {sha256_hash}")

# Keccak-256（注意：Python hashlib 的 sha3_256 是 NIST SHA-3，不是 Keccak-256）
keccak_hash = keccak.new(digest_bits=256)
keccak_hash.update(message)
print(f"Keccak-256: {keccak_hash.hexdigest()}")

# 驗證 Avalanche Effect
message2 = b"ethereun"  # 改一個字元
keccak_hash2 = keccak.new(digest_bits=256)
keccak_hash2.update(message2)
print(f"Keccak-256 (modified): {keccak_hash2.hexdigest()}")

# 計算 bit 差異
h1 = int(keccak_hash.hexdigest(), 16)
h2 = int(keccak_hash2.hexdigest(), 16)
diff_bits = bin(h1 ^ h2).count('1')
print(f"Bit difference: {diff_bits}/256 ({diff_bits/256*100:.1f}%)")
```

## 相關概念

- [Keccak-256](/ethereum/cryptography/keccak-256/) - Ethereum 主要使用的雜湊函數
- [SHA-256](/ethereum/cryptography/sha-256/) - Bitcoin 及 Beacon Chain 使用的雜湊函數
- [Merkle Tree](/ethereum/data-structures/merkle-tree/) - 基於雜湊函數的樹狀資料結構
- [Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/) - Ethereum 狀態儲存的核心資料結構
- [地址推導](/ethereum/accounts/address-derivation/) - 使用 Keccak-256 從公鑰推導地址
- [RLP 編碼](/ethereum/data-structures/rlp-encoding/) - 交易雜湊前的序列化格式
- [ECDSA](/ethereum/cryptography/ecdsa/) - 簽名演算法，簽名對象是訊息的雜湊值
