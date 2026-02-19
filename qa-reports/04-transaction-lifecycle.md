# QA 報告：交易生命週期章節

**審查範圍：** 9 篇交易生命週期文章 + 2 個視覺化元件（共 11 頁）
**審查日期：** 2026-02-19
**審查角色：** 以學習 Ethereum 交易端到端流程的學習者角度

---

## 一、頁面清單與狀態

| # | 頁面 | 狀態 | 內容長度 |
|---|------|------|----------|
| 1 | 交易生命週期（概覽） | OK | 4,913 chars |
| 2 | 密鑰生成與帳戶創建 | OK | 3,907 chars |
| 3 | 交易構建 | OK | 4,947 chars |
| 4 | 交易簽名 | OK | 5,172 chars |
| 5 | 交易廣播與驗證 | OK | 4,681 chars |
| 6 | 記憶池 | OK | 4,399 chars |
| 7 | 區塊生產 | OK | 5,045 chars |
| 8 | 共識與最終性 | OK | 6,948 chars |
| 9 | 狀態轉換 | OK | 6,361 chars |
| 10 | Transaction Flow 視覺化 | OK | 930 chars |
| 11 | Fee Simulator 視覺化 | OK | 1,579 chars |

所有頁面均成功載入（HTTP 200），無 console 錯誤。

---

## 二、評分

### 1. 敘事流暢度 (Narrative Flow): 9/10

**優點：**
- 概覽頁面清晰列出完整 8 步流程，從密鑰生成到狀態轉換，每一步都有簡潔摘要
- 每篇文章頂部有「交易流程路徑」導覽列，標示 "Step X/9"，帶有前後頁連結
- 每篇文章末尾的「相關概念」區塊正確標示「流程上一步」和「流程下一步」
- 流程圖從使用者意圖出發，自然過渡到技術實現，循序漸進
- 概覽頁面的 Mermaid 流程圖將 8 個步驟視覺化呈現，並附帶每步的核心技術關鍵字

**不足：**
- 概覽頁面的步驟是 1-8（密鑰生成到狀態轉換），但交易流程路徑導覽列顯示 "Step 1/9" 到 "Step 9/9"，其中概覽本身算第 1 步。這個計數差異可能造成輕微混淆（概覽說 8 步流程，但導覽列有 9 步）

### 2. 技術準確性 (Technical Accuracy): 9/10

**正確且詳實的內容：**

- **Gas 計算**：effectiveGasPrice = min(maxFeePerGas, baseFee + maxPriorityFeePerGas) 公式正確
- **baseFee 調整公式**：baseFee_{n+1} = baseFee_n * (1 + 1/8 * (gasUsed - target) / target)，每塊最多 12.5% 變動，完全正確
- **RLP 編碼**：Legacy 與 Typed Transaction 的序列化格式區分正確，包含 EIP-155 的 [nonce, gasPrice, gasLimit, to, value, data, chainId, 0, 0] 格式
- **ECDSA 簽章流程**：隨機數 r_k 生成、曲線點計算、s 值計算、RFC 6979 確定性 k 值都有正確數學表述
- **v 值含義**：Pre-EIP-155 (27/28)、EIP-155 (chainId * 2 + 35/36)、Typed TX (0/1) 三種場景區分清楚
- **EIP-2 Signature Malleability**：s <= n/2 的 low-s 規範正確
- **Casper FFG finality 時序**：justify 需 2/3 投票，finalize 需再等一個 epoch，總延遲 ~12.8 分鐘正確
- **Slashing 條件**：Double vote 和 Surround vote 兩條規則正確
- **EVM Gas 成本表**：SLOAD cold/warm (2100/100)、SSTORE new/update (20000/5000)、CALL cold (2600) 等數值符合 EIP-2929
- **Block Gas Limit**：Target 15M、Maximum 30M 正確
- **Intrinsic Gas 表**：基礎 21000、合約部署 +32000、calldata 零/非零 byte 4/16 gas、access list entry 2400/1900 gas 全部正確

**Pectra/Fusaka 更新**：文章涵蓋了 2025 年的重要升級：
- EIP-6110（validator 存款延遲降至 ~13 分鐘）
- EIP-7002（從 EL 觸發退出）
- EIP-7251（MAX_EFFECTIVE_BALANCE 至 2048 ETH）
- EIP-7549（committee index 移出 attestation data）
- EIP-7917（Fusaka proposer 預測透明化）

**輕微技術問題：**
- 密鑰生成頁面程式碼範例中 `wallet.mnemonic.phrase` 在 ethers.js v6 中應為 `wallet.mnemonic?.phrase`（mnemonic 可能為 null），但此為程式碼風格問題，不影響概念理解
- 交易類型演進表中 Type 4 (EIP-7702) 標注日期為 "Pectra, 2025/5/7"，這是正確的

### 3. 實用價值 (Practical Value): 9/10

**優點：**
- 每篇文章都包含完整的 ethers.js v6 程式碼範例，從密鑰生成到等待 finality 的完整流程
- 概覽頁面有一個完整的端到端程式碼範例（建立 -> 簽名 -> 廣播 -> 等待確認 -> 檢查 finality）
- 程式碼範例涵蓋常見操作場景：
  - 純 ETH 轉帳、合約呼叫、合約部署
  - 交易加速（Replace-by-Fee）和取消
  - EIP-191 個人簽章、EIP-712 結構化簽章
  - 監聽 pending 交易、查看 mempool 狀態
  - 觀察狀態轉換前後差異、讀取合約 storage slot
  - 檢查交易是否 finalized、等待 finality
- 「常見錯誤」表格（廣播驗證頁面）列出了 7 種常見 RPC 錯誤訊息及其原因
- Gas 估算建議實用（eth_estimateGas + 20-30% buffer）
- 時序與延遲表格清晰呈現各階段的典型延遲

**不足：**
- 程式碼範例使用 `process.env.PRIVATE_KEY` 但沒有提醒讀者設置環境變數的方法
- Flashbots 範例只有註解形式的概念範例，沒有可執行的完整程式碼（但註明需要額外安裝套件，這是合理的）

### 4. 視覺化整合 (Visualization Integration): 8/10

**Transaction Flow 視覺化：**
- 8 步流程清晰呈現，每一步有字母標識（K, T, S, B, M, P, C, E）
- 支援三種交易類型切換：Simple Transfer、Contract Call、Blob TX (EIP-4844)
- 切換交易類型時，各步驟的子標題會動態更新（例如 TX Construction 從 "EIP-1559 (Type 2)" 變為 "ABI Encoding"）
- Play 按鈕可自動推進流程
- 每步展開時顯示詳細說明和關鍵資料變化
- 底部有 4 個概念卡片（EIP-1559、EIP-155、PBS、Finality）提供額外上下文
- 無 console 錯誤

**Fee Simulator 視覺化：**
- 初始 base fee 20 Gwei，符合合理的 mainnet 設定
- "+ High Gas Block" 連點 5 次後 base fee 從 20.00 升到 26.94 Gwei（符合每塊最多 +12.5%）
- "+ Low Gas Block" 連點 5 次後 base fee 降到 19.90 Gwei（符合預期）
- 三個預設情境（Congestion Spike、Steady State、Recovery）都能正確執行
- Auto Simulate 功能正常，自動產生隨機區塊
- Mempool 交易列表會根據當前 base fee 動態排序並標示 "INCLUDABLE"
- 圖表（BASE FEE TREND、BLOCK GAS USAGE）正確更新
- 公式說明：newBaseFee = baseFee * (1 + (gasUsed - gasTarget) / gasTarget / 8)
- 底部有三個說明卡片：Base Fee Burned、Priority Fee (Tip)、12.5% Max Change
- 無 console 錯誤

**不足：**
- Transaction Flow 視覺化頁面的描述文字使用中文，但標題 "Transaction Lifecycle" 是英文，語言不一致
- Fee Simulator 沒有提供讀者直接輸入自訂 base fee / priority fee / gas limit 來計算總費用的功能。只能操作「加高/低 gas 區塊」來間接影響 base fee，無法驗證具體計算（例如 base fee = 30, priority = 2, gas = 21000 -> total 672000 gwei 的驗算）
- 視覺化頁面沒有直接連結到對應的文章頁面（例如 Fee Simulator 沒有連結到 EIP-1559 費用市場文章）

### 5. 內容缺口 (Content Gaps): 8/10

**已涵蓋的進階主題：**
- EIP-4844 blob 交易：概覽頁面的交易類型演進表有列出 Type 3
- EIP-7702 (Set Code TX)：概覽頁面有獨立章節說明 authorization_list 欄位和對交易生命週期的影響
- MEV/PBS pipeline：記憶池和區塊生產頁面有詳細說明 Searcher -> Bundle -> Builder -> Relay -> Proposer 流程
- Account Abstraction (ERC-4337)：在交易簽名頁面的「在 Ethereum 中的應用」提及
- Pectra/Fusaka 升級：共識與最終性頁面有專門章節

**缺少的內容：**
- **EIP-4844 blob 交易的完整生命週期差異**：雖然交易類型表列出了 Type 3，Transaction Flow 視覺化也支援 Blob TX 選項，但沒有獨立章節詳細說明 blob 交易在各步驟的具體差異（blob sidecar 的處理、blob gas market、data availability sampling）
- **Account Abstraction 的影響**：僅在交易簽名頁面一句帶過 ERC-4337，但 AA 改變了交易生命週期的多個環節（UserOperation 替代傳統交易、Bundler 角色、EntryPoint 合約），值得更深入說明
- **跨鏈交易**：L2 交易如何最終回到 L1 finality 的流程沒有涉及
- **實際 gas 追蹤工具介紹**：沒有提及 Etherscan、Tenderly 等工具讓讀者驗證學到的知識

---

## 三、8 步生命週期一致性分析

概覽頁面定義的 8 步流程：
1. 密鑰生成與帳戶創建
2. 交易構建
3. 交易簽名
4. 交易廣播與驗證
5. 記憶池
6. 區塊生產
7. 共識與最終性
8. 狀態轉換

**個別文章的一致性：** 每篇文章的「相關概念」區塊都正確標示自己在流程中的位置（例如「本筆記是流程第五步」），前後連結一致。

**Transaction Flow 視覺化的一致性：** 8 步流程與文章完全對應：
1. Key Generation (secp256k1)
2. TX Construction (EIP-1559 Type 2)
3. Signing (ECDSA + Keccak-256)
4. Broadcast (DevP2P Gossip)
5. Mempool (Pending Pool)
6. Block Production (PBS: Proposer-Builder Separation)
7. Consensus (Attestation + Finality)
8. State Transition (EVM Execution)

每一步的子標題和關鍵字與文章內容一致，流程完整無遺漏。

---

## 四、EIP-1559 費用機制正確性

跨多篇文章驗證：

| 概念 | 交易構建 | 記憶池 | 區塊生產 | Fee Simulator |
|------|---------|--------|---------|---------------|
| effectiveGasPrice 公式 | min(maxFeePerGas, baseFee + maxPriorityFeePerGas) | 同左 | 同左 | 一致 |
| baseFee 調整 | 提及 EIP-1559 | -- | 公式正確 (1/8 因子) | 正確實作 |
| 最大變動 | -- | -- | 12.5% | 12.5% |
| baseFee 銷毀 | -- | -- | -- | "Base Fee Burned" 卡片 |
| priority fee 歸 validator | -- | -- | 提及 | "Priority Fee (Tip)" 卡片 |
| Target gas | -- | -- | 15M | 15M (圖表參考線) |
| Max gas | -- | -- | 30M | -- |

各篇文章和視覺化之間的 EIP-1559 描述完全一致。

---

## 五、MEV/PBS Pipeline 準確性

記憶池頁面和區塊生產頁面對 MEV 生態的描述一致：

```
Searcher -> Bundle -> Builder -> Relay -> Proposer
```

- **記憶池**：說明 MEV 類型（Frontrun、Backrun、Sandwich）及 Flashbots Protect
- **區塊生產**：說明 PBS 的具體運作（Builder 組裝、Relay 驗證、Proposer 簽名選擇）
- **Transaction Flow 視覺化**：Block Production 步驟標示 "PBS: Proposer-Builder Separation"

描述準確且各處一致。

---

## 六、交叉引用與導航

### 內部連結測試

概覽頁面共有 64 個連結，其中 18 個指向交易生命週期子頁面。測試的所有連結均返回 HTTP 200。

跨章節連結涵蓋：
- 密碼學：CSPRNG、secp256k1、Keccak-256、ECDSA、ECRECOVER、BLS Signatures
- 資料結構：RLP 編碼、State Trie、Storage Trie、Receipt Trie、Bloom Filter
- 共識：Beacon Chain、RANDAO、Casper FFG、LMD GHOST、Attestation
- 帳戶：Nonce、Gas、EIP-1559、EIP-155、EOA
- 進階：EIP-4844

### 導航體驗
- 每篇文章頂部有交易流程路徑導覽列（Step X/9），支援前後頁快速跳轉
- 「Mark as read」按鈕讓讀者追蹤學習進度
- 右側目錄（TOC）在桌面版正常顯示
- 上/下一頁連結在每篇文章底部正確配置

---

## 七、行動裝置體驗

### Transaction Flow 視覺化（375x812 viewport）
- 整體可用但略擁擠
- 三個交易類型按鈕堆疊排列，可讀
- 8 步流程卡片只能看到前 2 步，需要左右滑動查看其餘步驟（水平溢出）
- 底部概念卡片（EIP-1559 等）被截斷，"Finality" 卡片的文字不完整

### Fee Simulator 視覺化（375x812 viewport）
- 按鈕和情境卡片排列合理
- 統計數字（CURRENT BASE FEE 等）可讀
- BASE FEE TREND 圖表被壓縮但仍可辨識
- Mempool 交易列表在手機上排列合理，每行一筆交易
- Astro 浮動工具列在手機上遮住了部分情境描述文字

### 文章頁面（375x812 viewport）
- 流程路徑導覽列在手機上正常運作
- 表格和程式碼區塊可水平滾動
- eth.build 嵌入式元件在手機上顯示正常

---

## 八、eth.build 嵌入元件

以下頁面包含 eth.build 互動式嵌入：
- **概覽**：Transactions 節點
- **密鑰生成**：Key Pair 節點
- **交易構建**：Transactions 節點
- **交易簽名**：Transactions (Signing) 節點
- **共識與最終性**：Byzantine Generals 節點

所有嵌入都有：
- 縮放控制（+/-/100%）
- 全螢幕按鈕
- "Open in eth.build" 外部連結
- Loading 狀態提示

eth.build 嵌入為每個概念提供了動手操作的機會，是很好的教學補充。

---

## 九、具體改進建議

### 高優先級

1. **Fee Simulator 增加手動計算器**：增加讓使用者輸入 base fee、priority fee、gas limit 的欄位，即時計算 total fee、burned amount、tip amount，讓讀者驗證 EIP-1559 公式
2. **視覺化頁面連結到文章**：Transaction Flow 應連結到各步驟對應的文章；Fee Simulator 應連結到 EIP-1559 費用市場文章

### 中優先級

3. **統一步驟計數**：概覽描述 "8 步流程"，但導覽列為 "Step 1/9"（概覽自身佔一步）。建議統一為 "9 頁（1 概覽 + 8 步驟）" 或調整導覽列
4. **增加 EIP-4844 blob 交易詳解**：在交易構建或獨立頁面中，詳細說明 blob 交易各步驟的差異
5. **Transaction Flow 手機版水平滑動**：8 步卡片在手機上溢出，建議改為垂直堆疊或加入明確的滑動提示

### 低優先級

6. **Account Abstraction 章節**：在交易簽名或概覽頁面增加 ERC-4337 UserOperation 對交易生命週期的影響說明
7. **實用工具推薦**：在概覽或個別文章中推薦 Etherscan、Tenderly、Blocknative 等工具，讓讀者驗證所學
8. **視覺化語言一致性**：Transaction Flow 標題為英文 "Transaction Lifecycle"，但描述為中文，建議統一

---

## 十、總結

| 評估項目 | 分數 | 說明 |
|---------|------|------|
| 敘事流暢度 | 9/10 | 8 步流程結構清晰，導覽一致，唯步驟計數有小差異 |
| 技術準確性 | 9/10 | Gas 計算、ECDSA 簽章、Casper FFG 等核心概念全部正確，涵蓋 Pectra/Fusaka 最新更新 |
| 實用價值 | 9/10 | 每篇附帶 ethers.js v6 完整範例，從密鑰生成到 finality 檢查，覆蓋所有常見操作 |
| 視覺化整合 | 8/10 | Transaction Flow 和 Fee Simulator 功能完善無錯誤，但缺少手動計算器和文章連結 |
| 內容缺口 | 8/10 | 已涵蓋 EIP-7702、MEV/PBS、Pectra，但缺 EIP-4844 詳解和 AA 深入說明 |
| **總體評分** | **8.6/10** | **交易生命週期章節是整個 Wiki 的核心，品質非常高** |

作為一個想學習 Ethereum 交易完整流程的讀者，讀完這 9 篇文章後，我能夠：
- 理解從私鑰生成到狀態轉換的完整技術鏈路
- 解釋 EIP-1559 費用機制的每個細節
- 使用 ethers.js 發送和追蹤一筆原始交易
- 理解為什麼需要等待 ~12.8 分鐘才能獲得 finality
- 解釋 MEV 生態和 PBS 架構

這是一個非常完整且技術嚴謹的教學系列。
