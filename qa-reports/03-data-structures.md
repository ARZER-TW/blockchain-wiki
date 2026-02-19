# 資料結構章節 QA 報告

> 審查人：ux-data agent
> 日期：2026-02-19
> 範圍：9 篇資料結構文章 + 2 個互動視覺化頁面

---

## 一、文章審查總覽

### 1. RLP 編碼 (`/ethereum/data-structures/rlp-encoding/`)

| 維度 | 分數 | 說明 |
|------|------|------|
| 技術準確度 | 9/10 | 編碼規則表格清晰正確，前綴範圍完整，手動編碼範例準確。唯一小瑕疵：JavaScript 範例中有一行多餘的右括號 `]]])`，應為 `]])`。 |
| 清晰度 | 9/10 | 從兩大型別切入（string / list），搭配前綴範圍總表和手動編碼範例，學習曲線合理。 |
| 實用範例 | 9/10 | 同時提供 JavaScript（ethers.js）和 Python（rlp）範例，且有手動實作的 Python encoder，教育價值高。 |
| 圖表/視覺化 | 6/10 | 純表格呈現，缺少圖解說明 prefix-length-data 的位元組拆解。可考慮內嵌 Encoding Demo 的截圖或連結。 |

**技術細節檢查：**
- 前綴範圍 `[0x00, 0x7f]`、`[0x80, 0xb7]`、`[0xb8, 0xbf]`、`[0xc0, 0xf7]`、`[0xf8, 0xff]` 與 Yellow Paper 一致
- 整數 0 編碼為 `0x80`（空 byte string）的說明正確
- EIP-2718 typed transaction 的描述準確
- **Bug**：JavaScript 範例第三行 `encodeRlp([[], ['0x636174'], ['0x636174', '0x646f67']]]])` 有多餘括號

---

### 2. SSZ 編碼 (`/ethereum/data-structures/ssz-encoding/`)

| 維度 | 分數 | 說明 |
|------|------|------|
| 技術準確度 | 9/10 | 型別分類（fixed/variable）、offset 機制、Merkleization 流程均正確。 |
| 清晰度 | 8/10 | 與 RLP 的對比表非常有幫助。Variable-size offset 機制的解說配合 Container 範例讓人容易理解。 |
| 實用範例 | 8/10 | @chainsafe/ssz 和 Python ssz 的範例實用。但 Python 範例使用的 `ssz` 套件較少見，可能不適合初學者。 |
| 圖表/視覺化 | 5/10 | Merkleization 過程缺少圖示。hash_tree_root 的公式使用 LaTeX 渲染，但沒有樹狀圖來展示 chunk 如何組成 Merkle tree。 |

**技術細節檢查：**
- `uint64(256)` 的 little-endian 表示 `0x0001000000000000` 正確
- offset 計算範例（8 + 4 + 4 = 16）正確
- List 混入 length 的 hash_tree_root 公式正確
- SHA-256（非 Keccak）用於 Merkleization 的說明正確

---

### 3. ABI 編碼 (`/ethereum/data-structures/abi-encoding/`)

| 維度 | 分數 | 說明 |
|------|------|------|
| 技術準確度 | 9/10 | Function selector、靜態/動態型別分類、head-tail 編碼機制正確。encodePacked 碰撞風險的警告很重要且正確。 |
| 清晰度 | 9/10 | 完整的 `foo(256, "hello", 512)` 手動編碼範例配合 offset 計算，是目前看過最清楚的 ABI 編碼教學之一。 |
| 實用範例 | 9/10 | 涵蓋 encode/decode、selector 計算、Interface 的完整使用。四種編碼模式的比較表很實用。 |
| 圖表/視覺化 | 6/10 | offset 指向的示意圖用文字排版呈現，效果尚可，但若有圖形化的 slot 佈局會更直觀。 |

**技術細節檢查：**
- `transfer(address,uint256)` selector `0xa9059cbb` 正確
- `balanceOf(address)` selector `0x70a08231` 正確
- `approve(address,uint256)` selector `0x095ea7b3` 正確
- address 左補零、bytes 右補零的說明正確
- encodePacked 碰撞範例（`"ab"+"c"` vs `"a"+"bc"`）正確

---

### 4. Merkle Patricia Trie (`/ethereum/data-structures/merkle-patricia-trie/`)

| 維度 | 分數 | 說明 |
|------|------|------|
| 技術準確度 | 8/10 | 四種節點類型、Hex-Prefix 編碼、查詢路徑描述正確。有一處小問題：Hex-Prefix 範例中先寫「不對」再給正確答案，顯得混亂。 |
| 清晰度 | 8/10 | 節點類型的結構化呈現好。查詢路徑的逐步範例有幫助。但 Hex-Prefix 編碼的表格和範例之間的銜接可以更流暢。 |
| 實用範例 | 8/10 | @ethereumjs/trie 和 py-trie 範例完整（插入、查詢、proof 生成與驗證、刪除）。Python 中也有手動 hex_prefix_encode 實作。 |
| 圖表/視覺化 | 5/10 | 這是最需要圖解的主題，但文章中完全沒有 Trie 結構圖。好在有 Trie Visualizer 頁面可以補充。建議在文章中直接嵌入或連結到 Trie Visualizer。 |

**技術細節檢查：**
- 四種節點（Empty、Leaf、Extension、Branch）的 RLP 結構正確
- Hex-Prefix 前綴規則（0x00/0x1/0x20/0x3）正確
- 節點 >= 32 bytes 以 hash 儲存的規則正確
- Verkle Trees 取代 MPT 的動機說明準確
- **問題**：Python 範例中 `hex_prefix_encode` 的測試註解寫「不對」(`352345 (...不對)`)，但其實結果 `312345` 是正確的。這個 "不對" 的註解容易造成讀者困惑。

---

### 5. State Trie (`/ethereum/data-structures/state-trie/`)

| 維度 | 分數 | 說明 |
|------|------|------|
| 技術準確度 | 10/10 | 帳戶四元組的描述完全正確。EOA vs 合約帳戶的差異表格清晰。空帳戶的 storageRoot 和 codeHash 常數值正確。 |
| 清晰度 | 9/10 | 用表格對比 EOA 和合約帳戶的各欄位，非常直觀。狀態轉換公式 sigma_{t+1} = Y(sigma_t, T) 與 Yellow Paper 一致。 |
| 實用範例 | 9/10 | eth_getProof 的完整範例特別有價值，展示了如何取得和驗證 State Proof。 |
| 圖表/視覺化 | 5/10 | 缺少 State Trie 的結構示意圖（address -> keccak256 -> trie path -> account data）。 |

**技術細節檢查：**
- Key = keccak256(address) 正確
- Value = RLP([nonce, balance, storageRoot, codeHash]) 正確
- EMPTY_ROOT = keccak256(RLP("")) 正確
- EMPTY_CODE = keccak256(0x) = 0xc5d2460... 正確
- State Trie 是「活的」（跨區塊持續修改）的描述正確

---

### 6. Storage Trie (`/ethereum/data-structures/storage-trie/`)

| 維度 | 分數 | 說明 |
|------|------|------|
| 技術準確度 | 10/10 | Solidity storage layout 的描述準確且全面，涵蓋基本型別打包、mapping、dynamic array、string/bytes、struct。 |
| 清晰度 | 10/10 | 這是整個章節中寫得最好的文章之一。從基本 slot 分配到巢狀 mapping 的 slot 計算，每一步都有公式和範例。 |
| 實用範例 | 10/10 | 直接用 USDC 合約的 balanceOf mapping 做範例（slot 9），讓讀者可以在 mainnet 上實際驗證。Storage proof 範例同樣實用。 |
| 圖表/視覺化 | 6/10 | Struct 打包的圖解用 code block 呈現，效果尚可。但 mapping 和 array 的 slot 佈局若有圖形化會更好。 |

**技術細節檢查：**
- mapping slot = keccak256(abi.encode(key, slot)) 正確
- 巢狀 mapping 的遞迴 hash 正確
- dynamic array: length 在 slot p, data 在 keccak256(p) + i 正確
- string 短/長模式的說明正確
- SSTORE gas 成本（cold 20,000 / warm 5,000）正確

---

### 7. Transaction Trie (`/ethereum/data-structures/transaction-trie/`)

| 維度 | 分數 | 說明 |
|------|------|------|
| 技術準確度 | 9/10 | 交易型別的序列化格式（Type 0-3）準確。EIP-2718 typed transaction envelope 的判斷規則正確。 |
| 清晰度 | 8/10 | 與 State Trie 的差異對比表很有幫助。交易 hash 不是 Trie key 的澄清很重要。 |
| 實用範例 | 7/10 | 範例主要是查詢區塊和交易的基本操作，缺少實際重建 Transaction Trie 並驗證 root 的範例。 |
| 圖表/視覺化 | 4/10 | 完全沒有圖表。交易 Trie 的結構（index 0, 1, 2... 作為 key）適合用簡單圖示說明。 |

**技術細節檢查：**
- Key = RLP(tx_index)（不是 keccak256 hash）正確
- Type 3 (EIP-4844) 標示 `SSZ_or_RLP`，略不精確——目前 Type 3 仍用 RLP
- Legacy tx 判斷：首 byte 在 [0xc0, 0xff] 為 legacy 正確

---

### 8. Receipt Trie (`/ethereum/data-structures/receipt-trie/`)

| 維度 | 分數 | 說明 |
|------|------|------|
| 技術準確度 | 10/10 | Receipt 結構（status, cumulativeGasUsed, logsBloom, logs）完全正確。Log topic 結構和 anonymous event 的說明準確。 |
| 清晰度 | 9/10 | 個別交易 gas 計算的公式清楚。Receipt Bloom 的分層過濾說明很直觀。 |
| 實用範例 | 9/10 | ERC-20 Transfer event 的解析範例非常實用，包含 topic 過濾和事件解碼。 |
| 圖表/視覺化 | 5/10 | 缺少 Receipt 結構的圖解。Log topics 的佈局適合用圖形化呈現。 |

**技術細節檢查：**
- EIP-658 後 status 取代舊的 stateRoot 的隱含說明正確
- cumulativeGasUsed 差值計算個別 gas 正確
- event signature 在 topics[0] 的說明正確
- anonymous event 的 topic slot 使用正確

---

### 9. Bloom Filter (`/ethereum/data-structures/bloom-filter/`)

| 維度 | 分數 | 說明 |
|------|------|------|
| 技術準確度 | 10/10 | 2048-bit / 3 hash / 基於 Keccak-256 的規格與 Yellow Paper Section 4.3.1 一致。bit 位置計算公式正確。 |
| 清晰度 | 9/10 | 三層過濾查詢流程（Block Bloom -> Receipt Bloom -> Actual Log）的描述非常清楚。 |
| 實用範例 | 10/10 | 完整的 JavaScript 和 Python Bloom filter 實作，可直接驗證。Python 範例末尾的 false positive 機率計算是很好的教學加分。 |
| 圖表/視覺化 | 6/10 | 有通用 Bloom Filter 的連結。但 Ethereum 特定的 3-hash 示意圖缺失。 |

**技術細節檢查：**
- bit_i = (h[2i]*256 + h[2i+1]) mod 2048 正確
- address 和 topic 加入 Bloom，data 不加入——正確
- 區塊 logsBloom = bitwise OR 所有 Receipt logsBloom——正確
- big-endian bit ordering (byteIndex = 255 - floor(bit/8)) 正確

---

## 二、視覺化頁面審查

### 10. Trie Visualizer (`/ethereum/visualize/trie-visualizer/`)

| 維度 | 分數 | 說明 |
|------|------|------|
| 正確性 | 9/10 | 插入 dog/doge/cat 後正確產生 Extension -> Branch -> Leaf 結構。Hex-Prefix 編碼值正確（0x16 for Extension odd, 0x20 for Leaf even, 0x35 for Leaf odd）。 |
| 教育價值 | 10/10 | 這是整個資料結構章節中最有價值的頁面。即時顯示四種節點類型的統計數字，Hex-Prefix 編碼的圖例清晰。 |
| 互動性 | 9/10 | 支持自訂 key/value 插入和刪除。4 個預設範例（Empty, Simple, Classic, Account Keys）涵蓋基本到進階場景。 |
| 邊界情況 | 8/10 | 空 trie 處理正確。Account Keys 預設能正常載入。刪除功能正常。未測試到極端情況如非常長的 key 或大量插入。 |

**詳細測試結果：**
- [OK] 空 Trie -> 插入一個 key -> 正確顯示單一 Leaf Node
- [OK] 插入 dog + doge -> Extension + Branch + Leaf 結構正確
- [OK] 插入 cat（不同 prefix）-> 頂層 Extension 更新，Branch 新增 slot
- [OK] 刪除操作正常，Trie 結構自動調整
- [OK] Classic (3 keys) 預設與 Ethereum 經典範例一致
- [OK] 無 console error
- [OK] 手機版（375x812）排版正常，可操作

**建議改進：**
- 缺少 Merkle hash 的顯示——只展示了結構但沒有各節點的 hash 值
- 可以增加「step-by-step 插入動畫」，讓使用者看到每個插入是如何觸發結構變化的
- 建議增加 Merkle proof 路徑的高亮顯示

---

### 11. Encoding Demo (`/ethereum/visualize/encoding-demo/`)

| 維度 | 分數 | 說明 |
|------|------|------|
| 正確性 | 10/10 | 所有測試的編碼結果均正確：dog -> 0x83646f67, "" -> 0x80, ["cat","dog"] -> 0xc88363617483646f67。長字串（>55 bytes）正確使用 0xb8 前綴。 |
| 教育價值 | 9/10 | byte-level 的色彩分段（Prefix/Length/Data）非常直觀。Encoding Rule Applied 區域即時顯示適用的規則。 |
| 互動性 | 8/10 | STRING/LIST 切換、6 個預設範例、自訂輸入都運作良好。但**僅支援 RLP 編碼**，頁面標題和路徑為 "Encoding Demo" 但實際只有 RLP，SSZ 和 ABI 編碼功能缺失。 |
| 邊界情況 | 8/10 | 空字串正確編碼為 0x80。100 字元長字串正確使用 >55 bytes 規則（0xb864...）。巢狀 list 正確遞迴編碼。 |

**詳細測試結果：**
- [OK] "dog" -> 0x83646f67（prefix 0x83 = 0x80+3）
- [OK] "" -> 0x80（空 string）
- [OK] "\x0f" -> 0x0f（單一 byte，值 < 0x80，直接輸出）
- [OK] ["cat","dog"] -> 0xc88363617483646f67（list prefix 0xc8 = 0xc0+8）
- [OK] [[],["cat"]] -> 巢狀 list 正確編碼
- [OK] "a"*100 -> 使用 0xb864 前綴（>55 bytes 規則）
- [OK] 無 console error
- [OK] 手機版排版正常，色彩分段清晰可見

**缺失功能：**
- 頁面名稱為 "Encoding Demo" 但只有 RLP。對應有三篇編碼文章（RLP、SSZ、ABI），理想上 Encoding Demo 應支援三種編碼格式的切換。
- 缺少 integer 編碼模式（需先轉為 bytes）
- 缺少 decode 功能（給定 hex 反向解碼）

---

## 三、整體評分摘要

### 文章評分

| 文章 | 技術準確度 | 清晰度 | 實用範例 | 圖表 | 加權平均 |
|------|-----------|--------|---------|------|---------|
| RLP 編碼 | 9 | 9 | 9 | 6 | 8.4 |
| SSZ 編碼 | 9 | 8 | 8 | 5 | 7.7 |
| ABI 編碼 | 9 | 9 | 9 | 6 | 8.4 |
| Merkle Patricia Trie | 8 | 8 | 8 | 5 | 7.4 |
| State Trie | 10 | 9 | 9 | 5 | 8.5 |
| Storage Trie | 10 | 10 | 10 | 6 | 9.2 |
| Transaction Trie | 9 | 8 | 7 | 4 | 7.2 |
| Receipt Trie | 10 | 9 | 9 | 5 | 8.5 |
| Bloom Filter | 10 | 9 | 10 | 6 | 9.0 |
| **章節平均** | **9.3** | **8.8** | **8.8** | **5.3** | **8.3** |

### 視覺化評分

| 視覺化 | 正確性 | 教育價值 | 互動性 | 邊界情況 | 加權平均 |
|--------|--------|---------|--------|---------|---------|
| Trie Visualizer | 9 | 10 | 9 | 8 | 9.1 |
| Encoding Demo | 10 | 9 | 8 | 8 | 8.8 |
| **視覺化平均** | **9.5** | **9.5** | **8.5** | **8.0** | **9.0** |

---

## 四、關鍵發現

### 優點

1. **技術準確度極高**（平均 9.3/10）——幾乎所有編碼規則、公式、常數值都與官方規格一致
2. **Storage Trie 是範本級文章**——Solidity storage layout 的解說搭配 USDC 真實合約範例，是目前中文教學資源中最完整的
3. **Bloom Filter 文章的完整度**——從 Yellow Paper 規格到完整實作再到 false positive 機率分析，一氣呵成
4. **Trie Visualizer 是殺手級功能**——MPT 是最難理解的資料結構，互動式視覺化大幅降低學習門檻
5. **雙語言範例**（JavaScript + Python）覆蓋兩大開發者群體
6. **交叉連結完善**——每篇文章末尾的「相關概念」連結形成知識網絡

### 問題

1. **圖表/視覺化是最大弱點**（平均 5.3/10）——資料結構天生需要圖示，但大部分文章只有表格和程式碼。特別是 MPT、State Trie、Receipt Trie 這些高度結構化的主題。
2. **Encoding Demo 只有 RLP**——頁面名稱暗示支援多種編碼，但只有 RLP 一種
3. **MPT 文章中的「不對」註解**——Python 範例中 hex_prefix_encode 的測試註解寫「不對」容易造成混淆
4. **RLP JavaScript 範例有括號錯誤**——巢狀 list 的 encodeRlp 呼叫多了一個 `]`
5. **Transaction Trie 的 Type 3 描述略不精確**——標示 `SSZ_or_RLP` 但目前 EIP-4844 仍使用 RLP

---

## 五、改進建議

### 高優先級

| # | 建議 | 影響頁面 |
|---|------|---------|
| 1 | 在 MPT、State Trie、Storage Trie 文章中嵌入結構示意圖 | 3 篇文章 |
| 2 | 擴充 Encoding Demo 支援 SSZ 和 ABI 編碼 | encoding-demo |
| 3 | 修正 RLP JavaScript 範例的多餘括號 | rlp-encoding |
| 4 | 修正 MPT Python 範例中「不對」的誤導性註解 | merkle-patricia-trie |

### 中優先級

| # | 建議 | 影響頁面 |
|---|------|---------|
| 5 | 在 Trie Visualizer 增加 Merkle hash 顯示 | trie-visualizer |
| 6 | 在 Encoding Demo 增加 decode（反向解碼）功能 | encoding-demo |
| 7 | 在 Receipt Trie 文章增加 Log topic 結構圖 | receipt-trie |
| 8 | Transaction Trie 修正 Type 3 的序列化格式描述 | transaction-trie |
| 9 | Encoding Demo 增加 integer 編碼模式 | encoding-demo |

### 低優先級

| # | 建議 | 影響頁面 |
|---|------|---------|
| 10 | SSZ Merkleization 增加 chunk tree 圖示 | ssz-encoding |
| 11 | ABI 編碼增加圖形化的 slot 佈局 | abi-encoding |
| 12 | Trie Visualizer 增加 step-by-step 插入動畫 | trie-visualizer |
| 13 | 在文章中嵌入 Trie Visualizer 和 Encoding Demo 的直接連結 | 多篇 |

---

## 六、手機版測試

| 頁面 | 狀態 | 備註 |
|------|------|------|
| Trie Visualizer | [OK] | 節點結構垂直排列，可操作，預設按鈕可點擊 |
| Encoding Demo | [OK] | 色彩分段清晰，預設按鈕需滑動才能看到全部 |
| RLP 文章 | [OK] | 表格可水平滾動，程式碼區塊有 overflow scroll |
| MPT 文章 | [OK] | 內容正常，Hex-Prefix 表格可讀 |

所有測試頁面在手機視口（375x812）下均無 console error，排版正常。

---

## 七、Console Error 總結

| 頁面 | Console Errors |
|------|---------------|
| 所有 9 篇文章 | 0 |
| Trie Visualizer | 0 |
| Encoding Demo | 0 |

**全部 11 個頁面零 console error。**

---

## 八、截圖清單

所有截圖位於 `qa-reports/screenshots/03-data/`:

- `01-rlp-encoding.png` - RLP 編碼文章（桌面）
- `01-rlp-mobile.png` - RLP 編碼文章（手機）
- `02-ssz-encoding.png` - SSZ 編碼文章
- `03-abi-encoding.png` - ABI 編碼文章
- `04-merkle-patricia-trie.png` - MPT 文章（桌面）
- `04-mpt-mobile.png` - MPT 文章（手機）
- `05-state-trie.png` - State Trie 文章
- `06-storage-trie.png` - Storage Trie 文章
- `07-transaction-trie.png` - Transaction Trie 文章
- `08-receipt-trie.png` - Receipt Trie 文章
- `09-bloom-filter.png` - Bloom Filter 文章
- `10-trie-visualizer-initial.png` - Trie Visualizer 初始（Classic 預設）
- `10-trie-after-dog.png` - 插入 dog 後
- `10-trie-after-doge.png` - 插入 doge 後
- `10-trie-after-cat.png` - 插入 cat 後
- `10-trie-account-keys.png` - Account Keys 預設
- `10-trie-after-delete.png` - 刪除操作後
- `10-trie-mobile.png` - Trie Visualizer（手機）
- `11-encoding-demo-initial.png` - Encoding Demo 初始（dog）
- `11-encoding-empty.png` - 空字串編碼
- `11-encoding-singlebyte.png` - 單 byte 編碼
- `11-encoding-list.png` - List 編碼
- `11-encoding-nested.png` - 巢狀 List 編碼
- `11-encoding-list-mode.png` - LIST 輸入模式
- `11-encoding-long-input.png` - 長字串（>55 bytes）
- `11-encoding-custom.png` - 自訂輸入
- `11-encoding-mobile.png` - Encoding Demo（手機）
- `11-encoding-mobile-dog.png` - Encoding Demo 手機互動
