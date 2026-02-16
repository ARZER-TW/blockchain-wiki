---
title: "資料可用性方案比較"
description: "Bitcoin Full Block Data vs Ethereum EIP-4844 Blobs + DAS Roadmap vs Solana Turbine + Erasure Coding, 三大公鏈資料可用性方案比較"
tags: [comparison, bitcoin, ethereum, solana, data-availability, eip-4844, blobs, turbine, erasure-coding, danksharding]
---

# 資料可用性方案比較

## 概述

資料可用性（Data Availability, DA）是區塊鏈安全性的核心問題之一：當一個區塊被提議時，網路中的節點如何確認該區塊的所有交易資料確實已被公開且可供任何人下載驗證？如果區塊生產者隱藏了部分資料，其他節點就無法完整重建和驗證狀態，整個系統的安全假設便會崩塌。

三大公鏈對 DA 的處理方式截然不同。Bitcoin 採用最保守的全量複製策略——每個全節點都完整下載並驗證每個區塊的所有資料。Ethereum 在 [EIP-4844](/ethereum/advanced/eip-4844/) 中引入了 blob 交易，為 Layer 2 提供專屬的 DA 空間，並在路線圖中規劃了 Data Availability Sampling（DAS）讓輕節點也能概率性驗證資料可用性。Solana 透過 [Turbine](/solana/consensus/turbine/) 協議的 erasure coding 和分層傳播，在高吞吐量下確保資料快速分發到全網。

DA 問題之所以重要，是因為它直接決定了區塊鏈的擴展上限。區塊越大，DA 的頻寬和儲存需求越高，能運行節點的參與者越少，去中心化程度就越低。三條鏈對這個權衡的不同選擇，反映了它們各自的設計優先順序。

## 快速比較表

| 屬性 | Bitcoin | Ethereum | Solana |
|------|---------|----------|--------|
| DA 策略 | 全量複製 | Blob + 未來 DAS | Turbine erasure coding |
| 區塊資料量 | ~1-4MB/block | ~130KB execution + ~768KB blobs | ~32MB/slot（shreds） |
| 資料保留期 | 永久（全節點） | Execution 永久 / Blob ~18 天 | Ledger 可修剪（~2 epoch） |
| 資料傳播方式 | P2P gossip + [Compact Blocks](/bitcoin/network/compact-blocks/) | gossipsub (libp2p) | [Turbine](/solana/consensus/turbine/) 分層傳播 |
| 輕節點 DA 驗證 | SPV（僅驗證 header） | 未來 DAS（隨機取樣） | 不支援（需要全量） |
| DA 成本模型 | 隱含在交易費（sat/vByte） | 獨立 blob fee market | 隱含在 compute units |
| Erasure coding | 無 | Blob 使用 KZG + Reed-Solomon（路線圖） | Turbine 使用 Reed-Solomon |

## DA 架構對比

<pre class="mermaid">
graph TB
    subgraph Bitcoin["Bitcoin: 全量複製"]
        BB[Block Producer] -->|完整區塊| BN1[Full Node 1]
        BB -->|完整區塊| BN2[Full Node 2]
        BB -->|完整區塊| BN3[Full Node N]
        BN1 -.->|SPV proof| BSP[SPV Client]
    end

    subgraph Ethereum["Ethereum: Blob + DAS"]
        EP[Proposer] -->|Execution Block| EN1[Full Node]
        EP -->|Blob Sidecar| EN2[Full Node]
        EN1 -.->|DAS Sampling| ELC[Light Client]
        EP -->|KZG Commitment| EV[Verifier]
    end

    subgraph Solana["Solana: Turbine"]
        SL[Leader] -->|Shreds Layer 0| SV1[Validator Group 1]
        SV1 -->|Retransmit Layer 1| SV2[Validator Group 2]
        SV2 -->|Retransmit Layer 2| SV3[Validator Group 3]
        SL -.->|Erasure shreds| SR[Recovery possible<br/>from any 2/3 subset]
    end
</pre>

## Bitcoin：全量複製

### 設計哲學

Bitcoin 對 DA 採用最保守的策略：每個全節點都必須下載、驗證並儲存每一個區塊的完整資料。這種設計犧牲了擴展性，換取了最強的 DA 保證——只要一個誠實節點存在，任何人都可以從它獲取完整的鏈歷史。

### 區塊資料結構

[Bitcoin 區塊](/bitcoin/data-structures/bitcoin-block-structure/)包含：

- **Block header**（80 bytes）：prev_hash、merkle_root、timestamp、bits、nonce
- **Transaction list**：Coinbase tx + 所有交易
- **SegWit witness data**：簽名和腳本見證資料

區塊大小限制：

$$\text{maxBlockWeight} = 4{,}000{,}000 \text{ weight units}$$

$$\text{effectiveSize} \approx 1 - 2 \text{ MB (typical)}, \text{max} \approx 4 \text{ MB}$$

### Compact Blocks (BIP-152)

[Compact Blocks](/bitcoin/network/compact-blocks/) 透過只傳送交易短 ID（而非完整交易）來減少區塊傳播的頻寬消耗。接收節點用本地 mempool 中已有的交易來重建完整區塊，僅在缺少某些交易時才請求完整資料。

$$\text{compactBlockSize} \approx 80 + 8n + \text{missing\_txs}$$

其中 $n$ 是區塊中的交易數量，$8n$ 是短 ID 的總大小。

### DA 成本

Bitcoin 的 DA 成本完全隱含在交易手續費中。每 byte 的鏈上資料都會永久被所有全節點儲存，因此儲存成本透過 fee rate（sat/vByte）反映出來。

$$\text{DA cost per byte} = \text{feeRate} \times 4 \text{ (non-witness) or } \text{feeRate} \times 1 \text{ (witness)}$$

SegWit 的 witness discount（witness data 只佔 1/4 weight）本質上就是一種 DA 成本的差異化定價。

### SPV 與 DA 的關係

SPV（Simplified Payment Verification）客戶端只下載 block header（80 bytes），透過 Merkle proof 驗證特定交易是否包含在區塊中。然而，SPV 客戶端無法驗證區塊中所有資料的可用性——它信任礦工已經驗證了完整區塊。這被稱為「DA 假設」，是 SPV 安全模型的基礎弱點。

$$\text{SPV proof size} = 80 + 32 \times \lceil \log_2(n) \rceil \text{ bytes}$$

其中 $n$ 是區塊中的交易數量。對於一個包含 2,000 筆交易的區塊，Merkle proof 約為 80 + 32 * 11 = 432 bytes。

### Assumevalid 與 AssumeUTXO

Bitcoin Core 使用兩種機制加速初始同步：

- **Assumevalid**：跳過特定區塊高度之前的腳本驗證（仍下載全部資料）
- **AssumeUTXO**：載入預先計算的 UTXO set 快照，允許節點在完整驗證完成前即可開始使用

這些機制本質上是 DA 和驗證效率之間的工程妥協。

### 優勢與限制

**優勢**：最強的 DA 保證、資料永久保存、SPV proof 支援輕節點驗證 header、極度去中心化（~20,000 full nodes）

**限制**：擴展性極度受限、全節點儲存需求持續增長（~600GB）、無 DA sampling 機制、輕節點無法獨立驗證資料可用性

## Ethereum：Blob + DAS Roadmap

### 設計哲學

Ethereum 認為 DA 是 L1 應該提供的核心基礎設施，但不同類型的資料有不同的保留需求。Execution data（狀態和交易）需要永久存儲，而 rollup 的 DA 資料只需要在挑戰期內可用。[EIP-4844](/ethereum/advanced/eip-4844/) 的 blob 交易正是基於這個認知設計的。

### EIP-4844 Blob 機制

Blob 交易（Type 3）為 rollups 提供專屬的 DA 通道：

| 參數 | 值 |
|------|-----|
| Blob 大小 | 128 KB（4096 個 field elements） |
| 每區塊 Blob 數量 | 目標 3，最大 6 |
| 每區塊 Blob 容量 | 384-768 KB |
| 資料保留期 | ~18 天（4096 epochs） |
| 承諾方案 | [KZG Commitments](/ethereum/advanced/kzg-commitments/) |
| Fee market | 獨立的 blob base fee（類似 EIP-1559） |

### KZG Commitment 驗證

每個 blob 附帶一個 KZG commitment，讓驗證者可以在不下載完整 blob 的情況下驗證其正確性：

$$C = \sum_{i=0}^{4095} f_i \cdot G_i$$

其中 $f_i$ 是 blob 中第 $i$ 個 field element，$G_i$ 是 trusted setup 產生的結構化參考字串（SRS）中的第 $i$ 個點。

驗證一個 evaluation point：

$$e(C - [y]_1, [1]_2) = e(\pi, [\tau - z]_2)$$

### Full Danksharding 路線圖

Full Danksharding 是 EIP-4844 的最終形態：

1. **增加 blob 數量**：從 6 個/block 提升到 64-256 個
2. **Data Availability Sampling (DAS)**：輕節點隨機取樣少量 blob chunks，透過 erasure coding 的數學特性，只要取樣成功率超過閾值，就能以高概率確認完整資料可用
3. **2D KZG**：在行和列兩個維度上進行 erasure coding 和 KZG commitment，讓取樣更高效
4. **Proposer-Builder Separation (PBS)**：將區塊構建和提議分離，避免單一實體需要處理所有 blob 資料

<pre class="mermaid">
flowchart LR
    A[EIP-4844<br/>6 blobs/block<br/>2024] --> B[PeerDAS<br/>DAS via gossip<br/>Pectra+]
    B --> C[Full Danksharding<br/>64-256 blobs/block<br/>路線圖]
    C --> D[2D KZG + PBS<br/>完全無狀態 DA 驗證]
</pre>

### DA 吞吐量

$$\text{Current DA throughput} = \frac{6 \times 128\text{KB}}{12\text{s}} = 64 \text{ KB/s}$$

$$\text{Full Danksharding target} = \frac{256 \times 128\text{KB}}{12\text{s}} \approx 2.7 \text{ MB/s}$$

### Blob Fee Market

Blob gas 有獨立於 execution gas 的定價機制，類似 EIP-1559：

$$\text{blobBaseFee}_{n+1} = \text{blobBaseFee}_n \times e^{\frac{\text{blobGasUsed} - \text{targetBlobGas}}{\text{targetBlobGas} \times \text{updateFraction}}}$$

- **Target**：3 blobs/block（393,216 blob gas）
- **Max**：6 blobs/block（786,432 blob gas）
- 實際使用量低於 target 時 fee 下降，高於 target 時上升
- Blob base fee 可以趨近於零（當 blob space 利用率低時）

### DA 層與 Rollup 的關係

Rollup 使用 blob space 的流程：

1. Rollup sequencer 將一批 L2 交易壓縮打包
2. 將壓縮資料作為 blob 附加到 L1 Type 3 交易中
3. L1 共識確保 blob 資料在 ~18 天內可用
4. 挑戰期內（Optimistic: 7 天）任何人都可以下載 blob 資料驗證 fraud proof
5. Blob 過期後，rollup 的 DA obligation 已滿足

### 優勢與限制

**優勢**：DA 和 execution 分離定價、blob 過期減少長期儲存壓力、KZG 提供數學可驗證性、DAS 路線圖讓輕節點也能驗證 DA

**限制**：KZG trusted setup 依賴（Powers of Tau ceremony）、目前 blob 容量仍有限（768KB/block）、Full Danksharding 實現時間未確定、blob 過期後 rollup 需要自行確保歷史資料可取得

## Solana：Turbine + Erasure Coding

### 設計哲學

Solana 面對的 DA 挑戰與 Bitcoin 和 Ethereum 截然不同：在每秒數千筆交易的吞吐量下，區塊資料量巨大，傳統的 gossip 傳播根本無法在 400ms 的 slot time 內完成。[Turbine](/solana/consensus/turbine/) 協議是 Solana 為解決高吞吐量 DA 而設計的專用方案。

### Turbine 傳播機制

Turbine 將區塊資料切分成小片段（shred），透過分層架構傳播：

1. **Leader** 產生區塊後，將其切分為 data shreds 和 coding shreds（Reed-Solomon erasure coding）
2. **Layer 0**：Leader 將不同 shreds 發送給第一層的不同 validator 群組
3. **Layer 1**：每個 validator 將收到的 shred 轉發給下一層的 validator 群組
4. **Layer N**：持續向下傳播直到所有 validator 都收到足夠的 shreds

### Erasure Coding

Solana 使用 Reed-Solomon erasure coding 將每個 FEC（Forward Error Correction）group 編碼：

$$\text{originalShreds} = 32, \quad \text{codingShreds} = 32$$

$$\text{recovery threshold} = \text{any 32 of 64 shreds}$$

這意味著即使丟失了 50% 的 shreds，接收者也能完整恢復原始資料。

### 資料量分析

$$\text{shredSize} = 1228 \text{ bytes (payload)}$$

$$\text{shredsPerBlock} \approx 25{,}000 - 50{,}000 \text{ (depending on block size)}$$

$$\text{blockDataSize} \approx 30 - 60 \text{ MB/slot (including coding shreds)}$$

### Ledger 儲存與修剪

Solana 的完整 ledger 增長速度極快（每天 ~100GB+），因此大多數 validator 會修剪（prune）歷史 ledger：

- 預設保留最近 2 個 epoch 的完整 ledger（~4-5 天）
- RPC 節點通常保留更長的歷史
- 歸檔節點（Warehouse nodes / Bigtable）儲存完整歷史
- Genesis 回溯需要歸檔服務（如 Google Bigtable）

### Shred 結構詳解

每個 shred 包含以下欄位：

```
Shred (Data Shred):
  common_header:
    signature: Ed25519 Signature (64 bytes)
    shred_variant: u8
    slot: u64
    index: u32
    version: u16
    fec_set_index: u32
  data_header:
    parent_offset: u16
    flags: u8
    size: u16
  payload: [u8; 1228]  // actual data
```

Leader 對每個 shred 簽名，接收方可以驗證 shred 確實來自合法的 leader，防止惡意節點注入偽造的區塊資料。

### 優勢與限制

**優勢**：在高吞吐量下仍能快速傳播區塊資料、erasure coding 提供容錯能力、分層架構降低 leader 的頻寬需求、shred 簽名防止偽造

**限制**：不支援 DA sampling（輕節點無法獨立驗證）、ledger 增長極快需要積極修剪、歷史資料存取依賴歸檔服務、validator 頻寬要求高

## 深度比較

### DA 成本模型

| 維度 | Bitcoin | Ethereum | Solana |
|------|---------|----------|--------|
| 1 MB 資料上鏈成本 | ~$50-500（視 fee rate） | ~$0.01-0.1（blob fee）| ~$0.001（transaction fees） |
| 永久儲存 | 是 | Execution 是 / Blob 否 | 否（可修剪） |
| 定價機制 | 市場競標（fee rate） | EIP-4844 blob fee market | Compute unit pricing |
| 價格波動性 | 高 | 中（blob fee 較穩定） | 低 |

### DA 安全性比較

<pre class="mermaid">
graph LR
    subgraph 安全性模型
        BDA["Bitcoin DA<br/>- 全節點驗證 100% 資料<br/>- SPV 只驗證 header<br/>- 最強但最慢"]
        EDA["Ethereum DA<br/>- 全節點驗證 execution + blobs<br/>- 未來 DAS 輕節點取樣<br/>- KZG 數學保證"]
        SDA["Solana DA<br/>- Validator 各收部分 shreds<br/>- Erasure coding 容錯<br/>- 無獨立 DA 驗證"]
    end
</pre>

### DA 擴展性上限

$$\text{Bitcoin DA ceiling} = \frac{4\text{MB}}{600\text{s}} \approx 6.7 \text{ KB/s}$$

$$\text{Ethereum DA ceiling (current)} = \frac{768\text{KB}}{12\text{s}} = 64 \text{ KB/s}$$

$$\text{Ethereum DA ceiling (Danksharding)} \approx 2.7 \text{ MB/s}$$

$$\text{Solana DA ceiling} = \frac{32\text{MB}}{0.4\text{s}} = 80 \text{ MB/s}$$

## 實際影響

### 對開發者

- **Bitcoin 開發者**面對最有限的 DA 空間，每 byte 都很昂貴。Inscriptions（Ordinals）的出現展示了社群對鏈上 DA 的需求。
- **Ethereum 開發者**（特別是 rollup 開發者）需要理解 blob fee market、KZG commitment 和資料過期的影響。DA 成本是 rollup 經濟模型的核心。
- **Solana 開發者**不需要擔心 DA 成本，但需要意識到歷史資料不一定可從鏈上直接取得。

### 對使用者

DA 方案的差異對使用者主要體現在費用和安全保證上。Bitcoin 使用者支付最高的 DA 成本但獲得最強的永久保存保證；Ethereum rollup 使用者享受 blob 帶來的低費用但需要信任 rollup 運營者在 blob 過期前處理好資料歸檔；Solana 使用者幾乎感受不到 DA 成本，但歷史交易的查詢可能需要依賴第三方歸檔服務。

### 對生態系

DA 是模組化區塊鏈論述的核心主題。Celestia、EigenDA 等專用 DA 層的出現，為 rollups 提供了除 Ethereum L1 之外的 DA 選擇。Bitcoin 社群中對區塊空間使用方式的爭論（Ordinals 與傳統交易）本質上也是 DA 資源分配的辯論。

### 第三方 DA 層

DA 問題催生了專用的 DA 層項目：

| 項目 | 機制 | 與三鏈的關係 |
|------|------|-------------|
| Celestia | DAS + Namespaced Merkle Tree | 為任何 rollup 提供 DA |
| EigenDA | Restaking + erasure coding | 利用 ETH restaking 安全性 |
| Avail | DAS + KZG | 獨立的 DA 鏈 |
| Near DA | Near Protocol 的 blob 儲存 | 低成本替代方案 |

這些項目的出現反映了模組化區塊鏈（Modular Blockchain）的趨勢：將 DA、執行和結算分離到不同的專用層。

## 相關概念

- [Bitcoin 區塊結構](/bitcoin/data-structures/bitcoin-block-structure/) - Bitcoin 區塊的完整資料格式
- [EIP-4844 Proto-Danksharding](/ethereum/advanced/eip-4844/) - Ethereum blob 交易與 DA 擴展
- [KZG Commitments](/ethereum/advanced/kzg-commitments/) - Blob 資料的多項式承諾方案
- [Turbine](/solana/consensus/turbine/) - Solana 分層區塊傳播協議
- [Compact Blocks](/bitcoin/network/compact-blocks/) - Bitcoin 壓縮區塊傳播
- [擴容方案比較](/comparisons/scalability-approaches/) - 三鏈擴容策略的全面比較
- [Merkle Tree](/fundamentals/data-structures/merkle-tree/) - 資料完整性驗證的基礎結構
- [Verkle Trees](/ethereum/advanced/verkle-trees/) - Ethereum 無狀態客戶端的路線圖
- [Block Relay](/bitcoin/network/block-relay/) - Bitcoin 區塊中繼機制
- [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) - Bitcoin 區塊驗證與 DA 的關係
- [Beacon Chain](/ethereum/consensus/beacon-chain/) - Ethereum blob 資料的共識處理
