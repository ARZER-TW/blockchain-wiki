# 帳戶與進階主題區段 — UX/內容審查報告

## 概要

此區段包含 8 篇帳戶文章、5 篇進階主題文章和 2 個互動式視覺化，共 15 頁。帳戶區段涵蓋 EOA、合約帳戶、地址推導、Nonce、Gas、EIP-55/155/1559；進階主題涵蓋 EIP-4844、KZG Commitments、Verkle Trees、Precompiled Contracts、zkSNARKs。

帳戶區段是「帳戶與交易路徑」的一部分，有完整的 Step 1-8 導航。內容品質高，特別是 EIP-1559 和 Gas 的解釋非常實用。進階主題深度足夠但門檻較高。視覺化元件 AccountDiagram 和 ComparisonTable 都有出色的教育價值。

**整體評分：8.4/10**

---

## 帳戶區段逐頁分析

### 1. EOA（外部帳戶）
- **內容品質**: 8/10
- **技術準確度**: 9/10
- **觀察**:
  - State Trie 四元組清晰：nonce、balance、storageRoot、codeHash
  - 空 EOA 的識別方式（codeHash == keccak256(0x)）正確
  - secp256k1 密鑰推導簡述完整
  - 有 eth.build 嵌入（Wallet EOA）
  - 交易結構（EIP-1559 格式）完整列出
- **問題**: 無重大問題

### 2. 合約帳戶
- **內容品質**: 9/10
- **技術準確度**: 10/10
- **觀察**:
  - EOA vs 合約帳戶差異表格非常清楚（控制方式、主動發起交易、Code、Storage、Nonce 含義）
  - **EIP-7702 影響已完整記錄**：EOA 可擁有 code、storage；0xef0100 delegation designation
  - 對開發者的影響說明實用（eth_getCode 不再可靠判斷 EOA）
  - CREATE 和 CREATE2 地址計算公式正確
  - 有 eth.build 嵌入（Smart Contracts）
- **問題**: 無重大問題。EIP-7702 的覆蓋是一大亮點。

### 3. 地址推導
- **內容品質**: 9/10
- **技術準確度**: 9/10
- **觀察**:
  - EOA 地址推導 5 步驟非常清晰（私鑰 → 公鑰 → 去 0x04 → Keccak-256 → 取後 20 bytes）
  - 數學公式正確：address = keccak256(Px || Py)[12:32]
  - CREATE 和 CREATE2 地址計算分別說明
  - 為什麼取後 20 bytes 的安全性分析到位
  - 有 eth.build 嵌入
- **問題**: 無重大問題

### 4. Nonce
- **內容品質**: 8/10
- **技術準確度**: 9/10
- **觀察**:
  - Nonce Gap 問題解釋清楚（nonce=5 發出但 nonce=4 未確認的場景）
  - 交易替換（Speed Up / Cancel）機制實用
  - 合約帳戶 Nonce 差異（初始值 1，EIP-161 後）正確
  - EIP-155 跨鏈重放保護有交叉引用
- **問題**: 無重大問題

### 5. Gas
- **內容品質**: 9/10
- **技術準確度**: 9/10
- **觀察**:
  - Pre/Post EIP-1559 費用計算清楚對比
  - EVM Opcode Gas Cost 表格實用
  - Intrinsic Gas 計算公式完整（21000 base + calldata costs + access list）
  - Gas Refund 機制（SELFDESTRUCT、SSTORE 清零）正確記錄
  - 區塊 Gas Limit（30M target, 60M max）數據正確
  - 有 eth.build 嵌入（Gas）
  - 內容長度 8,078 字元 — 深度充足
- **問題**: 無重大問題。此篇是「能讓人真正理解 Gas」的好文章。

### 6. EIP-55 地址校驗
- **內容品質**: 8/10
- **技術準確度**: 10/10
- **觀察**:
  - 演算法步驟精確（Keccak-256 hash → nibble >= 8 轉大寫）
  - 手動範例逐字元展示，教育價值高
  - 錯誤偵測率 99.986% 正確
  - 有 eth.build 嵌入
- **問題**: 無重大問題

### 7. EIP-155 重放保護
- **內容品質**: 9/10
- **技術準確度**: 10/10
- **觀察**:
  - 歷史背景（2016 DAO fork、ETH/ETC 分裂）交代完整
  - Pre/Post EIP-155 簽名差異對比清晰
  - v 值計算公式正確（chainId * 2 + 35 + recovery_id）
  - 從簽名恢復 chainId 的逆向推導也有說明
  - 與 EIP-1559 Type 2 交易的關係有解釋
- **問題**: 無重大問題

### 8. EIP-1559 費用市場
- **內容品質**: 10/10
- **技術準確度**: 10/10
- **觀察**:
  - 舊模式問題分析深入（first-price auction 的弊端）
  - 三個費用參數表格清晰（baseFee、maxPriorityFeePerGas、maxFeePerGas）
  - Base Fee 調整公式正確（target 50% 使用率，±12.5% 變動）
  - ETH 燃燒機制和通縮效應分析
  - Pectra/Fusaka 相關更新有提及
  - 有 eth.build 嵌入（Gas EIP-1559）
  - 內容長度 8,609 字元 — 全站最長文章之一
- **問題**: 無重大問題。此篇是整個網站最佳文章，兼具深度和可讀性。

---

## 進階主題逐頁分析

### 9. EIP-4844 Proto-Danksharding
- **內容品質**: 9/10
- **技術準確度**: 9/10
- **觀察**:
  - Blob transaction 機制解釋完整
  - 獨立 fee market（blob base fee）解釋清楚
  - Type 3 交易結構列出
  - 與 Full Danksharding 的路線圖關係有交代
  - 內容長度 8,266 字元 — 深度充足
- **問題**: 無重大問題

### 10. KZG Commitments
- **內容品質**: 8/10
- **技術準確度**: 8/10
- **觀察**:
  - 多項式承諾的數學基礎有解釋
  - Trusted Setup（Powers of Tau）流程完整
  - 與 EIP-4844 的關係清楚
- **問題**:
  - [MEDIUM] 數學門檻較高，缺乏視覺化輔助。配對運算（pairing）的直覺解釋可以更好

### 11. Verkle Trees
- **內容品質**: 8/10
- **技術準確度**: 8/10
- **觀察**:
  - MPT 到 Verkle 的遷移動機清楚（proof size 從 ~4KB 降到 ~150 bytes）
  - 向量承諾的概念有解釋
  - 無狀態以太坊（Stateless Ethereum）願景有交代
- **問題**:
  - [LOW] 可補充遷移時間表的最新狀態

### 12. Precompiled Contracts
- **內容品質**: 8/10
- **技術準確度**: 9/10
- **觀察**:
  - 9 個預編譯合約（地址 0x01-0x09）完整列出
  - 每個合約的用途、gas cost、使用場景說明清楚
  - 包含 EIP-4844 新增的 Point Evaluation（0x0a）
- **問題**: 無重大問題

### 13. zkSNARKs
- **內容品質**: 7/10
- **技術準確度**: 8/10
- **觀察**:
  - 零知識證明基礎概念有解釋
  - Groth16 和 PLONK 有區分
  - 與 Ethereum L2（zkRollup）的關係有交代
- **問題**:
  - [LOW] 內容較概括，與 Ethereum 的具體整合細節可更豐富
  - [LOW] 缺乏具體的 ZK proof 驗證流程示例

---

## 視覺化測試

### AccountDiagram
- **互動性**: 9/10
- **教育價值**: 10/10
- **Console Errors**: 0
- **測試結果**:
  - 5 個預設場景全部正常運作：
    - **Empty EOA**: 展示空帳戶的四元組（nonce=0, balance=0, 空 storageRoot, 空 codeHash）
    - **Funded EOA**: 展示有餘額的 EOA
    - **Simple Contract**: 展示合約帳戶的四元組差異（有 code, 有 storage）
    - **Proxy Contract**: 展示代理合約的結構
    - **EIP-7702**: 展示 EOA Code Delegation 的新模式
  - 每個欄位可展開查看詳細說明
  - State Trie 的 key-value 映射清楚展示
  - 底部有概念說明（4-Field Tuple、State Trie Key、EIP-7702）
  - EIP-7702 場景是一大亮點 — 很少有學習資源視覺化展示這個新特性
- **問題**: 無

### ComparisonTable
- **互動性**: 8/10
- **教育價值**: 9/10
- **Console Errors**: 0
- **測試結果**:
  - 3 個比較頁籤全部正常：
    - **ECDSA vs BLS**: 比較執行層和共識層的簽名方案（curve、key size、signature size、aggregation、recovery 等）
    - **Calldata vs Blob**: 比較永久數據和臨時 rollup 數據（storage duration、cost、EIP 引入、use case）
    - **MPT vs Verkle**: 比較現行和未來的狀態樹（node type、proof size、verification complexity）
  - 各列可展開查看備註
  - Key Takeaways 總結精準
  - 設計風格統一，表格可讀性好
- **問題**:
  - [LOW] 可增加更多比較主題（如 PoW vs PoS、EOA vs Contract Account、L1 vs L2）

---

## 問題清單

| 嚴重度 | 描述 | 頁面 |
|--------|------|------|
| MEDIUM | KZG Commitments 數學門檻高，缺乏視覺化輔助 | kzg-commitments |
| LOW | Verkle Trees 可補充遷移時間表最新狀態 | verkle-trees |
| LOW | zkSNARKs 內容較概括，可增加 Ethereum 具體整合細節 | zksnarks |
| LOW | ComparisonTable 可增加更多比較主題 | comparison-table |
| LOW | 進階主題缺少 eth.build 嵌入（不過這些主題在 eth.build 中可能沒有對應模組） | advanced/* |

---

## 評分摘要

| 項目 | 分數 |
|------|------|
| 技術準確度 | 9.2/10 |
| 內容完整度 | 8.5/10 |
| 學習體驗 | 8.3/10 |
| 視覺化效果 | 9.0/10 |
| Pectra/EIP-7702 覆蓋 | 9.5/10 |
| 文章間交叉引用 | 8/10 |
| 帳戶區段評分 | 8.8/10 |
| 進階主題評分 | 7.8/10 |
| **整體評分** | **8.4/10** |

---

## 改善建議

1. **EIP-1559 視覺化連結**：EIP-1559 文章是最佳文章之一，但應在文章中直接嵌入或連結 FeeSimulator 視覺化元件
2. **進階主題的視覺化**：KZG Commitments 和 Verkle Trees 非常適合用視覺化展示（多項式曲線、樹結構對比）
3. **帳戶區段 → AccountDiagram 連結**：EOA 和合約帳戶文章應直接引用 AccountDiagram 視覺化
4. **ComparisonTable 擴展**：可增加 PoW vs PoS、EOA vs Contract Account、Optimistic vs ZK Rollup 等比較
5. **zkSNARKs 實例**：增加一個具體的 ZK proof 驗證流程（如 Tornado Cash 的簡化版），讓抽象概念更具體
6. **學習路徑整合**：帳戶區段的 Step 1-8 導航很好，但進階主題也應有類似的路徑導航
7. **EIP-7702 的跨區段引用**：合約帳戶文章中的 EIP-7702 內容應連結到 AccountDiagram 的 EIP-7702 場景
