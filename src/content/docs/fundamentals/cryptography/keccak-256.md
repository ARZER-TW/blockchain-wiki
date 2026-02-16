---
title: "Keccak-256 雜湊函數"
description: "Keccak-256 hash function: sponge construction, Keccak-f permutation, SHA-3 vs Keccak difference, security properties"
tags: [fundamentals, cryptography, hash-function, keccak, sponge-construction]
---

# Keccak-256

## 概述

Keccak-256 是 Keccak 雜湊家族的 256-bit 變體，由 Guido Bertoni、Joan Daemen、Michael Peeters 和 Gilles Van Assche 設計。Keccak 在 2012 年贏得 NIST SHA-3 競賽，但 NIST 標準化時修改了填充規則，導致 SHA-3-256 與原始 Keccak-256 產生不同的輸出。多個區塊鏈系統（包括 Ethereum）採用的是原始 Keccak-256，而非 NIST SHA-3。

Keccak-256 基於 Sponge Construction，與 SHA-2 家族的 Merkle-Damgard 結構不同，天然免疫 Length Extension Attack。

## Sponge Construction

Keccak 使用 Sponge（海綿）結構，狀態大小為 $b = r + c$，其中：

- $b = 1600$ bit（固定）
- $r$（rate）= 1088 bit -- 每輪吸收的輸入量
- $c$（capacity）= 512 bit -- 安全性參數，$c = 2n$ 其中 $n = 256$

運作分為兩個階段：

**Absorb 階段：**
1. 將輸入訊息填充（padding）後切分為 $r$-bit 區塊 $P_0, P_1, \ldots, P_{k-1}$
2. 初始化狀態 $S = 0^{1600}$
3. 對每個區塊：$S = f(S \oplus (P_i \| 0^c))$

**Squeeze 階段：**
1. 從狀態 $S$ 的前 $r$ bit 提取輸出
2. 如需更多輸出：$S = f(S)$，再提取
3. 對 Keccak-256，只需提取 256 bit，一次 squeeze 即可

Sponge 結構的優勢在於 capacity $c$ 的部分從不直接暴露，攻擊者必須猜測完整的內部狀態才能偽造。這與 Merkle-Damgard 結構不同，後者的中間 hash 值就是完整狀態，因此容易受到 Length Extension Attack。

## Keccak-f[1600] 置換函數

核心的 permutation function $f = \text{Keccak-f}[1600]$，作用在 $5 \times 5 \times 64$ 的三維 bit 陣列上，執行 24 輪（rounds），每輪包含 5 個步驟：

$$\text{Round}(A, RC) = \iota \circ \chi \circ \pi \circ \rho \circ \theta(A)$$

| 步驟 | 作用 | 描述 |
|------|------|------|
| $\theta$ | 線性擴散 | 每個 bit XOR 同列及相鄰列的 parity |
| $\rho$ | 位移 | 每個 lane 做不同偏移量的循環位移 |
| $\pi$ | 置換 | 重新排列 lane 的位置 |
| $\chi$ | 非線性 | 唯一的非線性步驟：$a' = a \oplus (\lnot b \land c)$ |
| $\iota$ | 常數加入 | XOR 輪常數 $RC$，打破對稱性 |

這五個步驟共同提供了充分的擴散（diffusion）和混淆（confusion），確保即使輸入只有微小變化，輸出也會大幅改變。

## 填充規則：Keccak vs SHA-3

這是 Keccak-256 和 SHA-3-256 的關鍵差異：

- **Keccak-256**（原始版本）：`pad10*1`，填充為 `M || 0x01 || 0x00...0x00 || 0x80`
- **SHA-3-256**（NIST 標準）：填充為 `M || 0x06 || 0x00...0x00 || 0x80`

差別只在 domain separation byte：`0x01` vs `0x06`。這導致相同輸入產生不同雜湊值：

```
Keccak-256("") = c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
SHA-3-256("")  = a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a
```

在使用密碼學庫時務必確認實作的是哪個版本，否則會產生不相容的結果。

## 安全性分析

- **Preimage resistance**：$O(2^{256})$
- **Collision resistance**：$O(2^{128})$（由 $c/2 = 256$ 保證）
- **免疫 Length Extension Attack**：Sponge 結構的天然優勢，capacity 部分不暴露
- 24 輪 permutation 提供充分的擴散和混淆

與 [SHA-256](/fundamentals/cryptography/sha-256/) 的 Merkle-Damgard 結構相比，Sponge 結構在安全性設計上更為保守，不需要額外的包裝（如 HMAC）來防範 Length Extension Attack。

## 程式碼範例

```python
from Crypto.Hash import keccak

def keccak256(data: bytes) -> bytes:
    """計算 Keccak-256 雜湊"""
    h = keccak.new(digest_bits=256)
    h.update(data)
    return h.digest()

# 基本雜湊
msg = b"hello"
print(f"keccak256('hello') = {keccak256(msg).hex()}")

# 驗證 Keccak-256 != SHA-3-256
import hashlib
sha3_result = hashlib.sha3_256(b"").hexdigest()
keccak_result = keccak256(b"").hex()
print(f"SHA-3-256('') = {sha3_result}")
print(f"Keccak-256('') = {keccak_result}")
print(f"Same? {sha3_result == keccak_result}")  # False
```

## 相關概念

- [雜湊函數概述](/fundamentals/cryptography/hash-function-overview/) - 雜湊函數的通用安全性質
- [SHA-256](/fundamentals/cryptography/sha-256/) - 基於 Merkle-Damgard 結構的另一種雜湊函數
- [橢圓曲線密碼學](/fundamentals/cryptography/elliptic-curve-cryptography/) - 公鑰密碼學的基礎
- [Merkle Tree](/fundamentals/data-structures/merkle-tree/) - 雜湊函數在樹狀結構中的應用
