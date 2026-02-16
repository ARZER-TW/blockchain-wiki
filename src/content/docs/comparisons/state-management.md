---
title: "狀態管理比較"
description: "Bitcoin UTXO Set vs Ethereum MPT/Verkle State Trie vs Solana AccountsDB + Snapshots, 三大公鏈狀態管理機制深度比較"
tags: [comparison, bitcoin, ethereum, solana, state-management, utxo, state-trie, merkle-patricia-trie, verkle-trees, accountsdb, rent]
---

# 狀態管理比較

## 概述

區塊鏈的「狀態」（State）是所有帳戶、餘額、合約資料在某一時刻的完整快照。狀態管理——包括狀態的表示方式、存取效率、增長控制和證明機制——是影響區塊鏈效能和可持續性的核心問題。隨著鏈上活動的持續增長，狀態膨脹已成為三大公鏈共同面對的挑戰。

Bitcoin 使用 [UTXO Set](/bitcoin/data-structures/utxo-model/) 作為其全局狀態，記錄所有未花費的交易輸出。這種模型的優勢在於狀態存取模式簡單——每筆交易只需查找其引用的 UTXO 是否存在。Ethereum 使用 [Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/) 儲存帳戶狀態和合約 storage，提供了密碼學可驗證的全局狀態根。Solana 使用 AccountsDB 搭配定期快照（snapshots），所有帳戶資料存放在記憶體映射的扁平結構中，追求極致的讀寫效能。

這三種方案在狀態增長速率、證明效率、修剪可行性和無狀態客戶端支援度等方面有著根本性的差異，直接影響了各鏈的長期可持續性。

## 快速比較表

| 屬性 | Bitcoin | Ethereum | Solana |
|------|---------|----------|--------|
| 狀態模型 | [UTXO Set](/bitcoin/data-structures/utxo-model/) | [Account + Storage Trie](/ethereum/data-structures/state-trie/) | AccountsDB |
| 狀態資料結構 | LevelDB（扁平 key-value） | [Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/) | 記憶體映射 append-only 檔案 |
| 當前狀態大小 | ~8GB（UTXO set） | ~250GB+（state trie） | ~500GB+（accounts） |
| 狀態增長速率 | ~1GB/年 | ~30-50GB/年 | ~100GB+/年 |
| 狀態證明 | UTXO commitment（提案中） | Merkle proof / 未來 [Verkle proof](/ethereum/advanced/verkle-trees/) | 無原生狀態證明 |
| 狀態修剪 | UTXO 花費後自動移除 | 理論可行但複雜 | [Rent](/solana/account-model/rent/) 機制（帳戶可回收） |
| 無狀態客戶端 | 部分支援（Utreexo） | 路線圖中（Verkle Trees） | 不支援 |

## 狀態模型對比

<pre class="mermaid">
graph TB
    subgraph Bitcoin["Bitcoin: UTXO Set"]
        BG[Global State] --> BU1["UTXO 1<br/>txid:0 = 0.5 BTC"]
        BG --> BU2["UTXO 2<br/>txid:1 = 1.2 BTC"]
        BG --> BU3["UTXO 3<br/>txid:2 = 0.01 BTC"]
        BG --> BUN["... ~180M UTXOs"]
    end

    subgraph Ethereum["Ethereum: State Trie"]
        EG[State Root] --> EA1["Account 0x1...<br/>nonce, balance, storageRoot, codeHash"]
        EG --> EA2["Account 0x2...<br/>nonce, balance, storageRoot, codeHash"]
        EA2 --> ES["Storage Trie<br/>slot 0 = value<br/>slot 1 = value"]
    end

    subgraph Solana["Solana: AccountsDB"]
        SG[Accounts Index] --> SA1["Account PDA1<br/>owner, lamports, data[]"]
        SG --> SA2["Account PDA2<br/>owner, lamports, data[]"]
        SG --> SA3["Account Token<br/>owner, lamports, data[165 bytes]"]
    end
</pre>

## Bitcoin：UTXO Set

### 設計哲學

Bitcoin 的狀態極其簡潔：全局狀態就是所有未花費交易輸出（UTXO）的集合。每筆交易消耗一些 UTXO、產生新的 UTXO，狀態轉換清晰且可預測。這種設計避免了帳戶模型中常見的狀態依賴和衝突問題。

### UTXO Set 結構

每個 UTXO 由以下資訊唯一標識：

```
UTXO Entry:
  key: (txid, output_index)    // 32 bytes + 4 bytes
  value:
    script_pubkey: bytes       // 鎖定腳本
    amount: int64              // satoshis
    height: uint32             // 被創建的區塊高度
    is_coinbase: bool          // 是否為 coinbase 交易
```

Bitcoin Core 使用 LevelDB 儲存 UTXO set（chainstate database），並在記憶體中維護 dbcache 以加速查詢。

### 狀態大小與增長

$$\text{UTXO count} \approx 180{,}000{,}000 \text{ (2025)}$$

$$\text{UTXO set size} \approx 8 \text{ GB (serialized)}$$

UTXO set 的增長相對可控，因為每筆交易在消耗 UTXO 的同時也會花費它們——只有淨增加的 UTXO 才會使狀態增長。

### 狀態修剪

UTXO 模型天然支援「修剪」：一旦某個 UTXO 被花費，它就從 UTXO set 中移除，不再佔用狀態空間。這與 Ethereum 的帳戶模型形成鮮明對比——Ethereum 中的空帳戶仍然佔用 trie 節點。

### Utreexo：無狀態客戶端提案

Utreexo 使用 Merkle forest 壓縮 UTXO set 的表示：

$$\text{Utreexo proof size} = O(\log n) \text{ per UTXO}$$

驗證者只需儲存 Merkle tree 的根（~1 KB），而非完整的 UTXO set（~8 GB）。交易需要附帶 Merkle proof，證明其引用的 UTXO 確實存在於集合中。

### 優勢與限制

**優勢**：狀態增長可控、自然修剪、存取模式簡單（僅需查找 key）、Utreexo 提供了輕量化驗證路徑

**限制**：不支援複雜狀態（無智能合約 storage）、無原生狀態根承諾（需要額外提案如 AssumeUTXO）、UTXO 碎片化增加錢包管理複雜度

## Ethereum：Merkle Patricia Trie -> Verkle Trees

### 設計哲學

Ethereum 的狀態模型需要支援任意複雜的智能合約，因此採用了帳戶模型搭配密碼學可驗證的 trie 結構。[State Trie](/ethereum/data-structures/state-trie/) 將每個帳戶的 nonce、balance、storage root 和 code hash 組織在一棵 [Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/) 中，產生一個全局 state root。

### State Trie 結構

```
World State Trie
  key: keccak256(address) -> Account {
    nonce: uint64
    balance: uint256
    storageRoot: hash     // 指向 Storage Trie
    codeHash: hash        // 合約 bytecode 的 hash
  }

Storage Trie (per contract)
  key: keccak256(slot) -> value: uint256
```

### 狀態大小與增長

$$\text{Unique addresses} \approx 300{,}000{,}000+$$

$$\text{State trie size} \approx 250 \text{ GB+ (including storage tries)}$$

$$\text{Growth rate} \approx 30-50 \text{ GB/year}$$

狀態增長的主要來源是智能合約的 storage 寫入。每個新的 storage slot 都會在 trie 中添加節點，即使後來設為零也只是標記刪除（gas refund），trie 結構仍然留下痕跡。

### Merkle Patricia Trie 的問題

MPT 在設計之初是合理的選擇，但隨著狀態增長暴露出了多個問題：

- **Proof 過大**：MPT 的 proof 包含多個 RLP 編碼的 trie 節點，每個 proof 可達 ~3-4 KB
- **IO 開銷高**：每次 state access 需要多次磁碟讀取（trie 深度 ~40+ 層）
- **不友好的無狀態客戶端**：大 proof 使得無狀態驗證的頻寬需求過高

### Verkle Trees 轉型

[Verkle Trees](/ethereum/advanced/verkle-trees/) 是 Ethereum 規劃中的 MPT 替代方案：

| 特性 | Merkle Patricia Trie | Verkle Tree |
|------|---------------------|-------------|
| 分支因子 | 16（hex nibble） | 256 |
| Proof 大小 | ~3-4 KB/key | ~150 bytes/key |
| 承諾方案 | Keccak-256 hash | Pedersen / IPA commitment |
| 無狀態客戶端 | 不可行（proof 太大） | 可行 |
| 樹深度 | ~40+ 層 | ~3-4 層 |

Verkle proof 大小公式：

$$\text{proofSize} \approx 32 + 33 \times d \text{ bytes}$$

其中 $d$ 是樹的深度。相比 MPT 可減少約 95% 的 proof 大小。

### State Expiry 討論

Ethereum 社群長期討論的 state expiry 方案：
- 超過一定時間未被存取的 state 會「過期」，從活躍 trie 中移除
- 存取過期 state 時需要提供 proof（witness）來「復活」
- 目前尚未有具體的 EIP 被納入路線圖

### Gas 成本與狀態激勵

Ethereum 透過 gas 定價來反映狀態操作的成本：

| 操作 | Gas 成本 | 說明 |
|------|---------|------|
| SSTORE（零 -> 非零） | 20,000 | 新建 storage slot |
| SSTORE（非零 -> 非零） | 5,000 | 更新現有 slot |
| SSTORE（非零 -> 零） | 退還 4,800 | 清除 slot（鼓勵清理） |
| SLOAD（cold） | 2,100 | 首次讀取（EIP-2929） |
| SLOAD（warm） | 100 | 已存取過的 slot |
| Account access（cold） | 2,600 | 首次存取帳戶 |

EIP-2929 引入的 cold/warm 存取模型是對狀態存取成本更精確的建模——首次從磁碟載入 trie 節點的成本遠高於從記憶體快取讀取。

### 優勢與限制

**優勢**：密碼學可驗證的全局狀態根、支援任意複雜的合約 storage、Verkle Trees 路線圖為無狀態客戶端鋪路、EIP-7702 等持續優化帳戶模型

**限制**：狀態增長速度快且難以遏制、MPT IO 開銷影響效能、Verkle 遷移工程量巨大、缺乏有效的 state pruning 機制

## Solana：AccountsDB + Snapshots

### 設計哲學

Solana 的 [帳戶模型](/solana/account-model/account-model-overview/) 將所有鏈上資料統一表示為帳戶（Account）。與 Ethereum 不同，Solana 的帳戶資料不使用 trie 結構，而是存放在扁平的 AccountsDB 中，透過帳戶地址直接索引。這種設計犧牲了密碼學可驗證的狀態根，換取了極高的讀寫效能。

### Account 結構

```
Solana Account:
  pubkey: Pubkey           // 32 bytes, 帳戶地址
  lamports: u64            // 餘額
  data: Vec<u8>            // 帳戶資料（最大 10 MB）
  owner: Pubkey            // 擁有此帳戶的 program
  executable: bool         // 是否為可執行 program
  rent_epoch: u64          // rent 相關
```

### AccountsDB 架構

AccountsDB 使用 append-only 的檔案結構：

- **Append-only storage**：每個 slot 的帳戶更新追加到檔案末尾
- **Index**：記憶體中的 hash map，key 為帳戶地址，value 為最新版本的檔案位置
- **Squash/Clean**：定期合併舊版本，移除已被覆蓋的帳戶快照
- **Snapshots**：定期產生完整的帳戶狀態快照，供新節點快速同步

### Rent 機制

[Rent](/solana/account-model/rent/) 是 Solana 控制狀態增長的核心機制：

$$\text{rentExemptMinBalance} = \text{dataSize} \times \text{rentRate} \times 2 \text{ years}$$

$$\text{rentRate} = 3.48 \times 10^{-9} \text{ lamports/byte/slot}$$

帳戶必須持有足夠的 lamports 來支付 2 年的 rent（rent-exempt），否則會被垃圾回收。這直接激勵開發者清理不再需要的帳戶資料。

### 狀態大小與增長

$$\text{Total accounts} \approx 500{,}000{,}000+$$

$$\text{Accounts data size} \approx 500 \text{ GB+}$$

$$\text{Snapshot size} \approx 70-100 \text{ GB (compressed)}$$

### 優勢與限制

**優勢**：極高的讀寫效能（記憶體映射）、rent 機制控制狀態增長、snapshots 加速新節點同步、扁平結構避免 trie 的 IO 開銷

**限制**：無密碼學狀態根（無法產生 state proof）、不支援無狀態客戶端、帳戶歷史版本查詢受限、高記憶體需求

## 深度比較

### 狀態增長趨勢

<pre class="mermaid">
graph LR
    subgraph Growth["狀態增長對比 (估計)"]
        B["Bitcoin UTXO Set<br/>~8 GB (2025)<br/>增速: ~1 GB/年<br/>自然修剪"]
        E["Ethereum State<br/>~250 GB+ (2025)<br/>增速: ~30-50 GB/年<br/>無有效修剪"]
        S["Solana Accounts<br/>~500 GB+ (2025)<br/>增速: ~100 GB+/年<br/>Rent 修剪"]
    end
</pre>

### 狀態證明效率

| 維度 | Bitcoin | Ethereum (MPT) | Ethereum (Verkle) | Solana |
|------|---------|----------------|-------------------|--------|
| Proof 大小 | ~1 KB (Utreexo) | ~3-4 KB | ~150 bytes | N/A |
| 驗證複雜度 | O(log n) hash | O(depth) hash | O(depth) EC ops | N/A |
| 無狀態可行性 | 部分（Utreexo） | 困難 | 可行 | 不可行 |

### 狀態存取效能

| 操作 | Bitcoin | Ethereum | Solana |
|------|---------|----------|--------|
| 讀取單一帳戶 | O(1) LevelDB lookup | O(d) trie traversal | O(1) memory-mapped |
| 寫入單一帳戶 | O(1) insert/delete | O(d) trie update + hashing | O(1) append |
| 批次讀取 | 受限於 LevelDB | 高 IO 開銷 | 極快（RAM） |
| 狀態根計算 | 無原生支援 | 每個區塊重算 | 每個 epoch snapshot hash |

### 無狀態客戶端前景

**Bitcoin**：Utreexo 提案允許 bridge nodes 為交易附加 Merkle proof，使得輕量驗證者只需儲存 ~1KB 的 accumulator 根即可驗證交易。

**Ethereum**：Verkle Trees 是無狀態客戶端的關鍵。區塊提議者在區塊中附帶所有被存取的 state 的 Verkle proof，驗證者無需本地儲存完整 state trie 即可驗證區塊。

**Solana**：目前沒有無狀態客戶端的路線圖。Validator 需要存取完整的 AccountsDB 來處理交易。

## 實際影響

### 對開發者

- **Bitcoin 開發者**需要理解 UTXO 選擇和管理。狀態模型簡單，但能做的事情有限（無 storage）。
- **Ethereum 開發者**需要特別注意 storage 操作的 gas 成本（SSTORE 是最昂貴的操作之一）。Storage layout 優化是 Solidity 開發的重要技能。冷存取（cold access）vs 熱存取（warm access）的 gas 差異（EIP-2929）也需要考量。
- **Solana 開發者**需要為帳戶預分配 rent-exempt 的 lamports，管理帳戶的資料大小，並在不需要時主動關閉帳戶以回收 rent。

### 對使用者

使用者通常不直接感知狀態管理的差異，但間接影響體現在：Bitcoin 的低狀態量支持了廣泛的全節點運行；Ethereum 的狀態膨脹推高了節點運營成本；Solana 的 rent 機制意味著使用者可能需要為帳戶維持最低餘額。

### 對生態系

狀態管理方案直接影響了節點運營的門檻和去中心化程度。Bitcoin 的輕量狀態讓個人可以在低階硬體上運行全節點；Ethereum 的狀態增長已經使得歸檔節點需要 TB 級儲存；Solana 的高效能設計則要求 validator 使用高規格硬體。三種選擇各有其合理性，反映了不同的去中心化理念。

## 相關概念

- [UTXO Model](/bitcoin/data-structures/utxo-model/) - Bitcoin 的未花費交易輸出模型
- [State Trie](/ethereum/data-structures/state-trie/) - Ethereum 全局狀態的 trie 結構
- [Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/) - Ethereum state trie 的底層資料結構
- [Verkle Trees](/ethereum/advanced/verkle-trees/) - Ethereum 規劃中的 MPT 替代方案
- [Account Model (SOL)](/solana/account-model/account-model-overview/) - Solana 帳戶模型概述
- [Rent](/solana/account-model/rent/) - Solana 帳戶 rent 機制
- [帳戶模型比較](/comparisons/account-models/) - UTXO vs Account-based 模型比較
- [Storage Trie](/ethereum/data-structures/storage-trie/) - Ethereum 合約 storage 的 trie 結構
- [Merkle Tree](/fundamentals/data-structures/merkle-tree/) - 通用 Merkle tree 概念
- [Bloom Filter](/fundamentals/data-structures/bloom-filter/) - Ethereum 日誌檢索的概率資料結構
- [Keccak-256](/fundamentals/cryptography/keccak-256/) - Ethereum state trie 的雜湊函數
- [SHA-256](/fundamentals/cryptography/sha-256/) - Bitcoin 資料結構的雜湊函數
