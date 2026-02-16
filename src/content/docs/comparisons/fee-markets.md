---
title: "手續費市場機制比較"
description: "Bitcoin 純拍賣制、Ethereum EIP-1559 基礎費 + 小費、Solana 本地費用市場 + 優先費的深度比較"
tags: [comparison, bitcoin, ethereum, solana, fees, gas, eip-1559, priority-fees, mempool, mev]
---

# 手續費市場機制比較

## 概述

手續費市場是區塊鏈的資源定價機制——它決定了使用者如何競爭有限的區塊空間，以及礦工/驗證者如何從中獲得收入。三條主流公鏈採用了截然不同的費用模型：Bitcoin 使用純粹的第一價格拍賣（first-price auction），使用者出價競爭 [mempool](/bitcoin/network/mempool-btc/) 中的位置；Ethereum 的 [EIP-1559](/ethereum/accounts/eip-1559/) 引入了雙層結構——算法調整的 base fee（銷毀）加上使用者設定的 priority fee（給驗證者）；Solana 則採用本地費用市場（local fee markets），不同 program 的 [compute units](/solana/runtime/compute-units/) 費率獨立計算，搭配 priority fee 和 [Jito MEV](/solana/advanced/jito-mev/) 拍賣。

這些設計反映了不同的經濟哲學——Bitcoin 信奉自由市場定價，Ethereum 追求費用可預測性，Solana 則試圖在高吞吐量場景下避免全域擁塞。理解費用機制是有效使用任何區塊鏈的基礎。

## 快速比較表

| 屬性 | Bitcoin | Ethereum | Solana |
|------|---------|----------|--------|
| **費用模型** | 第一價格拍賣 | Base fee + Priority fee | Base fee + Priority fee |
| **計價單位** | sat/vByte | Gwei/gas | Lamports/compute unit |
| **Base fee** | 無 | 算法動態調整（銷毀） | 固定基礎費（~5000 lamports） |
| **費用銷毀** | 無 | Base fee 100% 銷毀 | 50% 銷毀 |
| **費用去向** | 100% 給礦工 | Priority fee 給驗證者 | 50% 給驗證者 + 50% 銷毀 |
| **平均費用** | $1-50（波動大） | $0.5-50（波動大） | ~$0.00025（穩定低） |
| **擁塞處理** | RBF/CPFP 加速 | Base fee 自動上調 | 本地費用市場隔離 |
| **MEV** | 有（礦工排序） | 有（PBS, MEV-Boost） | 有（Jito） |

## Bitcoin：第一價格拍賣

### 設計哲學

Bitcoin 的費用市場是最純粹的「自由市場」——使用者競標區塊空間，出價最高者優先被打包。沒有協議層面的費用調節機制，完全由供需決定。這反映了 Bitcoin 對最小化協議複雜度的堅持。

### 技術細節

#### 費用計算

Bitcoin 交易費用基於**交易的虛擬大小（virtual bytes, vB）**：

$$\text{fee} = \text{tx\_vsize} \times \text{fee\_rate (sat/vB)}$$

虛擬大小考慮了 SegWit 的 witness discount：

$$\text{vsize} = \max\left(\text{base\_size}, \frac{\text{weight}}{4}\right)$$

$$\text{weight} = \text{base\_size} \times 3 + \text{total\_size}$$

其中 witness data 享有 75% 的折扣。

#### 不同交易類型的費用

| 交易類型 | 典型 vsize | 費率 10 sat/vB | 費率 50 sat/vB |
|----------|-----------|---------------|---------------|
| [P2WPKH](/bitcoin/transactions/p2wpkh-p2wsh/) 1-in 2-out | ~141 vB | ~1,410 sat | ~7,050 sat |
| [P2TR](/bitcoin/transactions/p2tr/) 1-in 2-out | ~154 vB | ~1,540 sat | ~7,700 sat |
| [P2PKH](/bitcoin/transactions/p2pkh/) 1-in 2-out | ~226 vB | ~2,260 sat | ~11,300 sat |
| 多簽 2-of-3 P2WSH | ~164 vB | ~1,640 sat | ~8,200 sat |

#### Fee Estimation

[Fee estimation](/bitcoin/transactions/fee-estimation/) 基於 mempool 狀態：

```
// 簡化的費率估算邏輯
function estimateFeeRate(targetBlocks):
    mempool = getMempoolTransactions()
    sortByFeeRate(mempool, descending)

    for each simulated block:
        fill block (4M weight) from mempool top

    // targetBlocks 個區塊後剩餘的最高費率交易
    return feeRateAtPosition(targetBlocks * blockCapacity)
```

#### RBF 與 CPFP

當費率不足時，Bitcoin 提供兩種加速機制：

**[RBF（Replace-By-Fee）](/bitcoin/transactions/rbf-cpfp/)**：用更高費率重新廣播同一筆交易：

$$\text{new\_fee} > \text{old\_fee} + \text{relay\_fee\_increment}$$

**[CPFP（Child-Pays-For-Parent）](/bitcoin/transactions/rbf-cpfp/)**：花費低費率交易的 output，並支付足夠高的費率使整個「package」有吸引力：

$$\text{package\_fee\_rate} = \frac{\text{parent\_fee} + \text{child\_fee}}{\text{parent\_vsize} + \text{child\_vsize}}$$

### 費用流向

<pre class="mermaid">
graph LR
    U[使用者] -->|支付 fee| TX[Transaction]
    TX -->|包含在區塊中| M[礦工]
    M -->|收取| R[100% 歸礦工<br/>= block reward + fees]

    style U fill:#f7931a,color:#fff
    style TX fill:#333,color:#fff
    style M fill:#f7931a,color:#fff
    style R fill:#f7931a,color:#fff
</pre>

### 優勢

- **簡潔透明**：使用者直接看到供需關係
- **無協議風險**：費用機制不可能有 bug
- **靈活定價**：使用者完全控制費率選擇
- **RBF/CPFP**：提供事後補救機制

### 限制

- **費率波動劇烈**：高峰期費率可飆升 100x+
- **估算困難**：第一價格拍賣導致「winner's curse」，使用者傾向多付
- **灰塵問題**：小額 UTXO 在高費率時期可能永遠無法經濟地花費
- **MEV**：礦工可以重排交易以獲取額外利潤

## Ethereum：EIP-1559 (Base Fee + Priority Fee)

### 設計哲學

[EIP-1559](/ethereum/accounts/eip-1559/)（2021 年 London 升級）徹底改變了 Ethereum 的費用市場，引入了算法定價的 base fee。核心洞察是：**區塊空間的「公平價格」應由協議算法決定，而非純拍賣**。使用者只需決定願意支付的最大費用和小費，而不必猜測出價。

### 技術細節

#### 費用結構

$$\text{total\_fee} = \text{gas\_used} \times (\text{base\_fee} + \text{priority\_fee})$$

- **Base fee**：由協議根據前一區塊的使用率動態調整
- **Priority fee (tip)**：使用者設定，支付給驗證者
- **Max fee**：使用者設定的費用上限

#### Base Fee 動態調整

每個區塊的目標 gas 使用量為 gas limit 的 50%（目標 15M gas，最大 30M gas）：

$$\text{base\_fee}_{n+1} = \text{base\_fee}_n \times \left(1 + \frac{1}{8} \times \frac{\text{gas\_used}_n - \text{target\_gas}}{\text{target\_gas}}\right)$$

- 區塊 100% 滿：base fee 增加 12.5%
- 區塊 50% 滿（目標）：base fee 不變
- 區塊空：base fee 減少 12.5%

$$\text{最大單區塊漲幅} = 12.5\%$$

$$\text{連續 n 個滿區塊後的 base fee} = \text{base\_fee}_0 \times (1.125)^n$$

#### 費用流向

<pre class="mermaid">
graph LR
    U[使用者] -->|支付 max fee| TX[Transaction]
    TX --> BF[Base Fee<br/>100% 銷毀]
    TX --> PF[Priority Fee<br/>給 Validator]
    TX --> RF[Refund<br/>退回使用者]

    BF -->|burn| BURN["銷毀 (deflationary)"]
    PF --> V[Validator]
    RF --> U

    style BF fill:#ff6b6b,color:#fff
    style PF fill:#627eea,color:#fff
    style BURN fill:#333,color:#fff
</pre>

#### Gas 消耗範例

```solidity
// 常見操作的 gas 成本
// ETH 轉帳：21,000 gas
// ERC-20 transfer：~65,000 gas
// Uniswap swap：~150,000 gas
// NFT mint：~100,000-200,000 gas
// 合約部署：~1,000,000+ gas

// 費用計算範例（base fee = 20 gwei, tip = 2 gwei）
// ETH 轉帳：21,000 * 22 gwei = 462,000 gwei = 0.000462 ETH
// Uniswap swap：150,000 * 22 gwei = 3,300,000 gwei = 0.0033 ETH
```

#### [Gas](/ethereum/accounts/gas/) 退款機制

使用者設定 `maxFeePerGas`，實際支付 `baseFee + priorityFee`，差額退還：

$$\text{refund} = (\text{maxFeePerGas} - \text{baseFee} - \text{priorityFee}) \times \text{gasUsed}$$

### 優勢

- **費用可預測性**：base fee 是公開且可預測的，使用者不必猜測出價
- **通貨緊縮效應**：base fee 銷毀減少 ETH 供應量
- **抗 MEV**：base fee 部分不歸驗證者，減少了排序操縱的動機
- **消除 winner's curse**：使用者無需多付即可確保交易被打包

### 限制

- **高峰期仍然昂貴**：base fee 在擁塞時快速攀升
- **gas 抽象不直覺**：使用者需理解 gas limit、base fee、priority fee
- **L1 容量有限**：~15 TPS 的限制仍在，費用壓力仍大
- **MEV 仍然存在**：priority fee 和 [mempool](/ethereum/transaction-lifecycle/mempool/) 排序仍可被操縱

## Solana：本地費用市場 + Priority Fee

### 設計哲學

Solana 的費用設計追求兩個目標：**低成本**和**擁塞隔離**。不同於 Ethereum 的全域 gas 市場（一個熱門 NFT mint 會影響所有交易的費用），Solana 的本地費用市場使得不同 program 的擁塞是獨立的——一個熱門 DEX 不會影響穩定幣轉帳的費用。

### 技術細節

#### 費用結構

每筆 Solana 交易的費用由三部分組成：

$$\text{total\_fee} = \text{base\_fee} + \text{priority\_fee} + \text{rent}(\text{if creating accounts})$$

1. **Base fee（簽名費）**：每個簽名 5,000 lamports（固定）
2. **Priority fee**：以 [compute units](/solana/runtime/compute-units/) 計價

$$\text{priority\_fee} = \text{compute\_units\_consumed} \times \text{micro\_lamports\_per\_cu}$$

3. **Rent**：創建新帳戶時需支付的最低餘額（rent-exempt）

#### Compute Units

每筆交易有 compute unit 限額（預設 200,000 CU，最大 1,400,000 CU）：

| 操作 | 大約 CU 消耗 |
|------|-------------|
| SOL 轉帳 | ~150 CU |
| SPL Token 轉帳 | ~4,500 CU |
| Raydium Swap | ~60,000-150,000 CU |
| 複雜 DeFi 操作 | ~200,000-400,000 CU |

#### 本地費用市場

Solana 的 scheduler 根據**被寫入的帳戶**分隔交易：

```
// 概念模型
Account A (hot): 高 priority fee 競爭
Account B (cold): 基礎費率即可

// 交易 1: write Account A -> 需要高 priority fee
// 交易 2: write Account B -> 基礎費率即可
// 交易 1 的高費率不影響交易 2
```

這意味著一個熱門 NFT 鑄造導致的擁塞**不會**波及普通的 SOL 轉帳或其他不相關的 program。

#### 費用流向

<pre class="mermaid">
graph LR
    U[使用者] -->|支付 fee| TX[Transaction]
    TX --> BF[Base Fee<br/>5,000 lamports/sig]
    TX --> PF[Priority Fee<br/>micro-lamports/CU]

    BF --> SPLIT1["50% 給 Validator"]
    BF --> SPLIT2["50% 銷毀"]
    PF --> SPLIT3["50% 給 Validator"]
    PF --> SPLIT4["50% 銷毀"]

    style BF fill:#9945ff,color:#fff
    style PF fill:#14f195,color:#000
    style SPLIT2 fill:#333,color:#fff
    style SPLIT4 fill:#333,color:#fff
</pre>

#### Jito MEV

[Jito MEV](/solana/advanced/jito-mev/) 提供了額外的「小費」管道——使用者可以向 Jito validator 支付 bundle tips 以確保交易被特定順序打包：

$$\text{effective\_priority} = \text{priority\_fee} + \text{jito\_tip}$$

### 費用計算範例

```
// SOL 轉帳
base_fee = 5,000 lamports (1 signature)
priority_fee = 150 CU * 1 micro-lamport/CU = 0.00015 lamports
total = ~5,000 lamports = ~$0.00025

// Token swap (Raydium)
base_fee = 5,000 lamports (1 signature)
priority_fee = 100,000 CU * 100 micro-lamports/CU = 10,000 lamports
total = ~15,000 lamports = ~$0.00075

// 高擁塞時的 NFT mint
base_fee = 5,000 lamports
priority_fee = 200,000 CU * 50,000 micro-lamports/CU = 10,000,000 lamports
jito_tip = 100,000,000 lamports
total = ~110,005,000 lamports = ~$5.50
```

### 優勢

- **極低基礎費用**：普通交易 < $0.001
- **擁塞隔離**：本地費用市場防止全域費用飆升
- **高吞吐量**：大量區塊空間使費用壓力小
- **透明計價**：compute unit 是明確的計算單位

### 限制

- **Priority fee 仍需競爭**：熱門帳戶的交易仍需提高費率
- **Jito MEV 的中心化風險**：大量交易通過 Jito 路由
- **費用模型仍在演進**：本地費用市場的實作持續調整
- **Compute unit 估算**：動態交易難以精確預估 CU 消耗

## 深度比較

### 費用波動性

| 時期 | Bitcoin | Ethereum | Solana |
|------|---------|----------|--------|
| **低谷期** | ~$0.10 | ~$0.50 | ~$0.00025 |
| **正常期** | ~$1-5 | ~$2-10 | ~$0.00025 |
| **高峰期** | ~$30-100+ | ~$50-200+ | ~$0.001-5 |
| **波動比** | ~1000x | ~400x | ~20,000x（但起點極低） |

### 費用可預測性

**Bitcoin**：最不可預測。第一價格拍賣導致費率劇烈波動，使用者難以估算。

**Ethereum**：EIP-1559 的 base fee 提供了「下一區塊費率」的合理預測。但擁塞時 base fee 仍可快速翻倍。

**Solana**：最可預測。基礎費用固定，只有在熱門帳戶上需要動態調整 priority fee。

### 經濟模型影響

| 經濟效應 | Bitcoin | Ethereum | Solana |
|----------|---------|----------|--------|
| **通貨膨脹/緊縮** | 通膨（block reward） | 可能通縮（EIP-1559 burn > issuance） | 通膨（staking rewards > burn） |
| **安全預算** | Fee + block reward | Priority fee + MEV | Fee + staking rewards |
| **長期可持續性** | 隨 reward 減半而依賴 fee | Burn 機制與 fee 共同維持 | 依賴 inflation schedule |

## 實際影響

### 對開發者

**Bitcoin DApp**：需要精確估算 tx size（vBytes），實作 RBF 邏輯以應對費率波動，考慮 UTXO 碎片化的費用影響。

**Ethereum DApp**：需要合理設定 gas limit，考慮合約 gas 優化（減少 SSTORE 操作），提供使用者友好的費用估算 UI。

**Solana DApp**：需要正確設定 compute unit limit 和 priority fee，對熱門帳戶的交易考慮使用 Jito。

### 對使用者

- **Bitcoin**：需要理解 mempool 擁塞狀態，手動或自動選擇費率，接受高峰期的高費用
- **Ethereum**：EIP-1559 簡化了費用選擇，但高峰期仍然昂貴。L2 提供了低費替代方案
- **Solana**：幾乎不需要考慮費用，但在熱門 mint/swap 場景需要加入 priority fee

### 對生態系統

Bitcoin 的高費用推動了 [Lightning Network](/bitcoin/advanced/lightning-network/) 等 L2 方案的發展。Ethereum 的 EIP-1559 burn 機制創造了 ETH 的 monetary premium。Solana 的低費用使得高頻交易和微支付場景成為可能。

## 相關概念

- [Fee Estimation (BTC)](/bitcoin/transactions/fee-estimation/) - Bitcoin 費率估算
- [RBF/CPFP](/bitcoin/transactions/rbf-cpfp/) - Bitcoin 交易加速
- [Mempool (BTC)](/bitcoin/network/mempool-btc/) - Bitcoin 交易池
- [EIP-1559](/ethereum/accounts/eip-1559/) - Ethereum 費用改革
- [Gas](/ethereum/accounts/gas/) - Ethereum gas 機制
- [Mempool (ETH)](/ethereum/transaction-lifecycle/mempool/) - Ethereum 交易池
- [Fees & Priority (SOL)](/solana/transactions/fees-priority/) - Solana 費用機制
- [Compute Units](/solana/runtime/compute-units/) - Solana 計算單位
- [Jito MEV](/solana/advanced/jito-mev/) - Solana MEV 拍賣
- [Lightning Network](/bitcoin/advanced/lightning-network/) - Bitcoin L2 方案
- [共識機制比較](/comparisons/consensus-mechanisms/) - 三鏈共識機制對比
- [最終性保證比較](/comparisons/finality-guarantees/) - 三鏈最終性對比
- [智能合約執行環境](/comparisons/smart-contract-execution/) - Script vs EVM vs SVM
