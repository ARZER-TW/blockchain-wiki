---
title: "共識機制比較：PoW vs PoS vs PoH"
description: "Bitcoin Nakamoto Consensus、Ethereum Casper FFG + LMD GHOST、Solana Tower BFT + Proof of History 三大共識機制的深度比較"
tags: [comparison, bitcoin, ethereum, solana, consensus, pow, pos, poh, nakamoto, casper, tower-bft]
---

# 共識機制比較：PoW vs PoS vs PoH

## 概述

共識機制是區塊鏈系統最核心的設計抉擇，它決定了網路如何在去中心化環境下就交易順序與帳本狀態達成一致。三條主流公鏈分別採取了截然不同的策略：Bitcoin 的 [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) 以 Proof-of-Work 為基礎，將投票權綁定到物理算力；Ethereum 轉向 Proof-of-Stake，以 [Casper FFG](/ethereum/consensus/casper-ffg/) 提供 finality，搭配 [LMD GHOST](/ethereum/consensus/lmd-ghost/) 作為 fork choice rule；Solana 則結合 [Proof of History](/solana/consensus/proof-of-history/) 的可驗證延遲函數與 [Tower BFT](/solana/consensus/tower-bft/) 的 PBFT 變體，追求極致的吞吐量。

這三種設計各自優化了不同的面向——Bitcoin 優先確保去中心化與安全性，Ethereum 在安全性與效率之間取得平衡，Solana 則激進地追求性能。沒有任何一種設計在所有維度上全面勝出，它們反映的是 blockchain trilemma（去中心化、安全性、可擴展性）中不同的權衡取捨。

本文從機制設計、數學保證、安全模型三個層面進行系統性比較，幫助讀者理解每條鏈在共識層面做出的根本選擇。

## 快速比較表

| 屬性 | Bitcoin | Ethereum | Solana |
|------|---------|----------|--------|
| **共識族群** | Nakamoto (PoW) | Casper FFG + LMD GHOST (PoS) | Tower BFT + PoH (PoS) |
| **Sybil Resistance** | 算力（能源消耗） | 質押 ETH（經濟質押） | 質押 SOL（經濟質押） |
| **出塊時間** | ~10 分鐘 | 12 秒 | ~400 毫秒 |
| **最終性類型** | 機率性（probabilistic） | 經濟性（economic finality） | 樂觀確認 + rooted |
| **最終性時間** | ~60 分鐘（6 確認） | ~13 分鐘（2 epochs） | ~6.4 秒（~16 slots rooted） |
| **容錯門檻** | < 50% 算力 | < 1/3 質押量 | < 1/3 質押量 |
| **節點硬體需求** | 低（驗證）/ 高（挖礦） | 中等 | 高 |
| **能源效率** | 極低 | 高 | 高 |

## Bitcoin：Nakamoto Consensus

### 設計哲學

Bitcoin 的共識機制設計核心是**極端的簡潔與去中心化**。Satoshi Nakamoto 在 2008 年白皮書中解決了一個被認為不可能的問題：在 permissionless 環境下達成共識。其關鍵洞察是**用物理資源（能源/算力）作為投票權的 proxy**，讓 Sybil attack 變得昂貴而非不可能。

### 技術細節

#### 三大支柱

[Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) 由三個互相支撐的機制組成：

1. **[Proof-of-Work](/bitcoin/consensus/pow-hashcash/)**：礦工必須找到 nonce 使得區塊 hash 滿足難度目標
2. **[最長鏈規則](/bitcoin/consensus/longest-chain-rule/)**：節點始終選擇累計工作量最大的鏈
3. **[難度調整](/bitcoin/consensus/difficulty-adjustment/)**：每 2016 個區塊（約 2 週）調整難度，維持 ~10 分鐘出塊

#### PoW 挖礦流程

```
while true:
    block_header = construct_header(prev_hash, merkle_root, timestamp, nonce)
    hash = SHA256(SHA256(block_header))
    if hash < target:
        broadcast(block)
        break
    nonce += 1
```

#### 攻擊機率模型

攻擊者持有算力比例 $q$，誠實節點持有 $p = 1 - q$，交易後 $z$ 個確認：

$$P(\text{double-spend}) = \begin{cases} 1 & \text{if } q \geq p \\ (q/p)^z & \text{if } q < p \end{cases}$$

考慮 Poisson 分佈的精確公式：

$$P = 1 - \sum_{k=0}^{z} \frac{e^{-\lambda} \lambda^k}{k!} \left(1 - (q/p)^{z-k}\right), \quad \lambda = z \cdot \frac{q}{p}$$

### 優勢

- **最久經考驗**：2009 年以來從未被成功攻擊（主鏈層面）
- **極高去中心化**：任何人皆可成為驗證節點，硬體需求低
- **簡潔優雅**：協議規則極少，攻擊面小
- **無需 coordinator**：不依賴已知的驗證者集合

### 限制

- **能源消耗**：全網年耗電量堪比中等國家
- **低吞吐量**：~7 TPS，10 分鐘出塊
- **機率性最終性**：永遠無法 100% 確定，只能趨近
- **挖礦中心化趨勢**：ASIC 與礦池集中算力

## Ethereum：Casper FFG + LMD GHOST

### 設計哲學

Ethereum 的共識設計追求**經濟最終性（economic finality）**——讓逆轉已確認交易的經濟成本可量化且極其高昂。The Merge（2022）從 PoW 轉向 PoS，共識層由兩個互補協議組成：[Casper FFG](/ethereum/consensus/casper-ffg/) 負責 finality，[LMD GHOST](/ethereum/consensus/lmd-ghost/) 負責 fork choice。

### 技術細節

#### Beacon Chain 架構

[Beacon Chain](/ethereum/consensus/beacon-chain/) 將時間分為：
- **Slot**：12 秒，每 slot 由一個 [validator](/ethereum/consensus/validators/) 提議區塊
- **Epoch**：32 slots = 6.4 分鐘，epoch boundary 是 checkpoint

#### Casper FFG Finality

Checkpoint $B$ 被 finalized 需要：

1. 存在已 justified 的 checkpoint $A$
2. 超過 2/3 validator 質押量的 supermajority link $A \rightarrow B$

$$\frac{\sum_{\text{votes } A \rightarrow B} \text{effective\_balance}}{\text{total\_active\_balance}} > \frac{2}{3}$$

Finalized checkpoint 的安全保證：逆轉需要至少 1/3 validator 被 [slashed](/ethereum/consensus/slashing/)，以當前質押量計算約 $> 10M$ ETH。

#### LMD GHOST Fork Choice

Latest Message Driven GHOST（Greedy Heaviest Observed SubTree）：

1. 從最新 justified checkpoint 開始
2. 在每個 fork 點，選擇擁有最多 attestation 支持的子樹
3. 遞迴直到葉節點

#### Attestation 流程

每個 epoch 中，所有 validator 被分配到各 slot，產生 [attestation](/ethereum/consensus/attestation/)：
- **Source**：最新 justified checkpoint
- **Target**：當前 epoch 的 checkpoint
- **Head**：LMD GHOST 認為的鏈頭

### 優勢

- **經濟最終性**：finalized 後逆轉成本可量化（> 1/3 質押被銷毀）
- **能源效率**：PoS 能耗比 PoW 低 ~99.95%
- **Slashing 懲罰**：惡意行為有明確的經濟後果
- **形式化安全證明**：Casper FFG 有嚴格的 accountable safety 和 plausible liveness 證明

### 限制

- **最終性延遲**：需要 2 個 epoch（~13 分鐘）才能 finalize
- **複雜度高**：兩層協議（FFG + GHOST）互動複雜
- **最低質押門檻**：32 ETH 才能成為 validator（有 liquid staking 緩解）
- **弱主觀性（weak subjectivity）**：長時間離線的節點需要從可信來源取得最新 finalized state

## Solana：Tower BFT + Proof of History

### 設計哲學

Solana 的核心設計目標是**在不犧牲去中心化的前提下最大化吞吐量**。其關鍵創新是 [Proof of History (PoH)](/solana/consensus/proof-of-history/)——一個基於 SHA-256 的可驗證延遲函數（VDF），為所有事件提供密碼學時間戳，消除了共識過程中的通訊開銷。[Tower BFT](/solana/consensus/tower-bft/) 是建構在 PoH 時鐘之上的 PBFT 變體。

### 技術細節

#### Proof of History

PoH 是一條連續的 SHA-256 hash 鏈：

$$h_0 \xrightarrow{\text{SHA256}} h_1 \xrightarrow{\text{SHA256}} h_2 \xrightarrow{\text{SHA256}} \cdots$$

交易被穿插（interleave）到 hash 鏈中：

```
hash_n = SHA256(hash_{n-1})
hash_{n+1} = SHA256(hash_n || transaction_data)
hash_{n+2} = SHA256(hash_{n+1})
...
```

這提供了**交易排序的密碼學證明**——不需要節點之間協商時間戳。

#### Tower BFT

Tower BFT 是 PBFT 的優化變體，利用 PoH 作為全域時鐘：

- Validator 對 PoH slot 進行投票（vote transaction）
- 每次投票有一個 **lockout 期**，期間不能對衝突的 fork 投票
- Lockout 以指數方式遞增（doubling）：

$$\text{lockout}(n) = 2^{n+1} \text{ slots}$$

其中 $n$ 是該投票在投票堆疊中的深度。當投票堆疊達到 32 層時，最底層的投票 lockout 超過 $2^{32}$ slots，實際上達到 finality。

#### Leader Schedule

Solana 使用 leader-based 出塊：
1. 每個 epoch（~2 天）根據質押權重生成 leader schedule
2. 每 4 個 slot（~1.6 秒）輪換 leader
3. Leader 負責打包交易並產生 PoH hash 鏈
4. 其他 validator 驗證並投票

### 優勢

- **極高吞吐量**：理論 65,000+ TPS，實際 ~4,000 TPS
- **極低延遲**：~400ms 出塊，數秒內達到確認
- **低交易費用**：基本費用 ~$0.00025
- **原生時間概念**：PoH 提供了全域可驗證的時間排序

### 限制

- **高硬體需求**：validator 需要高端 CPU、128GB+ RAM、高速 SSD 和高頻寬
- **中心化疑慮**：硬體門檻限制了 validator 多樣性
- **網路中斷歷史**：曾多次發生全網停機事件
- **較年輕的設計**：相比 Bitcoin/Ethereum 經歷的實戰考驗較少

## 深度比較

### Finality 流程比較

<pre class="mermaid">
sequenceDiagram
    participant BTC as Bitcoin
    participant ETH as Ethereum
    participant SOL as Solana

    Note over BTC: Block mined (PoW)
    Note over ETH: Block proposed (Slot 0)
    Note over SOL: Slot produced (~400ms)

    Note over BTC: +10 min: 1 confirmation
    Note over ETH: +12s: 1 slot attestations
    Note over SOL: +800ms: Votes accumulate

    Note over BTC: +20 min: 2 confirmations
    Note over ETH: +6.4 min: Epoch 0 justified
    Note over SOL: +6.4s: Rooted (~16 slots)

    Note over BTC: +60 min: 6 confirmations<br/>(probabilistic finality)
    Note over ETH: +12.8 min: Epoch 0 finalized<br/>(economic finality)
    Note over SOL: +6.4s: Optimistic confirmation<br/>(2/3 stake voted)

    Note over BTC: 永遠不會 100%<br/>只趨近確定
    Note over ETH: Finalized = 需銷毀<br/>> 1/3 質押才能逆轉
    Note over SOL: Rooted = lockout<br/>指數遞增保護
</pre>

### 安全模型比較

#### 容錯假設

| 攻擊模型 | Bitcoin | Ethereum | Solana |
|----------|---------|----------|--------|
| **容錯門檻** | < 50% 算力 | < 1/3 質押 | < 1/3 質押 |
| **攻擊成本** | 算力 + 電力 | 質押 ETH（會被 slash） | 質押 SOL（會被 slash） |
| **Sybil Resistance** | 能源消耗 | 經濟質押 | 經濟質押 |
| **Nothing-at-Stake** | N/A（PoW 天然避免） | Slashing 懲罰 | Vote lockout + Slashing |
| **Long-Range Attack** | N/A（PoW 鏈不可偽造） | Weak subjectivity checkpoint | Weak subjectivity checkpoint |

#### 安全保證的數學基礎

**Bitcoin**：安全性基於**計算困難性假設**——找到有效 PoW 解需要的計算量與難度目標成正比。攻擊者需要持續投入大量能源。

**Ethereum**：安全性基於**經濟理性假設**——[Casper FFG](/ethereum/consensus/casper-ffg/) 提供 accountable safety：如果同一 epoch 有兩個 finalized checkpoint，可以在鏈上證明至少 1/3 validator 違規，並 [slash](/ethereum/consensus/slashing/) 其質押。

**Solana**：安全性基於 **lockout 機制**——投票的 lockout 以指數方式遞增，使得切換 fork 的機會成本隨時間快速增長。

### 性能比較

| 指標 | Bitcoin | Ethereum | Solana |
|------|---------|----------|--------|
| **TPS（L1）** | ~7 | ~15-30 | ~4,000（峰值 65K+） |
| **出塊時間** | ~10 分鐘 | 12 秒 | ~400 毫秒 |
| **Finality 時間** | ~60 分鐘 | ~13 分鐘 | ~6.4 秒 |
| **區塊大小** | 1-4 MB (SegWit) | ~150 KB (execution) | ~128 MB (max) |
| **狀態大小** | ~5 GB (UTXO set) | ~100+ GB (state trie) | ~100+ GB (accounts DB) |
| **全節點儲存** | ~600+ GB | ~1+ TB | ~1+ TB |
| **頻寬需求** | 低 (~1 Mbps) | 中等 (~25 Mbps) | 高 (~1 Gbps) |

### Trade-off 分析

<pre class="mermaid">
graph TD
    A[Blockchain Trilemma] --> B[去中心化]
    A --> C[安全性]
    A --> D[可擴展性]

    B --> BTC[Bitcoin: 最高去中心化<br/>任何人可驗證]
    C --> BTC2[Bitcoin: 15年無事故<br/>最久經考驗]
    D --> BTC3[Bitcoin: 最低 TPS<br/>~7 TPS]

    B --> ETH[Ethereum: 高去中心化<br/>~100萬 validators]
    C --> ETH2[Ethereum: 經濟最終性<br/>slashing 保證]
    D --> ETH3[Ethereum: 中等 TPS<br/>靠 L2 擴展]

    B --> SOL[Solana: 中等去中心化<br/>硬體門檻高]
    C --> SOL2[Solana: Tower BFT<br/>曾發生停機]
    D --> SOL3[Solana: 最高 TPS<br/>~4000 TPS L1]

    style BTC fill:#f7931a,color:#fff
    style BTC2 fill:#f7931a,color:#fff
    style BTC3 fill:#f7931a,color:#fff
    style ETH fill:#627eea,color:#fff
    style ETH2 fill:#627eea,color:#fff
    style ETH3 fill:#627eea,color:#fff
    style SOL fill:#9945ff,color:#fff
    style SOL2 fill:#9945ff,color:#fff
    style SOL3 fill:#9945ff,color:#fff
</pre>

## 實際影響

### 對開發者

| 面向 | Bitcoin | Ethereum | Solana |
|------|---------|----------|--------|
| **交易確認等待** | 需等 6 確認（~60 分鐘） | 等 finalize（~13 分鐘）或 1 確認（~12 秒） | 幾乎即時（~400ms） |
| **重組風險處理** | 必須處理 reorg 邏輯 | Finalized 後無需擔心 | Rooted 後風險極低 |
| **Liveness 保證** | 極高（從未停機） | 高（Inactivity leak 確保恢復） | 中等（曾有停機事件） |
| **開發複雜度** | 低（UTXO 模型簡單） | 中（EVM 狀態管理） | 高（account model + PoH 時序） |

### 對使用者

- **Bitcoin**：適合大額、低頻、安全性至上的轉帳（數位黃金場景）
- **Ethereum**：適合需要強最終性保證的 DeFi、NFT 操作，L2 處理日常交易
- **Solana**：適合高頻交易、即時遊戲、微支付等需要低延遲低費用的場景

### 對生態系統

**Bitcoin** 的 Nakamoto Consensus 啟發了整個區塊鏈產業，其安全性記錄是所有其他設計的參考基準。

**Ethereum** 的 PoS 轉型證明了大型公鏈可以改變共識機制，Casper FFG 的形式化驗證為學術與工程界建立了新標準。

**Solana** 的 PoH 創新展示了將時間嵌入協議層可以帶來的性能提升，推動了整個產業對高性能 L1 的探索。

## 相關概念

- [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) - Bitcoin 共識機制完整解析
- [Proof-of-Work (Hashcash)](/bitcoin/consensus/pow-hashcash/) - PoW 機制技術細節
- [最長鏈規則](/bitcoin/consensus/longest-chain-rule/) - Bitcoin fork choice rule
- [難度調整](/bitcoin/consensus/difficulty-adjustment/) - Bitcoin 難度調整演算法
- [Casper FFG](/ethereum/consensus/casper-ffg/) - Ethereum finality gadget
- [LMD GHOST](/ethereum/consensus/lmd-ghost/) - Ethereum fork choice rule
- [Validators (ETH)](/ethereum/consensus/validators/) - Ethereum 驗證者機制
- [Slashing](/ethereum/consensus/slashing/) - Ethereum 懲罰機制
- [Attestation](/ethereum/consensus/attestation/) - Ethereum 驗證者投票
- [Beacon Chain](/ethereum/consensus/beacon-chain/) - Ethereum 共識層
- [Tower BFT](/solana/consensus/tower-bft/) - Solana 共識機制
- [Proof of History](/solana/consensus/proof-of-history/) - Solana 時間證明
- [Validators & Staking (SOL)](/solana/consensus/validators-staking/) - Solana 驗證者
- [帳戶模型比較](/comparisons/account-models/) - 三鏈帳戶模型對比
- [最終性保證比較](/comparisons/finality-guarantees/) - 三鏈最終性深度比較
