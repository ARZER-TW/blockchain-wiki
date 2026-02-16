---
title: "Nonce"
description: "Nonce concept in cryptography and blockchain, replay protection, transaction ordering"
tags: [fundamentals, nonce, replay-protection, transaction-ordering]
---

# Nonce

## 概述

Nonce（Number used Once）是密碼學與區塊鏈中廣泛使用的概念。在密碼學中，nonce 是一個僅使用一次的隨機或唯一值，用於防止重放攻擊和確保訊息的新鮮性。在區塊鏈中，nonce 扮演交易排序與重放保護的核心角色，確保每筆交易只能被執行一次。

## 核心原理

### 密碼學中的 Nonce

在密碼學協定中，nonce 的用途包括：

- **防重放**：確保每個訊息/交易是唯一的，攻擊者無法重新提交
- **新鮮性保證**：接收方可以驗證訊息是最近產生的
- **確保唯一性**：與其他參數組合產生不可預測的輸出

常見的 nonce 類型：

| 類型 | 機制 | 使用場景 |
|------|------|----------|
| Sequential nonce | 遞增計數器 | 區塊鏈帳戶交易（Ethereum 等） |
| Random nonce | 隨機數 | 加密協定（AES-GCM 的 IV） |
| Timestamp-based | 時間戳 | API 認證、防重放 |
| Hash-based | 雜湊計算 | Proof of Work（Bitcoin mining） |

### Replay Protection（重放保護）

Nonce 防止重放攻擊的核心機制：

#### 同鏈重放
攻擊者截獲已簽名的交易並重新廣播：
- 第一次執行 nonce = 5 -- 成功，帳戶 nonce 變成 6
- 重播同一交易（nonce = 5）-- 失敗，因為帳戶 nonce 已經是 6

#### 跨鏈重放
在 fork 鏈上重播交易——nonce 單獨不足以防止跨鏈重放，需要搭配 chain ID 等機制。

### 區塊鏈中的 Nonce 模型

不同區塊鏈採用不同的 nonce 模型：

#### Account-based 模型（Sequential Nonce）

使用遞增計數器作為 nonce，規則通常為：

1. **初始值**：帳戶建立時 nonce = 0
2. **遞增**：每發送一筆交易，nonce + 1
3. **嚴格順序**：交易的 nonce 必須恰好等於帳戶當前 nonce
4. **不可跳過**：nonce = 5 的交易必須在 nonce = 4 之後執行
5. **不可重複**：同一 nonce 的交易只能成功一次

此模型的優點是簡單直觀，交易有明確的順序；缺點是可能產生 nonce gap 問題——如果中間某筆交易失敗或延遲，後續交易會被阻塞。

#### UTXO 模型

Bitcoin 等 UTXO 模型不使用帳戶 nonce。每筆交易消耗特定的 UTXO（Unspent Transaction Output），天然避免重放——同一 UTXO 只能被花費一次。

### Nonce Gap 問題

在 sequential nonce 模型中，如果交易不按順序到達：

```
帳戶 nonce = 4
發送 tx(nonce=5) -- 進入記憶池，等待
發送 tx(nonce=4) -- 執行成功，nonce 變 5
tx(nonce=5) -- 現在可以執行了
```

如果 nonce = 4 的交易被取消或失敗，nonce = 5 會永遠卡住（stuck transaction）。

### 交易排序與優先順序

Nonce 決定了同一帳戶交易的執行順序。結合手續費機制，可以實現：

- **加速**：同 nonce 提交新交易，更高手續費，相同內容 -- 節點優先處理
- **取消**：同 nonce 提交空交易，更高手續費 -- 用空交易取代原交易

### Proof of Work 中的 Nonce

在 PoW 共識機制中，nonce 有不同含義：礦工不斷調整區塊 header 中的 nonce 值，使區塊雜湊滿足難度目標。這裡的 nonce 不是用於防重放，而是 PoW 計算的搜索空間。

## 相關概念

- [公鑰密碼學](/fundamentals/cryptography/public-key-cryptography/) - Nonce 常與數位簽章搭配使用
- [雜湊函數概述](/fundamentals/cryptography/hash-function-overview/) - PoW nonce 與雜湊計算相關
- [CSPRNG](/fundamentals/cryptography/csprng/) - Random nonce 需要安全的隨機數產生器
- [Merkle Tree](/fundamentals/data-structures/merkle-tree/) - 交易在區塊中的組織結構
