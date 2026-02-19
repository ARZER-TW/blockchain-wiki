# 共識機制區段 — UX/內容審查報告

## 概要

共識機制區段包含 10 篇文章和 3 個互動式視覺化，涵蓋 Beacon Chain、Validators、Attestation、Casper FFG、LMD GHOST、RANDAO、Slashing、Ethash（歷史）、Block Structure 和 Block Header。整體內容品質高，技術準確度優秀，Pectra 升級內容已整合。視覺化元件教育價值突出，特別是 ForkTree 的互動設計。

**整體評分：8.5/10**

---

## 逐頁分析

### 1. Beacon Chain
- **內容品質**: 9/10
- **技術準確度**: 9/10
- **觀察**:
  - 時間劃分（Slot/Epoch）清晰，附表格說明
  - Proposer 選擇機制解釋完整（RANDAO seed + Fisher-Yates shuffle + effective balance 加權）
  - Pectra 升級影響已記錄（EIP-7251 MaxEB 從 32 ETH 提升到 2048 ETH）
  - Committee 分配演算法解釋到位（最多 64 個 committee，每個至少 128 個 validator）
  - State Transition 公式完整
  - 有 eth.build 嵌入（Distributed Ledger 視覺化）
- **問題**: 無重大問題
- **內容長度**: 6,987 字元，適中

### 2. Validators
- **內容品質**: 9/10
- **技術準確度**: 9/10
- **觀察**:
  - Validator 結構欄位表格清晰（pubkey、withdrawal_credentials、effective_balance 等）
  - 質押與啟用流程完整（deposit contract 地址正確：0x00000000219ab540356cBB839Cbe05303d7705Fa）
  - Pectra 前後差異清楚記錄（EIP-6110 存款確認時間從 ~12 小時降至 ~13 分鐘）
  - Activation Queue churn limit 計算正確
  - Effective Balance 機制解釋完整
  - 有 eth.build 嵌入（Byzantine Generals）
- **問題**: 無重大問題

### 3. Attestation
- **內容品質**: 9/10
- **技術準確度**: 9/10
- **觀察**:
  - AttestationData 結構精確（slot、index、beacon_block_root、source、target）
  - 三個投票語義（head vote / source vote / target vote）分別解釋，非常清楚
  - BLS 聚合簽章流程完整
  - 獎勵機制分項說明
  - 有 eth.build 嵌入
- **問題**: 無重大問題

### 4. Casper FFG
- **內容品質**: 9/10
- **技術準確度**: 10/10
- **觀察**:
  - Checkpoint 定義精確（epoch 的第一個 slot 對應的區塊）
  - Supermajority link 公式正確（>2/3 以 effective balance 加權）
  - Justification 和 Finalization 條件推理清晰
  - Slashing conditions（double vote、surround vote）定義完整
  - Safety 保證的數學證明框架有提及
  - 內容長度 7,646 字元，深度足夠
- **問題**: 無重大問題。此篇是整個網站技術深度最佳的文章之一。

### 5. LMD GHOST
- **內容品質**: 8/10
- **技術準確度**: 9/10
- **觀察**:
  - 原始 GHOST（Sompolinsky & Zohar）背景有交代
  - Latest Message Driven 規則解釋精確
  - Fork Choice 演算法虛擬碼完整
  - Weight 計算公式正確
  - Proposer Boost（EIP-0040）有記錄
- **問題**: 無 eth.build 嵌入（其他文章有但這篇沒有），略顯不一致

### 6. RANDAO
- **內容品質**: 8/10
- **技術準確度**: 9/10
- **觀察**:
  - Commit-Reveal 機制基礎解釋清楚
  - BLS 簽名的確定性特性作為天然 commit-reveal 很好地說明
  - RANDAO mix 的 XOR 累積機制完整
  - Lookahead 問題（最後一個 proposer 可選擇性 skip）有討論
- **問題**: 無重大問題

### 7. Slashing
- **內容品質**: 8/10
- **技術準確度**: 9/10
- **觀察**:
  - 兩種 slashable offences（double vote、surround vote）定義清楚
  - Slashing 懲罰計算公式正確
  - 關聯性懲罰（correlation penalty）解釋到位
  - Whistleblower 獎勵機制完整
- **問題**: 無重大問題

### 8. Ethash
- **內容品質**: 7/10
- **技術準確度**: 8/10
- **觀察**:
  - 作為歷史內容（The Merge 後已棄用）有明確標記
  - DAG 生成和 Hashimoto 演算法解釋完整
  - 內存硬度（memory-hard）設計原理說明到位
- **問題**:
  - [MEDIUM] 應在頁面頂部更醒目地標記「已棄用」狀態。目前可能讓初學者誤以為 Ethereum 仍使用 PoW
  - [LOW] 可補充 The Merge 時間（2022/9/15）

### 9. Block Structure
- **內容品質**: 8/10
- **技術準確度**: 9/10
- **觀察**:
  - Execution Payload 和 Consensus Payload 分層清楚
  - SignedBeaconBlock 結構完整
  - EIP-4844 blob 相關欄位（blob_kzg_commitments 等）已記錄
- **問題**: 無重大問題

### 10. Block Header
- **內容品質**: 8/10
- **技術準確度**: 9/10
- **觀察**:
  - ExecutionPayloadHeader 欄位表格完整
  - 各欄位的用途和來源說明清楚
  - 有對應的互動式視覺化元件
- **問題**: 無重大問題

---

## 視覺化測試

### SlotEpochTimeline
- **互動性**: 9/10
- **教育價值**: 9/10
- **Console Errors**: 0
- **測試結果**:
  - 3 個預設場景（Normal Epoch、Missed Slots、Finality Delay）全部正常切換
  - 清楚顯示 32 個 Slot 組成 1 個 Epoch 的結構
  - Proposed/Missed/Empty 狀態用不同顏色區分
  - Finalized/Justified/Pending 檢查點狀態視覺化清晰
  - 參與率百分比和 2/3 門檻線顯示
  - 可點擊個別 Slot 查看詳細資訊
  - Finality Delay 場景很有教育價值 — 展示當參與率低於 2/3 時 finality 如何停滯
- **問題**:
  - [LOW] 按鈕點擊有時 timeout（Playwright 測試中），可能是模式對話框遮擋

### ForkTree
- **互動性**: 10/10
- **教育價值**: 10/10
- **Console Errors**: 0
- **測試結果**:
  - 4 個預設場景（No Forks、Simple Fork、Deep Reorg、Finality）展示不同情境
  - 可點擊區塊添加/移除投票 — 動態展示 canonical chain 如何切換
  - Vote Counts 和 Checkpoints 可切換顯示
  - Weight 計算正確：heaviest subtree 成為 canonical chain
  - Justified/Finalized checkpoint 用黃色/紫色框線標示
  - 圖例完整（Canonical chain、Fork、Justified、Finalized）
  - 底部有 LMD-GHOST、Casper FFG、Fork Choice 三個概念簡述
- **問題**: 無。這是整個網站最佳視覺化元件之一。

### BlockHeader
- **互動性**: 8/10
- **教育價值**: 8/10
- **Console Errors**: 0
- **測試結果**:
  - 4 個預設場景（High Activity、Average Block、Low Activity、Full Blobs）
  - 展示不同條件下 block header 欄位的變化
  - 各欄位可展開查看詳細說明
- **問題**: 無重大問題

---

## 問題清單

| 嚴重度 | 描述 | 頁面 |
|--------|------|------|
| MEDIUM | Ethash 文章應在頂部醒目標記「已棄用 — The Merge (2022/9/15) 後 Ethereum 使用 PoS」 | ethash |
| LOW | LMD GHOST 文章缺少 eth.build 嵌入，與其他文章不一致 | lmd-ghost |
| LOW | Ethash 可補充 The Merge 確切日期 | ethash |
| LOW | SlotEpochTimeline 某些按鈕在自動化測試中 timeout | slot-epoch-timeline |

---

## 評分摘要

| 項目 | 分數 |
|------|------|
| 技術準確度 | 9.1/10 |
| 內容完整度 | 8.8/10 |
| 學習體驗 | 8.5/10 |
| 視覺化效果 | 9.0/10 |
| Pectra 升級覆蓋 | 9/10 |
| 文章間交叉引用 | 8/10 |
| **整體評分** | **8.5/10** |

---

## 改善建議

1. **Ethash 棄用標記**：在文章開頭加一個醒目的「已棄用」banner，避免初學者混淆
2. **學習路徑導引**：文章底部的導航（Step X/10）很好，但可在每篇文章結尾加上「推薦下一步」連結到對應的視覺化元件
3. **ForkTree 連結到 LMD GHOST 和 Casper FFG 文章**：視覺化元件中的概念簡述可加上超連結
4. **Casper FFG + LMD GHOST 整合說明**：可增加一篇「Ethereum 共識如何運作」的概覽文章，將 FFG 和 GHOST 的互動關係統一說明
5. **視覺化覆蓋率**：RANDAO 和 Slashing 目前沒有對應視覺化，但這兩個概念很適合用動畫展示（RANDAO 的 XOR 累積、Slashing 的懲罰計算）
