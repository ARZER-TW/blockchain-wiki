---
title: "區塊結構"
description: "Block Structure, 區塊, Block"
tags: [ethereum, block, consensus, execution-layer, consensus-layer]
---

# 區塊結構

## 概述

Ethereum 自 The Merge 後採用雙層區塊結構：Consensus Layer（CL）負責共識邏輯，Execution Layer（EL）負責交易執行與狀態轉換。一個完整的區塊由 Beacon Block 包裹 Execution Payload 組成，兩層各自維護不同的資料結構與驗證邏輯。

## 核心原理

### 雙層架構

The Merge 前，區塊是單一結構，包含 header、transactions、ommers。合併後拆分成：

- **Beacon Block**：共識層容器，包含 slot、proposer index、parent root、state root、body
- **Execution Payload**：嵌在 Beacon Block body 裡的執行層資料，等同於舊的區塊內容

這種設計讓共識邏輯與執行邏輯解耦，CL 客戶端（如 Prysm、Lighthouse）和 EL 客戶端（如 Geth、Nethermind）透過 Engine API 溝通。

### Beacon Block 結構

| 欄位 | 類型 | 說明 |
|------|------|------|
| `slot` | `uint64` | 所屬 slot 編號 |
| `proposer_index` | `ValidatorIndex` | 提議者在 validator registry 的 index |
| `parent_root` | `Root` | 父區塊的 hash tree root |
| `state_root` | `Root` | 後狀態的 [SSZ 編碼](/ethereum/data-structures/ssz-encoding/) hash tree root |
| `body` | `BeaconBlockBody` | 區塊主體 |

### BeaconBlockBody 主要欄位

| 欄位 | 說明 |
|------|------|
| `randao_reveal` | Proposer 的 [RANDAO](/ethereum/consensus/randao/) 揭示值（BLS signature） |
| `eth1_data` | 對 EL deposit contract 的引用 |
| `graffiti` | 32 bytes 自由欄位 |
| `proposer_slashings` | [Slashing](/ethereum/consensus/slashing/) 證據（proposer 類） |
| `attester_slashings` | [Slashing](/ethereum/consensus/slashing/) 證據（attester 類） |
| `attestations` | [Attestation](/ethereum/consensus/attestation/) 列表 |
| `deposits` | 新質押存款 |
| `voluntary_exits` | 自願退出請求 |
| `sync_committee_bits` | Sync committee 參與位元 |
| `sync_committee_signature` | Sync committee 聚合簽名 |
| `execution_payload` | 執行層負載 |

### Execution Payload 結構

Execution Payload 攜帶所有交易執行相關資料，欄位對應舊的[區塊 Header](/ethereum/consensus/block-header/)加上交易列表：

| 欄位 | 類型 | 說明 |
|------|------|------|
| `parent_hash` | `Hash32` | 父執行區塊的 [Keccak-256](/ethereum/cryptography/keccak-256/) hash |
| `fee_recipient` | `Address` | 接收 priority fee 的地址 |
| `state_root` | `Root` | 執行後的 [State Trie](/ethereum/data-structures/state-trie/) root |
| `receipts_root` | `Root` | [Receipt Trie](/ethereum/data-structures/receipt-trie/) root |
| `logs_bloom` | `ByteVector[256]` | [Bloom Filter](/ethereum/data-structures/bloom-filter/) |
| `prev_randao` | `Hash32` | 前一個 [RANDAO](/ethereum/consensus/randao/) 混合值 |
| `block_number` | `uint64` | 區塊高度 |
| `gas_limit` | `uint64` | Gas 上限 |
| `gas_used` | `uint64` | 已使用 Gas |
| `timestamp` | `uint64` | Unix timestamp |
| `extra_data` | `ByteList[32]` | 額外資料 |
| `base_fee_per_gas` | `uint256` | [EIP-1559 費用市場](/ethereum/accounts/eip-1559/) base fee |
| `block_hash` | `Hash32` | 執行區塊的 hash |
| `transactions` | `List[Transaction]` | 交易列表（[RLP 編碼](/ethereum/data-structures/rlp-encoding/)） |
| `withdrawals` | `List[Withdrawal]` | 提款列表（Shanghai 升級後） |

EIP-4844 後新增 `blob_gas_used` 和 `excess_blob_gas` 欄位，用於 [EIP-4844 Proto-Danksharding](/ethereum/advanced/eip-4844/) 的 blob gas 計價。

### 區塊 Hash 計算

兩層各自計算 hash：

- **CL**：對 Beacon Block 做 [SSZ 編碼](/ethereum/data-structures/ssz-encoding/) 後取 `hash_tree_root`
- **EL**：對 [區塊 Header](/ethereum/consensus/block-header/) 做 [RLP 編碼](/ethereum/data-structures/rlp-encoding/) 後取 [Keccak-256](/ethereum/cryptography/keccak-256/) hash

## 在 Ethereum 中的應用

區塊是狀態轉換的原子單位。每個 slot（12 秒）最多產生一個區塊：

1. [Validators](/ethereum/consensus/validators/) 被選為 proposer，組裝 Beacon Block
2. EL 客戶端透過 Engine API 提供 Execution Payload
3. Proposer 簽名並廣播
4. 其他 validator 進行 [Attestation](/ethereum/consensus/attestation/)，投票確認區塊有效性
5. 經過 [Casper FFG](/ethereum/consensus/casper-ffg/) 達成 finality

區塊驗證流程：
- CL 驗證 proposer 簽名、attestation 有效性、[RANDAO](/ethereum/consensus/randao/) reveal
- EL 驗證交易執行、state root、receipt root

## 程式碼範例

```python
# Beacon Block 結構（簡化版，對應 SSZ container）
from dataclasses import dataclass
from typing import List

@dataclass(frozen=True)
class BeaconBlock:
    slot: int
    proposer_index: int
    parent_root: bytes  # 32 bytes
    state_root: bytes   # 32 bytes
    body: 'BeaconBlockBody'

@dataclass(frozen=True)
class ExecutionPayload:
    parent_hash: bytes
    fee_recipient: bytes  # 20 bytes
    state_root: bytes
    receipts_root: bytes
    logs_bloom: bytes     # 256 bytes
    prev_randao: bytes
    block_number: int
    gas_limit: int
    gas_used: int
    timestamp: int
    extra_data: bytes
    base_fee_per_gas: int
    block_hash: bytes
    transactions: List[bytes]
    withdrawals: List['Withdrawal']
```

```javascript
// 透過 Engine API 取得 execution payload（EL 客戶端視角）
const block = await provider.getBlock("latest");
console.log({
  number: block.number,
  hash: block.hash,
  parentHash: block.parentHash,
  stateRoot: block.stateRoot,
  transactionsRoot: block.transactionsRoot,
  receiptsRoot: block.receiptsRoot,
  gasUsed: block.gasUsed.toString(),
  gasLimit: block.gasLimit.toString(),
  baseFeePerGas: block.baseFeePerGas.toString(),
  timestamp: block.timestamp,
});
```

## 相關概念

- [區塊 Header](/ethereum/consensus/block-header/) - Execution Payload 中的 header 欄位定義
- [Beacon Chain](/ethereum/consensus/beacon-chain/) - 管理區塊 slot 分配與 proposer 選擇
- [Validators](/ethereum/consensus/validators/) - 負責提議與驗證區塊
- [Attestation](/ethereum/consensus/attestation/) - Validator 對區塊的投票機制
- [SSZ 編碼](/ethereum/data-structures/ssz-encoding/) - Consensus Layer 的序列化格式
- [RLP 編碼](/ethereum/data-structures/rlp-encoding/) - Execution Layer 的序列化格式
- [State Trie](/ethereum/data-structures/state-trie/) - 執行後的全局狀態樹
- [EIP-4844 Proto-Danksharding](/ethereum/advanced/eip-4844/) - 新增 blob 相關欄位
- [交易生命週期](/ethereum/transaction-lifecycle/transaction-lifecycle/) - 交易從建構到被區塊收錄的完整流程
