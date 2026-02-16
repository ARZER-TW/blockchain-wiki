---
title: "Keccak-256"
description: "Keccak256, Keccak, ETH Hash"
tags: [ethereum, cryptography, hash-function, keccak]
---

# Keccak-256

## 概述

Keccak-256 是 Ethereum 的核心雜湊函數，用於地址推導、交易 ID、狀態樹等幾乎所有鏈上運算。它基於 Sponge Construction，與 NIST 標準化後的 SHA-3 存在填充規則差異——Ethereum 用的是原始 Keccak，不是 SHA-3。

## 核心原理

### Sponge Construction

Keccak 使用 Sponge（海綿）結構，狀態大小為 $b = r + c$，其中：

- $b = 1600$ bit（固定）
- $r$（rate）= 1088 bit — 每輪吸收的輸入量
- $c$（capacity）= 512 bit — 安全性參數，$c = 2n$ 其中 $n = 256$

運作分為兩個階段：

**Absorb 階段：**
1. 將輸入訊息填充（padding）後切分為 $r$-bit 區塊 $P_0, P_1, \ldots, P_{k-1}$
2. 初始化狀態 $S = 0^{1600}$
3. 對每個區塊：$S = f(S \oplus (P_i \| 0^c))$

**Squeeze 階段：**
1. 從狀態 $S$ 的前 $r$ bit 提取輸出
2. 如需更多輸出：$S = f(S)$，再提取
3. 對 Keccak-256，只需提取 256 bit，一次 squeeze 即可

### Keccak-f[1600] 置換函數

核心的 permutation function $f = \text{Keccak-f}[1600]$，作用在 $5 \times 5 \times 64$ 的三維 bit 陣列上，執行 24 輪（rounds），每輪包含 5 個步驟：

$$\text{Round}(A, RC) = \iota \circ \chi \circ \pi \circ \rho \circ \theta(A)$$

| 步驟 | 作用 | 描述 |
|------|------|------|
| $\theta$ | 線性擴散 | 每個 bit XOR 同列及相鄰列的 parity |
| $\rho$ | 位移 | 每個 lane 做不同偏移量的循環位移 |
| $\pi$ | 置換 | 重新排列 lane 的位置 |
| $\chi$ | 非線性 | 唯一的非線性步驟：$a' = a \oplus (\lnot b \land c)$ |
| $\iota$ | 常數加入 | XOR 輪常數 $RC$，打破對稱性 |

### 填充規則（Keccak vs SHA-3 的關鍵差異）

- **Keccak-256**（Ethereum 用）：`pad10*1`，填充為 `M || 0x01 || 0x00...0x00 || 0x80`
- **SHA-3-256**（NIST 標準）：填充為 `M || 0x06 || 0x00...0x00 || 0x80`

差別只在 domain separation byte：`0x01` vs `0x06`。這導致相同輸入產生不同雜湊值。

```
Keccak-256("") = c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
SHA-3-256("")  = a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a
```

### 安全性分析

- Preimage resistance：$O(2^{256})$
- Collision resistance：$O(2^{128})$（由 $c/2 = 256$ 保證）
- 免疫 Length Extension Attack（Sponge 結構的天然優勢）
- 24 輪 permutation 提供充分的擴散和混淆

## 在 Ethereum 中的應用

### EVM 層

- **KECCAK256 opcode**（0x20）：Gas 費用 = $30 + 6 \times \lceil \text{len}/32 \rceil$
- **地址推導**：`address = keccak256(public_key)[12:]`（取後 20 bytes），見 [地址推導](/ethereum/accounts/address-derivation/)
- **Storage slot 計算**：mapping 的 slot = `keccak256(key . slot_number)`
- **CREATE2 地址**：`keccak256(0xff . deployer . salt . keccak256(bytecode))`

### 資料結構

- [Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/)：節點雜湊使用 Keccak-256
- [State Trie](/ethereum/data-structures/state-trie/)、[Storage Trie](/ethereum/data-structures/storage-trie/)、[Transaction Trie](/ethereum/data-structures/transaction-trie/)、[Receipt Trie](/ethereum/data-structures/receipt-trie/)：全部基於 Keccak-256
- [RLP 編碼](/ethereum/data-structures/rlp-encoding/)：編碼後再 Keccak-256 得到雜湊

### Solidity

```solidity
// 函數選擇器
bytes4 selector = bytes4(keccak256("transfer(address,uint256)"));
// = 0xa9059cbb

// Event topic
bytes32 topic = keccak256("Transfer(address,address,uint256)");
```

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

# Ethereum 地址推導（從 uncompressed public key）
# 公鑰是 64 bytes（去掉 0x04 prefix 後）
dummy_pubkey = bytes.fromhex(
    "04"  # uncompressed prefix（推導時去掉）
    "7e5f4552091a69125d5dfcb7b8c2659029395bdf"
    "b7e5f4552091a69125d5dfcb7b8c2659029395bd"
    "f7e5f4552091a69125d5dfcb7b8c265902939500"
    "117e5f4552091a69125d5dfcb7b8c26590293955"
)
# 去掉 0x04 prefix，取 64 bytes
pubkey_bytes = dummy_pubkey[1:]
address = keccak256(pubkey_bytes)[-20:]
print(f"Address: 0x{address.hex()}")

# Solidity function selector
sig = b"transfer(address,uint256)"
selector = keccak256(sig)[:4]
print(f"Function selector: 0x{selector.hex()}")

# 驗證 Keccak-256 != SHA-3-256
import hashlib
sha3_result = hashlib.sha3_256(b"").hexdigest()
keccak_result = keccak256(b"").hex()
print(f"SHA-3-256('') = {sha3_result}")
print(f"Keccak-256('') = {keccak_result}")
print(f"Same? {sha3_result == keccak_result}")  # False
```

## 相關概念

- [雜湊函數概述](/ethereum/cryptography/hash-function-overview/) - 雜湊函數的通用安全性質
- [SHA-256](/ethereum/cryptography/sha-256/) - 另一種雜湊函數，用於 Beacon Chain
- [地址推導](/ethereum/accounts/address-derivation/) - 從公鑰到 Ethereum 地址的流程
- [橢圓曲線密碼學](/ethereum/cryptography/elliptic-curve-cryptography/) - 產生公鑰的基礎
- [Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/) - 以 Keccak-256 為基礎的狀態樹
- [RLP 編碼](/ethereum/data-structures/rlp-encoding/) - 資料序列化後再做 Keccak-256
- [ABI 編碼](/ethereum/data-structures/abi-encoding/) - 函數選擇器的計算依賴 Keccak-256
- [EIP-55 地址校驗](/ethereum/accounts/eip-55/) - 使用 Keccak-256 實現混合大小寫校驗
