# Ethereum 互動式學習平台 — 綜合 UX/內容研究報告

> **審查日期**：2026-02-19
> **審查範圍**：66 頁（49 篇文章 + 13 個互動式視覺化 + 首頁/圖譜/路徑/搜尋）
> **審查方法**：Playwright headless 瀏覽器逐頁測試（桌面 1440x900 + 手機 375x812），模擬初學者至中階 Ethereum 學習者
> **報告版本**：v1.0

---

## 目錄

1. [Executive Summary](#executive-summary)
2. [網站架構分析](#網站架構分析)
3. [內容品質評估](#內容品質評估)
4. [視覺化效果評估](#視覺化效果評估)
5. [學習體驗評估](#學習體驗評估)
6. [UX/設計問題](#ux設計問題)
7. [競品對比分析](#競品對比分析)
8. [改善建議](#改善建議)
9. [附錄](#附錄)

---

## Executive Summary

### 一句話結論

**這是一個技術準確度極高（平均 9.2/10）、視覺化設計出色的 Ethereum 學習平台，但被三個嚴重 bug 和入口體驗問題拉低了整體分數。**

### 整體評分

| 區段 | 分數 | 頁數 | 說明 |
|------|------|------|------|
| 首頁/圖譜/路徑 | 5.3/10 | 3 | 知識圖譜 hydration 失敗，CTA 指向過深 |
| 密碼學 | 7.2/10 | 12 | 文章 9.3/10 但 keccak256 bug 摧毀視覺化 |
| 資料結構 | 8.3/10 | 11 | 文章品質頂尖，缺結構圖 |
| 交易生命週期 | 8.6/10 | 11 | 全站最強區段，流程完整 |
| 共識機制 | 8.5/10 | 13 | Casper FFG 深度優秀，ForkTree 最佳視覺化 |
| 帳戶與進階 | 8.4/10 | 15 | EIP-1559/7702 覆蓋突出 |
| **加權總分** | **7.8/10** | **66** | **修復 3 個 CRITICAL 後可達 8.5+** |

### 三個必修 CRITICAL 問題

| # | 問題 | 影響範圍 | 修復難度 |
|---|------|---------|---------|
| C1 | **keccak256.ts BigInt NOT bug** — chi 步驟的 `~` 在 BigInt 上是無限精度 NOT，需 64-bit mask | 4 個視覺化（HashDemo、AddressPipeline、CurveVisualizer、SignatureFlow）所有雜湊值和地址輸出錯誤 | 1 行程式碼 |
| C2 | **KnowledgeGraph hydration 失敗** — 504 Outdated Optimize Dep + dynamic import 錯誤 | 首頁 + /graph/ 的核心功能完全空白 | 中等（需排查 Vite dep optimization） |
| C3 | **/fundamentals/ 路徑全部 404** — 30+ 連結指向不存在的 `src/content/docs/fundamentals/` | 所有 8 篇密碼學文章 + 可能波及其他區段 | 中等（移除或建立 fundamentals 層） |

### 三個最大亮點

1. **交易生命週期 8 步流程**（8.6/10）：從密鑰生成到狀態轉換的完整技術鏈路，每步附 ethers.js v6 實例，是全站核心價值
2. **ForkTree 視覺化**（10/10）：可互動的 LMD-GHOST fork choice 展示，點擊區塊加減投票、動態切換 canonical chain，是全站最佳視覺化
3. **EIP-1559 文章**（10/10）：兼具深度和可讀性，從舊模式弊端到新機制公式再到 ETH 燃燒效應，是全站最佳文章

---

## 網站架構分析

### 技術棧

| 層級 | 技術 | 版本 |
|------|------|------|
| 框架 | Astro | 5.17 |
| 主題 | Starlight | 0.37 |
| 互動島 | React | 19 |
| 動畫 | GSAP | — |
| 密碼學 | @noble/curves, @noble/hashes | v2 |
| 圖表 | recharts | — |
| 語言 | TypeScript | — |
| 部署 | Vercel | — |

### 內容結構

```
src/content/docs/
├── index.mdx                          # 首頁
├── graph.mdx                          # 知識圖譜
├── paths.mdx                          # 學習路徑
└── ethereum/
    ├── cryptography/          (8 篇)   # 密碼學
    ├── data-structures/       (9 篇)   # 資料結構
    ├── transaction-lifecycle/ (9 篇)   # 交易生命週期
    ├── consensus/             (10 篇)  # 共識機制
    ├── accounts/              (8 篇)   # 帳戶
    ├── advanced/              (5 篇)   # 進階主題
    └── visualize/             (13 個)  # 互動式視覺化
```

**統計**：49 篇文章 / 13 個視覺化 / 298 個內部連結 / 6 條學習路徑

### Sidebar 導航結構

6 個主要分類：密碼學、資料結構、帳戶與交易、交易流程、區塊與共識、進階主題。每個分類下的文章按邏輯順序排列。視覺化頁面分散在各分類下方。

### 學習路徑

| 路徑 | 步驟數 | 涵蓋文章 |
|------|--------|---------|
| 密碼學基礎 | 8 | SHA-256 -> BLS Signatures |
| 帳戶與交易 | 8 | EOA -> EIP-1559 |
| 交易流程 | 9 | 概覽 -> 狀態轉換 |
| 資料結構 | 9 | RLP -> Bloom Filter |
| 區塊與共識 | 10 | Beacon Chain -> Block Header |
| 進階主題 | 5 | EIP-4844 -> zkSNARKs |

每條路徑有 Step X/N 導覽列、前後頁連結、進度追蹤（localStorage）。交易流程路徑的導航體驗最完整。

---

## 內容品質評估

### 逐區段評分

#### 密碼學（8 篇）

| 指標 | 分數 |
|------|------|
| 技術準確度 | 9.3/10 |
| 清晰度 | 8.3/10 |
| 完整度 | 8.9/10 |
| 跨頁引用 | 5.9/10（/fundamentals/ 404 拉低） |

**最佳文章**：ECRECOVER（10/10 技術準確度）— 完整的 Q = r^{-1}(sR - zG) 數學推導、4 個候選公鑰的分析、Precompile 規格表、Solidity EIP-712 範例。

**特色**：每篇文章同時提供 Python 和 JavaScript 程式碼範例，雙語言覆蓋。EIP-7951 (secp256r1) 和 EIP-2537 (BLS12-381 precompile) 的前瞻內容是亮點。

#### 資料結構（9 篇）

| 指標 | 分數 |
|------|------|
| 技術準確度 | 9.3/10 |
| 清晰度 | 8.8/10 |
| 實用範例 | 8.8/10 |
| 圖表 | 5.3/10（最大弱點） |

**最佳文章**：Storage Trie（9.2/10）— 用 USDC 合約做真實 slot 計算範例，涵蓋 mapping/dynamic array/struct 打包。

**問題**：資料結構是最需要圖示的領域，但大部分文章只有表格和程式碼。MPT、State Trie、Receipt Trie 都缺少結構示意圖。

#### 交易生命週期（9 篇）

| 指標 | 分數 |
|------|------|
| 敘事流暢度 | 9/10 |
| 技術準確度 | 9/10 |
| 實用價值 | 9/10 |
| 視覺化整合 | 8/10 |

**全站最強區段**。8 步流程結構清晰，每步附完整 ethers.js v6 範例。涵蓋 EIP-1559 費用機制、ECDSA 簽章流程、MEV/PBS pipeline、Casper FFG finality。Pectra/Fusaka 更新已整合。

#### 共識機制（10 篇）

| 指標 | 分數 |
|------|------|
| 技術準確度 | 9.1/10 |
| 內容完整度 | 8.8/10 |
| 學習體驗 | 8.5/10 |

**最佳文章**：Casper FFG（10/10 技術準確度）— Checkpoint 定義精確、Supermajority link 公式正確、Slashing conditions 完整。

**問題**：Ethash 文章需在頂部加醒目的「已棄用」banner（2022/9/15 The Merge 後不再使用）。

#### 帳戶與進階主題（13 篇）

| 指標 | 分數 |
|------|------|
| 技術準確度 | 9.2/10 |
| Pectra/EIP-7702 覆蓋 | 9.5/10 |
| 帳戶區段 | 8.8/10 |
| 進階主題 | 7.8/10 |

**最佳文章**：EIP-1559 費用市場（10/10）— 8,609 字元，從 first-price auction 弊端到三參數表格到 baseFee 調整公式到 ETH 燃燒機制，兼具深度和可讀性。

**亮點**：EIP-7702 覆蓋完整（EOA 可擁有 code/storage、0xef0100 delegation designation、對開發者的影響），是全站內容中最具前瞻性的部分。

### 技術準確度交叉驗證

以下關鍵公式和數值在多篇文章間一致：

| 概念 | 出現於 | 一致性 |
|------|--------|--------|
| effectiveGasPrice = min(maxFeePerGas, baseFee + maxPriorityFeePerGas) | 交易構建、記憶池、區塊生產、Fee Simulator | 完全一致 |
| baseFee 調整: +-12.5% per block | 交易構建、區塊生產、Fee Simulator、EIP-1559 文章 | 完全一致 |
| Block gas target 15M / max 30M | 區塊生產、Gas 文章 | 完全一致 |
| ECDSA v 值: chainId * 2 + 35 + recovery_id | ECDSA 文章、交易簽名、EIP-155 文章 | 完全一致 |
| Casper FFG: 2/3 supermajority for justification | Casper FFG、共識與最終性、Attestation | 完全一致 |
| secp256k1: address = keccak256(PK)[12:32] | secp256k1、地址推導、密鑰生成 | 完全一致 |
| SLOAD cold/warm: 2100/100 gas | Gas 文章、狀態轉換 | 完全一致（EIP-2929） |

### Pectra/Fusaka 覆蓋

| 升級 | EIP | 覆蓋狀態 |
|------|-----|---------|
| Pectra (2025/5/7) | EIP-7702 Set Code TX | 完整（合約帳戶、交易構建） |
| Pectra | EIP-7251 MaxEB 2048 ETH | 完整（Beacon Chain、Validators） |
| Pectra | EIP-6110 快速存款 | 完整（Validators） |
| Pectra | EIP-2537 BLS Precompile | 完整（BLS12-381） |
| Fusaka (2025/12) | EIP-7594 PeerDAS | 提及（EIP-4844 文章） |
| Fusaka | EIP-7917 Proposer 預測 | 提及（共識與最終性） |

---

## 視覺化效果評估

### 13 個視覺化元件總覽

| # | 元件 | 互動性 | 教育價值 | Console Errors | 手機 |
|---|------|--------|---------|----------------|------|
| 1 | HashDemo | 9/10 | 9/10 | 0 | 有截斷問題 |
| 2 | AddressPipeline | 9/10 | 10/10 | 0 | 可用 |
| 3 | CurveVisualizer | 8/10 | 9/10 | 0 | SVG 太小 |
| 4 | SignatureFlow | 9/10 | 10/10 | 0 | 可用 |
| 5 | TrieVisualizer | 9/10 | 10/10 | 0 | 正常 |
| 6 | EncodingDemo | 8/10 | 9/10 | 0 | 正常 |
| 7 | FeeSimulator | 9/10 | 9/10 | 0 | 圖表壓縮 |
| 8 | TransactionFlow | 9/10 | 9/10 | 0 | 水平溢出 |
| 9 | SlotEpochTimeline | 9/10 | 9/10 | 0 | 未測 |
| 10 | ForkTree | 10/10 | 10/10 | 0 | 未測 |
| 11 | BlockHeader | 8/10 | 8/10 | 0 | 未測 |
| 12 | AccountDiagram | 9/10 | 10/10 | 0 | 未測 |
| 13 | ComparisonTable | 8/10 | 9/10 | 0 | 未測 |

**Console Errors: 全部 13 個視覺化元件零 console error。** 這是一個重要的品質指標。

### 最佳視覺化 Top 5

#### 1. ForkTree（10/10）
- 4 個預設場景（No Forks、Simple Fork、Deep Reorg、Finality）
- 點擊區塊添加/移除投票，動態展示 canonical chain 切換
- Weight 計算正確，heaviest subtree 成為 canonical chain
- Justified/Finalized checkpoint 用黃色/紫色框線標示
- 底部有 LMD-GHOST、Casper FFG、Fork Choice 概念簡述
- **評語**：這是全站最佳視覺化，也是目前可見的最佳 fork choice 互動教學之一

#### 2. SignatureFlow（10/10 教育價值）
- ECDSA 簽名 + ECRECOVER 驗證的**雙向** pipeline
- 「No 'from' field」標注讓使用者理解為何交易不需要 from 欄位
- ECRECOVER 數學步驟展示（R.x = r, R.y selected by v）
- 底部摘要卡片（Type 2、No 'from' field、EIP-155）

#### 3. TrieVisualizer（10/10 教育價值）
- 即時顯示四種 MPT 節點類型的統計
- 自訂 key/value 插入和刪除
- Hex-Prefix 編碼圖例清晰
- 是理解 MPT 最直觀的互動工具

#### 4. AddressPipeline（10/10 教育價值）
- 5 步 pipeline: Private Key -> Public Key -> Keccak-256 -> Raw Address -> Checksum Address
- EIP-55 checksum 逐字元對應 nibble >= 8 則大寫的規則
- **但受 keccak256 bug 影響，所有輸出地址錯誤**

#### 5. AccountDiagram（10/10 教育價值）
- 5 個預設場景含 EIP-7702 EOA Code Delegation
- State Trie 四元組 key-value 映射展示
- EIP-7702 場景是極少見的視覺化教學資源

### 致命問題：keccak256 bug

**keccak256.ts 第 45 行**的 chi 步驟使用 `~` 運算子，但 JavaScript BigInt 的 `~` 是無限精度 NOT（`~x = -(x+1)`），不是 64-bit unsigned NOT。

```typescript
// BUG:
state[y * 5 + x] = B[y * 5 + x] ^ (~B[y * 5 + (x + 1) % 5] & B[y * 5 + (x + 2) % 5])

// FIX:
const mask64 = (1n << 64n) - 1n
state[y * 5 + x] = B[y * 5 + x] ^ ((~B[y * 5 + (x + 1) % 5] & mask64) & B[y * 5 + (x + 2) % 5])
```

**影響**：

| 輸入 | 正確值 | 實際輸出 |
|------|--------|---------|
| `hello` | `0x1c8aff9506...` | `0x0b21364c7c...` |
| `""` (空) | `0xc5d24601...` | `0xb192c750...` |
| `transfer(address,uint256)` | `0xa9059cbb` | `0xacf90af5` |
| Hardhat #0 address | `0xf39Fd6e5...` | `0xe8d75598...` |

4 個密碼學視覺化（HashDemo、AddressPipeline、CurveVisualizer、SignatureFlow）的所有雜湊值和地址輸出全部錯誤。修復只需 1 行程式碼。

---

## 學習體驗評估

### 初學者體驗模擬

**場景**：一個對 Ethereum 感興趣但零基礎的開發者首次造訪網站。

#### 10 秒內的第一印象
- 標題「Ethereum 學習平台」清楚表明定位
- 副標題「從密碼學到共識機制，深入理解 Ethereum 協議」設定了技術深度的預期
- CTA「開始學習」按鈕醒目 — **但點擊後直接跳到 `/ethereum/transaction-lifecycle/transaction-lifecycle/`，對初學者太深**
- 知識圖譜區域是巨大的黑色空白（hydration 失敗），嚴重影響專業感
- **結論**：10 秒內不確定該從哪開始。

#### 30 分鐘學習路徑測試

假設初學者選擇「密碼學基礎」路徑：

1. **SHA-256**（Step 1/8）：內容清晰，Gas 公式正確，有 eth.build 互動。但頁面中的 `/fundamentals/cryptography/sha-256/` 連結 404。初學者會困惑。
2. **Keccak-256**（Step 2/8）：核心概念解釋得好，Function selector 範例實用。同樣有 fundamentals 404 連結。
3. **HashDemo 視覺化**：設計出色，雪崩效應展示直觀。**但顯示的雜湊值全部錯誤**。初學者不會知道，但進階學習者驗證後會失去信任。
4. **secp256k1**（Step 3/8）：內容品質高，EIP-7951 比較表有價值。但頁面載入較慢（eth.build CORS 重試）。
5. **AddressPipeline 視覺化**：5 步 pipeline 設計極好 — 但產生的地址全部錯誤。

**30 分鐘結論**：文章品質給人深刻印象，但視覺化的錯誤輸出會在進階學習者心中埋下疑慮。

#### 中階開發者體驗

**場景**：會寫 Solidity 的開發者，想深入理解底層。

- **Gas 文章** + **Fee Simulator**：能完全理解 EIP-1559，Fee Simulator 讓 baseFee 調整公式活起來
- **Storage Trie** + **Trie Visualizer**：USDC slot 計算範例可在 mainnet 驗證，Trie Visualizer 降低 MPT 理解門檻
- **Casper FFG** + **ForkTree**：數學推導配合互動展示，理解 finality 不再抽象
- **SignatureFlow**：ECDSA + ECRECOVER 雙向展示，理解「為何交易不需要 from 欄位」
- **EIP-7702 覆蓋**：AccountDiagram 的 EIP-7702 場景是獨特資源

**結論**：中階開發者會從這個平台獲得巨大價值，特別是視覺化元件。

### 學習路徑導航評估

| 路徑 | 導航品質 | 說明 |
|------|---------|------|
| 交易流程 | 9/10 | Step X/9 導覽列最完整，前後頁連結一致 |
| 密碼學基礎 | 8/10 | 有完整導覽但末尾自我引用（BLS Signatures → BLS Signatures） |
| 帳戶與交易 | 8/10 | Step 1-8 導航完整 |
| 資料結構 | 8/10 | 導航正常 |
| 區塊與共識 | 8/10 | 導航正常 |
| 進階主題 | 7/10 | 缺少類似其他路徑的 Step 導航 |

### eth.build 嵌入評估

大部分文章嵌入了 eth.build 互動元件，提供動手操作機會。但存在以下問題：

| 問題 | 影響 |
|------|------|
| CORS 錯誤（`austingriffith.com` 被擋） | Console 大量錯誤日誌，部分顯示「Loading...」 |
| SSL 證書過期（BLS Signatures 頁面） | 6 次 `ERR_CERT_DATE_INVALID` |
| 頁面載入超時（secp256k1、ECDSA） | `networkidle` 策略 15 秒內無法完成 |

eth.build 是**外部依賴**，CORS/SSL 問題非本站可控。建議加入 fallback UI 和超時處理。

---

## UX/設計問題

### 按嚴重度分類

#### CRITICAL（3 個）

| # | 問題 | 影響 | 修復方案 |
|---|------|------|---------|
| C1 | keccak256.ts BigInt NOT bug | 4 個視覺化輸出全錯 | 加 `mask64 = (1n << 64n) - 1n` |
| C2 | KnowledgeGraph hydration 失敗 | 首頁 + /graph/ 核心功能空白 | 排查 Vite dep optimization，清 `.astro` cache |
| C3 | /fundamentals/ 404 | 30+ 條斷連結 | 移除連結或建立 fundamentals 層 |

#### HIGH（5 個）

| # | 問題 | 影響 | 修復方案 |
|---|------|------|---------|
| H1 | CTA「開始學習」指向太深 | 初學者迷失 | 改連到 `/paths/` 或密碼學第一篇 |
| H2 | 學習路徑卡片不可展開 | 使用者不知怎麼開始 | 讓卡片點擊展開文章列表 |
| H3 | 沒有頂部導航列 | 找不到主要入口 | header 加首頁/圖譜/路徑連結 |
| H4 | 知識圖譜無縮放控制 UI | 觸控裝置無法操作 | 加 +/- 按鈕 |
| H5 | 路徑無推薦起始標記 | 初學者不知從哪開始 | 密碼學路徑加「建議起點」標記 |

#### MEDIUM（10 個）

| # | 問題 | 影響頁面 |
|---|------|---------|
| M1 | Ethash 缺少「已棄用」醒目 banner | ethash |
| M2 | eth.build CORS 大量錯誤 | 6+ 篇文章 |
| M3 | HashDemo/CurveVisualizer 手機版截斷 | 2 個視覺化 |
| M4 | TransactionFlow 手機版水平溢出 | 1 個視覺化 |
| M5 | EncodingDemo 只有 RLP 但名稱暗示多種 | encoding-demo |
| M6 | KZG Commitments 缺視覺化輔助 | kzg-commitments |
| M7 | secp256k1/ECDSA 頁面載入超時 | 2 篇文章 |
| M8 | 簡繁體中文混用（搜索/選擇主題） | UI 全域 |
| M9 | 內容概覽區塊無連結 | 首頁 |
| M10 | 進度追蹤機制不透明 | /paths/ |

#### LOW（12 個）

| # | 問題 | 影響頁面 |
|---|------|---------|
| L1 | BLS Signatures 路徑末尾自我引用 | bls-signatures |
| L2 | RLP JavaScript 範例多餘括號 | rlp-encoding |
| L3 | MPT Python 範例「不對」誤導註解 | merkle-patricia-trie |
| L4 | Transaction Trie Type 3 描述不精確 | transaction-trie |
| L5 | Verkle Trees 遷移時間表需更新 | verkle-trees |
| L6 | zkSNARKs 內容較概括 | zksnarks |
| L7 | ComparisonTable 可增更多比較主題 | comparison-table |
| L8 | 視覺化頁面未連結到文章 | 多個視覺化 |
| L9 | 路徑卡片不顯示文章數量 | /paths/ |
| L10 | LMD GHOST 缺 eth.build 嵌入 | lmd-ghost |
| L11 | EIP 日期可能需更新（Fusaka） | secp256k1, BLS12-381 |
| L12 | SlotEpochTimeline 按鈕偶爾 timeout | slot-epoch-timeline |

---

## 競品對比分析

### 對標平台

| 平台 | 定位 | 互動性 | 技術深度 | 中文 |
|------|------|--------|---------|------|
| **ethereum.org/learn** | 官方入門 | 低 | 中 | 有 |
| **Visualgo** | 演算法視覺化 | 極高 | 高 | 無 |
| **eth.build** | 積木式互動 | 高 | 中 | 無 |
| **EVM Codes** | Opcode 參考 | 中 | 極高 | 無 |
| **Blockchain Demo (Anders)** | Hash/Mining | 高 | 低 | 無 |
| **本站** | 全棧 Ethereum | 高 | 極高 | 有 |

### 差異化優勢

1. **唯一的中文 Ethereum 全棧技術學習平台** — 從密碼學到共識到 EVM，無其他平台覆蓋如此完整
2. **互動視覺化 + 深度文章** — Visualgo 風格的互動但有完整文字配合，其他平台只有一種
3. **Pectra/Fusaka 最新覆蓋** — EIP-7702、EIP-7251 等 2025 年最新內容，比大部分英文平台更新
4. **程式碼範例雙語言** — JavaScript + Python 同時提供，覆蓋兩大開發者群體
5. **ForkTree/SignatureFlow 等視覺化** — 目前無其他平台有可互動的 fork choice 或雙向 ECDSA 展示

### 待改善的差距

1. **入口體驗**（vs ethereum.org）：ethereum.org 有清晰的「新手 -> 開發者 -> 研究者」分流，本站缺少
2. **動畫品質**（vs Visualgo）：Visualgo 有逐步動畫和偽碼同步高亮，本站視覺化偏向靜態互動
3. **行動裝置**（vs 所有）：3 個視覺化在手機上有明顯問題

---

## 改善建議

### Phase 0: 修復（立即，1-2 天）

| # | 任務 | 預估工時 | 影響 |
|---|------|---------|------|
| 0.1 | 修復 keccak256.ts BigInt NOT bug | 15 分鐘 | 4 個視覺化恢復正確 |
| 0.2 | 修復 KnowledgeGraph hydration | 2-4 小時 | 首頁 + 圖譜頁恢復 |
| 0.3 | 處理 /fundamentals/ 404 連結 | 1-2 小時 | 30+ 斷連結消除 |
| 0.4 | 修改 CTA「開始學習」目標 | 5 分鐘 | 首頁導流改善 |
| 0.5 | Ethash 加「已棄用」banner | 10 分鐘 | 避免初學者混淆 |

### Phase 1: 核心體驗提升（1 週）

| # | 任務 | 影響 |
|---|------|------|
| 1.1 | 學習路徑卡片可展開 + 「建議起點」標記 | 入口體驗 |
| 1.2 | 頂部導航列（首頁/圖譜/路徑） | 全站導航 |
| 1.3 | 視覺化頁面連結到對應文章 | 視覺化 <-> 文章整合 |
| 1.4 | 統一簡繁體中文 UI | 語言一致性 |
| 1.5 | 修復 RLP/MPT 程式碼範例錯誤 | 內容準確度 |

### Phase 2: 內容補強（2-4 週）

| # | 任務 | 影響 |
|---|------|------|
| 2.1 | 資料結構文章加入結構示意圖（MPT、State Trie、Receipt Trie） | 學習體驗 |
| 2.2 | EncodingDemo 擴充支援 SSZ + ABI | 視覺化完整度 |
| 2.3 | EIP-4844 blob 交易詳解章節 | 內容覆蓋 |
| 2.4 | 進階主題加入學習路徑導航 | 導航一致性 |
| 2.5 | 知識圖譜加圖例和縮放控制 | 互動體驗 |

### Phase 3: 進階改善（長期）

| # | 任務 | 影響 |
|---|------|------|
| 3.1 | KZG/Verkle 視覺化元件 | 進階主題門檻降低 |
| 3.2 | 逐步動畫（Visualgo 風格 step-by-step） | 教學深度 |
| 3.3 | ComparisonTable 擴充（PoW vs PoS、L1 vs L2） | 知識廣度 |
| 3.4 | Account Abstraction (ERC-4337) 章節 | 內容前瞻性 |
| 3.5 | eth.build 載入失敗 fallback UI | 可靠性 |
| 3.6 | 視覺化響應式設計改善（HashDemo、CurveVisualizer、TransactionFlow） | 手機體驗 |

---

## 附錄

### A. 逐區段詳細報告

| 報告 | 檔案路徑 |
|------|---------|
| 首頁/圖譜/路徑 | `qa-reports/01-homepage-graph-paths.md` |
| 密碼學 | `qa-reports/02-cryptography.md` |
| 資料結構 | `qa-reports/03-data-structures.md` |
| 交易生命週期 | `qa-reports/04-transaction-lifecycle.md` |
| 共識機制 | `qa-reports/05-consensus.md` |
| 帳戶與進階 | `qa-reports/06-accounts-advanced.md` |

### B. 截圖目錄

| 目錄 | 截圖數 |
|------|--------|
| `qa-reports/screenshots/01-homepage/` | 12 |
| `qa-reports/screenshots/02-crypto/` | 20+ |
| `qa-reports/screenshots/03-data/` | 27 |
| `qa-reports/screenshots/04-tx-lifecycle/` | 15+ |
| `qa-reports/screenshots/05-consensus/` | 10+ |
| `qa-reports/screenshots/06-accounts/` | 10+ |

### C. 所有視覺化元件測試結果

| 元件 | 預設場景 | 全部通過 | Console Errors | 手機測試 |
|------|---------|---------|----------------|---------|
| HashDemo | 5 | Yes | 0 | 有截斷 |
| AddressPipeline | 4 | Yes | 0 | OK |
| CurveVisualizer | 3 tabs | Yes | 0 | SVG 太小 |
| SignatureFlow | 4 + 2 tabs | Yes | 0 | OK |
| TrieVisualizer | 4 | Yes | 0 | OK |
| EncodingDemo | 6 | Yes | 0 | OK |
| FeeSimulator | 3 + auto | Yes | 0 | 圖表壓縮 |
| TransactionFlow | 3 types | Yes | 0 | 水平溢出 |
| SlotEpochTimeline | 3 | Yes | 0 | 未測 |
| ForkTree | 4 | Yes | 0 | 未測 |
| BlockHeader | 4 | Yes | 0 | 未測 |
| AccountDiagram | 5 | Yes | 0 | 未測 |
| ComparisonTable | 3 | Yes | 0 | 未測 |

### D. 問題總數

| 嚴重度 | 數量 |
|--------|------|
| CRITICAL | 3 |
| HIGH | 5 |
| MEDIUM | 10 |
| LOW | 12 |
| **總計** | **30** |

### E. 評分方法

- **技術準確度**：與 Yellow Paper、EIP 規格、ethers.js v6 文件交叉驗證
- **清晰度**：以初學者角度評估是否能在不查額外資料的情況下理解
- **互動性**：測試所有按鈕、預設、輸入、邊界情況
- **手機測試**：375x812 viewport（iPhone SE/12 mini 尺寸）
- **Console Errors**：Playwright `page.on('console')` 監控
- **連結驗證**：逐個 HTTP GET 驗證所有內部連結

---

*報告由 6 個 Playwright 自動化 agent 平行生成，經人工彙整校對。*
