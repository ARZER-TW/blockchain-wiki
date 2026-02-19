# QA 報告：密碼學章節 (Cryptography Section)

> 審查日期：2026-02-19
> 審查範圍：8 篇密碼學文章 + 4 個互動式視覺化頁面
> 審查者：crypto-reviewer agent

---

## 一、整體摘要

密碼學章節包含 8 篇高品質技術文章，涵蓋 Ethereum 的雙簽章系統（ECDSA + BLS）、雜湊函數（Keccak-256、SHA-256）、橢圓曲線（secp256k1、BLS12-381）以及相關操作（ECRECOVER、數位簽章概述）。4 個視覺化元件（HashDemo、AddressPipeline、CurveVisualizer、SignatureFlow）設計精良，互動性強。

**但發現一個嚴重的技術錯誤**：自製的 Keccak-256 實作有 bug，導致所有 4 個視覺化元件輸出錯誤的雜湊值和地址。

### 整體評分：7.2 / 10

- 文章品質優秀（8.5/10）
- 視覺化設計出色（9/10）
- 技術正確性受 keccak256 bug 嚴重影響（5/10 for visualizations）
- 跨頁引用有系統性 404 問題（6/10）

---

## 二、嚴重問題 (CRITICAL)

### CRITICAL-1: 自製 Keccak-256 實作產生錯誤雜湊值

**檔案**：`src/components/visualizations/utils/keccak256.ts`
**影響範圍**：HashDemo、AddressPipeline、CurveVisualizer、SignatureFlow（全部 4 個視覺化元件）

**問題描述**：
keccakF 函數的 chi 步驟使用 JavaScript BigInt 的 `~` 運算子，但 BigInt 的 `~` 是無限精度的二補數 NOT（`~x = -(x+1)`），不是 64-bit unsigned NOT。

**錯誤程式碼（第 45 行）**：
```typescript
state[y * 5 + x] = B[y * 5 + x] ^ (~B[y * 5 + (x + 1) % 5] & B[y * 5 + (x + 2) % 5])
```

**修正方案**：需要 mask 為 64-bit：
```typescript
const mask64 = (1n << 64n) - 1n
// ...
state[y * 5 + x] = B[y * 5 + x] ^ ((~B[y * 5 + (x + 1) % 5] & mask64) & B[y * 5 + (x + 2) % 5])
```

**驗證結果**：

| 輸入 | 正確 Keccak-256 | 自製實作輸出 | 結果 |
|------|----------------|-------------|------|
| `hello` | `0x1c8aff9506...` | `0x0b21364c7c...` | WRONG |
| `""` (empty) | `0xc5d24601...` | `0xb192c750...` | WRONG |
| `transfer(address,uint256)` selector | `0xa9059cbb` | `0xacf90af5` | WRONG |
| Hardhat #0 address | `0xf39Fd6e5...` | `0xe8d75598...` | WRONG |

**影響**：
- HashDemo 顯示的所有雜湊值都不正確
- AddressPipeline 推導出的地址全部錯誤（Hardhat #0 地址應為 `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`，顯示為 `0xe8d75598efbe1d145e29e295e3be56cf9f9fb869`）
- CurveVisualizer 的 ECDSA 簽名頁籤中 message hash 和 address 均錯誤
- SignatureFlow 的交易雜湊和恢復的地址均錯誤
- 教育內容的公信力嚴重受損

---

### CRITICAL-2: `/fundamentals/` 路徑全部 404

**影響範圍**：所有 8 篇密碼學文章

**問題描述**：每篇文章都引用 `/fundamentals/cryptography/...` 路徑的「通用理論」頁面，但 `src/content/docs/fundamentals/` 目錄不存在。這些文章被設計為 Ethereum-specific 層，搭配 fundamentals 層的通用理論，但 fundamentals 層尚未建立。

**受影響連結（部分列表）**：
- `/fundamentals/cryptography/keccak-256/` (404)
- `/fundamentals/cryptography/sha-256/` (404)
- `/fundamentals/cryptography/secp256k1/` (404)
- `/fundamentals/cryptography/ecdsa/` (404)
- `/fundamentals/cryptography/bls-signatures/` (404)
- `/fundamentals/cryptography/bls12-381/` (404)
- `/fundamentals/cryptography/hash-function-overview/` (404)
- `/fundamentals/cryptography/digital-signature-overview/` (404)
- `/fundamentals/cryptography/elliptic-curve-cryptography/` (404)
- `/fundamentals/cryptography/public-key-cryptography/` (404)
- `/fundamentals/cryptography/csprng/` (404)
- `/fundamentals/data-structures/merkle-tree/` (404)

**建議**：在 fundamentals 層建立之前，應移除或以 tooltip/注釋方式標記這些連結為「即將推出」，避免使用者遇到 404。

---

## 三、中等問題 (MEDIUM)

### MEDIUM-1: eth.build iframe 大量 CORS 錯誤

**影響範圍**：所有嵌入 eth.build iframe 的文章（SHA-256、secp256k1、ECDSA、ECRECOVER、digital-signature-overview、BLS Signatures）

**錯誤訊息**：
```
Access to XMLHttpRequest at 'https://austingriffith.com/' from origin 'https://sandbox.eth.build'
has been blocked by CORS policy
```

**說明**：eth.build sandbox 嘗試連接 `austingriffith.com`，被 CORS 擋住。這不影響 iframe 本身的主要功能展示，但會在開發者控制台產生大量錯誤日誌。部分 iframe 顯示 "Loading eth.build..." 狀態。

### MEDIUM-2: BLS Signatures 文章 SSL 證書錯誤

**錯誤**：`net::ERR_CERT_DATE_INVALID`（6 次）

**說明**：eth.build 嵌入的某些資源 SSL 證書過期，可能導致部分功能無法正常載入。

### MEDIUM-3: 行動裝置版面問題

**HashDemo (375x812)**：
- 輸入框被壓縮，預設文字 "Hello, Ethereum!" 顯示不完整（截斷為 "Hell o, Ethe"）
- 雜湊輸出 8x8 grid 最右側 1-2 列被截斷
- QUICK PRESETS 按鈕過小，不易點擊
- 雪崩效應指標未顯示（需更改輸入後才出現，但輸入框較難操作）

**CurveVisualizer (375x812)**：
- SVG 曲線圖非常小，幾乎看不清楚點標記
- 右側計算面板完全不可見（被推到畫面外或隱藏）
- 三個 tab 按鈕文字被壓縮

### MEDIUM-4: secp256k1 頁面載入超時

**問題**：使用 `networkidle` 策略時，secp256k1 和 ECDSA 頁面在 15 秒內無法完成載入。改用 `domcontentloaded` 後正常，表示有長時間未完成的網路請求（可能是 eth.build iframe 的 CORS 請求不斷重試）。

---

## 四、輕微問題 (LOW)

### LOW-1: 404 和 504 資源載入錯誤

所有頁面都有以下錯誤（console）：
- `Failed to load resource: the server responded with a status of 404`
- `Failed to load resource: the server responded with a status of 504 (Outdated Optimize Dep)`

504 錯誤可能是開發伺服器的依賴優化過期，重建可解決。

### LOW-2: 學習路徑導覽按鈕循環問題

BLS Signatures 頁面顯示 "Path complete!" 和 step 8/8，但上方的 `← BLS12-381` 和下方的 `BLS Signatures →` 指向自身。這在使用者完成路徑時可能造成困惑。

### LOW-3: secp256k1 文章中 EIP-7951 日期可能需要更新

文章提到 "EIP-7951（Fusaka 2025/12）"。如果 Fusaka 升級時程有變動，這個日期需要更新。

### LOW-4: BLS12-381 文章提及 "Pectra 2025/5/7 上線"

EIP-2537 標注為 "Pectra 2025/5/7 上線"，如果已經上線，可改為「已上線」而非未來式。

---

## 五、逐頁評分

### 文章評分

| 文章 | 技術正確性 | 清晰度 | 完整性 | 跨頁引用 | 備註 |
|------|-----------|--------|--------|---------|------|
| SHA-256 | 9 | 9 | 8 | 6 | Gas 公式正確，fundamentals 連結 404 |
| Keccak-256 | 9 | 9 | 9 | 6 | selector 0xa9059cbb 正確，fundamentals 404 |
| secp256k1 | 9 | 8 | 9 | 6 | EIP-7951 比較表很有價值 |
| 數位簽章概述 | 9 | 9 | 8 | 5 | fundamentals 連結最多 |
| ECDSA | 10 | 8 | 9 | 6 | v 值演變說明精確 |
| ECRECOVER | 10 | 7 | 10 | 6 | 數學推導完整但較難讀 |
| BLS12-381 | 9 | 8 | 9 | 6 | EIP-2537 precompile 表格很有參考價值 |
| BLS Signatures | 9 | 8 | 9 | 6 | 聚合效率數據表很好 |

**文章平均分**：技術正確性 9.3 | 清晰度 8.3 | 完整性 8.9 | 跨頁引用 5.9

### 視覺化評分

| 視覺化 | 互動性 | 教育價值 | 視覺品質 | 錯誤處理 | 備註 |
|--------|--------|---------|---------|---------|------|
| HashDemo | 9 | 9 | 9 | 7 | 雪崩效應展示極好，但雜湊值錯誤 |
| AddressPipeline | 9 | 10 | 9 | 7 | 5 步 pipeline 設計出色，但地址錯誤 |
| CurveVisualizer | 8 | 9 | 8 | 7 | 3 個 tab 覆蓋完整，小域曲線直覺佳 |
| SignatureFlow | 9 | 10 | 9 | 7 | ECDSA+ECRECOVER 雙向展示非常好 |

**視覺化平均分**：互動性 8.8 | 教育價值 9.5 | 視覺品質 8.8 | 錯誤處理 7.0

> 注意：上述評分為設計和概念評分。由於 keccak256 bug，所有視覺化的實際技術正確性為 3/10（輸出值全部錯誤）。

---

## 六、逐頁詳細分析

### 1. SHA-256 (`/ethereum/cryptography/sha-256/`)

**內容品質**：優秀。清楚解釋了 SHA-256 在 Ethereum 中主要用於 Beacon Chain 共識層和 Precompile (0x02) 的定位，與 Keccak-256 的分工明確。

**技術亮點**：
- Gas 公式 `60 + 12 * ceil(len/32)` 正確
- 解釋了為何共識層選擇 SHA-256（硬體加速：Intel SHA Extensions）
- SSZ Merkleization 程式碼範例清晰
- Double-SHA-256 用於 Bitcoin 互操作的說明很實用

**問題**：2 個 fundamentals 連結 404

---

### 2. Keccak-256 (`/ethereum/cryptography/keccak-256/`)

**內容品質**：優秀。作為 Ethereum 最核心的雜湊函數，文章覆蓋了 EVM opcode、地址推導、Storage slot、CREATE2、Merkle Patricia Trie 等所有關鍵應用。

**技術亮點**：
- 明確指出 EVM 的 KECCAK256 opcode（0x20）與 NIST SHA-3 的區別
- Function selector `0xa9059cbb` 經驗證正確
- Gas 公式 `30 + 6 * ceil(len/32)` 正確
- `abi.encodePacked` vs `abi.encode` 的安全性比較很有教育價值

**問題**：3 個 fundamentals 連結 404

---

### 3. secp256k1 (`/ethereum/cryptography/secp256k1/`)

**內容品質**：優秀。涵蓋帳戶系統、地址推導、交易簽名，並前瞻性地介紹了 EIP-7951 (secp256r1)。

**技術亮點**：
- secp256k1 vs secp256r1 比較表非常有價值
- 解釋了 Passkey/WebAuthn 與帳戶抽象的關聯
- 完整的 Python 地址推導程式碼
- 壓縮公鑰的生成範例

**問題**：
- 4 個 fundamentals 連結 404
- 頁面載入較慢（eth.build iframe CORS 重試）

---

### 4. 數位簽章概述 (`/ethereum/cryptography/digital-signature-overview/`)

**內容品質**：良好。作為概述文章，有效地建立了 ECDSA vs BLS 雙簽章系統的框架。

**技術亮點**：
- ECDSA vs BLS 比較表清晰準確
- Pectra/Fusaka 升級的時間線和影響
- 歷史演進的脈絡說明

**問題**：
- fundamentals 連結最多（6 個 404），因為作為概述文章引用了大量通用理論
- 文章較短，可以考慮擴充更多 Ethereum-specific 內容

---

### 5. ECDSA (`/ethereum/cryptography/ecdsa/`)

**內容品質**：優秀。(r, s, v) 格式、v 值演變、Low-S 正規化、簽名大小等都有詳細說明。

**技術亮點**：
- v 值演變歷史完整：{0,1} -> {27,28} -> EIP-155
- Low-S 正規化的必要性和實作方法
- 完整的 Python ECDSA 簽名實作
- EIP-155 重放保護的 v 值公式

**問題**：2 個 fundamentals 連結 404

---

### 6. ECRECOVER (`/ethereum/cryptography/ecrecover/`)

**內容品質**：極優秀。這是 8 篇文章中技術深度最高的，完整推導了從 (r, s, v) 恢復公鑰的數學過程。

**技術亮點**：
- 完整的數學推導：Q = r^{-1}(sR - zG)
- 為什麼需要 v 的解釋（4 個候選公鑰，secp256k1 上實際只有 2 個）
- Precompile 規格表（輸入/輸出格式、Gas）
- Solidity EIP-712 permit 範例
- 完整的 Python ecrecover 實作

**問題**：
- 1 個 fundamentals 連結 404
- 數學推導對非密碼學背景讀者可能較難理解（清晰度 7/10）

---

### 7. BLS12-381 (`/ethereum/cryptography/bls12-381/`)

**內容品質**：優秀。EIP-2537 precompile 表格是重要參考資料。

**技術亮點**：
- BN254 vs BLS12-381 比較表（安全強度、precompile 地址、用途）
- EIP-2537 的 9 個 precompile 完整規格表
- 輸入格式說明（G1 128 bytes, G2 256 bytes, scalar 32 bytes little-endian）
- 意義分析（執行層驗證共識層簽名、zkSNARK 遷移）

**問題**：2 個 fundamentals 連結 404

---

### 8. BLS Signatures (`/ethereum/cryptography/bls-signatures/`)

**內容品質**：優秀。聚焦 Beacon Chain 的實際應用場景。

**技術亮點**：
- 方案選擇的原因（公鑰在 G1, 簽名在 G2）
- Hash-to-curve 的 DST 字串
- PoP 防 rogue key attack
- 效率數據表（32,000 簽名聚合：3MB -> 96B）
- 完整的 Python 範例（attestation、PoP、RANDAO）

**問題**：
- 1 個 fundamentals 連結 404
- SSL 證書過期錯誤（eth.build 相關）

---

### 9. HashDemo (`/ethereum/visualize/demo/`)

**設計品質**：極優秀。暗色主題、即時雜湊更新、8x8 hex grid、雪崩效應色彩指示、快捷預設按鈕。

**互動測試**：
- 輸入文字即時更新雜湊值：OK
- 雪崩效應展示（改變輸入後橘色標記變化的 bit）：OK
- 5 個預設按鈕全部可點擊：OK
- 4 個 Ethereum 應用卡片（Address Derivation、Function Selector、Storage Slot、State Trie）：展示正確概念

**CRITICAL 問題**：所有雜湊值均不正確（keccak256 bug）

**行動裝置**：輸入框被壓縮，grid 右側截斷

---

### 10. Address Derivation Pipeline (`/ethereum/visualize/address-pipeline/`)

**設計品質**：極優秀。5 步 pipeline（Private Key -> Public Key -> Keccak-256 Hash -> Raw Address -> Checksum Address）是密碼學教學的絕佳視覺化。

**互動測試**：
- Random Key 按鈕：生成隨機金鑰並更新整條 pipeline：OK
- Hardhat #0 / #1 預設：OK（但地址錯誤）
- Key = 1 / Key = 2：OK
- EIP-55 checksum signal 的逐字元高亮：設計精巧

**CRITICAL 問題**：
- Hardhat #0 地址應為 `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`，顯示為 `0xe8d75598EFBE1d145E29e295e3Be56cf9F9FB869`
- 所有推導出的地址均不正確

---

### 11. Elliptic Curve Visualizer (`/ethereum/visualize/curve-visualizer/`)

**設計品質**：優秀。小素數域 (mod 97) 的 SVG 曲線圖 + 真實 secp256k1 運算的混合設計很聰明。

**互動測試**：
- Point Addition tab：展示 P + Q = R 的幾何直覺（line-and-reflect），含 k1/k2 滑桿：OK
- Scalar Multiplication tab：展示 double-and-add 中間步驟（1G, 2G, 3G, 4G, 5G）：極好
- ECDSA Signing tab：使用真實 secp256k1 進行簽名，展示 (r, s, v)：OK（但 message hash 和 address 受 keccak bug 影響）
- "Sign (new key)" 按鈕每次生成新金鑰：OK

**問題**：
- 行動裝置上 SVG 曲線圖太小，右側面板不可見
- ECDSA tab 的 address 受 keccak256 bug 影響

---

### 12. Transaction Signing Flow (`/ethereum/visualize/signature-flow/`)

**設計品質**：極優秀。這是 4 個視覺化中教育價值最高的，完整展示了 EIP-1559 交易從構建到簽名再到 ECRECOVER 驗證的雙向流程。

**互動測試**：
- Sign Transaction tab（5 步 pipeline）：
  1. Raw Transaction Fields（展示 Type 2 欄位，標注 "no 'from' field"）：OK
  2. Serialized Transaction（0x02 || RLP 格式）：OK
  3. Transaction Hash：OK（但值錯誤）
  4. ECDSA Signing（展示 sk, r, s, v）：OK
  5. Signed Transaction（Ready to broadcast）：OK
- ECRECOVER tab（5 步反向 pipeline）：
  1. Extract Signature：OK
  2. Reconstruct Transaction Hash：OK
  3. ECRECOVER（展示 Step A/B 數學）：OK
  4. Derive Sender Address：OK（但地址錯誤）
  5. Signature Verification（顯示 "VALID"）：OK
- Simple Transfer / Contract Call / Zero Value / Random Key 預設：全部 OK
- Contract Call 展示了有 data 欄位的交易：OK

**CRITICAL 問題**：Transaction hash 和恢復的地址受 keccak256 bug 影響

**特別讚賞**：
- "No 'from' field" 的標注讓使用者理解為何交易中不需要發送者欄位
- ECRECOVER tab 的數學步驟展示（R.x = r, R.y selected by v）非常清晰
- 底部三個摘要卡片（Type 2, No 'from' field, EIP-155）很好地總結了核心概念

---

## 七、問題清單（按優先級排序）

| # | 嚴重度 | 問題 | 影響範圍 | 建議修復 |
|---|--------|------|---------|---------|
| 1 | CRITICAL | keccak256.ts BigInt NOT bug | 4 個視覺化元件 | 在 chi 步驟加 mask64 |
| 2 | CRITICAL | /fundamentals/ 路徑全部 404 | 8 篇文章（~30+ 連結） | 建立 fundamentals 或標記連結 |
| 3 | MEDIUM | eth.build CORS 錯誤 | 6 篇文章 | 考慮加載失敗的 fallback UI |
| 4 | MEDIUM | BLS Signatures SSL 證書錯誤 | 1 篇文章 | 更新 eth.build 嵌入 URL |
| 5 | MEDIUM | 行動裝置版面問題 | HashDemo, CurveVisualizer | 響應式設計調整 |
| 6 | MEDIUM | secp256k1/ECDSA 頁面載入慢 | 2 篇文章 | lazy-load eth.build iframe |
| 7 | LOW | 404/504 資源錯誤 | 所有頁面 | 重建開發伺服器依賴 |
| 8 | LOW | BLS Signatures 路徑完成導覽 | 1 篇文章 | 修正自我引用連結 |
| 9 | LOW | 日期資訊可能過時 | secp256k1, BLS12-381 | 確認 Fusaka/Pectra 時程 |

---

## 八、特別推薦

以下設計值得特別表揚：

1. **AddressPipeline 的 EIP-55 checksum 展示**：逐字元對應 keccak hash nibble >= 8 則大寫的規則，是目前見過最清晰的 EIP-55 教學。

2. **SignatureFlow 的 ECRECOVER 反向 pipeline**：在同一元件中展示簽名和驗證的雙向流程，且標注 "no 'from' field"，完美說明了為何 Ethereum 交易不需要 from 欄位。

3. **CurveVisualizer 的小域 + 真實曲線混合**：用 mod 97 的小域展示幾何直覺，同時用真實 secp256k1 展示實際簽名，兩者互補。

4. **HashDemo 的雪崩效應色彩展示**：改變一個字元後，橘色標記變化的 bit，直觀展示雪崩效應。

5. **文章結構的一致性**：每篇文章都遵循「概述 -> Ethereum 應用 -> 程式碼範例 -> 相關概念」的結構，易於導航。

---

## 九、修復優先級建議

1. **立即修復**：keccak256.ts bug（影響全部視覺化，修復只需 1 行程式碼）
2. **短期修復**：/fundamentals/ 連結處理（移除或標記為即將推出）
3. **中期改善**：行動裝置響應式設計、eth.build 載入失敗 fallback
4. **低優先級**：日期更新、504 錯誤修復
