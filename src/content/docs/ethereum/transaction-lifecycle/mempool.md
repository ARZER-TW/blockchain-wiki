---
title: "記憶池"
description: "Mempool, Transaction Pool, txpool, 交易池"
tags: [ethereum, mempool, transaction-pool, MEV]
sidebar:
  order: 6
---

# 記憶池

## 概述

記憶池（mempool / transaction pool）是每個 Ethereum 節點維護的本地資料結構，用來暫存已驗證但尚未被包含在區塊中的交易。Mempool 不屬於共識協議的一部分，各節點獨立管理，內容可能不同。交易在 mempool 中按 effective gas price 排序，等待 [區塊 Proposer](/ethereum/transaction-lifecycle/block-production/) 挑選打包。

## 核心原理

### Mempool 結構

主流客戶端（Geth）將 mempool 分為兩個區域：

| 區域 | 說明 | 容量（預設） |
|------|------|-------------|
| **Pending pool** | nonce 連續、可立即執行的交易 | 4,096 筆 |
| **Queued pool** | nonce 不連續（有 gap）的交易 | 1,024 筆 |

交易狀態流轉：

```
新交易進入
    │
    ├── nonce == 帳戶 pending nonce → Pending pool
    │
    └── nonce > 帳戶 pending nonce → Queued pool
                                        │
                                        └── 前序交易確認後 → 自動移入 Pending pool
```

### 排序策略

Pending pool 內的交易按以下規則排序：

1. **同一發送者**：按 nonce 嚴格遞增
2. **不同發送者之間**：按 effective gas price 降序

$$\text{effectiveGasPrice} = \min(\text{maxFeePerGas},\ \text{baseFee} + \text{maxPriorityFeePerGas})$$

Proposer 從排序頂端開始挑選交易，直到區塊 gas limit 用完。

### 交易替換（Replace-by-Fee）

發送同一 nonce 的新交易可以替換 pending 交易，但新交易的 gas price 必須比舊交易高出至少 10%（Geth 預設）：

$$\text{newGasPrice} \geq \text{oldGasPrice} \times 1.1$$

常見用途：
- **加速**：提高 gas price 讓交易更快被打包
- **取消**：發送 value=0、to=自己 的交易覆蓋原交易

### 交易逐出

Mempool 容量有限，當滿載時：

1. 移除 gas price 最低的交易
2. 移除停留時間超過閾值的交易（Geth 預設 3 小時）
3. 同一帳戶在 pending pool 最多 16 筆，queued pool 最多 64 筆
4. baseFee 上升時，`maxFeePerGas < baseFee` 的交易可能被移除

### MEV 與 Mempool

公開 mempool 是 MEV（Maximal Extractable Value）的主要來源。Searcher 監控 mempool 尋找可提取價值的交易：

| MEV 類型 | 說明 | 手法 |
|----------|------|------|
| Frontrun | 搶在目標交易之前執行 | 用更高 gas price 插隊 |
| Backrun | 在目標交易之後執行 | 利用目標交易造成的價格變動 |
| Sandwich | 同時 frontrun + backrun | 在 DEX swap 前後夾擊 |

Post-Merge 後，MEV 生態演化為 PBS（Proposer-Builder Separation）架構：

```
Searcher → Bundle → Builder → Relay → Proposer
```

Builder 從 searcher 收集 bundle，組裝最高價值的區塊，透過 relay 提交給 proposer。Proposer 只需選擇出價最高的區塊。

## 在 Ethereum 中的應用

- **使用者體驗**：pending 交易的等待時間取決於 mempool 競爭程度和 gas price
- **Gas 費用估算**：錢包和 dApp 監控 mempool 狀態來推薦 gas price
- **MEV 保護**：Flashbots Protect 等服務讓交易繞過公開 mempool
- **Blob mempool**：EIP-4844 引入了獨立的 blob 交易 mempool，有不同的容量和費用邏輯

## 程式碼範例

```javascript
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider('http://localhost:8545');
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// --- 1. 查看 pending 交易數量 ---
const pendingCount = await provider.getTransactionCount(wallet.address, 'pending');
const confirmedCount = await provider.getTransactionCount(wallet.address, 'latest');
const inMempool = pendingCount - confirmedCount;
console.log(`Pending in mempool: ${inMempool}`);

// --- 2. 交易加速（Replace-by-Fee） ---
// 假設已有一筆 pending 交易，nonce = 5，gas price 太低
const currentNonce = 5;
const speedUpTx = {
  type: 2,
  to: '0xRecipient', // 原始交易的 to
  value: ethers.parseEther('0.1'), // 原始交易的 value
  nonce: currentNonce,
  maxFeePerGas: ethers.parseUnits('50', 'gwei'), // 大幅提高
  maxPriorityFeePerGas: ethers.parseUnits('5', 'gwei'),
  gasLimit: 21000n,
  chainId: 1n,
};
const speedUpResponse = await wallet.sendTransaction(speedUpTx);
console.log('Speed-up TX:', speedUpResponse.hash);

// --- 3. 交易取消 ---
const cancelTx = {
  type: 2,
  to: wallet.address, // 發給自己
  value: 0n,          // 不轉帳
  nonce: currentNonce, // 覆蓋同一 nonce
  maxFeePerGas: ethers.parseUnits('60', 'gwei'), // 比原交易高 10%+
  maxPriorityFeePerGas: ethers.parseUnits('6', 'gwei'),
  gasLimit: 21000n,
  chainId: 1n,
};
const cancelResponse = await wallet.sendTransaction(cancelTx);
console.log('Cancel TX:', cancelResponse.hash);

// --- 4. 監控 mempool（pending 交易事件） ---
provider.on('pending', (txHash) => {
  console.log('New pending TX:', txHash);
});

// --- 5. 用 Geth debug API 查看 mempool 狀態 ---
// 需要 Geth node 啟用 debug namespace
async function getMempoolStatus() {
  const content = await provider.send('txpool_content', []);
  const pendingCount = Object.keys(content.pending).reduce(
    (sum, addr) => sum + Object.keys(content.pending[addr]).length, 0
  );
  const queuedCount = Object.keys(content.queued).reduce(
    (sum, addr) => sum + Object.keys(content.queued[addr]).length, 0
  );
  console.log(`Pending: ${pendingCount}, Queued: ${queuedCount}`);
}
```

## 相關概念

- [交易生命週期](/ethereum/transaction-lifecycle/transaction-lifecycle/) - 本筆記是流程第五步
- [交易廣播與驗證](/ethereum/transaction-lifecycle/broadcast-validation/) - 流程上一步：通過驗證後進入 mempool
- [區塊生產](/ethereum/transaction-lifecycle/block-production/) - 流程下一步：Proposer 從 mempool 挑選交易
- [Gas](/ethereum/accounts/gas/) - 交易排序的依據
- [EIP-1559 費用市場](/ethereum/accounts/eip-1559/) - baseFee 動態調整影響 mempool 行為
- [Nonce](/ethereum/accounts/nonce/) - 交易排序和替換的關鍵
