---
title: "區塊 Header"
description: "Block Header, 區塊頭, BlockHeader"
tags: [ethereum, block, header, execution-layer]
---

# 區塊 Header

## 概述

區塊 Header 是 Execution Layer 區塊的摘要資訊，包含父區塊 hash、狀態根、交易根、收據根等關鍵欄位。Header 的 [Keccak-256](/ethereum/cryptography/keccak-256/) hash 就是區塊的唯一識別碼。The Merge 後，Header 成為 [區塊結構](/ethereum/consensus/block-structure/) 中 Execution Payload 的核心組成部分。

## 核心原理

### 完整欄位定義

Post-Merge 的區塊 Header 包含以下欄位（按 [RLP 編碼](/ethereum/data-structures/rlp-encoding/) 順序）：

| 欄位 | 類型 | 位元組 | 說明 |
|------|------|--------|------|
| `parentHash` | `Hash` | 32 | 父區塊 header 的 [Keccak-256](/ethereum/cryptography/keccak-256/) hash |
| `ommersHash` | `Hash` | 32 | 固定為空 ommer 列表的 hash（post-merge） |
| `beneficiary` | `Address` | 20 | 出塊獎勵接收地址（fee recipient） |
| `stateRoot` | `Hash` | 32 | [State Trie](/ethereum/data-structures/state-trie/) 的根 hash |
| `transactionsRoot` | `Hash` | 32 | [Transaction Trie](/ethereum/data-structures/transaction-trie/) 的根 hash |
| `receiptsRoot` | `Hash` | 32 | [Receipt Trie](/ethereum/data-structures/receipt-trie/) 的根 hash |
| `logsBloom` | `Bloom` | 256 | [Bloom Filter](/ethereum/data-structures/bloom-filter/)，用於快速查詢 log |
| `difficulty` | `uint256` | 可變 | 固定為 0（post-merge） |
| `number` | `uint64` | 8 | 區塊高度 |
| `gasLimit` | `uint64` | 8 | 區塊 [Gas](/ethereum/accounts/gas/) 上限 |
| `gasUsed` | `uint64` | 8 | 區塊已使用 Gas 總量 |
| `timestamp` | `uint64` | 8 | Unix timestamp |
| `extraData` | `bytes` | 0-32 | 自訂資料（最多 32 bytes） |
| `mixHash` | `Hash` | 32 | post-merge 改為 `prevRandao`（[RANDAO](/ethereum/consensus/randao/) 值） |
| `nonce` | `uint64` | 8 | 固定為 `0x0000000000000000`（post-merge） |
| `baseFeePerGas` | `uint256` | 可變 | [EIP-1559 費用市場](/ethereum/accounts/eip-1559/) base fee |
| `withdrawalsRoot` | `Hash` | 32 | 提款列表的 MPT root（Shanghai 後） |
| `blobGasUsed` | `uint64` | 8 | blob gas 使用量（[EIP-4844 Proto-Danksharding](/ethereum/advanced/eip-4844/) 後） |
| `excessBlobGas` | `uint64` | 8 | 超額 blob gas（EIP-4844 後） |
| `parentBeaconBlockRoot` | `Hash` | 32 | 父 Beacon Block root（EIP-4788 後） |

### Header Hash 計算

區塊 hash 的計算方式：

$$\text{blockHash} = \text{keccak256}(\text{RLP}([\text{parentHash}, \text{ommersHash}, ..., \text{parentBeaconBlockRoot}]))$$

所有欄位按照上表順序進行 [RLP 編碼](/ethereum/data-structures/rlp-encoding/)，對編碼結果取 [Keccak-256](/ethereum/cryptography/keccak-256/) hash，得到 32 bytes 的區塊 hash。

### Post-Merge 欄位變更

The Merge 後幾個欄位的語義改變：

- **difficulty**：永遠為 0，不再用於 PoW
- **nonce**：永遠為 0，不再用於 [Ethash](/ethereum/consensus/ethash/) 挖礦
- **mixHash**：重新利用為 `prevRandao`，攜帶 [RANDAO](/ethereum/consensus/randao/) 產生的隨機值
- **ommersHash**：永遠為空列表的 hash `keccak256(RLP([]))`

### State Root 語義

`stateRoot` 是執行完區塊內所有交易後的 [State Trie](/ethereum/data-structures/state-trie/) 根。驗證節點必須：

1. 取得父狀態
2. 按順序執行所有交易（[狀態轉換](/ethereum/transaction-lifecycle/state-transition/)）
3. 計算新的 state root
4. 比對 header 中的 `stateRoot`

這確保所有節點對同一區塊的執行結果達成共識。

## 在 Ethereum 中的應用

### 輕節點驗證

輕節點只下載 header，不需要完整交易資料。透過 header 中的各種 root，可以用 [Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/) proof 驗證特定資料的存在性：

- 交易是否在區塊中：用 `transactionsRoot` + Merkle proof
- 收據是否有效：用 `receiptsRoot` + Merkle proof
- 帳戶狀態查詢：用 `stateRoot` + Merkle proof

### Gas 機制

header 中的 `gasLimit` 和 `gasUsed` 控制區塊容量：

- `gasLimit` 由 proposer 在前一個區塊的基礎上微調（最多 $\pm \frac{1}{1024}$）
- `gasUsed` 必須 $\leq$ `gasLimit`
- `baseFeePerGas` 根據前一區塊的 `gasUsed / gasLimit` 比例動態調整

### 時間約束

- `timestamp` 必須 $>$ 父區塊的 `timestamp`
- post-merge 後，timestamp 按 slot 固定遞增 12 秒

## 程式碼範例

```javascript
// 從 RLP 編碼的 header 計算 block hash
const { RLP } = require("@ethereumjs/rlp");
const { keccak256 } = require("ethereum-cryptography/keccak");

function computeBlockHash(header) {
  // 按欄位順序排列
  const fields = [
    header.parentHash,
    header.ommersHash,
    header.beneficiary,
    header.stateRoot,
    header.transactionsRoot,
    header.receiptsRoot,
    header.logsBloom,
    header.difficulty,
    header.number,
    header.gasLimit,
    header.gasUsed,
    header.timestamp,
    header.extraData,
    header.mixHash,       // prevRandao post-merge
    header.nonce,
    header.baseFeePerGas,
    header.withdrawalsRoot,
    header.blobGasUsed,
    header.excessBlobGas,
    header.parentBeaconBlockRoot,
  ];

  const encoded = RLP.encode(fields);
  return keccak256(encoded);
}
```

```python
# 驗證 header 中的 state root
from eth_utils import keccak

def verify_state_root(parent_state, transactions, expected_state_root):
    """
    執行所有交易後，驗證得到的 state root 是否符合 header 宣告的值。
    """
    state = parent_state  # 不可變：每次 apply 產生新的 state
    for tx in transactions:
        state = apply_transaction(state, tx)

    computed_root = state.root_hash()
    return computed_root == expected_state_root
```

## 相關概念

- [區塊結構](/ethereum/consensus/block-structure/) - Header 是 Execution Payload 的核心部分
- [Keccak-256](/ethereum/cryptography/keccak-256/) - 用於計算 block hash
- [RLP 編碼](/ethereum/data-structures/rlp-encoding/) - Header 的序列化格式
- [State Trie](/ethereum/data-structures/state-trie/) - stateRoot 指向的全局狀態樹
- [Transaction Trie](/ethereum/data-structures/transaction-trie/) - transactionsRoot 指向的交易樹
- [Receipt Trie](/ethereum/data-structures/receipt-trie/) - receiptsRoot 指向的收據樹
- [Bloom Filter](/ethereum/data-structures/bloom-filter/) - logsBloom 的資料結構
- [EIP-1559 費用市場](/ethereum/accounts/eip-1559/) - baseFeePerGas 的計算邏輯
- [RANDAO](/ethereum/consensus/randao/) - mixHash 欄位在 post-merge 的新用途
- [Ethash](/ethereum/consensus/ethash/) - 舊 PoW 時代 difficulty/nonce/mixHash 的原始用途
- [Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/) - Header 中各 root 的底層資料結構
