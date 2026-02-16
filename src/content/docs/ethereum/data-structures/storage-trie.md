---
title: "Storage Trie"
description: "Storage Trie, Contract Storage, storageRoot"
tags: [ethereum, data-structure, trie, storage, evm]
---

# Storage Trie

## 概述

Storage Trie 是每個[合約帳戶](/ethereum/accounts/contract-account/)獨立擁有的 [Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/)，儲存合約的所有持久化狀態變數。合約的 `storageRoot`（存在 [State Trie](/ethereum/data-structures/state-trie/) 的帳戶四元組中）就是這棵 Trie 的根 hash。

## 核心原理

### Key-Value 結構

| 欄位 | 內容 |
|------|------|
| **Key** | `keccak256(slot)` — 32-byte slot number 的 [Keccak-256](/ethereum/cryptography/keccak-256/) hash |
| **Value** | `RLP(value)` — slot 中的值，[RLP 編碼](/ethereum/data-structures/rlp-encoding/)，前導零會被去除 |

### Solidity Storage Layout

Solidity 編譯器依照變數宣告順序分配 storage slot：

#### 基本規則

```solidity
contract Example {
    uint256 a;        // slot 0
    uint256 b;        // slot 1
    address c;        // slot 2
    bool d;           // slot 2 (與 c 打包，因 address=20 bytes + bool=1 byte <= 32 bytes)
    uint256 e;        // slot 3
}
```

- 每個 slot 32 bytes（256 bits）
- 小於 32 bytes 的變數會嘗試打包進同一 slot
- 打包順序：低位 -> 高位（right-aligned）

#### Mapping 的 slot 計算

```solidity
mapping(address => uint256) balances; // 宣告在 slot p
```

`balances[addr]` 的 slot：

$$\text{slot} = \text{keccak256}(\text{abi.encode}(\text{addr}, p))$$

key 左補零到 32 bytes，與 slot number 左補零到 32 bytes 串接後取 hash。

巢狀 mapping：

```solidity
mapping(address => mapping(address => uint256)) allowance; // slot p
```

`allowance[owner][spender]` 的 slot：

$$\text{slot} = \text{keccak256}(\text{abi.encode}(\text{spender}, \text{keccak256}(\text{abi.encode}(\text{owner}, p))))$$

#### Dynamic Array 的 slot 計算

```solidity
uint256[] arr; // 宣告在 slot p
```

- `arr.length` 存在 slot $p$
- `arr[i]` 存在 slot $\text{keccak256}(p) + i$

#### String / Bytes

```solidity
string name; // 宣告在 slot p
```

- 短字串（<= 31 bytes）：直接存在 slot $p$，最低 byte 存 `length * 2`
- 長字串（> 31 bytes）：slot $p$ 存 `length * 2 + 1`，資料從 slot $\text{keccak256}(p)$ 開始

#### Struct

```solidity
struct User {
    uint128 id;      // slot n, 低 16 bytes
    uint128 balance;  // slot n, 高 16 bytes
    address addr;     // slot n+1
}
User user; // 宣告在 slot p → id 在 slot p, addr 在 slot p+1
```

### Storage Proof

可透過 `eth_getProof` RPC 取得某個 storage slot 的 Merkle proof：

```
提供：
1. 合約地址
2. Storage slot key
3. Block number

回傳：
1. Account proof（State Trie 中合約帳戶的 proof）
2. Storage proof（Storage Trie 中 slot 的 proof）
```

這讓 light client 可以驗證合約的任意狀態，不需要下載完整狀態。

## 在 Ethereum 中的應用

- **EVM 操作碼**：`SLOAD`（讀取 slot）和 `SSTORE`（寫入 slot）操作 Storage Trie
- **[Gas](/ethereum/accounts/gas/)**：`SSTORE` 是 EVM 中最貴的操作之一（cold: 20,000 gas 新值；warm: 5,000 gas 更新）
- **跨鏈驗證**：Bridge 用 storage proof 驗證源鏈上合約的狀態
- **Layer 2**：Rollup 需要驗證 L1 合約的 storage slot（如 deposit queue）
- **State expiry**：未來的提案可能讓長期未存取的 storage slot 過期

## 程式碼範例

### JavaScript（ethers.js / viem）

```javascript
import { JsonRpcProvider, keccak256, AbiCoder, zeroPadValue, toBeHex } from 'ethers';

const provider = new JsonRpcProvider('https://eth.llamarpc.com');
const coder = AbiCoder.defaultAbiCoder();

// USDC contract
const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

// 計算 mapping slot: balanceOf mapping 在 slot 9
// balanceOf[address] → keccak256(abi.encode(address, 9))
const holder = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const slot = keccak256(
  coder.encode(['address', 'uint256'], [holder, 9])
);
console.log('storage slot:', slot);

// 直接讀取 storage
const value = await provider.getStorage(usdc, slot);
console.log('raw value:', value);
console.log('balance:', BigInt(value));

// 使用 eth_getProof 取得 storage proof
const proof = await provider.send('eth_getProof', [
  usdc,
  [slot],
  'latest',
]);

console.log('storage proof nodes:', proof.storageProof[0].proof.length);
console.log('storage value:', proof.storageProof[0].value);

// 計算 dynamic array slot
// 假設 array 在 slot 5
const arraySlot = 5n;
const arrayDataStart = keccak256(
  zeroPadValue(toBeHex(arraySlot), 32)
);
// arr[0] 在 arrayDataStart, arr[1] 在 arrayDataStart + 1, ...
console.log('arr[0] slot:', arrayDataStart);
```

### Python（web3.py）

```python
from web3 import Web3
from eth_utils import keccak
from eth_abi import encode

w3 = Web3(Web3.HTTPProvider('https://eth.llamarpc.com'))

usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

# 計算 mapping slot
holder = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
mapping_slot = 9

# keccak256(abi.encode(address, uint256))
encoded = encode(['address', 'uint256'], [holder, mapping_slot])
slot = '0x' + keccak(encoded).hex()
print(f"storage slot: {slot}")

# 讀取 storage
value = w3.eth.get_storage_at(usdc, slot)
print(f"raw value: {value.hex()}")
print(f"balance: {int.from_bytes(value, 'big')}")

# Storage proof
proof = w3.eth.get_proof(usdc, [slot], 'latest')
storage_proof = proof['storageProof'][0]
print(f"proof nodes: {len(storage_proof['proof'])}")
print(f"value: {int(storage_proof['value'], 16)}")

# Nested mapping: allowance[owner][spender]
# allowance mapping 在 slot 10
owner = holder
spender = '0x0000000000000000000000000000000000000001'
inner_slot = keccak(encode(['address', 'uint256'], [owner, 10]))
outer_slot = '0x' + keccak(
    encode(['address', 'bytes32'], [spender, inner_slot])
).hex()
print(f"allowance slot: {outer_slot}")
```

## 相關概念

- [Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/) - Storage Trie 的底層結構
- [State Trie](/ethereum/data-structures/state-trie/) - 合約帳戶的 `storageRoot` 欄位指向 Storage Trie
- [合約帳戶](/ethereum/accounts/contract-account/) - Storage Trie 的擁有者
- [Gas](/ethereum/accounts/gas/) - SLOAD/SSTORE 的 gas 成本
- [Keccak-256](/ethereum/cryptography/keccak-256/) - Slot key 的 hash 函數
- [RLP 編碼](/ethereum/data-structures/rlp-encoding/) - Storage Trie value 的序列化格式
- [ABI 編碼](/ethereum/data-structures/abi-encoding/) - Mapping key 使用 abi.encode 後 hash
- [Verkle Trees](/ethereum/advanced/verkle-trees/) - 未來可能取代 MPT 作為 Storage Trie 結構
