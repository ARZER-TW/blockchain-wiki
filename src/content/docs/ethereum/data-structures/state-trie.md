---
title: "State Trie"
description: "State Trie, World State Trie, Global State Trie, stateRoot"
tags: [ethereum, data-structure, trie, state, world-state]
sidebar:
  order: 5
---

# State Trie

## 概述

State Trie 是 Ethereum 的全域狀態資料庫，一棵 [Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/)，儲存所有帳戶（[EOA](/ethereum/accounts/eoa/) 和[合約帳戶](/ethereum/accounts/contract-account/)）的當前狀態。每個區塊的 header 都包含這棵 Trie 的根 hash（`stateRoot`），使得任何人都能驗證任一時間點的全域狀態。

## 核心原理

### Key-Value 結構

| 欄位 | 內容 |
|------|------|
| **Key** | `keccak256(address)` — 20 bytes 地址的 [Keccak-256](/ethereum/cryptography/keccak-256/) hash（32 bytes） |
| **Value** | `RLP([nonce, balance, storageRoot, codeHash])` — 帳戶四元組的 [RLP 編碼](/ethereum/data-structures/rlp-encoding/) |

Key 使用 hash 而非原始地址，目的是讓 key 均勻分散在 Trie 中，避免攻擊者透過選擇特定地址來製造深層路徑。

### 帳戶四元組

每個帳戶儲存 4 個欄位：

```
Account {
  nonce:       uint64    // 交易計數器（EOA）或建立合約次數（合約）
  balance:     uint256   // Wei 餘額
  storageRoot: bytes32   // Storage Trie 的根 hash（合約才有意義）
  codeHash:    bytes32   // 合約 bytecode 的 keccak256（EOA 為空 code 的 hash）
}
```

| 欄位 | EOA | 合約帳戶 |
|------|-----|----------|
| [Nonce](/ethereum/accounts/nonce/) | 發送交易計數 | `CREATE` opcode 計數 |
| balance | ETH 餘額 | ETH 餘額 |
| storageRoot | 空 trie root | [Storage Trie](/ethereum/data-structures/storage-trie/) root |
| codeHash | `keccak256(0x)` | `keccak256(bytecode)` |

空帳戶的 `storageRoot` 是空 trie 的 root：
$$\text{EMPTY\_ROOT} = \text{keccak256}(\text{RLP}(\text{""})) = \texttt{0x56e81f...}$$

空帳戶的 `codeHash`：
$$\text{EMPTY\_CODE} = \text{keccak256}(\texttt{0x}) = \texttt{0xc5d2460...}$$

### 狀態轉換

每筆交易執行後，受影響的帳戶狀態會更新，產生新的 `stateRoot`。這是 Ethereum 狀態機的核心：

$$\sigma_{t+1} = \Upsilon(\sigma_t, T)$$

其中 $\sigma$ 是世界狀態（State Trie），$T$ 是交易，$\Upsilon$ 是[狀態轉換](/ethereum/transaction-lifecycle/state-transition/)函數。

重要：State Trie 是「活的」——不同於 [Transaction Trie](/ethereum/data-structures/transaction-trie/) 和 [Receipt Trie](/ethereum/data-structures/receipt-trie/) 是每個區塊獨立的，State Trie 在整個區塊鏈生命週期中持續修改。

### 儲存規模

截至目前，Ethereum mainnet 的 State Trie 包含：
- 超過 2.5 億個帳戶
- Trie 深度通常在 7-9 層（因 key 是 hash，分佈均勻）
- Full node 需要數百 GB 儲存空間（含歷史狀態）

### State Proof

Light client 可透過 Merkle proof 驗證帳戶狀態：

```
提供：
1. Block header（含 stateRoot）
2. 目標帳戶的 address
3. Merkle proof（Trie 路徑上的節點）

驗證：
1. 計算 key = keccak256(address)
2. 沿 proof 路徑重建 root
3. 比對 root == stateRoot
```

## 在 Ethereum 中的應用

- **[區塊 Header](/ethereum/consensus/block-header/)**：`stateRoot` 欄位記錄執行完所有交易後的全域狀態
- **[狀態轉換](/ethereum/transaction-lifecycle/state-transition/)**：EVM 執行交易時讀寫 State Trie
- **`eth_getBalance`**、**`eth_getTransactionCount`** 等 RPC call 都在查詢 State Trie
- **[Storage Trie](/ethereum/data-structures/storage-trie/)**：每個合約帳戶的 `storageRoot` 指向獨立的 Storage Trie
- **Light client sync**：只需 block header 即可透過 state proof 驗證任何帳戶
- **State pruning**：為了控制儲存大小，node 可以 prune 歷史狀態（只保留最近 N 個區塊）

## 程式碼範例

### JavaScript（ethers.js）

```javascript
import { JsonRpcProvider, keccak256, AbiCoder, getBytes } from 'ethers';

const provider = new JsonRpcProvider('https://eth.llamarpc.com');

// 查詢帳戶狀態（透過 State Trie）
const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'; // vitalik.eth

const [balance, nonce, code] = await Promise.all([
  provider.getBalance(address),
  provider.getTransactionCount(address),
  provider.getCode(address),
]);

console.log('balance (wei):', balance.toString());
console.log('nonce:', nonce);
console.log('codeHash:', keccak256(code));
console.log('is EOA:', code === '0x');

// 取得 State Proof（eth_getProof）
const proof = await provider.send('eth_getProof', [
  address,
  [],  // storage keys（空表示只要帳戶 proof）
  'latest',
]);

console.log('account proof nodes:', proof.accountProof.length);
console.log('nonce:', BigInt(proof.nonce));
console.log('balance:', BigInt(proof.balance));
console.log('storageHash:', proof.storageHash);
console.log('codeHash:', proof.codeHash);

// State Trie key = keccak256(address)
const trieKey = keccak256(address);
console.log('trie key:', trieKey);
```

### Python（web3.py）

```python
from web3 import Web3
from eth_utils import keccak

w3 = Web3(Web3.HTTPProvider('https://eth.llamarpc.com'))

address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

# 查詢帳戶狀態
balance = w3.eth.get_balance(address)
nonce = w3.eth.get_transaction_count(address)
code = w3.eth.get_code(address)

print(f"balance: {balance} wei ({w3.from_wei(balance, 'ether')} ETH)")
print(f"nonce: {nonce}")
print(f"code length: {len(code)} bytes")

# State proof
proof = w3.eth.get_proof(address, [], 'latest')
print(f"account proof nodes: {len(proof['accountProof'])}")
print(f"storageHash: {proof['storageHash'].hex()}")
print(f"codeHash: {proof['codeHash'].hex()}")

# Trie key
trie_key = keccak(bytes.fromhex(address[2:]))
print(f"trie key: 0x{trie_key.hex()}")
```

## 相關概念

- [Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/) - State Trie 的底層資料結構
- [Storage Trie](/ethereum/data-structures/storage-trie/) - 每個合約帳戶內部的儲存 Trie
- [EOA](/ethereum/accounts/eoa/) - 外部擁有帳戶
- [合約帳戶](/ethereum/accounts/contract-account/) - 智能合約帳戶
- [Nonce](/ethereum/accounts/nonce/) - 帳戶四元組的第一個欄位
- [Keccak-256](/ethereum/cryptography/keccak-256/) - Trie key 和 codeHash 的 hash 函數
- [RLP 編碼](/ethereum/data-structures/rlp-encoding/) - 帳戶四元組的序列化格式
- [區塊 Header](/ethereum/consensus/block-header/) - 包含 stateRoot
- [狀態轉換](/ethereum/transaction-lifecycle/state-transition/) - 交易執行導致 State Trie 更新
- [Verkle Trees](/ethereum/advanced/verkle-trees/) - 未來可能取代 MPT 作為 State Trie 的結構
