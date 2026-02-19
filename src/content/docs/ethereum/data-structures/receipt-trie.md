---
title: "Receipt Trie"
description: "Receipt Trie, Receipts Trie, receiptsRoot, Transaction Receipt"
tags: [ethereum, data-structure, trie, receipt, logs]
sidebar:
  order: 8
---

# Receipt Trie

## 概述

Receipt Trie 是每個區塊獨立的 [Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/)，儲存該區塊中所有交易的執行結果（Receipt）。區塊 header 的 `receiptsRoot` 即為此 Trie 的根 hash。Receipt 包含交易的 gas 消耗、log 事件、狀態等執行後資訊，是 DApp 監聽事件和確認交易結果的關鍵資料來源。

## 核心原理

### Key-Value 結構

| 欄位 | 內容 |
|------|------|
| **Key** | `RLP(tx_index)` — 與 [Transaction Trie](/ethereum/data-structures/transaction-trie/) 相同 |
| **Value** | Receipt 的序列化資料 |

### Receipt 結構

```
Receipt {
  status:            uint8      // 1 = success, 0 = revert（EIP-658 後）
  cumulativeGasUsed: uint64     // 截至此交易的累積 gas 使用量
  logsBloom:         bytes256   // 2048-bit Bloom filter（本交易的 logs）
  logs:              Log[]      // event logs 陣列
}
```

每個 Log 的結構：

```
Log {
  address:  address    // 產生 log 的合約地址
  topics:   bytes32[]  // indexed 參數（最多 4 個，第一個通常是 event signature hash）
  data:     bytes      // 非 indexed 參數的 ABI 編碼
}
```

### Receipt 序列化

與交易類似，根據交易類型不同：

- **Legacy**：`RLP([status, cumulativeGasUsed, logsBloom, logs])`
- **Typed（EIP-2718）**：`type || RLP([status, cumulativeGasUsed, logsBloom, logs])`

### Log Topics

Solidity event 的 topic 結構：

```solidity
event Transfer(address indexed from, address indexed to, uint256 value);
```

產生的 Log：
- `topics[0]` = `keccak256("Transfer(address,address,uint256)")` — event signature
- `topics[1]` = `from` 地址左補零到 32 bytes
- `topics[2]` = `to` 地址左補零到 32 bytes
- `data` = [ABI 編碼](/ethereum/data-structures/abi-encoding/) 的 `value`（非 indexed）

`anonymous` event 沒有 `topics[0]`，所有 4 個 topic slot 都可用於 indexed 參數。

### 個別交易 Gas 計算

Receipt 只儲存 `cumulativeGasUsed`，要算個別交易的 gas：

$$\text{gasUsed}_i = \text{cumulativeGasUsed}_i - \text{cumulativeGasUsed}_{i-1}$$

第 0 筆交易的 `gasUsed` 就等於其 `cumulativeGasUsed`。

### Logs Bloom（Receipt 級別）

每個 Receipt 有自己的 `logsBloom`（2048-bit [Bloom Filter](/ethereum/data-structures/bloom-filter/)），用於快速過濾：

- 包含所有 log 的 `address`
- 包含所有 log 的每個 `topic`

區塊級別的 `logsBloom`（在 block header 中）是所有 Receipt `logsBloom` 的 bitwise OR。

## 在 Ethereum 中的應用

- **[區塊 Header](/ethereum/consensus/block-header/)**：`receiptsRoot` 欄位
- **事件監聽**：DApp 透過 `eth_getLogs` 查詢 event，底層就是在讀 Receipt Trie
- **[Bloom Filter](/ethereum/data-structures/bloom-filter/)**：快速過濾包含特定 event 的區塊
- **交易確認**：`status` 欄位告訴你交易成功或失敗
- **Gas 分析**：`cumulativeGasUsed` 計算個別交易的 gas 消耗
- **跨鏈通訊**：Bridge 常用 receipt proof 驗證源鏈事件的發生
- **Light client**：透過 Merkle proof 驗證特定 event 確實發生

## 程式碼範例

### JavaScript（ethers.js）

```javascript
import { JsonRpcProvider, Interface } from 'ethers';

const provider = new JsonRpcProvider('https://eth.llamarpc.com');

// 取得交易收據
const txHash = '0x...'; // 任意交易 hash
const receipt = await provider.getTransactionReceipt(txHash);

console.log('status:', receipt.status); // 1 = success
console.log('gasUsed:', receipt.gasUsed.toString());
console.log('cumulativeGasUsed:', receipt.cumulativeGasUsed.toString());
console.log('logs count:', receipt.logs.length);

// 解析 ERC-20 Transfer event
const erc20Interface = new Interface([
  'event Transfer(address indexed from, address indexed to, uint256 value)'
]);

for (const log of receipt.logs) {
  try {
    const parsed = erc20Interface.parseLog({
      topics: log.topics,
      data: log.data,
    });
    if (parsed) {
      console.log('Transfer:', {
        from: parsed.args.from,
        to: parsed.args.to,
        value: parsed.args.value.toString(),
      });
    }
  } catch {
    // 不是 ERC-20 Transfer event
  }
}

// 查詢特定 event（使用 Bloom filter 加速）
const transferTopic = erc20Interface.getEvent('Transfer').topicHash;
const logs = await provider.getLogs({
  fromBlock: receipt.blockNumber,
  toBlock: receipt.blockNumber,
  topics: [transferTopic],
});
console.log('Transfer events in block:', logs.length);

// 取得區塊的 receiptsRoot
const block = await provider.getBlock(receipt.blockNumber);
console.log('receiptsRoot:', block.receiptsRoot);
```

### Python（web3.py）

```python
from web3 import Web3
from eth_utils import keccak

w3 = Web3(Web3.HTTPProvider('https://eth.llamarpc.com'))

# 取得收據
tx_hash = '0x...'
receipt = w3.eth.get_transaction_receipt(tx_hash)

print(f"status: {receipt['status']}")
print(f"gasUsed: {receipt['gasUsed']}")
print(f"cumulativeGasUsed: {receipt['cumulativeGasUsed']}")
print(f"logs: {len(receipt['logs'])}")

# 解析 logs
transfer_topic = keccak(b'Transfer(address,address,uint256)')

for log in receipt['logs']:
    if log['topics'][0] == transfer_topic:
        from_addr = '0x' + log['topics'][1].hex()[-40:]
        to_addr = '0x' + log['topics'][2].hex()[-40:]
        value = int.from_bytes(log['data'], 'big')
        print(f"Transfer: {from_addr} -> {to_addr}, value={value}")

# 查詢區塊中所有 Transfer events
block = w3.eth.get_block(receipt['blockNumber'])
print(f"receiptsRoot: {block['receiptsRoot'].hex()}")

logs = w3.eth.get_logs({
    'fromBlock': receipt['blockNumber'],
    'toBlock': receipt['blockNumber'],
    'topics': [transfer_topic],
})
print(f"Transfer events in block: {len(logs)}")

# 計算個別 gas
if receipt['transactionIndex'] > 0:
    prev_receipt = w3.eth.get_transaction_receipt(
        block['transactions'][receipt['transactionIndex'] - 1]
    )
    individual_gas = receipt['cumulativeGasUsed'] - prev_receipt['cumulativeGasUsed']
else:
    individual_gas = receipt['cumulativeGasUsed']
print(f"individual gasUsed: {individual_gas}")
```

## 相關概念

- [Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/) - Receipt Trie 的底層結構
- [Transaction Trie](/ethereum/data-structures/transaction-trie/) - 與 Receipt Trie 平行，同樣以 tx index 為 key
- [Bloom Filter](/ethereum/data-structures/bloom-filter/) - Receipt 的 logsBloom 用於快速事件過濾
- [ABI 編碼](/ethereum/data-structures/abi-encoding/) - Log data 使用 ABI 編碼
- [Keccak-256](/ethereum/cryptography/keccak-256/) - Event topic（event signature hash）
- [區塊 Header](/ethereum/consensus/block-header/) - 包含 `receiptsRoot` 和區塊級 `logsBloom`
- [Gas](/ethereum/accounts/gas/) - Receipt 記錄 gas 使用量
- [交易生命週期](/ethereum/transaction-lifecycle/transaction-lifecycle/) - Receipt 是交易執行的最終輸出
