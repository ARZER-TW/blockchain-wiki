---
title: "Proof of History (PoH)"
description: "Proof of History, PoH, 歷史證明, SHA-256 hash chain, cryptographic clock, VDF"
tags: [solana, consensus, proof-of-history, sha256, clock, vdf]
---

# Proof of History (PoH)

## 概述

Proof of History（PoH）是 Solana 的核心創新——一條連續的 [SHA-256](/solana/cryptography/sha256-poh/) hash chain，作為去中心化的密碼學時鐘。每個 hash 代表一個「tick」，交易可以被穿插在任意兩個 hash 之間，從而提供全域排序而無需 validator 之間的額外通訊。PoH 讓 [Tower BFT](/solana/consensus/tower-bft/) 能以極低的通訊開銷達成共識，是 Solana 高吞吐量的基礎設施之一。

## 核心原理

### Hash Chain 結構

PoH 是一個 sequential SHA-256 hash chain：

$$h_0 = \text{initial seed}$$
$$h_{n+1} = \text{SHA-256}(h_n)$$

每個 hash 的計算必須依賴前一個 hash 的結果，因此 **無法並行化**——這是刻意設計，保證了時間流逝的不可偽造性。

### 交易的交織

當有交易需要記錄時，將交易資料混入 hash chain：

$$h_{\text{tx}} = \text{SHA-256}(h_n \| \text{tx\_data})$$

這樣交易就被「蓋上時間戳」——它必然發生在 $h_n$ 之後、$h_{\text{tx}}$ 之後的 hash 之前。

```
h_100 -> h_101 -> h_102 -> h_103(tx_A) -> h_104 -> h_105(tx_B) -> ...
                                 |                        |
                            tx_A 在此時刻              tx_B 在此時刻
```

### Tick 和 Slot 時序

| 概念 | 說明 |
|------|------|
| Tick | 一個 SHA-256 hash 計算 |
| Tick rate | 每秒產生的 tick 數量（目標值由硬體決定） |
| Slot | 一段固定數量的 tick，約 400ms |
| Entry | 一組交易 + 對應的 PoH hash |

每個 [Slot](/solana/consensus/clock-and-slots/) 包含固定數量的 tick。Leader 在其分配的 slot 內產生 PoH hash 並交織交易。

### 全域排序無需通訊

傳統 BFT 共識需要 $O(n^2)$ 的訊息交換來就交易順序達成一致。PoH 提供了一個不可偽造的時間軸：

1. Leader 在本地運行 PoH hash chain
2. 將交易穿插在 hash chain 中
3. 廣播 hash chain + 交易
4. 其他 validator 驗證 hash chain 正確性（可並行驗證多段）
5. Hash chain 本身就證明了交易的順序和時間間隔

### PoH Generator

PoH generator 在 validator 內部的單一 CPU 核心上運行：

- **單核心**：hash chain 天然不可並行，必須使用單核心
- **高效能 CPU**：更快的單核心性能 = 更高的 tick rate
- **專用線程**：PoH generator 獨佔一個核心，不與其他任務共享

### 驗證的可並行性

雖然 PoH 的 **生成** 無法並行，但 **驗證** 可以：

- 將 hash chain 切割成多段
- 每段可獨立驗證（只需起始和結束的 hash 值）
- 多核心 / GPU 並行驗證

這讓驗證速度遠快於生成速度，validator 可以快速確認 leader 產生的 PoH 是否正確。

### 與 VDF 的關係

PoH 在概念上類似 **Verifiable Delay Function（VDF）**：

| 特性 | PoH | VDF |
|------|-----|-----|
| 計算 | Sequential SHA-256 | 通常基於 RSA group 或 class group |
| 可驗證性 | 重放 hash chain | 數學證明 |
| 目的 | 時間排序證明 | 證明經過了一定的時間 |
| 效率 | 驗證可並行化 | 驗證通常更快 |

PoH 是一種工程上的實用 VDF，犧牲了密碼學上的嚴格時間下界證明，換取了高效能和簡潔性。

### PoH 在共識中的角色

PoH 不是共識機制本身，而是共識的 **輔助設施**：

1. 提供全域時鐘 -> [Tower BFT](/solana/consensus/tower-bft/) 利用它減少投票輪次
2. 證明 leader 的出塊時間 -> [Leader Schedule](/solana/consensus/leader-schedule/) 的合規驗證
3. 交易排序 -> 減少 validator 之間的分歧

## 程式碼範例

```rust
// PoH hash chain 的概念示範
use solana_sdk::hash::{hash, Hash};

/// 模擬 PoH hash chain 的生成
struct PohRecorder {
    current_hash: Hash,
    tick_count: u64,
}

impl PohRecorder {
    fn new(initial_hash: Hash) -> Self {
        Self {
            current_hash: initial_hash,
            tick_count: 0,
        }
    }

    /// 產生一個 tick（空的 hash 推進）
    fn tick(&mut self) -> Hash {
        self.current_hash = hash(self.current_hash.as_ref());
        self.tick_count += 1;
        self.current_hash
    }

    /// 記錄交易（mixin 交易資料到 hash chain）
    fn record(&mut self, tx_hash: &Hash) -> Hash {
        let mut data = Vec::with_capacity(64);
        data.extend_from_slice(self.current_hash.as_ref());
        data.extend_from_slice(tx_hash.as_ref());
        self.current_hash = hash(&data);
        self.current_hash
    }
}

/// 驗證一段 PoH（可並行）
fn verify_poh_segment(
    start_hash: Hash,
    entries: &[(Option<Hash>, Hash)], // (mixin_data, expected_hash)
) -> bool {
    let mut current = start_hash;
    for (mixin, expected) in entries {
        current = match mixin {
            Some(tx_hash) => {
                let mut data = Vec::with_capacity(64);
                data.extend_from_slice(current.as_ref());
                data.extend_from_slice(tx_hash.as_ref());
                hash(&data)
            }
            None => hash(current.as_ref()),
        };
        if current != *expected {
            return false;
        }
    }
    true
}
```

```typescript
import { Connection } from "@solana/web3.js";

// 查詢 PoH 相關的鏈上資訊
const connection = new Connection("https://api.mainnet-beta.solana.com");

// 取得當前 slot 和 blockhash（PoH 產出）
const slot = await connection.getSlot();
const blockTime = await connection.getBlockTime(slot);
const block = await connection.getBlock(slot, {
  maxSupportedTransactionVersion: 0,
});

if (block) {
  // block.blockhash: 該 slot 的最終 PoH hash
  // block.parentSlot: 父 slot
  // block.blockTime: Unix timestamp（非 PoH 時間，而是驗證者的時鐘估算）
  // block.transactions: 穿插在 PoH 中的交易列表
}

// 取得 epoch 資訊
const epochInfo = await connection.getEpochInfo();
// epochInfo.slotsInEpoch: 每個 epoch 的 slot 數量（432,000）
// epochInfo.absoluteSlot: 自 genesis 以來的總 slot 數
```

## 相關概念

- [SHA-256 in PoH](/solana/cryptography/sha256-poh/) - PoH 使用的雜湊函數
- [Tower BFT](/solana/consensus/tower-bft/) - 利用 PoH 時鐘的共識協議
- [Leader Schedule](/solana/consensus/leader-schedule/) - Leader 在指定 slot 產生 PoH
- [Slots, Blocks, and Epochs](/solana/consensus/clock-and-slots/) - PoH 定義的時間單位
- [Gulf Stream](/solana/consensus/gulf-stream/) - 利用 PoH 時序的交易轉發
- [Turbine](/solana/consensus/turbine/) - PoH 區塊的傳播機制
- [Alpenglow](/solana/consensus/alpenglow/) - 取代 PoH + Tower BFT 的新共識
- [Solana Transaction Lifecycle](/solana/transactions/transaction-lifecycle-solana/) - PoH 交織在交易處理中
- [Hash Function Overview](/fundamentals/cryptography/hash-function-overview/) - 雜湊函數的基礎原理
