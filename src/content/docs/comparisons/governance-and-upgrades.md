---
title: "治理與升級機制比較"
description: "Bitcoin BIP Process + Soft/Hard Forks vs Ethereum EIP Process + Coordinated Hard Forks vs Solana Feature Gates + On-chain Voting, 三大公鏈治理與升級機制深度比較"
tags: [comparison, bitcoin, ethereum, solana, governance, upgrades, bip, eip, feature-gates, forks, hard-fork, soft-fork]
---

# 治理與升級機制比較

## 概述

區塊鏈作為去中心化系統，如何在沒有中央權威的情況下達成協議來升級協議、修復漏洞和引入新功能，是一個根本性的治理挑戰。治理機制的設計直接反映了社群對去中心化、效率和安全性之間權衡的態度，也深刻影響了每條鏈的演進速度和方向。

Bitcoin 採用最保守的治理模型：通過 BIP（Bitcoin Improvement Proposal）流程進行提案，透過 soft fork（向後相容升級）為主的策略來避免網路分裂。Ethereum 使用 EIP（Ethereum Improvement Proposal）流程，透過定期的協調 hard fork（向後不相容升級）來引入重大改變，包括從 PoW 到 PoS 的歷史性遷移。Solana 則在協議中內建了 feature gate 機制和鏈上投票系統，validator 可以對新功能的啟用進行投票，使得協議升級更加流暢。

這三種治理模型代表了一個頻譜：從 Bitcoin 的極度保守（「不要輕易改變」）到 Ethereum 的審慎積極（「透過社會共識推動進化」）再到 Solana 的快速迭代（「讓協議像軟體一樣持續更新」）。沒有一種模型是絕對優越的——每種選擇都有其對應的風險和收益。

## 快速比較表

| 屬性 | Bitcoin | Ethereum | Solana |
|------|---------|----------|--------|
| 提案流程 | BIP（Bitcoin Improvement Proposal） | EIP（Ethereum Improvement Proposal） | SIMD（Solana Improvement Document） |
| 升級方式 | Soft fork 為主 / Hard fork 極少 | 定期協調 Hard fork | Feature gates + validator 鏈上投票 |
| 決策者 | 礦工 + 節點運營者 + 開發者 + 使用者 | Core devs + 社群 + 驗證者 | Validators（stake-weighted 投票） |
| 升級頻率 | 數年一次重大升級 | 每 6-12 個月一次 hard fork | 持續（feature gate 隨時可啟用） |
| 向後相容 | 強制（soft fork） | 不保證（hard fork） | 透過 feature gate 管理 |
| 爭議處理 | 可能導致鏈分裂（BCH, BSV） | 社會共識協調 + 鏈分裂歷史（ETC） | 投票機制減少爭議 |
| 核心開發團隊 | Bitcoin Core + 獨立貢獻者 | 多客戶端團隊（Geth, Prysm, Lighthouse...） | Solana Labs + Jito Labs + Firedancer (Jump) |

## 升級流程對比

<pre class="mermaid">
flowchart TD
    subgraph Bitcoin["Bitcoin: BIP Process"]
        BB1[BIP Draft 提案] --> BB2[社群討論<br/>bitcoin-dev 郵件列表]
        BB2 --> BB3[BIP 編號分配]
        BB3 --> BB4[實作與測試<br/>Bitcoin Core PR]
        BB4 --> BB5{Soft Fork?}
        BB5 -->|是| BB6[Miner 信號<br/>95% or Speedy Trial]
        BB5 -->|否| BB7[Hard Fork<br/>極少採用]
        BB6 --> BB8[鎖定 + 啟動]
    end

    subgraph Ethereum["Ethereum: EIP Process"]
        EE1[EIP Draft] --> EE2[社群審查<br/>Ethereum Magicians]
        EE2 --> EE3[AllCoreDevs Call<br/>核心開發者會議]
        EE3 --> EE4[選入 Hard Fork]
        EE4 --> EE5[測試網部署<br/>Goerli/Sepolia/Holesky]
        EE5 --> EE6[主網 Hard Fork<br/>所有節點同時升級]
    end

    subgraph Solana["Solana: Feature Gates"]
        SS1[SIMD Proposal] --> SS2[社群討論<br/>GitHub + Forum]
        SS2 --> SS3[實作於客戶端]
        SS3 --> SS4[Feature Gate 部署<br/>預設未啟用]
        SS4 --> SS5[Validator 投票<br/>stake-weighted]
        SS5 --> SS6{>95% Stake?}
        SS6 -->|是| SS7[Feature 啟動]
        SS6 -->|否| SS8[等待更多支持]
    end
</pre>

## Bitcoin：BIP Process + Soft/Hard Forks

### 設計哲學

Bitcoin 的治理哲學可以總結為「保守主義」：變更是危險的，因此只有在廣泛共識和充分測試之後才能引入。沒有任何個人或組織有權力單方面改變 Bitcoin 協議。這種保守態度源於 Bitcoin 作為「數位黃金」的定位——貨幣政策的不可預測性會摧毀信任。

### BIP 流程

BIP（Bitcoin Improvement Proposal）是 Bitcoin 協議變更的標準流程：

| BIP 類型 | 說明 | 範例 |
|---------|------|------|
| Standards Track | 影響 Bitcoin 協議的技術變更 | BIP-141（SegWit）、BIP-341（Taproot） |
| Informational | 設計指南或資訊分享 | BIP-39（助記詞） |
| Process | 治理流程本身的變更 | BIP-2（BIP 流程） |

### Soft Fork vs Hard Fork

**Soft Fork**（向後相容升級）：
- 新規則是舊規則的子集
- 未升級的節點仍然認為新區塊有效
- 需要多數算力支持（歷史上要求 95%）
- Bitcoin 偏好的升級方式

**Hard Fork**（向後不相容升級）：
- 新規則與舊規則不相容
- 未升級的節點會拒絕新區塊
- 可能導致永久鏈分裂
- Bitcoin 社群極力避免

### 啟動機制演進

| 機制 | 時期 | 說明 |
|------|------|------|
| Flag Day | 早期 | 設定固定日期啟動 |
| IsSuperMajority | 2012-2015 | 要求 950/1000 區塊信號 |
| BIP-9 (versionbits) | 2016 | 1 年信號期，95% 閾值 |
| BIP-8 (LOT=true) | 2021 提案 | 信號期結束後強制啟動 |
| Speedy Trial | 2021 (Taproot) | 3 個月快速信號期，90% 閾值 |

### 重大升級歷史

<pre class="mermaid">
timeline
    title Bitcoin Major Upgrades
    2009 : Genesis Block
         : 原始協議
    2012 : P2SH (BIP-16)
         : 付款至腳本雜湊
    2015 : BIP-65/66
         : CHECKLOCKTIMEVERIFY + 嚴格 DER
    2017 : SegWit (BIP-141)
         : 隔離見證, 區塊 weight
    2017 : BCH Hard Fork
         : 社群分裂, 大區塊路線
    2021 : Taproot (BIP-340/341/342)
         : Schnorr + MAST + SegWit v1
    2025+ : OP_CAT / CTV 討論中
         : Covenant 功能提案
</pre>

### 優勢與限制

**優勢**：極高的穩定性和可預測性、soft fork 避免網路分裂、廣泛共識確保變更品質、「Code is law」的精神得到最大尊重

**限制**：升級速度極慢（SegWit 從提案到啟動耗時 ~2 年、Taproot ~3 年）、保守態度可能阻礙有益的創新、缺乏正式的爭議解決機制、「Ossification」（協議僵化）的擔憂

## Ethereum：EIP Process + Coordinated Hard Forks

### 設計哲學

Ethereum 的治理模型可以描述為「仁慈的社會共識」：核心開發者透過定期的 AllCoreDevs 會議協調升級方向，但最終的合法性來源是更廣泛的社群共識。與 Bitcoin 不同，Ethereum 積極擁抱 hard fork 作為協議演進的工具，將其視為軟體更新而非危機。

### EIP 流程

EIP（Ethereum Improvement Proposal）遵循結構化的審查流程：

| 狀態 | 說明 |
|------|------|
| Draft | 初始提案，開放討論 |
| Review | 正在接受同行審查 |
| Last Call | 最後評論期（14 天） |
| Final | 被接受為標準 |
| Stagnant | 6 個月無活動 |
| Withdrawn | 被作者撤回 |

### EIP 類型

| 類型 | 說明 | 範例 |
|------|------|------|
| Standards Track - Core | 需要 hard fork 的共識變更 | EIP-1559、EIP-4844 |
| Standards Track - Networking | P2P 網路協議變更 | EIP-4938 |
| Standards Track - Interface | API/ABI 標準 | EIP-712（Typed Data Signing） |
| Standards Track - ERC | 應用層標準（合約介面） | ERC-20、ERC-721 |
| Meta | 流程變更 | EIP-1 |
| Informational | 資訊性文件 | EIP-2 |

### 協調 Hard Fork 機制

Ethereum 的 hard fork 是一個高度協調的社會過程：

1. **EIP 選入**：AllCoreDevs Call 決定哪些 EIP 被包含在下一次 hard fork
2. **命名**：每次 hard fork 有代號（如 Dencun, Pectra）
3. **多測試網部署**：先在 devnet -> Goerli -> Sepolia -> Holesky 等測試網驗證
4. **主網啟動**：設定 slot/epoch 數，所有客戶端在同一時間點切換規則
5. **監控**：升級後密切監控網路狀態

### 重大升級歷史

<pre class="mermaid">
timeline
    title Ethereum Major Upgrades
    2015 : Frontier
         : 創世啟動
    2016 : The DAO Fork
         : 爭議性 hard fork, ETC 分裂
    2017 : Byzantium + Constantinople
         : EVM 改進, 費用調整
    2021 : London (EIP-1559)
         : 費用市場改革, ETH 燃燒
    2022 : The Merge
         : PoW -> PoS 遷移
    2024 : Dencun (EIP-4844)
         : Blob 交易, Proto-Danksharding
    2025 : Pectra
         : EIP-7702 Account Abstraction
    2026+ : Fusaka / Osaka
         : Verkle Trees, PeerDAS
</pre>

### 多客戶端架構

Ethereum 的治理獨特之處在於多客戶端架構：

| 層 | 客戶端 | 語言 |
|----|--------|------|
| Execution | Geth | Go |
| Execution | Nethermind | C# |
| Execution | Besu | Java |
| Execution | Erigon | Go |
| Execution | Reth | Rust |
| Consensus | Prysm | Go |
| Consensus | Lighthouse | Rust |
| Consensus | Teku | Java |
| Consensus | Lodestar | TypeScript |
| Consensus | Nimbus | Nim |

每次 hard fork 需要所有客戶端團隊獨立實作並通過互操作性測試（hive tests），這增加了升級的時間成本，但大幅提升了安全性和抗單點故障能力。

### 優勢與限制

**優勢**：定期的升級節奏推動協議持續進化、多客戶端架構增強安全性、EIP 流程提供了結構化的討論框架、The Merge 證明了大規模協調升級的可行性

**限制**：hard fork 的協調成本高（需要所有客戶端同時準備好）、AllCoreDevs 的影響力集中引發去中心化疑慮、升級延遲頻繁（原定時間常被推遲）、多客戶端實作不一致可能導致共識 bug

## Solana：Feature Gates + On-chain Voting

### 設計哲學

Solana 的治理模型反映了其「快速迭代」的工程文化。Feature gate 機制讓協議變更可以像軟體的 feature flag 一樣被部署和啟用——新功能先被編譯到客戶端中但預設關閉，待 validator 投票達到閾值後自動啟用。這種設計大幅縮短了從提案到上線的週期。

### SIMD 流程

SIMD（Solana Improvement Document）是 Solana 的提案流程：

1. **Draft**：在 GitHub 上提交 SIMD 草案
2. **社群討論**：透過 GitHub discussions 和 Solana 開發者論壇討論
3. **審查**：由核心開發者和社群成員審查技術細節
4. **實作**：被接受的 SIMD 由客戶端團隊實作
5. **Feature Gate**：實作完成後透過 feature gate 部署

### Feature Gate 機制

Feature gate 是 Solana 協議升級的核心機制：

```
Feature Gate Lifecycle:
  1. 開發者實作新功能，綁定一個 feature gate pubkey
  2. 新版本客戶端包含此功能但預設未啟用
  3. Validator 升級客戶端後，可以選擇支持啟用
  4. 當支持的 stake 超過 95%，feature 在下一個 epoch 啟動
  5. 啟動後所有節點必須遵守新規則
```

### 鏈上投票

Solana 的 feature gate 啟用基於鏈上的 stake-weighted 投票：

$$\text{啟用條件: } \frac{\text{supporting\_stake}}{\text{total\_active\_stake}} \geq 0.95$$

每個 feature gate 有一個對應的 Solana 帳戶（feature account），validator 透過交易表達對該 feature 的支持。一旦支持的 stake 比例達到 95%，feature 在下一個 epoch boundary 自動啟用。

### 多客戶端發展

Solana 正在發展多客戶端架構：

| 客戶端 | 開發者 | 語言 | 狀態 |
|--------|--------|------|------|
| Agave（原 Solana Labs） | Anza | Rust | 主要客戶端 |
| [Firedancer](/solana/advanced/firedancer/) | Jump Crypto | C | 開發中，部分組件已部署 |
| Sig | Syndica | Zig | 早期開發 |

### 重大升級歷史

<pre class="mermaid">
timeline
    title Solana Major Upgrades
    2020 : Mainnet Beta 啟動
         : 初始協議
    2021 : 多次網路中斷
         : 穩定性挑戰
    2022 : QUIC 遷移
         : 改善 Tx ingress
    2023 : Priority Fees
         : 本地 fee market
    2024 : Firedancer 組件上線
         : frankendancer 混合模式
    2025 : Alpenglow 共識
         : 新共識協議提案
    2025+ : SIMD-0296 v1 Txs
         : 4096 byte 交易格式
</pre>

### 優勢與限制

**優勢**：極快的升級週期（數週而非數月/年）、feature gate 機制減少升級的協調成本、stake-weighted 投票提供了明確的決策機制、漸進式啟用降低風險

**限制**：快速迭代可能引入未經充分測試的變更、validator 的投票權集中於大 stake 持有者、多客戶端尚未成熟（Firedancer 仍在開發中）、治理過程的去中心化程度受質疑

## 深度比較

### 治理光譜

<pre class="mermaid">
graph LR
    A["保守/去中心化<br/>Bitcoin<br/>數年一次升級<br/>soft fork 優先"] --> B["審慎/協調<br/>Ethereum<br/>6-12 個月一次<br/>hard fork 為主"]
    B --> C["快速/高效<br/>Solana<br/>持續升級<br/>feature gate 投票"]

    style A fill:#f7931a,stroke:#c16c12,color:#fff
    style B fill:#627eea,stroke:#3b5bb5,color:#fff
    style C fill:#9945ff,stroke:#7a35cc,color:#fff
</pre>

### 決策權力分佈

| 利害關係者 | Bitcoin | Ethereum | Solana |
|-----------|---------|----------|--------|
| 核心開發者 | 提案與實作 | 提案、實作與排程 | 提案、實作與部署 |
| 礦工/Validators | 算力信號（啟動決策） | 需升級客戶端（隱式同意） | Stake-weighted 投票（明確決策） |
| 節點運營者 | 選擇是否升級（UASF 權力） | 選擇客戶端版本 | 需跟隨 validator 多數 |
| 使用者/社群 | 市場選擇（BCH vs BTC） | 論壇討論、社會壓力 | 有限（delegate to validators） |
| 基金會/公司 | 無正式角色 | Ethereum Foundation 協調 | Solana Foundation 資助 |

### 升級風險管理

| 風險類型 | Bitcoin | Ethereum | Solana |
|---------|---------|----------|--------|
| 鏈分裂 | 可能（BCH, BSV 歷史） | 可能（ETC 歷史） | 極低（投票機制） |
| 共識 bug | 極低（變更少） | 中等（多客戶端降低） | 中等（快速修復能力強） |
| 升級延遲 | 常見（保守文化） | 常見（協調複雜） | 少見（快速迭代） |
| 不當變更 | 極低（審查嚴格） | 低（多層審查） | 中等（速度換取風險） |

### 向後相容性

**Bitcoin**：Soft fork 天然向後相容。未升級的節點仍然接受新區塊（雖然無法驗證新規則）。這使得 Bitcoin 的升級對節點運營者的壓力最小。

**Ethereum**：Hard fork 不向後相容。每次升級都要求所有節點在截止日期前升級客戶端，否則會被分叉到舊鏈。這給節點運營者帶來定期的維護壓力。

**Solana**：Feature gate 在啟用前是向後相容的（功能存在但未啟用）。啟用後，未升級的 validator 會因無法產生有效的投票而逐漸被排除。

## 實際影響

### 對開發者

- **Bitcoin 開發者**面對最穩定但也最受限的協議環境。新功能（如 OP_CAT、CTV）的引入可能需要數年的討論和共識建立。開發者更傾向在 L2（Lightning、Liquid）上創新。
- **Ethereum 開發者**享受定期的協議改進（新 opcode、gas 優化、帳戶抽象），但也需要適應每次 hard fork 帶來的行為變更。ERC 標準流程使得應用層的標準化較為順暢。
- **Solana 開發者**可以較快享受到新的 runtime 功能和效能優化，但也需要適應更頻繁的環境變化。SIMD 流程相對年輕，標準化程度不如 EIP/BIP。

### 對使用者

使用者通常不直接參與治理，但治理決策的影響是深遠的。Bitcoin 的保守治理讓使用者可以信任協議的長期穩定性（「21M 上限永遠不會改變」）。Ethereum 的積極治理帶來了 EIP-1559 的費用改革和 The Merge 的環保轉型。Solana 的快速迭代幫助解決了早期的穩定性問題並持續改善效能。

### 對生態系

治理模型深刻塑造了各鏈的社群文化。Bitcoin 社群重視「don't trust, verify」的精神，對變更持懷疑態度。Ethereum 社群更具技術實驗精神，「move fast and iterate」的態度推動了 DeFi 和 NFT 的快速發展。Solana 社群則以工程效率為導向，強調實際效能和使用者體驗。

## 相關概念

- [Bitcoin Forks](/bitcoin/consensus/bitcoin-forks/) - Bitcoin 軟分叉與硬分叉的技術細節
- [Beacon Chain](/ethereum/consensus/beacon-chain/) - Ethereum PoS 共識層
- [Alpenglow](/solana/consensus/alpenglow/) - Solana 下一代共識協議提案
- [Validators (SOL)](/solana/consensus/validators-staking/) - Solana 驗證者與質押機制
- [共識機制比較](/comparisons/consensus-mechanisms/) - 三鏈共識機制的全面比較
- [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) - Bitcoin 工作量證明共識
- [Casper FFG](/ethereum/consensus/casper-ffg/) - Ethereum 最終性機制
- [Schnorr Signatures](/bitcoin/cryptography/schnorr-signatures/) - Taproot 升級引入的簽名方案
- [EIP-4844](/ethereum/advanced/eip-4844/) - Dencun 升級的核心 EIP
- [EIP-1559](/ethereum/accounts/eip-1559/) - London 升級的費用市場改革
- [Firedancer](/solana/advanced/firedancer/) - Solana 多客戶端架構的關鍵
- [Slashing](/ethereum/consensus/slashing/) - Ethereum 驗證者懲罰機制
