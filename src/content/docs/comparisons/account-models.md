---
title: "帳戶模型比較：UTXO vs Account-Based vs Solana Account"
description: "Bitcoin UTXO 模型、Ethereum Account 模型、Solana Account/Program 模型的深度比較與 trade-off 分析"
tags: [comparison, bitcoin, ethereum, solana, account-model, utxo, state, parallelism]
---

# 帳戶模型比較：UTXO vs Account-Based vs Solana Account

## 概述

帳戶模型是區塊鏈追蹤餘額與狀態的根本方式，直接影響交易結構、隱私特性、平行化能力與智能合約的可組合性。Bitcoin 採用 [UTXO 模型](/bitcoin/data-structures/utxo-model/)，將資產表示為一組「未花費的交易輸出」；Ethereum 使用 [Account 模型](/ethereum/accounts/eoa/)，以全域 [State Trie](/ethereum/data-structures/state-trie/) 記錄每個帳戶的餘額與 storage；Solana 則採用獨特的 [Account Model](/solana/account-model/account-model-overview/)，將程式（program）與資料（account）分離，並允許交易宣告所需的帳戶以實現平行執行。

這三種模型不僅是技術實作的差異，更反映了對區塊鏈本質的不同理解——Bitcoin 將其視為一個交易記錄系統，Ethereum 將其視為一個全域狀態機，Solana 將其視為一個高效能的平行運算平台。

## 快速比較表

| 屬性 | Bitcoin UTXO | Ethereum Account | Solana Account |
|------|-------------|-----------------|----------------|
| **狀態表示** | 未花費輸出集合 | 帳戶餘額 + storage | Account data + lamports |
| **交易結構** | inputs + outputs | from -> to + value + data | instructions + account list |
| **平行處理** | 天然平行（不同 UTXO） | 困難（全域狀態鎖） | 宣告式平行（Sealevel） |
| **隱私性** | 較高（每次新地址） | 較低（地址重用） | 較低（地址重用） |
| **狀態大小** | ~5 GB (UTXO set) | ~100+ GB (state trie) | ~100+ GB |
| **程式/資料分離** | Script 嵌入 UTXO | Code + Storage 同帳戶 | Program 與 Data Account 分離 |
| **可組合性** | 低 | 極高（同步組合） | 高（CPI 跨程式調用） |
| **Nonce 管理** | 無（UTXO 天然唯一） | 需要順序 nonce | 使用 recent blockhash |

## Bitcoin：UTXO 模型

### 設計哲學

Bitcoin 的 UTXO（Unspent Transaction Output）模型直接反映了「現金」的概念——每筆 UTXO 就像一張特定面額的鈔票，交易是將舊鈔票銷毀並產生新鈔票的過程。這個設計源於 Satoshi Nakamoto 對簡潔與安全的追求。

### 技術細節

#### UTXO 生命週期

<pre class="mermaid">
stateDiagram-v2
    [*] --> Created: Coinbase / Transaction Output
    Created --> Unspent: 進入 UTXO Set
    Unspent --> Spent: 被新交易引用為 Input
    Spent --> [*]: 從 UTXO Set 移除

    note right of Unspent
        UTXO Set 是所有
        未花費輸出的集合
        ~5 GB (2024)
    end note
</pre>

#### 交易結構

一筆 Bitcoin 交易消耗（spend）一或多個 UTXO，產生（create）新的 UTXO：

```
Transaction {
    inputs: [
        { txid: "abc123...", vout: 0, scriptSig: "..." },
        { txid: "def456...", vout: 1, scriptSig: "..." }
    ],
    outputs: [
        { value: 0.5 BTC, scriptPubKey: "OP_DUP OP_HASH160 <hash> OP_EQUALVERIFY OP_CHECKSIG" },
        { value: 0.3 BTC, scriptPubKey: "OP_HASH160 <hash> OP_EQUAL" }  // change
    ]
}
// input 總額 - output 總額 = 礦工手續費
```

#### UTXO Selection

[UTXO Selection](/bitcoin/transactions/utxo-selection/) 是錢包的關鍵演算法——如何選擇最佳的 UTXO 組合以最小化手續費和產生的碎片：

$$\text{fee} = \text{tx\_size}(\text{bytes}) \times \text{fee\_rate}(\text{sat/vB})$$

每增加一個 input 約增加 ~68 vBytes（P2WPKH），所以 UTXO 碎片化會增加費用。

#### 驗證模型

驗證只需檢查：
1. 每個 input 引用的 UTXO 存在且未被花費
2. Script 驗證通過（簽名有效）
3. $\sum \text{inputs} \geq \sum \text{outputs}$

### 優勢

- **天然平行驗證**：不同 UTXO 之間互不依賴，可以平行驗證
- **隱私增強**：鼓勵每次使用新地址，UTXO 之間難以關聯
- **確定性驗證**：無需全域狀態，只需 UTXO set
- **無 nonce 問題**：不存在 nonce 衝突或排序問題
- **簡單審計**：$\sum \text{所有 UTXO} = \text{目前流通的 BTC 總量}$

### 限制

- **狀態碎片化**：小額 UTXO 累積成「灰塵」，增加交易成本
- **有限的可編程性**：[Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) 故意受限
- **UTXO 管理複雜**：錢包需要實作複雜的 coin selection 演算法
- **難以表示全域狀態**：無法自然地表示合約狀態

## Ethereum：Account-Based 模型

### 設計哲學

Ethereum 的帳戶模型將區塊鏈視為一台**全域狀態機**。每個區塊的執行是一個狀態轉移函數 $\sigma_{t+1} = \Upsilon(\sigma_t, T)$，其中 $\sigma$ 是世界狀態，$T$ 是交易。這個設計使得智能合約能夠自然地持有和操作複雜狀態。

### 技術細節

#### 帳戶類型

Ethereum 有兩種帳戶：

1. **[EOA（Externally Owned Account）](/ethereum/accounts/eoa/)**：由私鑰控制
   - 欄位：nonce, balance
   - 發起交易，支付 [gas](/ethereum/accounts/gas/)

2. **[Contract Account](/ethereum/accounts/contract-account/)**：由合約代碼控制
   - 欄位：nonce, balance, codeHash, storageRoot
   - 被交易或其他合約觸發執行

<pre class="mermaid">
graph TD
    subgraph "World State (State Trie)"
        A[Account A - EOA<br/>nonce: 5<br/>balance: 3.2 ETH]
        B[Account B - EOA<br/>nonce: 12<br/>balance: 0.5 ETH]
        C[Contract C<br/>nonce: 0<br/>balance: 100 ETH<br/>codeHash: 0xabc...<br/>storageRoot: 0xdef...]
    end

    subgraph "Storage Trie (Contract C)"
        S1[slot 0: totalSupply]
        S2[slot 1: owner]
        S3[mapping: balances]
    end

    C --> S1
    C --> S2
    C --> S3

    style A fill:#627eea,color:#fff
    style B fill:#627eea,color:#fff
    style C fill:#ff6b6b,color:#fff
</pre>

#### State Trie 結構

所有帳戶狀態儲存在 [Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/) 中：

$$\text{stateRoot} = \text{MPT}(\{address \rightarrow \text{RLP}(nonce, balance, storageRoot, codeHash)\})$$

每個 [Contract Account](/ethereum/accounts/contract-account/) 有自己的 [Storage Trie](/ethereum/data-structures/storage-trie/)，key 為 256-bit slot 號碼，value 為 256-bit 值。

#### 交易結構

```solidity
// Ethereum 交易（EIP-1559 格式）
Transaction {
    chainId: 1,
    nonce: 5,          // sender 的交易序號
    maxFeePerGas: 30 gwei,
    maxPriorityFeePerGas: 2 gwei,
    gasLimit: 21000,
    to: 0xRecipient,
    value: 1 ether,
    data: 0x...,       // 合約調用的 calldata
    accessList: []
}
```

#### Nonce 管理

[Nonce](/ethereum/accounts/nonce/) 是帳戶模型的關鍵機制：

$$\text{nonce}_{new} = \text{nonce}_{old} + 1$$

交易必須嚴格按 nonce 順序執行。如果 nonce 3 的交易未確認，nonce 4 的交易會被阻塞。

### 優勢

- **直覺的餘額模型**：與傳統銀行帳戶概念一致
- **強大的可編程性**：智能合約可持有複雜狀態
- **可組合性極高**：合約之間可同步調用（composability）
- **空間效率**：存餘額而非每筆交易的輸出
- **全域狀態一致性**：任何時刻所有狀態可由 stateRoot 驗證

### 限制

- **平行處理困難**：共享全域狀態導致交易間可能有依賴
- **隱私性弱**：地址重用，交易歷史透明
- **狀態膨脹**：State Trie 持續增長（state bloat 問題）
- **Nonce 瓶頸**：同一帳戶的交易必須依序執行
- **Storage 成本高**：永久佔用鏈上存儲

## Solana：Account/Program 模型

### 設計哲學

Solana 的 Account Model 做了一個關鍵的架構分離——**程式（program）與資料（account）解耦**。這不是 Ethereum 那種「合約自帶 storage」的模式，而是類似作業系統中「程式讀寫檔案」的模式。這個設計直接服務於 Solana 的平行執行引擎 [Sealevel](/solana/runtime/svm-sealevel/)。

### 技術細節

#### Account 結構

Solana 上每個 Account 包含：

```rust
pub struct Account {
    pub lamports: u64,       // SOL 餘額（1 SOL = 10^9 lamports）
    pub data: Vec<u8>,       // 任意資料（由 owner program 解釋）
    pub owner: Pubkey,       // 擁有此 account 的 program
    pub executable: bool,    // 是否為可執行程式
    pub rent_epoch: u64,     // rent 相關
}
```

#### Program 與 Data Account 分離

<pre class="mermaid">
graph LR
    subgraph "Programs (Executable)"
        P1[Token Program<br/>executable: true<br/>owner: BPFLoader]
        P2[Custom Program<br/>executable: true<br/>owner: BPFLoader]
    end

    subgraph "Data Accounts"
        D1[Token Account A<br/>owner: Token Program<br/>data: mint, amount, authority]
        D2[Token Account B<br/>owner: Token Program<br/>data: mint, amount, authority]
        D3[Custom Data<br/>owner: Custom Program<br/>data: application state]
    end

    P1 -->|can read/write| D1
    P1 -->|can read/write| D2
    P2 -->|can read/write| D3

    style P1 fill:#9945ff,color:#fff
    style P2 fill:#9945ff,color:#fff
    style D1 fill:#14f195,color:#000
    style D2 fill:#14f195,color:#000
    style D3 fill:#14f195,color:#000
</pre>

關鍵規則：
- 只有 account 的 **owner program** 可以修改其 `data`
- 任何人可以增加 `lamports`，只有 owner 可以減少
- Program 本身是不可變的（除非標記為 upgradeable）

#### Program Derived Address (PDA)

[PDA](/solana/account-model/pda/) 是 Solana 獨有的概念——由 program 確定性生成的地址，不對應任何私鑰：

$$\text{PDA} = \text{SHA256}(\text{seeds} \| \text{program\_id} \| \text{"ProgramDerivedAddress"})$$

如果結果落在 Ed25519 曲線上，加入 bump seed 直到不在曲線上。PDA 允許 program 以程式化方式「簽署」交易。

#### 交易結構與平行執行

```rust
// Solana Transaction
Transaction {
    signatures: [Signature],
    message: Message {
        header: MessageHeader { ... },
        account_keys: [Pubkey],   // 所有會被讀寫的帳戶
        recent_blockhash: Hash,
        instructions: [
            CompiledInstruction {
                program_id_index: u8,
                accounts: [u8],   // 索引到 account_keys
                data: Vec<u8>,
            }
        ]
    }
}
```

關鍵設計：交易**必須預先宣告**所有會讀寫的帳戶。[Sealevel](/solana/runtime/svm-sealevel/) 引擎據此判斷哪些交易可以平行執行：

$$\text{parallel}(T_1, T_2) \iff \text{write\_set}(T_1) \cap \text{accounts}(T_2) = \emptyset \land \text{write\_set}(T_2) \cap \text{accounts}(T_1) = \emptyset$$

### 優勢

- **原生平行執行**：Sealevel 可同時處理不衝突的交易
- **靈活的資料模型**：account data 是任意 bytes，由 program 自行解釋
- **Program 複用**：同一個 program 可服務無數個 data account
- **PDA 機制**：program 可管理資產而無需持有私鑰
- **Rent 機制**：鼓勵回收不用的 account，控制狀態膨脹

### 限制

- **開發心智模型複雜**：account ownership、PDA、CPI 概念需要適應
- **Account 大小限制**：單個 account 最大 10 MB
- **必須預宣告帳戶**：增加交易構建複雜度
- **Rent 負擔**：帳戶需要維持最低 lamports（rent-exempt）

## 深度比較

### 狀態模型視覺化

<pre class="mermaid">
graph TB
    subgraph "Bitcoin UTXO Model"
        U1[UTXO 1<br/>0.5 BTC<br/>→ Alice]
        U2[UTXO 2<br/>0.3 BTC<br/>→ Alice]
        U3[UTXO 3<br/>1.0 BTC<br/>→ Bob]
        TX[Transaction]
        U1 -->|input| TX
        U2 -->|input| TX
        TX -->|output| U4[UTXO 4<br/>0.7 BTC<br/>→ Charlie]
        TX -->|output| U5[UTXO 5<br/>0.09 BTC<br/>→ Alice<br/>change]
    end

    style U1 fill:#f7931a,color:#fff
    style U2 fill:#f7931a,color:#fff
    style U3 fill:#f7931a,color:#fff
    style U4 fill:#f7931a,color:#fff
    style U5 fill:#f7931a,color:#fff
    style TX fill:#333,color:#fff
</pre>

### 平行處理能力

| 場景 | Bitcoin | Ethereum | Solana |
|------|---------|----------|--------|
| **轉帳 A->B, C->D** | 平行（不同 UTXO） | 循序（同 state trie） | 平行（不同 account） |
| **同帳戶連續轉帳** | 可能平行（不同 UTXO） | 必須循序（nonce） | 可能平行（不同 dest） |
| **DeFi 組合操作** | 不適用 | 循序（共享狀態） | 部分平行（取決於 account 重疊） |
| **NFT 批量鑄造** | 不適用 | 循序（同合約 storage） | 部分平行（不同 mint account） |

### 隱私特性

**Bitcoin**：UTXO 模型天然鼓勵每次使用新地址。配合 CoinJoin 等技術，可以顯著提升隱私。但鏈分析公司仍可通過啟發式方法追蹤 UTXO 流動。

**Ethereum**：帳戶模型鼓勵地址重用（因為 ENS、合約互動等原因），所有交易歷史透明可追蹤。隱私需要額外的 Layer 2 解決方案。

**Solana**：與 Ethereum 類似，帳戶地址固定，交易歷史可追蹤。不過 program 可以設計更複雜的隱私方案。

### 可組合性

**Bitcoin**：受限於 Script 的能力，跨交易的可組合性極低。[HTLC](/bitcoin/advanced/htlc/) 和 [Payment Channels](/bitcoin/advanced/payment-channels/) 是少數例外。

**Ethereum**：**同步可組合性（synchronous composability）** 是 Ethereum DeFi 爆發的核心推動力。一筆交易可以原子性地跨越多個合約（flash loan -> swap -> repay）。

**Solana**：通過 [CPI（Cross-Program Invocation）](/solana/runtime/cpi/) 實現類似的可組合性。指令可以在同一交易中調用多個 program。但因為需要預宣告帳戶，組合的動態性受到一定限制。

## 實際影響

### 對開發者

**Bitcoin 開發者**需要理解 UTXO 的消費/生成模型。錢包開發需要實作 coin selection。Script 編程有嚴格限制，但 [Tapscript](/bitcoin/advanced/tapscript/) 帶來了更多可能。

**Ethereum 開發者**享受最自然的程式設計體驗——Solidity 的 storage 變數就像普通程式的全域變數。但需要注意 storage 操作的 gas 成本，以及 reentrancy 等安全問題。

**Solana 開發者**面臨最陡的學習曲線——需要理解 account ownership、PDA derivation、instruction 組合、rent 等獨特概念。但掌握後可以建構高效能的平行化應用。

### 對使用者

- **Bitcoin**：錢包自動管理 UTXO，使用者無需關心底層模型。但小額 UTXO 會產生「灰塵」問題。
- **Ethereum**：帳戶餘額直覺易懂。但 nonce 問題偶爾困擾使用者（交易卡住）。
- **Solana**：使用體驗接近 Ethereum 的帳戶模型，但偶爾需要為帳戶支付 rent。

### 對生態系統

UTXO 模型催生了 Bitcoin 的 [Lightning Network](/bitcoin/advanced/lightning-network/)——利用 UTXO 的特性建構 payment channel。Account 模型催生了 Ethereum 的 DeFi 可組合性。Solana 的 program/account 分離催生了高效能的鏈上交易場景。

## 相關概念

- [UTXO Model](/bitcoin/data-structures/utxo-model/) - Bitcoin UTXO 模型完整解析
- [UTXO Selection](/bitcoin/transactions/utxo-selection/) - UTXO 選擇演算法
- [EOA](/ethereum/accounts/eoa/) - Ethereum 外部帳戶
- [Contract Account](/ethereum/accounts/contract-account/) - Ethereum 合約帳戶
- [State Trie](/ethereum/data-structures/state-trie/) - Ethereum 狀態樹
- [Storage Trie](/ethereum/data-structures/storage-trie/) - Ethereum 儲存樹
- [Nonce](/ethereum/accounts/nonce/) - Ethereum 帳戶序號
- [Solana Account Model](/solana/account-model/account-model-overview/) - Solana 帳戶模型
- [PDA](/solana/account-model/pda/) - Program Derived Address
- [SVM/Sealevel](/solana/runtime/svm-sealevel/) - Solana 平行執行引擎
- [CPI](/solana/runtime/cpi/) - 跨程式調用
- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - Bitcoin 腳本系統
- [共識機制比較](/comparisons/consensus-mechanisms/) - 三鏈共識機制對比
- [智能合約執行環境](/comparisons/smart-contract-execution/) - Script vs EVM vs SVM
