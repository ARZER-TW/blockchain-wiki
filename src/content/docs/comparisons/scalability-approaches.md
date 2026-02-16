---
title: "擴容方案比較：L2 vs Sharding vs 平行執行"
description: "Bitcoin Lightning Network + Sidechains vs Ethereum Rollups + Danksharding vs Solana Sealevel + Firedancer, 三大公鏈擴容策略比較"
tags: [comparison, bitcoin, ethereum, solana, scalability, layer2, rollups, sharding, sealevel, firedancer, lightning-network]
---

# 擴容方案比較：L2 vs Sharding vs 平行執行

## 概述

區塊鏈的「不可能三角」（Scalability Trilemma）指出去中心化、安全性和擴展性三者之間的張力。面對這個根本挑戰，三大公鏈選擇了截然不同的擴容路線：Bitcoin 堅持小區塊策略，將擴容責任交給 Layer 2（[Lightning Network](/bitcoin/advanced/lightning-network/)、Sidechains）；Ethereum 選擇 rollup-centric roadmap，結合 [EIP-4844](/ethereum/advanced/eip-4844/) blob 交易和未來的 Full Danksharding 來擴展資料可用性；Solana 則在 Layer 1 直接追求硬體級效能，透過 [Sealevel](/solana/runtime/svm-sealevel/) 平行執行和 [Firedancer](/solana/advanced/firedancer/) 驗證器客戶端實現水平擴展。

這三種路線代表了對區塊鏈擴展性的三種根本信念：Bitcoin 認為基礎層應保持極簡，擴展在更上層完成；Ethereum 認為基礎層應提供最大的資料可用性，讓 Layer 2 承擔執行；Solana 認為硬體和網路技術的進步可以讓基礎層本身足夠快。

值得注意的是，這三種路線並非互斥。Ethereum 同時也在研究 L1 平行執行；Solana 生態中也出現了 rollup 和 SVM chain 等 L2 嘗試。擴容是一個多維問題，每條鏈都在不同維度上持續探索。

## 快速比較表

| 屬性 | Bitcoin | Ethereum | Solana |
|------|---------|----------|--------|
| 主要策略 | Layer 2（Lightning、Sidechains） | Rollups + Danksharding | L1 平行執行 + 硬體擴展 |
| L1 理論 TPS | ~7 | ~30 | ~4,000（實測）/ ~65,000（理論） |
| 含 L2 理論 TPS | 數百萬（Lightning） | ~100,000+（rollups 彙總） | ~1,000,000+（Firedancer 目標） |
| 資料可用性 | 全節點存全量資料 | [EIP-4844](/ethereum/advanced/eip-4844/) blobs + 未來 DAS | [Turbine](/solana/consensus/turbine/) erasure coding |
| 區塊大小/Gas | 4M weight units | 30M gas + 6 blobs/block | 48M compute units/block |
| 最終性 | ~60 min | ~13 min | ~6.4 s |
| 節點硬體要求 | 低（Raspberry Pi 可跑） | 中等 | 高（專用硬體推薦） |
| 去中心化程度 | 最高（~20,000 full nodes） | 高（~7,000 nodes） | 中等（~2,000 validators） |

## 擴容架構對比

<pre class="mermaid">
graph TB
    subgraph Bitcoin["Bitcoin: L2 擴容"]
        BL1[Bitcoin L1<br/>~7 TPS, 10 min blocks] --> BLN[Lightning Network<br/>即時支付通道]
        BL1 --> BSC[Sidechains<br/>Liquid, RSK]
        BL1 --> BDV[Drivechain<br/>BIP-300/301]
        BLN --> BHTLC[HTLC 路由<br/>數百萬 TPS 理論值]
    end

    subgraph Ethereum["Ethereum: Rollup-Centric"]
        EL1[Ethereum L1<br/>~30 TPS, 12s slots] --> EOR[Optimistic Rollups<br/>Optimism, Arbitrum]
        EL1 --> EZR[ZK Rollups<br/>zkSync, StarkNet]
        EL1 --> E4844[EIP-4844 Blobs<br/>低成本 DA]
        E4844 --> EDS[Full Danksharding<br/>DAS 路線圖]
    end

    subgraph Solana["Solana: L1 效能"]
        SL1[Solana L1<br/>~4000 TPS, 400ms slots] --> SSL[Sealevel<br/>平行交易執行]
        SL1 --> SFD[Firedancer<br/>獨立驗證器客戶端]
        SL1 --> STB[Turbine<br/>高效區塊傳播]
        SFD --> SGOAL[目標: 1M+ TPS]
    end
</pre>

## Bitcoin：Layer 2 擴容

### 設計哲學

Bitcoin 社群普遍認為基礎層的首要任務是安全性和去中心化，而非吞吐量。Satoshi 的原始設計刻意限制了區塊大小（1MB，SegWit 後等效 ~4MB weight），確保普通用戶也能運行全節點。擴容的重任交給了建構在 L1 之上的 Layer 2 協議。

### Lightning Network

[Lightning Network](/bitcoin/advanced/lightning-network/) 是 Bitcoin 最成熟的 Layer 2 方案：

- **機制**：兩方透過 2-of-2 multisig 在鏈上鎖定資金，後續的餘額更新完全在鏈下進行。透過 [HTLC](/bitcoin/advanced/htlc/) 串聯多條通道實現多跳路由。
- **容量**：約 5,000 BTC 鎖定、60,000+ 通道、15,000+ 節點
- **延遲**：毫秒級支付確認
- **限制**：需要接收方在線、通道容量限制、路由失敗率、鏈上結算仍受 L1 速度限制

### Sidechains

- **Liquid Network**（Blockstream）：聯邦式側鏈，~1 分鐘區塊時間，支援 Confidential Transactions
- **RSK**（Rootstock）：合併挖礦的 EVM 相容側鏈，~30 秒區塊時間
- **Stacks**：使用 Proof of Transfer（PoX）與 Bitcoin L1 錨定

### 吞吐量分析

$$\text{Bitcoin L1 TPS} \approx \frac{4{,}000{,}000 \text{ WU}}{600\text{s} \times 560 \text{ WU/tx}} \approx 7 \text{ TPS}$$

Lightning Network 理論上不受 L1 限制，每個通道可處理的交易數僅受網路延遲限制，彙總網路容量可達每秒數百萬筆。

### 其他 L2 探索

Bitcoin 生態中還有多種 L2 嘗試：

| 方案 | 類型 | 信任模型 | 狀態 |
|------|------|---------|------|
| Lightning | Payment channels | 無信任（鏈上仲裁） | 生產中 |
| Liquid | Federated sidechain | 聯邦（11-of-15 functionaries） | 生產中 |
| RSK | Merge-mined sidechain | PoW + federation | 生產中 |
| Stacks | PoX L2 | Proof of Transfer | 生產中 |
| BitVM | Optimistic compute | Fraud proof（類似 Optimistic Rollup） | 開發中 |
| Ark | Virtual UTXO (vTXO) | 服務提供者 + 單邊退出 | 實驗性 |

### 優勢與限制

**優勢**：保持 L1 極度去中心化、Lightning 支付近乎即時且接近零費用、不需要信任第三方（通道內）、BitVM 展示了無需 L1 變更的 rollup 可能性

**限制**：Lightning 使用體驗仍有摩擦（通道管理、流動性）、Sidechains 多為聯邦式信任模型、L1 結算速度慢限制了 L2 退出的即時性

## Ethereum：Rollup-Centric Roadmap

### 設計哲學

Ethereum 在 2020 年明確了 rollup-centric roadmap：L1 的核心任務是提供資料可用性（Data Availability）和共識安全性，將執行擴展交給 Layer 2 rollups。[EIP-4844](/ethereum/advanced/eip-4844/) 是這條路線的關鍵里程碑，而未來的 Full Danksharding 將進一步擴展 DA 容量。

### Rollup 類型

**Optimistic Rollups**（Optimism、Arbitrum）：
- 假設交易有效，設置 7 天挑戰期（fraud proof）
- 與 EVM 高度相容
- 挑戰期內資金退出延遲

**ZK Rollups**（zkSync、StarkNet、Scroll）：
- 使用零知識證明確保有效性（validity proof）
- 即時最終性（證明驗證後）
- 證明生成計算成本高

### EIP-4844 與 Danksharding

[EIP-4844](/ethereum/advanced/eip-4844/) 引入 blob 交易，為 rollups 提供低成本的鏈上資料空間：

- 每個 blob 128KB，每個區塊最多 6 個 blobs
- 獨立的 blob fee market（與 execution gas 分離）
- 資料約 18 天後自動過期（非永久存儲）
- Dencun 升級後 rollup 費用下降約 90%

未來 Full Danksharding 目標：
- 每個區塊 64-256 個 blobs
- Data Availability Sampling（DAS）讓輕節點也能驗證
- 結合 [Verkle Trees](/ethereum/advanced/verkle-trees/) 實現無狀態客戶端

### 吞吐量分析

$$\text{Ethereum L1 TPS} \approx 30 \text{ TPS}$$

$$\text{Blob DA capacity} = 6 \times 128\text{KB} = 768\text{KB/block} \approx 64\text{KB/s}$$

Rollup 壓縮後每筆交易約 10-20 bytes，因此：

$$\text{Rollup TPS (via blobs)} \approx \frac{64{,}000}{15} \approx 4{,}000 \text{ TPS (all rollups combined)}$$

Full Danksharding（128 blobs）預計可將此數字提升至 ~100,000+ TPS。

### Rollup 生態版圖

| Rollup | 類型 | TPS（實測） | TVL（估計） | 特色 |
|--------|------|-----------|-----------|------|
| Arbitrum One | Optimistic | ~40 | >$10B | 最大 TVL，EVM 等效 |
| Optimism (OP Mainnet) | Optimistic | ~30 | >$5B | OP Stack 開放框架 |
| Base | Optimistic (OP Stack) | ~30 | >$5B | Coinbase 支持 |
| zkSync Era | ZK | ~20 | >$1B | ZK + EVM 相容 |
| StarkNet | ZK (STARK) | ~15 | >$500M | Cairo 語言，STARK 證明 |
| Scroll | ZK | ~10 | >$500M | EVM 等效 ZK rollup |
| Linea | ZK | ~15 | >$500M | Consensys 支持 |

### 跨 Rollup 互操作性

Rollup 碎片化是 Ethereum 擴容路線面臨的主要挑戰。正在發展的解決方案包括：

- **Shared Sequencing**：多個 rollup 共享 sequencer，實現原子跨 rollup 交易
- **Based Rollup**：由 L1 proposer 負責 rollup 排序，天然繼承 L1 的互操作性
- **Superchain**（OP Stack）：Optimism 的 rollup 聯盟，共享安全性和標準
- **Intent-based Bridges**：使用者表達意圖，solver 跨 rollup 執行

### 優勢與限制

**優勢**：繼承 L1 安全性、ZK rollups 可實現即時最終性、模組化架構靈活、不同 rollup 可針對不同場景優化

**限制**：Optimistic rollup 有 7 天挑戰期、跨 rollup 互操作性仍在發展中、Full Danksharding 實現時間未定、複雜性增加了開發和使用門檻

## Solana：L1 平行執行

### 設計哲學

Solana 的核心理念是「軟體不應成為硬體的瓶頸」。透過在協議層面充分利用現代硬體的多核心、高頻寬和 GPU 加速能力，Solana 試圖在 L1 直接達到網際網路級別的吞吐量，而不依賴 Layer 2 的複雜架構。

### Sealevel 平行執行引擎

[Sealevel](/solana/runtime/svm-sealevel/) 是 Solana 的交易執行引擎：

- 交易預先聲明讀寫帳戶，runtime 根據帳戶依賴關係建構衝突圖
- 不衝突的交易可在多核心上平行執行
- 類似資料庫的樂觀並行控制（OCC）策略
- 充分利用現代 CPU 的多核心特性

### Firedancer

[Firedancer](/solana/advanced/firedancer/) 是由 Jump Crypto 開發的獨立 Solana 驗證器客戶端：

- 完全用 C 語言從頭重寫（非 Rust 客戶端的 fork）
- 目標吞吐量：1,000,000+ TPS
- 針對網路 I/O、簽名驗證、交易排程進行底層優化
- 增加客戶端多樣性，提升網路韌性

### Turbine 區塊傳播

[Turbine](/solana/consensus/turbine/) 是 Solana 的區塊傳播協議：

- 類似 BitTorrent 的分層傳播架構
- 使用 erasure coding 減少重傳需求
- 將區塊切成 shred 分發給不同的 validator 群組
- 降低 leader 的頻寬需求

### 吞吐量分析

$$\text{Solana 實測 TPS} \approx 3{,}000 - 5{,}000 \text{ TPS (including vote txs)}$$

$$\text{Non-vote TPS} \approx 400 - 2{,}000 \text{ TPS}$$

Firedancer 內部測試已達到 600,000+ TPS 的單一客戶端處理能力。

### 硬體要求

Solana 的 L1 擴容路線直接反映在其驗證器硬體要求上：

| 規格 | 推薦值 |
|------|--------|
| CPU | 24+ 核心，3.0 GHz+ |
| RAM | 512 GB |
| Storage | NVMe SSD，2+ TB |
| Network | 1 Gbps 對稱頻寬 |
| GPU | 可選（用於 PoH 加速） |

這些要求遠高於 Bitcoin 和 Ethereum 的全節點需求，但 Solana 團隊認為這些規格在未來 5-10 年內將成為消費級硬體的標準。

### SVM Chain 與 L2 嘗試

儘管 Solana 的主要策略是 L1 擴展，但生態中也出現了基於 SVM 的擴展嘗試：

- **Eclipse**：使用 SVM 作為 execution layer，Ethereum 作為 settlement layer 的 rollup
- **Neon EVM**：在 Solana 上運行 EVM 相容環境
- **NetworkExtensions**：Solana 自身的 rollup/appchain 框架提案

### 優勢與限制

**優勢**：極低延遲（~400ms slot time）、使用者體驗接近 Web2、無需管理 L2 橋接、單一全局狀態簡化開發

**限制**：高硬體要求降低了 validator 門檻的包容性、歷史上曾多次因驗證器 bug 導致網路中斷、狀態增長需要積極管理（[rent](/solana/account-model/rent/)）

## 深度比較

### 擴容哲學三角

<pre class="mermaid">
graph LR
    A[去中心化優先<br/>Bitcoin] --- B[DA 擴展 + L2 執行<br/>Ethereum]
    B --- C[L1 效能優先<br/>Solana]
    C --- A

    A -.- A1[小區塊 + Lightning<br/>任何人可跑全節點]
    B -.- B1[Rollup-centric<br/>模組化分層]
    C -.- C1[硬體摩爾定律<br/>平行執行最大化]
</pre>

### 安全性與信任假設

| 層面 | Bitcoin L2 | Ethereum L2 | Solana L1 |
|------|-----------|-------------|-----------|
| 結算安全性 | Bitcoin PoW（最高） | Ethereum PoS + rollup 證明 | Solana PoS |
| 資料可用性 | L1 全量（Lightning 鏈下） | Blobs + 未來 DAS | Turbine + erasure coding |
| 退出機制 | 通道關閉（L1 交易） | Rollup bridge（7天 or 即時） | N/A（已在 L1） |
| 活性假設 | Lightning 需要在線監控 | Sequencer 活性（可 force exit） | 2/3 validators 在線 |

### 實際效能指標（2024-2025 數據）

| 指標 | Bitcoin + Lightning | Ethereum + Rollups | Solana |
|------|-------------------|-------------------|--------|
| L1 平均費用 | $1-10 | $0.5-5 | $0.001-0.01 |
| L2 平均費用 | < $0.01（Lightning） | $0.01-0.1（post-4844） | N/A |
| 支付延遲 | ~1s（LN）/ ~60min（L1） | ~1s（L2）/ ~13min（L1 finality） | ~0.4s |
| 節點儲存需求 | ~600GB（full node） | ~1TB（archive node） | ~100TB+（含歷史） |

## 實際影響

### 對開發者

- **Bitcoin**：L2 開發需要深入理解支付通道協議、HTLC 和 BOLT 規範。開發工具較為稀缺。
- **Ethereum**：rollup 開發可直接使用 Solidity，但需要考慮 L1/L2 之間的訊息傳遞和資產橋接。多 rollup 環境下的流動性碎片化是挑戰。
- **Solana**：開發者在單一 L1 環境中工作，無需處理跨層互操作。但需要理解平行執行的約束和帳戶模型。

### 對使用者

- **Bitcoin**：Lightning 使用者體驗持續改善（自動通道管理、LSP），但仍不如傳統支付。L1 交易在擁塞時費用可能飆升。
- **Ethereum**：使用者需要面對多 rollup 選擇、橋接風險和跨鏈資產管理。但 rollup 內的體驗已趨近 L1。
- **Solana**：使用者享受最流暢的鏈上體驗，但需要承受網路偶爾的不穩定。

### 對生態系

各鏈的擴容策略塑造了各自的生態特徵：Bitcoin 的 Lightning 生態聚焦於支付場景；Ethereum 的 rollup 生態形成了豐富但碎片化的 DeFi 版圖；Solana 的統一 L1 生態在速度敏感的應用（DEX、社交、遊戲）中表現突出。

## 相關概念

- [Lightning Network](/bitcoin/advanced/lightning-network/) - Bitcoin L2 支付通道網路
- [EIP-4844 Proto-Danksharding](/ethereum/advanced/eip-4844/) - Ethereum blob 交易與 DA 擴展
- [SVM/Sealevel](/solana/runtime/svm-sealevel/) - Solana 平行執行引擎
- [Firedancer](/solana/advanced/firedancer/) - Jump Crypto 開發的 Solana 驗證器客戶端
- [Verkle Trees](/ethereum/advanced/verkle-trees/) - Ethereum 無狀態客戶端的基礎資料結構
- [Compact Blocks](/bitcoin/network/compact-blocks/) - Bitcoin 區塊壓縮傳播協議
- [Turbine](/solana/consensus/turbine/) - Solana 分層區塊傳播協議
- [資料可用性比較](/comparisons/data-availability/) - 三鏈 DA 方案的深度比較
- [Payment Channels](/bitcoin/advanced/payment-channels/) - Lightning 的基礎：雙向支付通道
- [HTLC](/bitcoin/advanced/htlc/) - Hash Time-Locked Contract，Lightning 路由核心
- [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) - Bitcoin L1 的共識機制
- [Beacon Chain](/ethereum/consensus/beacon-chain/) - Ethereum PoS 共識的核心
- [Gulf Stream](/solana/consensus/gulf-stream/) - Solana 的無 mempool 交易轉發機制
