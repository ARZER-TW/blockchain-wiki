---
title: "網路傳播機制比較"
description: "Bitcoin Gossip + Compact Blocks vs Ethereum gossipsub (libp2p) vs Solana Turbine + Gulf Stream, 三大公鏈網路傳播機制深度比較"
tags: [comparison, bitcoin, ethereum, solana, networking, propagation, gossip, compact-blocks, gossipsub, turbine, gulf-stream, p2p]
---

# 網路傳播機制比較

## 概述

區塊鏈的 P2P 網路層負責在全球分散的節點之間傳播交易和區塊。網路傳播的效率直接影響了區塊鏈的安全性（孤塊率、分叉機率）、效能（交易確認延遲）和公平性（MEV 提取機會）。三大公鏈在網路層的設計選擇，反映了它們對安全性、效能和去中心化之間權衡的不同態度。

Bitcoin 使用經典的 gossip 協議搭配 [Compact Blocks](/bitcoin/network/compact-blocks/) 優化，在約 10 分鐘的區塊間隔下實現可靠的全網傳播。Ethereum 採用 libp2p 框架的 gossipsub 協議，搭配 Beacon Chain 的 slot/epoch 結構，在 12 秒的 slot time 內完成區塊和 attestation 的傳播。Solana 則設計了專用的 [Turbine](/solana/consensus/turbine/) 和 [Gulf Stream](/solana/consensus/gulf-stream/) 協議，在 400 毫秒的 slot time 下實現高吞吐量的資料分發。

網路層的設計是這三條鏈中最容易被忽視但又至關重要的差異點。區塊傳播延遲增加 1 秒，對 Bitcoin 的影響微乎其微，但對 Solana 來說可能意味著整個 slot 的丟失。

## 快速比較表

| 屬性 | Bitcoin | Ethereum | Solana |
|------|---------|----------|--------|
| P2P 協議 | 自訂 Bitcoin P2P | libp2p / gossipsub | 自訂 QUIC + Turbine |
| 交易傳播 | inv/tx gossip | gossipsub topics | [Gulf Stream](/solana/consensus/gulf-stream/)（直接轉發給 leader） |
| 區塊傳播 | [Compact Blocks](/bitcoin/network/compact-blocks/) (BIP-152) | gossipsub + req/resp | [Turbine](/solana/consensus/turbine/)（分層 erasure coding） |
| 傳輸層 | TCP | TCP + QUIC | QUIC（UDP-based） |
| 節點發現 | DNS seeds + addr gossip | discv5 (DHT) | Gossip protocol（cluster info） |
| 目標傳播延遲 | < 數秒（區塊間隔 10 min） | < 4 秒（slot time 12s） | < 100ms（slot time 400ms） |
| Mempool | 是（本地維護） | 是（本地維護） | 無傳統 mempool |
| 典型節點連線數 | 8-125 peers | ~50-100 peers | ~40 stake-weighted peers |

## 網路架構對比

<pre class="mermaid">
graph TB
    subgraph Bitcoin["Bitcoin: Gossip + Compact Blocks"]
        BN1[Node A] <-->|inv/tx/block| BN2[Node B]
        BN2 <-->|inv/tx/block| BN3[Node C]
        BN3 <-->|inv/tx/block| BN4[Node D]
        BN1 <-->|compact block| BN4
        style BN1 fill:#f7931a,stroke:#c16c12,color:#fff
        style BN2 fill:#f7931a,stroke:#c16c12,color:#fff
        style BN3 fill:#f7931a,stroke:#c16c12,color:#fff
        style BN4 fill:#f7931a,stroke:#c16c12,color:#fff
    end

    subgraph Ethereum["Ethereum: gossipsub (libp2p)"]
        EN1[Node A] -->|beacon_block topic| EN2[Node B]
        EN1 -->|beacon_block topic| EN3[Node C]
        EN2 -->|attestation subnet| EN4[Node D]
        EN3 -->|blob sidecar topic| EN5[Node E]
        style EN1 fill:#627eea,stroke:#3b5bb5,color:#fff
        style EN2 fill:#627eea,stroke:#3b5bb5,color:#fff
        style EN3 fill:#627eea,stroke:#3b5bb5,color:#fff
        style EN4 fill:#627eea,stroke:#3b5bb5,color:#fff
        style EN5 fill:#627eea,stroke:#3b5bb5,color:#fff
    end

    subgraph Solana["Solana: Turbine + Gulf Stream"]
        SL[Leader] -->|shreds| SG1[Group 1 Validators]
        SG1 -->|retransmit| SG2[Group 2 Validators]
        SG2 -->|retransmit| SG3[Group 3 Validators]
        SC[Client] -->|tx via Gulf Stream| SNL[Next Leader]
        style SL fill:#14f195,stroke:#0cb87a,color:#000
        style SG1 fill:#9945ff,stroke:#7a35cc,color:#fff
        style SG2 fill:#9945ff,stroke:#7a35cc,color:#fff
        style SG3 fill:#9945ff,stroke:#7a35cc,color:#fff
        style SC fill:#14f195,stroke:#0cb87a,color:#000
        style SNL fill:#14f195,stroke:#0cb87a,color:#000
    end
</pre>

## Bitcoin：Gossip + Compact Blocks

### 設計哲學

Bitcoin 的 P2P 網路設計以韌性和去中心化為首要目標。10 分鐘的區塊間隔給予了充裕的傳播時間，網路協議可以偏向保守和可靠，而不需要追求極致的延遲。

### 交易傳播

Bitcoin 交易透過 inv/tx 機制傳播：

1. 節點收到新交易後，向所有 peers 發送 `inv` 訊息（包含交易 hash）
2. 尚未見過該交易的 peer 回覆 `getdata` 請求
3. 原始節點回覆完整的 `tx` 訊息
4. 接收節點驗證後繼續向其 peers 傳播

BIP-330（Erlay）提案使用 set reconciliation 協議（minisketch）來減少 inv 訊息的冗餘，預計可降低約 40% 的交易傳播頻寬。

### 區塊傳播

[Compact Blocks](/bitcoin/network/compact-blocks/)（BIP-152）是 Bitcoin 區塊傳播的核心優化：

**High Bandwidth Mode**：
- 節點之間預先協商使用 compact block relay
- 新區塊到來時直接發送 compact block（header + 短 tx ID 列表）
- 接收方用本地 mempool 重建完整區塊
- 僅請求缺少的交易

**Low Bandwidth Mode**：
- 先發送 `inv`，對方請求才發送 compact block
- 適用於頻寬受限的連線

$$\text{compactBlockSize} \approx 80 + 8 \times n_{\text{txs}} + \text{missing\_txs\_size}$$

典型情況下，compact block 可將區塊傳播的頻寬需求降低約 90%。

### 節點發現

- **DNS Seeds**：硬編碼的 DNS 地址返回活躍節點 IP 列表
- **Addr Gossip**：節點之間互相分享已知的節點地址
- **Version Handshake**：新連線時交換協議版本和能力

### 效能特性

| 指標 | 值 |
|------|-----|
| 區塊傳播至 90% 節點 | ~2-5 秒 |
| 交易傳播至 90% 節點 | ~3-10 秒 |
| 平均節點連線數 | 8 outbound + 最多 117 inbound |
| 全網節點數 | ~15,000-20,000 reachable |

### 優勢與限制

**優勢**：久經考驗的穩定性、極高的抗審查能力（任何人可運行節點）、Compact Blocks 大幅減少頻寬需求、Erlay 進一步優化交易中繼

**限制**：交易傳播延遲較高（對 10 分鐘區塊無影響）、gossip 協議的冗餘傳播浪費頻寬、無法支援高 TPS 場景

## Ethereum：gossipsub (libp2p)

### 設計哲學

Ethereum 在 The Merge 後完全遷移至 libp2p 框架，使用 gossipsub v1.1 作為核心的訊息傳播協議。12 秒的 slot time 要求區塊和 attestation 必須在 4 秒內傳播到網路的大部分節點。gossipsub 的 topic-based 發布/訂閱模型為不同類型的訊息提供了靈活的傳播管道。

### gossipsub 機制

gossipsub 使用兩層架構：

- **Mesh**：每個節點為每個 topic 維護一個 mesh（通常 6-12 個 peers），完整訊息在 mesh 內傳播
- **Gossip**：非 mesh peer 之間交換 metadata（IHAVE/IWANT），按需獲取完整訊息

主要 topics：
| Topic | 內容 |
|-------|------|
| `beacon_block` | 新的 Beacon Chain 區塊 |
| `beacon_aggregate_and_proof` | 聚合的 attestation |
| `beacon_attestation_{subnet}` | 64 個 attestation subnet |
| `blob_sidecar_{index}` | EIP-4844 blob sidecar |
| `voluntary_exit` | 驗證者退出訊息 |
| `sync_committee` | 同步委員會簽名 |

### 交易傳播

Ethereum 的 execution layer 交易透過 devp2p（傳統 Ethereum Wire Protocol）或 libp2p 傳播：

1. 交易進入本地 mempool
2. 透過 `NewPooledTransactionHashes` 通知 peers
3. Peers 透過 `GetPooledTransactions` 請求完整交易
4. 交易在 mempool 中按 gas price 排序

### 區塊傳播

Beacon Chain 區塊的傳播流程：

1. Proposer 在 slot 開始時產生區塊
2. 區塊透過 `beacon_block` topic 在 gossipsub mesh 中傳播
3. Blob sidecar 透過 `blob_sidecar_{index}` topic 平行傳播
4. 驗證者在收到區塊後 4 秒內完成 [attestation](/ethereum/consensus/attestation/) 並發布

### 節點發現：discv5

Ethereum 使用 discv5（Discovery v5）進行節點發現：

- 基於 Kademlia DHT 的結構化節點發現
- 使用 UDP 傳輸 ENR（Ethereum Node Record）
- 支援 topic 廣告，讓節點宣告其能力
- 加密的節點通訊（ECDH key agreement）

### 效能特性

| 指標 | 值 |
|------|-----|
| 區塊傳播至 95% 節點 | ~1-3 秒 |
| Attestation 傳播 | < 4 秒（deadline） |
| 平均 gossipsub mesh 大小 | 6-12 peers/topic |
| 全網節點數 | ~7,000-10,000 |

### 優勢與限制

**優勢**：gossipsub 的 topic 模型靈活、score-based peer management 抗 sybil 攻擊、libp2p 生態成熟多語言實現、EIP-4844 blob 傳播的獨立 topic 減輕負擔

**限制**：12 秒 slot time 對傳播延遲有嚴格要求、gossipsub mesh 維護增加複雜度、blob 傳播增加了頻寬需求、proposer 需要在 slot 開始時準備好區塊

## Solana：Turbine + Gulf Stream

### 設計哲學

Solana 面對的網路挑戰是前所未有的：在 400 毫秒的 slot time 和每秒數千筆交易的吞吐量下，傳統的 gossip 協議完全無法滿足需求。[Turbine](/solana/consensus/turbine/) 和 [Gulf Stream](/solana/consensus/gulf-stream/) 是 Solana 為高效能場景設計的專用網路協議。

### Gulf Stream：無 Mempool 交易轉發

[Gulf Stream](/solana/consensus/gulf-stream/) 消除了傳統的 mempool 等待階段：

1. 客戶端知道當前和未來數個 slot 的 leader schedule
2. 交易直接發送給預期的 leader（和相鄰的 leader）
3. Leader 在收到交易後可以立即開始處理
4. 無需等待全網傳播後再打包

<pre class="mermaid">
flowchart LR
    C[Client] -->|直接發送| L1[Current Leader]
    C -->|預發送| L2[Next Leader]
    C -->|預發送| L3[Leader + 2]
    L1 -->|處理中| P[Sealevel 執行]
    L2 -.->|準備接收| Q[下個 Slot]
</pre>

這種設計的核心優勢是減少了交易從提交到執行的延遲，因為省去了 mempool 廣播和等待的時間。

### Turbine：分層區塊傳播

[Turbine](/solana/consensus/turbine/) 是 Solana 區塊傳播的核心協議：

1. **Shred 產生**：Leader 將區塊資料切分為 data shreds（~1228 bytes payload），並透過 Reed-Solomon erasure coding 產生 coding shreds
2. **分層傳播**：
   - Layer 0：Leader 將不同的 shreds 發送給第一層的 validator 群組
   - Layer 1：每個 validator 將收到的 shred 轉發給下一層
   - Layer N：持續向下直到所有 validator 收到足夠的 shreds
3. **Stake-weighted 分組**：高 stake 的 validator 被分配到較早的傳播層，確保關鍵投票者優先收到資料

### QUIC 傳輸

Solana 從 2023 年開始使用 QUIC（UDP-based）作為主要傳輸協議：

- 多路復用（multiplexing）避免 head-of-line blocking
- 零 RTT 連線建立（0-RTT）
- 內建加密（TLS 1.3）
- 支援 stake-weighted 連線優先級
- 比 TCP 更適合高吞吐量場景

### 節點發現

Solana 使用 gossip protocol 傳播 cluster 資訊：

- **ContactInfo**：每個 validator 的網路地址和能力
- **Vote**：最新投票狀態
- **Epoch Slots**：slot-leader 映射
- 使用 CrDS（Crdt Data Store）進行最終一致的資訊同步

### 效能特性

| 指標 | 值 |
|------|-----|
| Shred 傳播至全網 | < 200ms（目標） |
| 交易提交到確認 | ~400ms（1 slot） |
| Leader 頻寬需求 | ~100-200 Mbps |
| Validator 頻寬需求 | ~50-100 Mbps |
| Turbine 分層數 | 2-4 層 |

### 優勢與限制

**優勢**：極低的傳播延遲、Gulf Stream 消除 mempool 等待、Turbine 降低 leader 頻寬壓力、QUIC 傳輸適合高吞吐量、stake-weighted 優先級確保重要 validator 優先收到資料

**限制**：高頻寬要求限制了 validator 的門檻、網路故障時缺少 mempool 緩衝（交易直接丟棄）、stake-weighted 設計可能造成低 stake validator 的延遲不公平、對網路基礎設施品質依賴度高

## 深度比較

### 傳播模型差異

<pre class="mermaid">
flowchart TD
    subgraph 傳播策略
        BM["Bitcoin<br/>Flat Gossip<br/>每個節點都是對等的<br/>冗餘但韌性強"]
        EM["Ethereum<br/>Topic-based Mesh<br/>gossipsub 評分管理<br/>平衡效率與安全"]
        SM["Solana<br/>Hierarchical Push<br/>stake-weighted 分層<br/>最小延遲路徑"]
    end
</pre>

### 頻寬需求對比

| 角色 | Bitcoin | Ethereum | Solana |
|------|---------|----------|--------|
| Full node（上傳） | ~5-50 KB/s | ~100-500 KB/s | N/A |
| Full node（下載） | ~5-50 KB/s | ~100-500 KB/s | N/A |
| Validator（上傳） | N/A（PoW miner） | ~1-5 MB/s | ~50-200 Mbps |
| Validator（下載） | N/A | ~1-5 MB/s | ~50-100 Mbps |
| 最低頻寬建議 | 1 Mbps | 10 Mbps | 1 Gbps |

### 抗審查能力

| 維度 | Bitcoin | Ethereum | Solana |
|------|---------|----------|--------|
| 節點加入門檻 | 極低 | 低-中 | 高 |
| 交易審查阻力 | 高（任何節點可廣播） | 中（MEV relay 可審查） | 中（leader 可審查） |
| 區塊審查阻力 | 高（PoW 去中心化） | 中（PBS 分離） | 中（leader rotation） |
| 網路分割韌性 | 最強 | 強 | 中等 |

### 延遲與容錯

$$\text{Bitcoin: } t_{\text{block\_propagation}} \ll t_{\text{block\_interval}} = 600\text{s}$$

$$\text{Ethereum: } t_{\text{block\_propagation}} < \frac{t_{\text{slot}}}{3} = 4\text{s}$$

$$\text{Solana: } t_{\text{shred\_propagation}} < t_{\text{slot}} = 0.4\text{s}$$

Bitcoin 的長區塊間隔給予了巨大的容錯空間——即使傳播延遲增加數秒也不影響安全性。Ethereum 的 4 秒 attestation deadline 要求較高的傳播效率，但仍有一定緩衝。Solana 的 400ms slot time 對傳播延遲幾乎零容忍，任何網路抖動都可能導致 slot miss。

## 實際影響

### 對開發者

- **Bitcoin 開發者**構建的應用可以假設交易會在秒級內傳播到全網，但確認需要等待區塊。Bitcoin P2P 協議的穩定性使得建立長期連線容易。
- **Ethereum 開發者**需要考慮 MEV 對交易排序的影響。Flashbots 和 MEV-Boost 等基礎設施改變了交易在網路中的傳播路徑。Private transaction pool 是避免被搶先交易的常見策略。
- **Solana 開發者**需要理解 Gulf Stream 的運作方式——直接發送給 leader 意味著交易提交的時機和目標 leader 的選擇很重要。網路擁塞時需要實作重試邏輯。

### 對使用者

網路層的差異主要體現在交易確認的體驗上。Bitcoin 使用者等待 10 分鐘以上的首次確認；Ethereum 使用者在 12 秒內看到交易被包含在區塊中；Solana 使用者幾乎即時看到交易確認，但偶爾會遇到交易被丟棄需要重試的情況。

### 對生態系

網路層的設計選擇深刻影響了各鏈的 MEV 生態。Bitcoin 的簡單 gossip 使得 MEV 機會有限；Ethereum 的 PBS/MEV-Boost 架構形成了複雜的 MEV 供應鏈；Solana 的 leader-based 架構使得 MEV 策略集中在與 leader 的低延遲連線上，催生了 Jito 等 MEV 基礎設施。

## 相關概念

- [Peer Discovery (BTC)](/bitcoin/network/peer-discovery/) - Bitcoin 節點發現機制
- [Compact Blocks](/bitcoin/network/compact-blocks/) - Bitcoin 壓縮區塊傳播
- [Block Relay](/bitcoin/network/block-relay/) - Bitcoin 區塊中繼機制
- [Broadcast & Validation (ETH)](/ethereum/transaction-lifecycle/broadcast-validation/) - Ethereum 交易廣播與驗證
- [Turbine](/solana/consensus/turbine/) - Solana 分層區塊傳播協議
- [Gulf Stream](/solana/consensus/gulf-stream/) - Solana 無 mempool 交易轉發
- [共識機制比較](/comparisons/consensus-mechanisms/) - 三鏈共識機制的全面比較
- [Attestation](/ethereum/consensus/attestation/) - Ethereum 驗證者投票機制
- [Beacon Chain](/ethereum/consensus/beacon-chain/) - Ethereum 共識層的核心
- [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) - Bitcoin 工作量證明共識
- [Mempool (ETH)](/ethereum/transaction-lifecycle/mempool/) - Ethereum 記憶池運作
- [SVM/Sealevel](/solana/runtime/svm-sealevel/) - Solana 平行執行引擎
