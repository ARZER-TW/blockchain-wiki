---
title: "交易生命週期"
description: "Transaction Lifecycle, 交易生命週期概覽"
tags: [ethereum, transaction, lifecycle, hub]
---

# 交易生命週期

## 概述

一筆 Ethereum 交易從使用者意圖到鏈上最終確認，經歷密鑰生成、交易構建、數位簽章、網路廣播、記憶池排隊、區塊打包、共識投票、狀態轉換等階段。每個階段都涉及特定的密碼學原語和協議機制。本筆記作為 Hub，串連整個流程。

## 完整流程圖

```mermaid
flowchart TD
    A[使用者產生交易意圖] --> B[密鑰生成與帳戶創建]
    B --> C[交易構建]
    C --> D[交易簽名]
    D --> E[交易廣播與驗證]
    E --> F[記憶池]
    F --> G[區塊生產]
    G --> H[共識與最終性]
    H --> I[狀態轉換]

    B -.- B1["私鑰 → 公鑰 → 地址<br/>CSPRNG + secp256k1 + Keccak-256"]
    C -.- C1["組裝欄位 + RLP 編碼<br/>nonce / gas / to / value / data"]
    D -.- D1["ECDSA 簽章<br/>產生 v, r, s"]
    E -.- E1["P2P gossip 傳播<br/>節點獨立驗證"]
    F -.- F1["交易排序與替換<br/>gas price 優先佇列"]
    G -.- G1["Proposer 選擇 + 執行交易<br/>RANDAO + Beacon Chain"]
    H -.- H1["Attestation 投票<br/>Casper FFG 最終確認"]
    I -.- I1["EVM 執行<br/>State Trie 更新"]

    style A fill:#1a1a2e,stroke:#e94560,color:#fff
    style B fill:#16213e,stroke:#0f3460,color:#fff
    style C fill:#16213e,stroke:#0f3460,color:#fff
    style D fill:#16213e,stroke:#0f3460,color:#fff
    style E fill:#16213e,stroke:#0f3460,color:#fff
    style F fill:#16213e,stroke:#0f3460,color:#fff
    style G fill:#16213e,stroke:#0f3460,color:#fff
    style H fill:#16213e,stroke:#0f3460,color:#fff
    style I fill:#1a1a2e,stroke:#e94560,color:#fff
```

## 各階段詳解

### 1. 密鑰生成與帳戶創建

使用 [CSPRNG](/fundamentals/cryptography/csprng/) 產生 256-bit 私鑰，透過 [secp256k1](/ethereum/cryptography/secp256k1/) 橢圓曲線乘法推導公鑰，再經 [Keccak-256](/ethereum/cryptography/keccak-256/) 雜湊取後 20 bytes 得到地址。整個過程不需要鏈上操作 -- 帳戶在第一筆交易時才「實體化」到 [State Trie](/ethereum/data-structures/state-trie/) 中。

詳見：[密鑰生成與帳戶創建](/ethereum/transaction-lifecycle/key-generation/)

### 2. 交易構建

組裝交易的各個欄位：[Nonce](/ethereum/accounts/nonce/)（防重放序號）、gas 相關參數（[Gas](/ethereum/accounts/gas/) / [EIP-1559 費用市場](/ethereum/accounts/eip-1559/)）、目標地址、轉帳金額、calldata。Legacy 交易用 [RLP 編碼](/ethereum/data-structures/rlp-encoding/) 序列化；EIP-2718 之後的 typed transaction 在 RLP 前加上 type prefix。

詳見：[交易構建](/ethereum/transaction-lifecycle/transaction-construction/)

### 3. 交易簽名

對序列化後的交易取 [Keccak-256](/ethereum/cryptography/keccak-256/) 雜湊，再用 [ECDSA](/ethereum/cryptography/ecdsa/) 以私鑰簽章，產生 `(v, r, s)` 三個值。`v` 值包含 recovery ID 和 chain ID（[EIP-155 重放保護](/ethereum/accounts/eip-155/)），讓驗證者能用 [ECRECOVER](/ethereum/cryptography/ecrecover/) 從簽章反推出簽署者公鑰。

詳見：[交易簽名](/ethereum/transaction-lifecycle/transaction-signing/)

### 4. 交易廣播與驗證

簽好的交易透過 `eth_sendRawTransaction` RPC 提交給節點，節點驗證簽章有效性、nonce 正確性、餘額充足性後，透過 DevP2P gossip 協議擴散到整個網路。

詳見：[交易廣播與驗證](/ethereum/transaction-lifecycle/broadcast-validation/)

### 5. 記憶池

通過驗證的交易進入節點本地的 mempool。Mempool 不是共識層的一部分，各節點獨立管理。交易按 effective gas price 排序，高價交易優先被打包。使用者可透過相同 nonce 但更高 gas price 的交易替換 pending 交易。

詳見：[記憶池](/ethereum/transaction-lifecycle/mempool/)

### 6. 區塊生產

[Beacon Chain](/ethereum/consensus/beacon-chain/) 透過 [RANDAO](/ethereum/consensus/randao/) 為每個 slot（12 秒）選出一個 Proposer。Proposer 從記憶池挑選交易、在 EVM 中依序執行、組裝 [區塊](/ethereum/consensus/block-structure/)。Execution payload 包含交易列表、state root、receipts root 等。

詳見：[區塊生產](/ethereum/transaction-lifecycle/block-production/)

### 7. 共識與最終性

同一 slot 的 committee 驗證者對區塊投出 [Attestation](/ethereum/consensus/attestation/)。[LMD GHOST](/ethereum/consensus/lmd-ghost/) fork choice rule 決定鏈頭。每 32 slots 為一個 epoch，[Casper FFG](/ethereum/consensus/casper-ffg/) 在 epoch 邊界進行 justify 和 finalize 投票。一個 checkpoint 被 2/3 以上 stake 的驗證者投票後，該 checkpoint 之前的所有區塊獲得最終性，無法被逆轉。

詳見：[共識與最終性](/ethereum/transaction-lifecycle/consensus-finality/)

### 8. 狀態轉換

交易被區塊包含後，EVM 執行交易邏輯：轉帳 ETH、執行合約 bytecode、修改 [Storage Trie](/ethereum/data-structures/storage-trie/)。所有帳戶變更反映到 [State Trie](/ethereum/data-structures/state-trie/)，計算新的 state root 寫入 [區塊 Header](/ethereum/consensus/block-header/)。交易回執記錄 status、gas used、logs，寫入 [Receipt Trie](/ethereum/data-structures/receipt-trie/)。

詳見：[狀態轉換](/ethereum/transaction-lifecycle/state-transition/)

## 時序與延遲

| 階段 | 典型延遲 | 備註 |
|------|----------|------|
| 簽名 | < 1ms | 本地運算 |
| 廣播到多數節點 | 1-3s | DevP2P gossip |
| 進入區塊 | 12s（1 slot） | 取決於 gas price 和 mempool 狀態 |
| 1 confirmation | 12s | 包含在一個區塊中 |
| Justified | ~6.4 min（1 epoch） | 2/3 投票通過 |
| Finalized | ~12.8 min（2 epochs） | 不可逆轉 |

## 交易類型演進

```mermaid
flowchart LR
    L["Type 0<br/>Legacy"] --> A["Type 1<br/>EIP-2930<br/>Access List"]
    A --> B["Type 2<br/>EIP-1559<br/>Fee Market"]
    B --> C["Type 3<br/>EIP-4844<br/>Blob TX"]
    C --> D["Type 4<br/>EIP-7702<br/>Set Code"]

    style L fill:#2d2d2d,stroke:#666,color:#fff
    style A fill:#2d2d2d,stroke:#666,color:#fff
    style B fill:#2d2d2d,stroke:#666,color:#fff
    style C fill:#2d2d2d,stroke:#666,color:#fff
    style D fill:#2d2d2d,stroke:#666,color:#fff
```

- **Type 0 (Legacy)**：gasPrice 統一定價，[RLP 編碼](/ethereum/data-structures/rlp-encoding/) 序列化
- **Type 1 (EIP-2930)**：引入 access list 降低跨合約呼叫 gas 成本
- **Type 2 (EIP-1559)**：baseFee + maxPriorityFeePerGas，費用更可預測
- **Type 3 (EIP-4844)**：引入 blob，大幅降低 L2 data availability 成本（[EIP-4844 Proto-Danksharding](/ethereum/advanced/eip-4844/)）
- **Type 4 (EIP-7702)**：Set Code 交易，[EOA](/ethereum/accounts/eoa/) 可設定委託合約代碼（Pectra，2025/5/7）

### EIP-7702 對交易生命週期的影響

Type 4 交易引入了 `authorization_list` 欄位，改變了交易執行的語義：

1. **交易構建**：除了標準 EIP-1559 欄位外，還需要包含一個 authorization list，每個 entry 指定 `chainId`、`address`（委託目標合約）、`nonce`，並由 EOA 簽名
2. **交易執行**：EVM 處理 authorization list 時，會將簽署者 EOA 的 code 設定為指定的 delegation designation
3. **後續互動**：設定委託後，其他交易呼叫該 EOA 時會執行委託合約的邏輯

這意味著一筆 Type 4 交易同時完成「設定委託」和「執行操作」，使用者體驗上可以把多步操作壓縮成一筆交易。

## 程式碼範例

完整的交易生命週期示範（建立 → 簽名 → 廣播 → 等待確認）：

```javascript
import { ethers } from 'ethers';

// 1. 建立 provider 和 wallet（密鑰生成）
const provider = new ethers.JsonRpcProvider('http://localhost:8545');
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// 2. 構建交易（EIP-1559）
const tx = {
  type: 2,
  to: '0xRecipientAddress',
  value: ethers.parseEther('0.1'),
  nonce: await provider.getTransactionCount(wallet.address, 'pending'),
  maxFeePerGas: ethers.parseUnits('30', 'gwei'),
  maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei'),
  gasLimit: 21000n,
  chainId: 1n,
};

// 3. 簽名（ECDSA over secp256k1）
const signedTx = await wallet.signTransaction(tx);
console.log('Signed TX:', signedTx);

// 4. 廣播到網路
const txResponse = await provider.broadcastTransaction(signedTx);
console.log('TX Hash:', txResponse.hash);

// 5. 等待確認（1 confirmation = 包含在區塊中）
const receipt = await txResponse.wait(1);
console.log('Block:', receipt.blockNumber);
console.log('Gas Used:', receipt.gasUsed.toString());
console.log('Status:', receipt.status === 1 ? 'Success' : 'Failed');

// 6. 等待最終性（可選，需要較長時間）
// Finality 在 PoS 下約需 2 epochs (~12.8 min)
const finalizedBlock = await provider.getBlock('finalized');
const isFinalized = receipt.blockNumber <= finalizedBlock.number;
console.log('Finalized:', isFinalized);
```

## 相關概念

- [密鑰生成與帳戶創建](/ethereum/transaction-lifecycle/key-generation/) - 流程第一步：產生帳戶
- [交易構建](/ethereum/transaction-lifecycle/transaction-construction/) - 流程第二步：組裝交易欄位
- [交易簽名](/ethereum/transaction-lifecycle/transaction-signing/) - 流程第三步：ECDSA 簽章
- [交易廣播與驗證](/ethereum/transaction-lifecycle/broadcast-validation/) - 流程第四步：網路傳播
- [記憶池](/ethereum/transaction-lifecycle/mempool/) - 流程第五步：等待打包
- [區塊生產](/ethereum/transaction-lifecycle/block-production/) - 流程第六步：Proposer 組裝區塊
- [共識與最終性](/ethereum/transaction-lifecycle/consensus-finality/) - 流程第七步：投票確認
- [狀態轉換](/ethereum/transaction-lifecycle/state-transition/) - 流程第八步：執行與狀態更新
- [Ethereum MOC](/ethereum/) - 知識庫主索引
