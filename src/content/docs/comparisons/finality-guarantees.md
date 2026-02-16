---
title: "最終性保證比較"
description: "Bitcoin 機率性最終性、Ethereum 經濟最終性、Solana 樂觀確認與 rooted 最終性的量化分析與深度比較"
tags: [comparison, bitcoin, ethereum, solana, finality, consensus, security, probabilistic, economic]
---

# 最終性保證比較

## 概述

最終性（finality）是區塊鏈最核心的安全屬性之一——它回答了一個根本問題：**一筆交易在什麼時候可以被認為是不可逆轉的？** 三條主流公鏈對這個問題給出了截然不同的答案。Bitcoin 的 [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) 提供機率性最終性，確認數越多安全性越高但永遠不會達到 100%；Ethereum 的 [Casper FFG](/ethereum/consensus/casper-ffg/) 提供經濟最終性，一旦 finalized 則逆轉成本可量化且極其高昂；Solana 的 [Tower BFT](/solana/consensus/tower-bft/) 提供快速的樂觀確認，搭配 lockout 指數遞增機制達到 rooted 狀態。

這些差異直接影響了交易所充值確認時間、DeFi 協議的風險模型、跨鏈橋的安全設計、以及日常交易的使用體驗。本文將以量化數據和數學模型深入比較三者的最終性保證。

## 快速比較表

| 指標 | Bitcoin | Ethereum | Solana |
|------|---------|----------|--------|
| **最終性類型** | 機率性 (probabilistic) | 經濟性 (economic) | 樂觀 + rooted |
| **出塊時間** | ~10 分鐘 | 12 秒 | ~400 毫秒 |
| **商業可接受最終性** | ~60 分鐘 (6 確認) | ~13 分鐘 (2 epochs) | ~6.4 秒 (rooted) |
| **絕對最終性** | 不存在 | 存在 (finalized) | 準最終性 (deep rooted) |
| **逆轉成本** | 取決於算力 | > 1/3 質押被 slash | > 1/3 質押被 slash |
| **理論 TPS** | ~7 | ~15-30 | ~65,000 |
| **實際 TPS** | ~3-5 | ~12-15 | ~2,000-4,000 |
| **狀態大小** | ~5 GB (UTXO set) | ~100+ GB | ~100+ GB |

## Bitcoin：機率性最終性

### 設計哲學

Bitcoin 的最終性模型源於 [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) 的根本設計——在 permissionless 環境下，沒有任何機制可以保證一個決定是「真正最終的」。取而代之的是，隨著後續區塊的累積，逆轉交易的難度指數級增長，使得攻擊在經濟上不可行。

### 技術細節

#### 雙重花費攻擊模型

攻擊者持有全網 $q$ 比例的算力，誠實節點持有 $p = 1 - q$。交易後已有 $z$ 個確認區塊，攻擊者需要從落後的位置追上誠實鏈。

**簡化模型（隨機遊走）**：

$$P(\text{attacker catches up}) = \begin{cases} 1 & \text{if } q \geq p \\ (q/p)^z & \text{if } q < p \end{cases}$$

**精確模型（Poisson 分佈）**：

攻擊者在誠實節點找到 $z$ 個區塊的時間內，預期找到的區塊數為 $\lambda = z \cdot q/p$：

$$P = 1 - \sum_{k=0}^{z} \frac{e^{-\lambda} \lambda^k}{k!} \left(1 - (q/p)^{z-k}\right)$$

#### 量化安全性

| 確認數 $z$ | $q = 0.1$ (10%) | $q = 0.2$ (20%) | $q = 0.3$ (30%) | $q = 0.4$ (40%) |
|-----------|-----------------|-----------------|-----------------|-----------------|
| 1 | $2.0 \times 10^{-1}$ | $4.2 \times 10^{-1}$ | $6.3 \times 10^{-1}$ | $8.1 \times 10^{-1}$ |
| 3 | $1.3 \times 10^{-2}$ | $7.5 \times 10^{-2}$ | $2.5 \times 10^{-1}$ | $5.3 \times 10^{-1}$ |
| 6 | $2.4 \times 10^{-4}$ | $1.0 \times 10^{-2}$ | $9.9 \times 10^{-2}$ | $3.5 \times 10^{-1}$ |
| 10 | $1.2 \times 10^{-6}$ | $1.3 \times 10^{-3}$ | $3.9 \times 10^{-2}$ | $2.3 \times 10^{-1}$ |
| 20 | $5.4 \times 10^{-12}$ | $1.6 \times 10^{-6}$ | $1.6 \times 10^{-3}$ | $5.4 \times 10^{-2}$ |
| 30 | $2.4 \times 10^{-17}$ | $2.1 \times 10^{-9}$ | $6.1 \times 10^{-5}$ | $1.6 \times 10^{-2}$ |

#### 行業標準確認要求

| 場景 | 確認數 | 等待時間 | 原因 |
|------|--------|----------|------|
| 小額支付 | 0-1 | 0-10 分鐘 | 雙重花費的經濟動機低 |
| 一般交易 | 3 | ~30 分鐘 | 攻擊機率 < 1%（假設 $q < 0.2$） |
| 大額交易 | 6 | ~60 分鐘 | Satoshi 白皮書建議 |
| 交易所充值 | 3-6 | 30-60 分鐘 | 平衡使用者體驗與安全 |
| 大型交易所 (BTC) | 2-6 | 20-60 分鐘 | 依金額調整 |

### 優勢

- **無需信任假設**：安全性僅基於算力分佈，不需信任任何特定實體
- **簡潔的安全模型**：數學上可精確計算任意確認數的攻擊機率
- **漸進式安全**：安全性隨時間連續增長，可根據交易金額靈活選擇

### 限制

- **漫長的等待**：商業可接受的安全性需要 ~60 分鐘
- **永不絕對**：理論上任何交易都可被逆轉（雖然成本天文數字）
- **受算力波動影響**：若攻擊者租借大量算力，安全假設可能暫時不成立

## Ethereum：經濟最終性

### 設計哲學

Ethereum 的 [Casper FFG](/ethereum/consensus/casper-ffg/) 追求一種更強的保證——**economic finality**：一旦交易被 finalized，逆轉它需要銷毀大量質押的 ETH，使得攻擊的經濟成本可以被精確計算且極其高昂。這比 Bitcoin 的機率性保證更接近「確定性最終性」。

### 技術細節

#### Finality 的生命週期

<pre class="mermaid">
stateDiagram-v2
    [*] --> Proposed: Block proposed (1 slot = 12s)
    Proposed --> Attested: Validators attest
    Attested --> Justified: Supermajority link<br/>(&gt; 2/3 stake)
    Justified --> Finalized: Next epoch also justified<br/>(~2 epochs = ~12.8 min)

    note right of Attested
        大多數 DApp 在此階段
        即視為「已確認」
    end note

    note right of Finalized
        逆轉需要 slash
        &gt; 1/3 質押量
    end note
</pre>

#### Casper FFG 的 2/3 門檻

Supermajority link 要求超過 2/3 的 active validator 質押量：

$$\frac{\sum_{\text{votes } A \rightarrow B} \text{effective\_balance}}{\text{total\_active\_balance}} > \frac{2}{3}$$

**為什麼是 2/3？** 因為要同時 finalize 兩個衝突的 checkpoint，需要兩組各 > 2/3 的投票。$2/3 + 2/3 > 1$，所以至少有 $1/3$ 的 validator 必須雙投（equivocate），會被 [slashed](/ethereum/consensus/slashing/)。

#### Slashing 的經濟保證

Finalized 區塊的安全保證：

$$\text{逆轉成本} \geq \frac{1}{3} \times \text{total\_staked\_ETH} \times \text{ETH\_price}$$

以 2024 年數據估算：
- Total staked: ~33M ETH
- 1/3 質押: ~11M ETH
- 以 ETH = $3,000 計：逆轉成本 > $33B

此外，correlation penalty 機制使得大規模 slashing 的懲罰更加嚴厲：

$$\text{penalty}_i = \text{effective\_balance}_i \times \min\left(\frac{3 \times \text{total\_slashed}}{total\_balance}, 1\right)$$

#### 最終性時間線

| 階段 | 時間 | 狀態 | 安全保證 |
|------|------|------|----------|
| Block proposed | T+0 | 提議 | 可能被 reorg |
| Attestations | T+4-12s | 被投票 | 多數節點認可（1 slot） |
| Epoch boundary | T+6.4m | Justified | > 2/3 投票支持 |
| **Finalized** | **T+12.8m** | **最終** | **逆轉需銷毀 > 1/3 質押** |

#### Inactivity Leak

如果 finality 停滯超過 4 epochs（~25 分鐘），[Beacon Chain](/ethereum/consensus/beacon-chain/) 啟動 **inactivity leak**：

$$\text{penalty}_i \propto \text{inactivity\_score}_i \times \text{effective\_balance}_i$$

離線 validator 的質押逐漸流失，直到在線 validator 的比例重新超過 2/3，恢復 finality。這確保了即使大量 validator 離線，系統最終也能恢復。

### 優勢

- **可量化的安全保證**：逆轉成本以美元/ETH 精確計算
- **Accountable safety**：違規 validator 可被識別並懲罰
- **Liveness 保證**：inactivity leak 確保 finality 最終恢復
- **形式化驗證**：Casper FFG 有嚴格的數學安全證明

### 限制

- **~13 分鐘延遲**：從提交到 finalized 需要 ~2 epochs
- **Weak subjectivity**：長時間離線的節點需要從可信來源同步
- **複雜度高**：FFG + GHOST 的交互增加了實作和推理的難度
- **Finality 可能停滯**：如果 > 1/3 validator 離線，finality 會暫停

## Solana：樂觀確認 + Rooted

### 設計哲學

Solana 的最終性設計優先追求**速度**。[Tower BFT](/solana/consensus/tower-bft/) 的 lockout 機制讓 validator 的投票承諾隨時間指數級增強，配合 [Proof of History](/solana/consensus/proof-of-history/) 的全域時鐘，實現了數秒級的交易確認。Solana 區分了「optimistic confirmation」（快速但較弱）和「rooted」（較慢但更強）兩個層次。

### 技術細節

#### 確認層級

1. **Processed**：交易被 leader 處理並包含在 block 中（~400ms）
2. **Confirmed (Optimistic)**：超過 2/3 質押量投票支持（~1-2s）
3. **Finalized (Rooted)**：投票的 lockout 達到足夠深度（~6.4s，32 slots 確認深度）

#### Tower BFT Lockout 機制

Validator 維護一個投票堆疊。每次投票有一個 lockout 期，在此期間不能對衝突的 fork 投票：

$$\text{lockout}(n) = 2^{n+1} \text{ slots}$$

投票堆疊示例：

| 堆疊位置 | Slot 投票 | Lockout (slots) | 過期 Slot |
|----------|----------|-----------------|-----------|
| 0 (頂部) | 100 | 4 | 104 |
| 1 | 98 | 8 | 106 |
| 2 | 95 | 16 | 111 |
| 3 | 90 | 32 | 122 |
| ... | ... | ... | ... |
| 31 (底部) | 10 | $2^{32} \approx 4.3B$ | 實質不可逆 |

當投票堆疊達到 32 層深時，最底層的 lockout 超過 $2^{32}$ slots（約 ~54 年），此投票對應的 slot 被視為 **rooted**。

#### Rooted 的安全保證

Rooted slot 的逆轉需要 > 1/3 的 validator 違反 lockout 規則，這意味著：
- 他們會被 slashed
- 他們需要放棄所有在 lockout 期間累積的投票獎勵

$$\text{逆轉成本} \geq \frac{1}{3} \times \text{total\_staked\_SOL} \times \text{SOL\_price}$$

#### Optimistic Confirmation

Solana 的 [Alpenglow](/solana/consensus/alpenglow/) 升級進一步優化了確認速度：

- 當 > 2/3 質押量的 validator 對一個 slot 投票後，即達到 optimistic confirmation
- 這通常在 1-2 秒內完成
- Optimistic confirmation 的安全性等同於逆轉需要 > 1/3 質押被 slash

### 優勢

- **極速確認**：optimistic confirmation 在 1-2 秒內
- **分層安全**：DApp 可根據場景選擇 processed/confirmed/finalized
- **經濟最終性**：rooted 後逆轉成本與 Ethereum 同級

### 限制

- **網路停機風險**：歷史上多次出現全網停機，影響 finality
- **較年輕的設計**：相比 Bitcoin/Ethereum 實戰考驗較少
- **硬體依賴**：高性能要求限制了 validator 多樣性

## 深度比較

### 最終性時間線對比

<pre class="mermaid">
gantt
    title 最終性時間線比較（秒）
    dateFormat s
    axisFormat %S

    section Bitcoin
    1 confirmation (10 min)    :btc1, 0, 600s
    6 confirmations (60 min)   :btc6, 0, 3600s

    section Ethereum
    1 slot attestation (12s)   :eth1, 0, 12s
    Justified (~6.4 min)       :ethj, 0, 384s
    Finalized (~12.8 min)      :ethf, 0, 768s

    section Solana
    Processed (~400ms)         :sol1, 0, 1s
    Confirmed (~1.5s)          :sol2, 0, 2s
    Rooted (~6.4s)             :sol3, 0, 7s
</pre>

### 安全性-速度權衡

| 場景 | 推薦確認層級 | Bitcoin | Ethereum | Solana |
|------|-------------|---------|----------|--------|
| **咖啡支付** | 最低安全 | 0-conf (~instant) | 1 slot (~12s) | processed (~400ms) |
| **線上購物** | 低安全 | 1 conf (~10 min) | 1 slot (~12s) | confirmed (~1.5s) |
| **DeFi 操作** | 中安全 | 3 conf (~30 min) | justified (~6.4 min) | confirmed (~1.5s) |
| **交易所充值** | 高安全 | 6 conf (~60 min) | finalized (~13 min) | finalized (~6.4s) |
| **大額轉帳** | 最高安全 | 12+ conf (~2 hrs) | finalized (~13 min) | finalized (~6.4s) |
| **跨鏈橋** | 極高安全 | 6+ conf (~60 min) | finalized (~13 min) | finalized (~6.4s) |

### 逆轉成本比較

| 攻擊類型 | Bitcoin | Ethereum | Solana |
|----------|---------|----------|--------|
| **51% attack / 1/3 stake** | 租用算力成本 ($XX B/hr) | > 1/3 質押被 slash (~$33B) | > 1/3 質押被 slash (~$XB) |
| **攻擊可持續性** | 需持續消耗能源 | 一次性損失（被 slash 後無法繼續） | 一次性損失 |
| **攻擊可檢測性** | 事後可檢測（分叉） | 即時可檢測 + 自動 slash | 即時可檢測 + 自動 slash |
| **攻擊後恢復** | 自動（最長鏈勝出） | 自動（inactivity leak） | 需要人工干預（歷史先例） |

### Liveness vs Safety Trade-off

**Bitcoin** 選擇 liveness over safety：即使存在分叉（暫時違反 safety），網路始終可以產生新區塊（liveness 保證）。最終通過最長鏈規則收斂。

**Ethereum** 在正常情況下兩者兼顧：LMD GHOST 保證 liveness，Casper FFG 保證 safety。但在極端情況下（> 1/3 offline），會暫時犧牲 finality（safety）以維持 liveness（inactivity leak）。

**Solana** 優先 liveness：leader-based 出塊確保高速產出。但歷史上的多次停機事件表明，在極端壓力下 liveness 保證可能失效。

## 實際影響

### 對開發者

**交易確認策略**：

```
// 跨鏈場景的確認等待邏輯（偽代碼）
function waitForFinality(chain, txHash):
    switch chain:
        case "bitcoin":
            waitForConfirmations(txHash, 6)     // ~60 min
        case "ethereum":
            waitForFinalized(txHash)            // ~13 min
        case "solana":
            waitForFinalized(txHash)            // ~6.4s
```

**重組處理**：
- Bitcoin DApp 必須處理 reorg 邏輯（回滾本地狀態）
- Ethereum DApp 在 finalized 後無需擔心 reorg
- Solana DApp 在 rooted 後無需擔心，但需處理 leader 切換導致的短暫不確定性

### 對使用者

- **Bitcoin**：大額轉帳需要耐心等待，小額可接受 0-conf 的便利性
- **Ethereum**：~12 秒看到交易，~13 分鐘完全安心
- **Solana**：幾乎即時的使用者體驗，但需接受偶爾的網路不穩定

### 對生態系統

最終性速度直接影響跨鏈橋的設計與安全假設。Bitcoin 的長確認時間是跨鏈橋的主要瓶頸，通常使用 multisig 或 threshold 方案來提前釋放資金。Ethereum 的 finalized 提供了明確的安全界限。Solana 的快速 finality 使得跨鏈操作更流暢，但橋設計者需要考慮其歷史停機風險。

## 相關概念

- [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) - Bitcoin 共識機制
- [最長鏈規則](/bitcoin/consensus/longest-chain-rule/) - Bitcoin fork choice rule
- [Casper FFG](/ethereum/consensus/casper-ffg/) - Ethereum finality gadget
- [LMD GHOST](/ethereum/consensus/lmd-ghost/) - Ethereum fork choice rule
- [Consensus Finality (ETH)](/ethereum/transaction-lifecycle/consensus-finality/) - Ethereum 交易最終性
- [Slashing](/ethereum/consensus/slashing/) - Ethereum 懲罰機制
- [Attestation](/ethereum/consensus/attestation/) - Ethereum 驗證者投票
- [Tower BFT](/solana/consensus/tower-bft/) - Solana 共識機制
- [Proof of History](/solana/consensus/proof-of-history/) - Solana 時間證明
- [Alpenglow](/solana/consensus/alpenglow/) - Solana 共識升級
- [共識機制比較](/comparisons/consensus-mechanisms/) - 三鏈共識機制對比
- [手續費市場比較](/comparisons/fee-markets/) - 三鏈費用機制對比
