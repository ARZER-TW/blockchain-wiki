---
title: "交易模型比較"
description: "Bitcoin Script Transactions vs Ethereum Typed Transactions vs Solana Instruction-based Transactions, 三大公鏈交易模型深度比較"
tags: [comparison, bitcoin, ethereum, solana, transactions, utxo, account-model, instructions, eip-1559, eip-4844]
---

# 交易模型比較

## 概述

交易（Transaction）是區塊鏈上的原子操作單元，所有狀態變更都必須透過交易來實現。然而，三大公鏈對「交易」的定義和結構截然不同：Bitcoin 使用基於 Script 的 UTXO 交易模型，每筆交易消耗未花費的輸出並產生新輸出；Ethereum 採用帳戶模型下的 typed transaction 架構，從 Legacy 到 EIP-1559 再到 EIP-4844，交易類型隨協議演進而擴展；Solana 則設計了以 instruction 為核心的交易格式，一筆交易可包含多個指向不同 program 的指令，全部原子執行。

這三種模型反映了各鏈截然不同的設計哲學：Bitcoin 追求可驗證性與安全性極簡主義；Ethereum 追求通用計算的表達力；Solana 追求高吞吐量下的平行執行效率。理解交易模型的差異，是深入學習各鏈技術架構的重要起點。

交易模型的選擇直接影響到手續費機制、隱私屬性、程式設計範式、以及最終用戶體驗。本文將從交易結構、生命週期、表達能力三個維度進行深度比較。

## 快速比較表

| 屬性 | Bitcoin | Ethereum | Solana |
|------|---------|----------|--------|
| 帳戶模型 | [UTXO](/bitcoin/data-structures/utxo-model/) | Account-based | Account-based |
| 交易類型 | Script-based（單一格式 + SegWit） | Typed（Type 0/1/2/3/4） | Instruction-based（Legacy/v0/v1） |
| 最小操作單元 | 交易本身 | 交易本身 | [Instruction](/solana/transactions/instructions/) |
| 簽名演算法 | [ECDSA](/fundamentals/cryptography/ecdsa/) / [Schnorr](/bitcoin/cryptography/schnorr-signatures/) | ECDSA | [Ed25519](/solana/cryptography/ed25519/) |
| 手續費模型 | 隱含差額（sat/vByte） | 顯式 gas（[EIP-1559](/ethereum/accounts/eip-1559/)） | Base fee + Priority fee（lamports/CU） |
| 最大交易大小 | 400KB（標準交易 ~100KB） | 無固定上限（受 gas limit 限制） | 1232 bytes（v0）/ 4096 bytes（v1） |
| Nonce 機制 | 無（UTXO 自帶防重放） | 帳戶 nonce 遞增 | Recent blockhash（~2 分鐘有效） |
| 原生多操作 | 多輸入多輸出 | 單一呼叫（需透過合約批次） | 多 instruction 原子執行 |

## 交易生命週期比較

<pre class="mermaid">
flowchart LR
    subgraph Bitcoin
        B1[UTXO 選擇] --> B2[Script 構建]
        B2 --> B3[ECDSA/Schnorr 簽名]
        B3 --> B4[P2P 廣播]
        B4 --> B5[Mempool 排隊]
        B5 --> B6[礦工打包]
        B6 --> B7[PoW 確認]
    end

    subgraph Ethereum
        E1[Nonce 查詢] --> E2[欄位填充]
        E2 --> E3[RLP 序列化]
        E3 --> E4[ECDSA 簽名]
        E4 --> E5[P2P gossipsub]
        E5 --> E6[Mempool/PBS]
        E6 --> E7[Proposer 打包]
        E7 --> E8[Casper FFG 最終性]
    end

    subgraph Solana
        S1[Instructions 組裝] --> S2[Account Keys 排序]
        S2 --> S3[Ed25519 簽名]
        S3 --> S4[Gulf Stream 轉發]
        S4 --> S5[Leader 直接處理]
        S5 --> S6[Sealevel 平行執行]
        S6 --> S7[投票確認]
    end
</pre>

## Bitcoin：Script-based Transaction

### 設計哲學

Bitcoin 的交易模型以安全性和可驗證性為最高優先。每筆交易明確指定資金來源（輸入）和去向（輸出），不存在隱式的狀態依賴。Bitcoin Script 是刻意設計為非圖靈完備的堆疊式語言，避免了無限迴圈等安全風險。

### 交易結構

```
Bitcoin Transaction (SegWit)
+-- version: int32
+-- marker: 0x00 (SegWit flag)
+-- flag: 0x01
+-- tx_in_count: varint
+-- tx_in[]:
|     +-- prev_tx_hash: 32 bytes
|     +-- prev_output_index: uint32
|     +-- script_sig: varint + bytes (SegWit 下為空)
|     +-- sequence: uint32
+-- tx_out_count: varint
+-- tx_out[]:
|     +-- value: int64 (satoshis)
|     +-- script_pubkey: varint + bytes
+-- witness[]:       (SegWit 新增)
|     +-- stack items per input
+-- locktime: uint32
```

### 腳本類型演進

| 類型 | 地址前綴 | 引入時間 | 說明 |
|------|---------|---------|------|
| [P2PKH](/bitcoin/transactions/p2pkh/) | `1...` | 2009 | 經典付款至公鑰雜湊 |
| [P2SH](/bitcoin/transactions/p2sh/) | `3...` | 2012 (BIP-16) | 付款至腳本雜湊，支援多簽 |
| [P2WPKH/P2WSH](/bitcoin/transactions/p2wpkh-p2wsh/) | `bc1q...` | 2017 (BIP-141) | SegWit 原生，降低交易費用 |
| [P2TR](/bitcoin/transactions/p2tr/) | `bc1p...` | 2021 (BIP-341) | Taproot，Schnorr + MAST |

### 手續費計算

手續費隱含在輸入與輸出的差額中：

$$\text{fee} = \sum \text{inputs} - \sum \text{outputs}$$

費率以 sat/vByte 衡量：

$$\text{feeRate} = \frac{\text{fee}}{\lceil \text{weight} / 4 \rceil}$$

### 優勢與限制

**優勢**：
- UTXO 天然支援平行驗證（輸入之間互不依賴）
- 隱私性較佳（每筆交易可使用新地址）
- 無狀態交易驗證（僅需 UTXO set）
- 不存在帳戶 nonce 卡住的問題

**限制**：
- 非圖靈完備，無法支援複雜智能合約
- UTXO 管理增加錢包複雜度
- 找零機制可能產生粉塵 UTXO
- 多筆轉帳需要多個輸出，效率較低

詳見：[Bitcoin 交易生命週期](/bitcoin/transactions/transaction-lifecycle-btc/)

## Ethereum：Typed Transaction

### 設計哲學

Ethereum 的交易模型以通用計算為目標。帳戶模型使得智能合約可以維護任意狀態，交易不僅能轉帳，還能觸發複雜的鏈上邏輯。Typed transaction 機制（EIP-2718）讓協議能夠在不破壞向後相容性的前提下持續演進。

### 交易類型演進

<pre class="mermaid">
timeline
    title Ethereum Transaction Types Evolution
    2015 : Type 0 - Legacy Transaction
         : gasPrice 定價模型
    2021 : Type 1 - EIP-2930
         : Access List 引入
    2021 : Type 2 - EIP-1559
         : Base Fee + Priority Fee
    2024 : Type 3 - EIP-4844
         : Blob Transaction
    2025 : Type 4 - EIP-7702
         : Account Abstraction
</pre>

### 交易結構（Type 2, EIP-1559）

```
EIP-1559 Transaction
+-- type: 0x02
+-- chainId: uint256
+-- nonce: uint64
+-- maxPriorityFeePerGas: uint256
+-- maxFeePerGas: uint256
+-- gasLimit: uint64
+-- to: address (20 bytes) | null
+-- value: uint256
+-- data: bytes (calldata)
+-- accessList: [(address, [storageKey])]
+-- signatureYParity: uint8
+-- signatureR: uint256
+-- signatureS: uint256
```

### 手續費計算

EIP-1559 引入雙層費用結構：

$$\text{effectiveGasPrice} = \min(\text{maxFeePerGas},\ \text{baseFee} + \text{maxPriorityFeePerGas})$$

$$\text{totalFee} = \text{gasUsed} \times \text{effectiveGasPrice}$$

其中 baseFee 由協議根據區塊使用率動態調整，超過目標 50% 使用率時上漲，反之下降。被燃燒的部分為 `gasUsed * baseFee`，validator 收取 priority fee。

### 優勢與限制

**優勢**：
- 圖靈完備，支援任意智能合約邏輯
- Typed transaction 框架允許協議靈活演進
- [EIP-1559](/ethereum/accounts/eip-1559/) 提供更可預測的費用估算
- 帳戶模型直覺，開發者容易理解

**限制**：
- Nonce 必須嚴格遞增，卡住的交易會阻塞後續交易
- 單線程 EVM 執行，無法平行處理交易
- 狀態膨脹問題（帳戶和 storage 持續增長）
- Gas 估算不準確可能導致交易失敗

詳見：[交易構建](/ethereum/transaction-lifecycle/transaction-construction/)

## Solana：Instruction-based Transaction

### 設計哲學

Solana 的交易模型為高吞吐量而生。一筆交易可以包含多個指向不同 program 的 instruction，所有 instruction 原子執行。交易在提交時即聲明所有需要存取的帳戶及其讀寫權限，使得 [Sealevel 執行引擎](/solana/runtime/svm-sealevel/) 能夠根據帳戶依賴關係平行排程不相干的交易。

### 交易結構

```
Solana Transaction
+-- signatures: Vec<Signature>      // 64 bytes each (Ed25519)
+-- message: Message
      +-- header: MessageHeader
      |     +-- num_required_signatures: u8
      |     +-- num_readonly_signed: u8
      |     +-- num_readonly_unsigned: u8
      +-- account_keys: Vec<Pubkey>  // 32 bytes each
      +-- recent_blockhash: Hash     // 32 bytes
      +-- instructions: Vec<CompiledInstruction>
            +-- program_id_index: u8
            +-- accounts: Vec<u8>    // indices into account_keys
            +-- data: Vec<u8>
```

### 帳戶聲明與排序

Solana 要求交易在提交時預先聲明所有涉及的帳戶，並按以下優先順序排列：

1. Writable + Signer（第一個為 fee payer）
2. Readonly + Signer
3. Writable + Non-signer
4. Readonly + Non-signer

這種顯式聲明讓 runtime 能在執行前就判定交易之間是否存在衝突（寫入相同帳戶），從而將不衝突的交易平行執行。

### 手續費計算

Solana 採用固定 base fee 加上可選的 priority fee：

$$\text{baseFee} = \text{numSignatures} \times 5000 \text{ lamports}$$

$$\text{priorityFee} = \text{computeUnits} \times \text{microLamportsPerCU}$$

$$\text{totalFee} = \text{baseFee} + \text{priorityFee}$$

### 優勢與限制

**優勢**：
- 多 instruction 原子組合，一筆交易可完成複雜操作
- 預聲明帳戶使 Sealevel 能平行執行
- [Ed25519](/solana/cryptography/ed25519/) 簽名驗證效率高
- 無 mempool 等待，[Gulf Stream](/solana/consensus/gulf-stream/) 直接轉發給 leader

**限制**：
- 1232 bytes 的交易大小限制（v0）制約了單筆交易的複雜度
- Recent blockhash 約 2 分鐘過期，離線簽署不便
- 帳戶數量受交易大小限制（~35 個帳戶 for legacy）
- 網路擁塞時交易可能被丟棄（無 mempool 保障）

詳見：[Transaction Anatomy](/solana/transactions/transaction-anatomy/)、[Instructions](/solana/transactions/instructions/)

## 深度比較

### 交易表達力

<pre class="mermaid">
graph TD
    subgraph Bitcoin
        BT[一筆交易] --> BI[多輸入 + 多輸出]
        BI --> BS[Script 驗證]
    end

    subgraph Ethereum
        ET[一筆交易] --> EC[單一合約呼叫]
        EC --> EI[內部呼叫鏈]
        EI --> EI2[call / delegatecall / staticcall]
    end

    subgraph Solana
        ST[一筆交易] --> SI1[Instruction 1: Program A]
        ST --> SI2[Instruction 2: Program B]
        ST --> SI3[Instruction 3: Program C]
        SI1 --> SCPI[CPI: Cross-Program Invocation]
    end
</pre>

| 維度 | Bitcoin | Ethereum | Solana |
|------|---------|----------|--------|
| 單筆交易可呼叫的合約數 | N/A（無智能合約） | 1（透過內部呼叫串聯） | 多個（多 instruction） |
| 組合性 | 低 | 高（合約互相呼叫） | 極高（instruction 組合） |
| 原子批次操作 | 多輸出轉帳 | 需透過合約封裝 | 原生多 instruction |
| 失敗行為 | 整筆交易失敗 | 可 try/catch 部分回滾 | 整筆交易回滾 |

### 安全模型比較

**Bitcoin**：安全性來自 UTXO 模型的隔離性。每個輸入獨立驗證，不存在重入攻擊等狀態相關漏洞。Script 的有限表達力大幅縮小了攻擊面。

**Ethereum**：帳戶模型和圖靈完備的 EVM 帶來了更大的攻擊面。重入攻擊、整數溢位、存取控制漏洞等是常見威脅。EIP-1559 的 baseFee 燒毀機制減輕了部分 MEV 問題。

**Solana**：程式（program）與資料（account）的分離設計降低了某些攻擊向量，但帳戶驗證不當、缺少 signer 檢查、PDA 碰撞等仍是常見漏洞來源。

### 效能特性

| 指標 | Bitcoin | Ethereum | Solana |
|------|---------|----------|--------|
| 理論 TPS | ~7 | ~30（L1）| ~4,000（實際） |
| 區塊時間 | ~10 min | 12 s | ~400 ms |
| 最終性時間 | ~60 min（6 conf） | ~13 min（2 epoch） | ~6.4 s（supermajority） |
| 交易平行度 | 驗證可平行 | 串行執行 | Sealevel 平行執行 |

## 實際影響

### 對開發者

- **Bitcoin 開發者**需要深入理解 UTXO 管理、Script 操作碼和 SegWit/Taproot 的 witness 結構。工具鏈較為底層，大部分應用邏輯在鏈下處理。
- **Ethereum 開發者**使用 Solidity/Vyper 編寫智能合約，透過 ABI 編碼構建 calldata。需要特別注意 gas 優化、nonce 管理和交易替換（speedup/cancel）。
- **Solana 開發者**使用 Rust（或 Anchor 框架）編寫 program，需要理解帳戶模型、instruction 組裝和 CPI（Cross-Program Invocation）。交易大小限制要求開發者精心管理帳戶數量。

### 對使用者

- **Bitcoin 使用者**主要關心手續費率（sat/vByte）和確認時間。UTXO 管理對使用者透明，由錢包自動處理。
- **Ethereum 使用者**需要理解 gas price 波動、EIP-1559 的 base fee 機制、以及 nonce 卡住時的處理方式。
- **Solana 使用者**享受低費用和快速確認，但需要面對交易在網路擁塞時被丟棄的風險，以及 blockhash 過期的問題。

### 對生態系

Bitcoin 的簡單交易模型使其最適合作為價值儲存和結算層；Ethereum 的通用交易模型催生了 DeFi、NFT、DAO 等豐富的鏈上生態；Solana 的高效交易模型使其在高頻交易、遊戲和社交等需要快速確認的場景中佔有優勢。

## 相關概念

- [Bitcoin 交易生命週期](/bitcoin/transactions/transaction-lifecycle-btc/) - Bitcoin 交易從 UTXO 選擇到確認的完整流程
- [交易構建 (ETH)](/ethereum/transaction-lifecycle/transaction-construction/) - Ethereum typed transaction 的欄位與序列化
- [Transaction Anatomy (SOL)](/solana/transactions/transaction-anatomy/) - Solana 交易的 signatures、message 與 instructions 結構
- [UTXO Model](/bitcoin/data-structures/utxo-model/) - Bitcoin 未花費交易輸出模型
- [Instructions](/solana/transactions/instructions/) - Solana 交易中的最小執行單元
- [EIP-1559 費用市場](/ethereum/accounts/eip-1559/) - Ethereum Type 2 交易的雙層費用結構
- [EIP-4844 Proto-Danksharding](/ethereum/advanced/eip-4844/) - Ethereum Type 3 blob 交易
- [費用市場比較](/comparisons/fee-markets/) - 三鏈手續費機制的深度比較
- [帳戶模型比較](/comparisons/account-models/) - UTXO vs Account-based 模型比較
- [SVM/Sealevel](/solana/runtime/svm-sealevel/) - Solana 的平行執行引擎
- [ECDSA](/fundamentals/cryptography/ecdsa/) - Bitcoin 和 Ethereum 使用的簽名演算法
- [Ed25519](/solana/cryptography/ed25519/) - Solana 使用的簽名演算法
- [Schnorr Signatures](/bitcoin/cryptography/schnorr-signatures/) - Bitcoin Taproot 引入的簽名方案
