---
title: "交易簽名"
description: "Hash-then-sign pattern, signature verification in distributed systems, replay protection"
tags: [fundamentals, transaction-signing, digital-signature, authentication, integrity]
---

# 交易簽名

## 概述

交易簽名是區塊鏈中驗證交易真實性與完整性的核心機制。透過「先雜湊、再簽名」（hash-then-sign）的模式，發送者用私鑰對交易內容的雜湊值進行簽章，任何人都可以用對應的公鑰驗證簽名，但無法偽造。這使得去中心化網路中的節點能在不信任發送者的情況下確認交易的合法性。

## 核心原理

### Hash-then-Sign 模式

數位簽章不直接對完整訊息簽名，而是先將訊息[雜湊](/fundamentals/cryptography/hash-function-overview/)為固定長度的摘要，再對摘要簽名：

```
原始訊息 → 雜湊函數 → 固定長度摘要 → 簽名演算法(私鑰) → 簽章
```

#### 為什麼簽雜湊而非原始訊息

1. **效率**：簽名演算法（如 ECDSA）操作的是固定大小的數字，對任意長度的訊息直接簽名在數學上不可行或效率極低
2. **安全性**：[雜湊函數](/fundamentals/cryptography/hash-function-overview/)的抗碰撞性確保不同的訊息產生不同的雜湊，簽署雜湊等同於簽署原始訊息
3. **一致性**：無論交易多大，簽名過程和結果的大小都是固定的

### 簽名驗證在分散式系統中的角色

在傳統中心化系統中，身份驗證依賴伺服器（密碼、session）。在區塊鏈中：

- **無中心認證機構**：沒有伺服器可以「登入」
- **自我主權身份**：[私鑰](/fundamentals/concepts/key-generation/)就是身份證明
- **公開驗證**：任何節點都可以獨立驗證簽名的有效性
- **不可否認性**：只有持有私鑰的人才能產生有效簽名

### 區塊鏈交易簽名的通用流程

```
1. 構建交易：填入接收者、金額、手續費等欄位
2. 序列化：將交易編碼為標準化的二進位格式
3. 雜湊：計算序列化資料的雜湊值
4. 簽名：用私鑰對雜湊值簽名
5. 附加簽名：將簽名附加到交易中
6. 廣播：將已簽名交易發送到網路
```

### 簽名方案比較

不同區塊鏈使用不同的簽名演算法：

| 區塊鏈 | 簽名演算法 | 曲線 | 簽名大小 |
|---------|-----------|------|----------|
| Bitcoin | ECDSA（+ Schnorr via Taproot） | secp256k1 | 64-72 bytes |
| Ethereum | ECDSA | secp256k1 | 65 bytes (r, s, v) |
| Solana | EdDSA | Ed25519 | 64 bytes |
| Polkadot | Schnorr / EdDSA | Ed25519 / Sr25519 | 64 bytes |

### Replay Protection（重放保護）

簽名本身不能防止重放攻擊——攻擊者可以截獲有效的已簽名交易並重新廣播。重放保護機制包括：

- **[Nonce](/fundamentals/concepts/nonce/)**：sequential nonce 確保每筆交易只能執行一次
- **Chain ID**：在簽名資料中包含鏈 ID，防止跨鏈重放
- **過期機制**：設定交易的有效期限

### 從簽名恢復公鑰

某些簽名方案（如 ECDSA）允許從簽名本身恢復簽名者的公鑰，這讓交易不需要顯式包含「發送者」欄位——驗證者可以從簽名反推出發送者的公鑰和地址。

### Signature Malleability

某些簽名演算法存在 malleability 問題：對於有效簽章 $(r, s)$，可以數學變換出另一個有效簽章 $(r, s')$。這不影響安全性（攻擊者無法偽造新訊息的簽名），但可能影響以簽名雜湊作為交易 ID 的系統。各區塊鏈透過標準化簽名格式來消除此問題。

### 確定性簽名（RFC 6979）

傳統 ECDSA 需要每次簽名產生隨機數 $k$。如果 $k$ 的品質不佳或重複使用，私鑰會洩露。RFC 6979 定義了確定性方法：

$$k = \text{HMAC-DRBG}(\text{privateKey}, \text{messageHash})$$

同一筆交易永遠產生相同簽名，且不洩露私鑰資訊。

## 相關概念

- [密鑰生成](/fundamentals/concepts/key-generation/) - 簽名的前提：產生密鑰對
- [Nonce](/fundamentals/concepts/nonce/) - 搭配簽名實現重放保護
- [橢圓曲線密碼學](/fundamentals/cryptography/elliptic-curve-cryptography/) - ECDSA 簽名的數學基礎
- [公鑰密碼學](/fundamentals/cryptography/public-key-cryptography/) - 數位簽章是公鑰密碼學的核心應用
- [雜湊函數概述](/fundamentals/cryptography/hash-function-overview/) - Hash-then-sign 中使用的雜湊函數
- [CSPRNG](/fundamentals/cryptography/csprng/) - 非確定性簽名需要安全的隨機數
