---
title: "交易廣播與驗證"
description: "Transaction Broadcasting, 交易傳播, 交易驗證"
tags: [ethereum, transaction, broadcast, validation, p2p]
sidebar:
  order: 5
---

# 交易廣播與驗證

## 概述

簽好的交易透過 JSON-RPC（`eth_sendRawTransaction`）提交給 Ethereum 節點，節點執行一系列驗證檢查後，將交易加入本地 [記憶池](/ethereum/transaction-lifecycle/mempool/) 並透過 DevP2P gossip 協議傳播到其他 peer。每個收到交易的節點會獨立驗證，不信任傳播來源。

## 核心原理

### 提交方式

使用者（或 dApp）將已簽名的原始交易 hex 透過 RPC 提交：

```
POST /
{
  "jsonrpc": "2.0",
  "method": "eth_sendRawTransaction",
  "params": ["0x02f8...signed_tx_hex"],
  "id": 1
}
```

節點收到後進行驗證，通過則回傳交易雜湊；失敗則回傳錯誤。

### 節點驗證流程

每個節點對收到的交易執行以下檢查（順序可能因客戶端而異）：

```
1. 格式驗證
   ├── 交易 RLP 解碼是否成功
   ├── 欄位型別是否正確
   └── 交易大小 <= 131,072 bytes (128 KB)

2. 簽章驗證
   ├── ECRECOVER 恢復公鑰
   ├── 推導地址 = 發送者地址
   ├── v 值對應正確 chain ID
   └── s <= secp256k1 order / 2（EIP-2 low-s）

3. 狀態驗證
   ├── 發送者帳戶存在（或 value+gas 足以創建）
   ├── nonce == 帳戶當前 nonce（或 pending nonce）
   ├── 餘額 >= value + gasLimit * maxFeePerGas
   └── gasLimit >= intrinsic gas（21000 + calldata cost）

4. 費用驗證
   ├── maxFeePerGas >= 當前 baseFee（可寬鬆）
   └── maxPriorityFeePerGas >= 0
```

### 簽章驗證細節

這是整個驗證中密碼學最密集的部分：

1. 從已簽名交易解析出 `(v, r, s)` 和交易欄位
2. 重新序列化交易欄位（不含簽章），計算 [Keccak-256](/ethereum/cryptography/keccak-256/) 雜湊 $z$
3. 呼叫 [ECRECOVER](/ethereum/cryptography/ecrecover/)：從 $(z, v, r, s)$ 恢復公鑰 $K$
4. 計算地址：$\text{addr} = \text{Keccak-256}(K)[12{:}32]$
5. 此地址即為交易發送者（`from`）

整個過程不需要事先知道發送者是誰 -- 身份完全由簽章數學推導。

### Intrinsic Gas

交易在 EVM 執行前就要消耗的固定 gas：

| 項目 | Gas 成本 |
|------|----------|
| 基礎交易 | 21,000 |
| 合約部署（to = null） | 額外 32,000 |
| calldata 中的零 byte | 每 byte 4 gas |
| calldata 中的非零 byte | 每 byte 16 gas |
| Access list entry（地址） | 2,400 |
| Access list entry（storage key） | 1,900 |

`gasLimit` 必須 >= intrinsic gas，否則交易直接被拒絕。

### DevP2P Gossip 傳播

Ethereum 使用結構化的 P2P 網路：

1. **Discovery**：用 discv4/discv5 協議（基於 Kademlia DHT）發現 peers
2. **連線**：RLPx 加密傳輸（ECIES 握手 + AES-256-CTR）
3. **交易傳播**：
   - 節點向部分 peers 發送完整交易（`Transactions` 訊息）
   - 向其餘 peers 只發送交易雜湊（`NewPooledTransactionHashes`）
   - 收到雜湊的節點按需請求完整交易（`GetPooledTransactions`）

這種混合策略平衡了延遲和頻寬。一筆交易通常在 1-3 秒內傳播到大部分網路節點。

### 私有交易（Flashbots / MEV）

為避免被 MEV searcher 搶跑，可以繞過公開 mempool：

- **Flashbots Protect**：交易直接發送給 block builder，不進入公開 mempool
- **Private mempool**：部分 builder 提供私有交易提交端點
- 這些交易其他節點在區塊上鏈前看不到

## 在 Ethereum 中的應用

- **標準交易**：透過公開 RPC 提交、gossip 傳播、所有節點可見
- **MEV 保護交易**：透過 Flashbots 等私有通道直接送到 builder
- **Bundle**：多筆交易打包為原子操作，全部成功或全部不包含
- **節點同步**：新節點加入網路時也透過 DevP2P 同步歷史區塊

## 程式碼範例

```javascript
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider('http://localhost:8545');
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// --- 1. 標準廣播 ---
const tx = await wallet.sendTransaction({
  to: '0xRecipient',
  value: ethers.parseEther('0.1'),
});
console.log('TX Hash:', tx.hash);

// 等待被包含在區塊中
const receipt = await tx.wait();
console.log('Confirmed in block:', receipt.blockNumber);

// --- 2. 手動廣播原始交易 ---
const signedTx = await wallet.signTransaction({
  type: 2,
  to: '0xRecipient',
  value: ethers.parseEther('0.1'),
  chainId: 1n,
  nonce: await provider.getTransactionCount(wallet.address, 'pending'),
  maxFeePerGas: ethers.parseUnits('30', 'gwei'),
  maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei'),
  gasLimit: 21000n,
});

const txResponse = await provider.broadcastTransaction(signedTx);
console.log('Broadcasted:', txResponse.hash);

// --- 3. 驗證已存在的交易簽章 ---
const existingTx = await provider.getTransaction(tx.hash);
const recoveredFrom = ethers.recoverAddress(
  ethers.Transaction.from(existingTx).unsignedHash,
  existingTx.signature
);
console.log('Sender verified:', recoveredFrom === existingTx.from);

// --- 4. 監聽 pending 交易 ---
provider.on('pending', async (txHash) => {
  const pendingTx = await provider.getTransaction(txHash);
  if (pendingTx) {
    console.log(`Pending: ${txHash} from ${pendingTx.from} value ${ethers.formatEther(pendingTx.value)} ETH`);
  }
});

// --- 5. Flashbots 提交（概念範例） ---
// 實際使用需安裝 @flashbots/ethers-provider-bundle
// const flashbotsProvider = await FlashbotsBundleProvider.create(provider, authSigner);
// const bundle = [{ signedTransaction: signedTx }];
// const result = await flashbotsProvider.sendBundle(bundle, targetBlock);
```

## 常見錯誤

| 錯誤訊息 | 原因 |
|----------|------|
| `nonce too low` | nonce 已被使用過 |
| `nonce too high` | nonce 跳號，中間有未確認交易 |
| `insufficient funds` | 餘額不足以支付 value + gas |
| `intrinsic gas too low` | gasLimit 低於最低要求 |
| `max fee per gas less than block base fee` | maxFeePerGas 低於當前 baseFee |
| `already known` | 此交易已在 mempool 中 |
| `replacement transaction underpriced` | 替換交易的 gas price 不夠高 |

## 相關概念

- [交易生命週期](/ethereum/transaction-lifecycle/transaction-lifecycle/) - 本筆記是流程第四步
- [交易簽名](/ethereum/transaction-lifecycle/transaction-signing/) - 流程上一步：產生簽章
- [記憶池](/ethereum/transaction-lifecycle/mempool/) - 流程下一步：通過驗證後進入 mempool
- [ECRECOVER](/ethereum/cryptography/ecrecover/) - 驗證中的簽章恢復操作
- [Keccak-256](/ethereum/cryptography/keccak-256/) - 交易雜湊計算
- [EIP-155 重放保護](/ethereum/accounts/eip-155/) - 簽章中的 chain ID 驗證
- [Nonce](/ethereum/accounts/nonce/) - nonce 連續性檢查
- [Gas](/ethereum/accounts/gas/) - intrinsic gas 和 gas limit 驗證
