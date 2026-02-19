---
title: "區塊生產"
description: "Block Production, 區塊打包, 出塊"
tags: [ethereum, block-production, proposer, PoS]
sidebar:
  order: 7
---

# 區塊生產

## 概述

在 PoS Ethereum 中，[Beacon Chain](/ethereum/consensus/beacon-chain/) 透過 [RANDAO](/ethereum/consensus/randao/) 偽隨機機制為每個 slot（12 秒）選出一個 Proposer（[驗證者](/ethereum/consensus/validators/)）。Proposer 從 [記憶池](/ethereum/transaction-lifecycle/mempool/) 挑選交易，在 EVM 中執行，組裝出完整的區塊（包含 execution payload 和 consensus 資料），然後廣播給網路進行 [共識投票](/ethereum/transaction-lifecycle/consensus-finality/)。

## 核心原理

### Slot 與 Epoch

| 概念 | 定義 |
|------|------|
| Slot | 12 秒，區塊生產的最小時間單位 |
| Epoch | 32 slots = 384 秒（6.4 分鐘） |

每個 slot 有一個 proposer 和一個 committee（負責 attestation）。Proposer 在 slot 開始時有 4 秒的窗口廣播區塊。

### Proposer 選擇

Proposer 選擇基於 [RANDAO](/ethereum/consensus/randao/) 混合值（pseudo-random）：

1. 每個 epoch 開始前，用前一個 epoch 的 RANDAO mix 計算 proposer 排程
2. 選擇機率與驗證者的有效餘額成正比（最高 32 ETH）
3. 具體算法：將 RANDAO seed 和 slot 做 hash，結合驗證者集合的 shuffle 結果

$$\text{proposerIndex} = \text{computeProposerIndex}(\text{state}, \text{epoch}, \text{seed})$$

RANDAO seed 本身來自驗證者在出塊時提交的 BLS 簽章（[BLS Signatures](/ethereum/cryptography/bls-signatures/)），每個 epoch 累積更新。

### 區塊組裝流程

```
1. Proposer 被選中
      │
2. 從 mempool 挑選交易
      │  ├── 按 effective gas price 排序
      │  ├── 依序在 EVM 中執行
      │  └── 累計 gas 不超過 block gas limit (30M)
      │
3. 計算 execution payload
      │  ├── state root（Merkle Patricia Trie 根雜湊）
      │  ├── receipts root
      │  ├── logs bloom（Bloom Filter）
      │  └── 其他 header 欄位
      │
4. 組裝 Beacon Block
      │  ├── slot, proposer_index
      │  ├── parent_root（前一區塊根）
      │  ├── state_root（Beacon state）
      │  ├── body: attestations, deposits, execution_payload...
      │  └── RANDAO reveal（BLS 簽章）
      │
5. 簽署並廣播
```

### Execution Payload

Post-Merge 後，區塊分為兩層：

**Consensus layer（Beacon Block）**：
- slot、proposer_index
- attestations、slashings、deposits
- RANDAO reveal
- execution_payload

**Execution layer（Execution Payload）**：
- parentHash、feeRecipient、stateRoot
- receiptsRoot、logsBloom
- baseFeePerGas、gasLimit、gasUsed
- timestamp、extraData
- transactions[]（已序列化的交易列表）

### Block Gas Limit

| 參數 | 值 |
|------|-----|
| Target | 15,000,000 gas |
| Maximum | 30,000,000 gas |
| baseFee 調整 | 區塊 gas > target → baseFee 上升；< target → 下降 |

baseFee 的調整公式（[EIP-1559 費用市場](/ethereum/accounts/eip-1559/)）：

$$\text{baseFee}_{n+1} = \text{baseFee}_n \times \left(1 + \frac{1}{8} \times \frac{\text{gasUsed}_n - \text{target}}{\text{target}}\right)$$

每個區塊 baseFee 最多變動 12.5%。

### PBS（Proposer-Builder Separation）

目前 Ethereum 實務上採用 MEV-Boost 實現的 PBS：

```
Searcher → Bundle → Builder → Relay → Proposer
```

1. **Builder** 從 searcher 收集 bundle 和 mempool 交易，組裝最高價值區塊
2. **Relay** 驗證 builder 的區塊有效性，做為可信中介
3. **Proposer** 收到多個 builder 的出價，選擇最高價的區塊頭簽名
4. Proposer 簽名後，relay 才揭露完整區塊內容

Proposer 不需要自己組裝區塊，只需選擇和簽名，降低了運行複雜 MEV 策略的門檻。

## 在 Ethereum 中的應用

- **交易排序**：交易在區塊中的順序直接影響執行結果（MEV）
- **[Bloom Filter](/ethereum/data-structures/bloom-filter/)**：logsBloom 讓輕客戶端快速過濾相關交易
- **Withdrawals**：PoS 後區塊包含驗證者提款操作
- **Blob 交易**：EIP-4844 的 blob sidecar 和 execution payload 分開處理

## 程式碼範例

```javascript
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider('http://localhost:8545');

// --- 1. 查看最新區塊 ---
const block = await provider.getBlock('latest', true); // true = 包含交易
console.log('Block Number:', block.number);
console.log('Proposer (miner):', block.miner); // PoS 後為 fee recipient
console.log('Gas Used:', block.gasUsed.toString());
console.log('Gas Limit:', block.gasLimit.toString());
console.log('Base Fee:', ethers.formatUnits(block.baseFeePerGas, 'gwei'), 'gwei');
console.log('TX Count:', block.transactions.length);

// --- 2. 分析區塊中的交易排序 ---
const fullBlock = await provider.getBlock(block.number, true);
for (const tx of fullBlock.prefetchedTransactions) {
  const effectiveGasPrice = tx.type === 2
    ? (block.baseFeePerGas + tx.maxPriorityFeePerGas > tx.maxFeePerGas
        ? tx.maxFeePerGas
        : block.baseFeePerGas + tx.maxPriorityFeePerGas)
    : tx.gasPrice;
  console.log(`  ${tx.hash.slice(0, 10)} | ${ethers.formatUnits(effectiveGasPrice, 'gwei')} gwei`);
}

// --- 3. 追蹤 baseFee 趨勢 ---
async function trackBaseFee(numBlocks) {
  const latest = await provider.getBlockNumber();
  const results = [];
  for (let i = 0; i < numBlocks; i++) {
    const b = await provider.getBlock(latest - i);
    results.push({
      number: b.number,
      baseFee: ethers.formatUnits(b.baseFeePerGas, 'gwei'),
      gasUsed: b.gasUsed.toString(),
      utilization: ((Number(b.gasUsed) / Number(b.gasLimit)) * 100).toFixed(1) + '%',
    });
  }
  console.table(results.reverse());
}
await trackBaseFee(10);

// --- 4. 查看 Beacon Chain 資訊（需要 Beacon API） ---
// const beaconUrl = 'http://localhost:5052';
// const headResponse = await fetch(`${beaconUrl}/eth/v1/beacon/headers/head`);
// const headData = await headResponse.json();
// console.log('Slot:', headData.data.header.message.slot);
// console.log('Proposer:', headData.data.header.message.proposer_index);
```

## 相關概念

- [交易生命週期](/ethereum/transaction-lifecycle/transaction-lifecycle/) - 本筆記是流程第六步
- [記憶池](/ethereum/transaction-lifecycle/mempool/) - 流程上一步：交易在此等待打包
- [共識與最終性](/ethereum/transaction-lifecycle/consensus-finality/) - 流程下一步：驗證者對區塊投票
- [Beacon Chain](/ethereum/consensus/beacon-chain/) - 共識層協調 proposer 選擇
- [RANDAO](/ethereum/consensus/randao/) - Proposer 選擇的隨機數來源
- [Validators](/ethereum/consensus/validators/) - 驗證者角色
- [BLS Signatures](/ethereum/cryptography/bls-signatures/) - RANDAO reveal 使用 BLS 簽章
- [區塊結構](/ethereum/consensus/block-structure/) - 完整的區塊格式定義
- [區塊 Header](/ethereum/consensus/block-header/) - Header 各欄位說明
- [EIP-1559 費用市場](/ethereum/accounts/eip-1559/) - baseFee 調整機制
- [Bloom Filter](/ethereum/data-structures/bloom-filter/) - logsBloom 欄位
