---
title: "Nonce"
description: "Nonce, 交易序號, Account Nonce"
tags: [ethereum, account, nonce, transaction, replay-protection]
sidebar:
  order: 5
---

# Nonce

> 本文聚焦 Ethereum 特定的實現細節。通用 nonce 概念請參見 [Nonce](/fundamentals/concepts/nonce/)。

## 概述

在 Ethereum 中，nonce 是每個帳戶的交易計數器。[EOA](/ethereum/accounts/eoa/) 的 nonce 代表已發送的交易數量；[合約帳戶](/ethereum/accounts/contract-account/)的 nonce 代表透過 `CREATE` opcode 建立的合約數量。Nonce 是 replay protection 的核心機制，同時也參與 CREATE 地址計算。

## Ethereum Nonce 規則

1. **初始值**：帳戶建立時 nonce = 0
2. **遞增**：每發送一筆交易（EOA）或 CREATE 一個合約（合約帳戶），nonce + 1
3. **嚴格順序**：交易的 nonce 必須 **恰好等於** 帳戶當前 nonce
4. **不可跳過**：nonce = 5 的交易必須在 nonce = 4 之後執行
5. **不可重複**：同一 nonce 的交易只能成功一次

### EIP-155 跨鏈重放保護

Nonce 能防止同鏈重放，但跨鏈重放需要靠 [EIP-155 重放保護](/ethereum/accounts/eip-155/)（chainId）來防止。

### Nonce Gap 問題

如果你發送 nonce = 5 但 nonce = 4 還沒確認：

```
帳戶 nonce = 4
發送 tx(nonce=5) → 進入 mempool，等待
發送 tx(nonce=4) → 執行成功，nonce 變 5
tx(nonce=5) → 現在可以執行了
```

如果 nonce = 4 的交易被取消或失敗，nonce = 5 會永遠卡住（stuck transaction）。

### 交易替換（Speed Up / Cancel）

同一 nonce 可以發送多筆交易，但只有一筆能被收入區塊。利用這個特性：

- **加速**：同 nonce，更高 gas price，相同內容 -- 礦工/驗證者優先處理
- **取消**：同 nonce，更高 gas price，`to = self, value = 0` -- 空交易取代原交易

替換交易的 gas price 通常需要比原交易高 10% 以上。

### 合約帳戶的 Nonce

- 初始值為 1（EIP-161 之後）
- 每次 `CREATE` opcode 成功執行時 +1
- 用於計算新合約的地址：`keccak256(rlp([sender, nonce]))[12:]`
- `CREATE2` 不影響 nonce

### Nonce 在帳戶模型中的位置

```
State Trie
  └── keccak256(address) → RLP([nonce, balance, storageRoot, codeHash])
                             ↑
                             第一個欄位
```

### Pending Nonce vs Confirmed Nonce

- `eth_getTransactionCount(address, 'latest')`：最新確認區塊的 nonce
- `eth_getTransactionCount(address, 'pending')`：包含 mempool 中交易的 nonce

建議使用 `pending` 來構建新交易，避免 nonce 衝突。

## 在 Ethereum 中的應用

- **[交易生命週期](/ethereum/transaction-lifecycle/transaction-lifecycle/)**：nonce 決定交易執行順序
- **[記憶池](/ethereum/transaction-lifecycle/mempool/)**：mempool 中的交易按 nonce 排序
- **[地址推導](/ethereum/accounts/address-derivation/)**：CREATE 合約地址 = `keccak256(rlp([sender, nonce]))[12:]`
- **[交易構建](/ethereum/transaction-lifecycle/transaction-construction/)**：構建交易時必須正確設定 nonce
- **[交易廣播與驗證](/ethereum/transaction-lifecycle/broadcast-validation/)**：node 驗證 nonce 是否正確
- **[Gas](/ethereum/accounts/gas/)**：stuck transaction 問題常與 gas price 和 nonce 相關
- **MEV**：Searcher 需要精確管理 nonce 以確保 bundle 中交易順序

## 程式碼範例

### JavaScript（ethers.js）

```javascript
import { JsonRpcProvider, Wallet, parseEther } from 'ethers';

const provider = new JsonRpcProvider('https://eth.llamarpc.com');

const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

// 取得確認的 nonce
const confirmedNonce = await provider.getTransactionCount(address, 'latest');
console.log('confirmed nonce:', confirmedNonce);

// 取得包含 pending 的 nonce
const pendingNonce = await provider.getTransactionCount(address, 'pending');
console.log('pending nonce:', pendingNonce);

// 手動指定 nonce 發送交易
const wallet = new Wallet('0x...', provider);

// 正常發送（自動取 pending nonce）
const tx1 = await wallet.sendTransaction({
  to: '0x...',
  value: parseEther('0.01'),
  // nonce 不指定，ethers 自動管理
});

// 手動指定 nonce（進階用途）
const currentNonce = await provider.getTransactionCount(wallet.address, 'pending');

// 批量發送：連續 nonce
const tx2 = await wallet.sendTransaction({
  to: '0x...',
  value: parseEther('0.01'),
  nonce: currentNonce,
});

const tx3 = await wallet.sendTransaction({
  to: '0x...',
  value: parseEther('0.02'),
  nonce: currentNonce + 1,
});

// 取消交易：同 nonce，高 gas，空交易
const cancelTx = await wallet.sendTransaction({
  to: wallet.address,
  value: 0n,
  nonce: currentNonce,
  maxFeePerGas: tx2.maxFeePerGas * 2n,
  maxPriorityFeePerGas: tx2.maxPriorityFeePerGas * 2n,
});
console.log('cancel tx:', cancelTx.hash);
```

### Python（web3.py）

```python
from web3 import Web3

w3 = Web3(Web3.HTTPProvider('https://eth.llamarpc.com'))

address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

# 取得 nonce
confirmed = w3.eth.get_transaction_count(address, 'latest')
pending = w3.eth.get_transaction_count(address, 'pending')
print(f"confirmed nonce: {confirmed}")
print(f"pending nonce: {pending}")

# 構建交易時使用正確 nonce
nonce = w3.eth.get_transaction_count(address, 'pending')

tx = {
    'nonce': nonce,
    'to': '0x...',
    'value': w3.to_wei(0.01, 'ether'),
    'gas': 21000,
    'maxFeePerGas': w3.to_wei(30, 'gwei'),
    'maxPriorityFeePerGas': w3.to_wei(2, 'gwei'),
    'chainId': 1,
}

# 預測 CREATE 地址
from eth_utils import keccak
import rlp

def predict_contract_address(deployer: str, nonce: int) -> str:
    sender = bytes.fromhex(deployer[2:])
    encoded = rlp.encode([sender, nonce])
    return '0x' + keccak(encoded)[-20:].hex()

# nonce 0, 1, 2 分別部署的合約地址
for n in range(3):
    addr = predict_contract_address(address, n)
    print(f"nonce {n} -> contract: {addr}")
```

## 相關概念

- [Nonce（通用概念）](/fundamentals/concepts/nonce/) - 跨鏈通用的 nonce 概念
- [EOA](/ethereum/accounts/eoa/) - EOA 的 nonce 是交易計數器
- [合約帳戶](/ethereum/accounts/contract-account/) - 合約的 nonce 是 CREATE 計數器
- [EIP-155 重放保護](/ethereum/accounts/eip-155/) - chainId 補充 nonce 的跨鏈保護不足
- [地址推導](/ethereum/accounts/address-derivation/) - CREATE 地址計算使用 nonce
- [交易生命週期](/ethereum/transaction-lifecycle/transaction-lifecycle/) - Nonce 決定交易排序
- [記憶池](/ethereum/transaction-lifecycle/mempool/) - Pending 交易的 nonce 管理
- [交易構建](/ethereum/transaction-lifecycle/transaction-construction/) - 正確設定 nonce
- [State Trie](/ethereum/data-structures/state-trie/) - Nonce 存在帳戶四元組的第一個欄位
- [RLP 編碼](/ethereum/data-structures/rlp-encoding/) - Nonce 以 RLP 編碼儲存
- [Gas](/ethereum/accounts/gas/) - 交易替換需要更高的 gas price
