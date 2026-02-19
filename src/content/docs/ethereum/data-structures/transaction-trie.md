---
title: "Transaction Trie"
description: "Transaction Trie, Transactions Trie, transactionsRoot"
tags: [ethereum, data-structure, trie, transaction]
sidebar:
  order: 7
---

# Transaction Trie

## 概述

Transaction Trie 是每個區塊獨立的 [Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/)，以交易在區塊中的索引為 key，交易本體為 value。區塊 header 的 `transactionsRoot` 欄位即為此 Trie 的根 hash，讓任何人可以驗證某筆交易確實被收入特定區塊。

## 核心原理

### Key-Value 結構

| 欄位 | 內容 |
|------|------|
| **Key** | `RLP(tx_index)` — 交易在區塊中的索引（0, 1, 2, ...）的 [RLP 編碼](/ethereum/data-structures/rlp-encoding/) |
| **Value** | 交易的序列化資料 |

注意：這裡的 key 是 RLP 編碼的索引，**不是** keccak256 hash（與 [State Trie](/ethereum/data-structures/state-trie/) 不同）。因為交易索引是已知且有限的，不需要 hash 均勻分散。

### 交易序列化格式

根據交易類型不同，序列化方式有差異：

#### Legacy Transaction（Type 0）

```
RLP([nonce, gasPrice, gasLimit, to, value, data, v, r, s])
```

#### EIP-2930 Transaction（Type 1）

```
0x01 || RLP([chainId, nonce, gasPrice, gasLimit, to, value, data, accessList, signatureYParity, signatureR, signatureS])
```

#### EIP-1559 Transaction（Type 2）

```
0x02 || RLP([chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList, signatureYParity, signatureR, signatureS])
```

#### EIP-4844 Transaction（Type 3）

```
0x03 || SSZ_or_RLP([chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList, maxFeePerBlobGas, blobVersionedHashes, signatureYParity, signatureR, signatureS])
```

EIP-2718 引入了 typed transaction envelope：若第一個 byte 在 `[0x00, 0x7f]` 範圍，就是 typed transaction（`type || payload`）；若在 `[0xc0, 0xff]` 範圍，則是 legacy transaction（RLP list 的前綴）。

### 與其他 Trie 的差異

| 特性 | Transaction Trie | [State Trie](/ethereum/data-structures/state-trie/) |
|------|-----------------|---------------|
| 生命週期 | 每個區塊獨立 | 持續存在 |
| Key | RLP(index) | keccak256(address) |
| 可修改 | 否（建完不變） | 每筆交易都更新 |
| 大小 | 通常 < 數百筆 | 數億筆 |

### 交易 Hash

交易 hash（txHash）是交易序列化資料的 [Keccak-256](/ethereum/cryptography/keccak-256/)：

- Legacy：`keccak256(RLP(tx))`
- Typed：`keccak256(type || RLP(payload))`

這個 hash 不是 Trie 的 key，而是用於交易的全域唯一識別。

## 在 Ethereum 中的應用

- **[區塊 Header](/ethereum/consensus/block-header/)**：`transactionsRoot` 欄位
- **交易驗證**：Light client 使用 Merkle proof 驗證某筆交易確實存在於某區塊
- **區塊驗證**：Full node 重建 Transaction Trie 驗證 root 與 header 一致
- **[交易生命週期](/ethereum/transaction-lifecycle/transaction-lifecycle/)**：交易從[記憶池](/ethereum/transaction-lifecycle/mempool/)被選入區塊後，寫入 Transaction Trie
- **Block explorer**：查詢某區塊中的所有交易

## 程式碼範例

### JavaScript（ethers.js）

```javascript
import { JsonRpcProvider, encodeRlp, keccak256, toBeHex } from 'ethers';

const provider = new JsonRpcProvider('https://eth.llamarpc.com');

// 取得區塊和交易
const block = await provider.getBlock('latest', true);
console.log('transactionsRoot:', block.transactionsRoot);

// 取得單筆交易的完整資料
const tx = await provider.getTransaction(block.transactions[0]);
console.log('tx hash:', tx.hash);
console.log('tx type:', tx.type);
console.log('tx index:', tx.index);

// 交易 hash 是序列化資料的 keccak256
// ethers 內部已處理，這裡展示結構
console.log('from:', tx.from);
console.log('to:', tx.to);
console.log('value:', tx.value.toString());
console.log('nonce:', tx.nonce);
console.log('gasLimit:', tx.gasLimit.toString());

// 驗證：取得 proof
// 注意：標準 JSON-RPC 沒有直接取 transaction proof 的方法
// 但可以透過 eth_getTransactionByBlockNumberAndIndex 確認索引

// 重建 Trie key（RLP 編碼索引）
const trieKey = encodeRlp(toBeHex(tx.index));
console.log('trie key:', trieKey);
```

### Python（web3.py）

```python
from web3 import Web3
import rlp
from eth_utils import keccak

w3 = Web3(Web3.HTTPProvider('https://eth.llamarpc.com'))

# 取得區塊
block = w3.eth.get_block('latest', full_transactions=True)
print(f"transactionsRoot: {block['transactionsRoot'].hex()}")
print(f"tx count: {len(block['transactions'])}")

# 遍歷交易
for i, tx in enumerate(block['transactions'][:3]):
    print(f"\n--- Transaction {i} ---")
    print(f"hash: {tx['hash'].hex()}")
    print(f"type: {tx.get('type', 0)}")
    print(f"from: {tx['from']}")
    print(f"to: {tx['to']}")
    print(f"value: {tx['value']} wei")
    print(f"nonce: {tx['nonce']}")

    # Trie key = RLP(index)
    trie_key = rlp.encode(i)
    print(f"trie key: 0x{trie_key.hex()}")

# 取得單筆交易的收據（包含 transactionIndex）
receipt = w3.eth.get_transaction_receipt(block['transactions'][0]['hash'])
print(f"\ntransactionIndex: {receipt['transactionIndex']}")
print(f"blockNumber: {receipt['blockNumber']}")
```

## 相關概念

- [Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/) - Transaction Trie 的底層結構
- [RLP 編碼](/ethereum/data-structures/rlp-encoding/) - Key（索引）和 Value（交易）的序列化格式
- [Receipt Trie](/ethereum/data-structures/receipt-trie/) - 與 Transaction Trie 平行，儲存交易收據
- [區塊 Header](/ethereum/consensus/block-header/) - 包含 `transactionsRoot`
- [區塊結構](/ethereum/consensus/block-structure/) - Transaction Trie 是區塊資料的一部分
- [交易生命週期](/ethereum/transaction-lifecycle/transaction-lifecycle/) - 交易從建構到收入區塊的完整流程
- [EIP-1559 費用市場](/ethereum/accounts/eip-1559/) - Type 2 交易的費用結構
- [EIP-155 重放保護](/ethereum/accounts/eip-155/) - 影響 Legacy 交易的 v 值
- [交易簽名](/ethereum/transaction-lifecycle/transaction-signing/) - 交易序列化中包含簽名欄位
