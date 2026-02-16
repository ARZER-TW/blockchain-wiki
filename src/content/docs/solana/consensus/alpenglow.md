---
title: "Alpenglow"
description: "Alpenglow, Votor, Rotor, BLS aggregated votes, single-round finality, 150ms finality"
tags: [solana, consensus, alpenglow, votor, rotor, bls, finality]
---

# Alpenglow

## 概述

Alpenglow 是 Solana 的下一代共識協議，旨在取代 [Proof of History + Tower BFT](/solana/consensus/tower-bft/) 的組合。它由兩個核心子協議組成：**Votor**（投票聚合，取代 Tower BFT）和 **Rotor**（一跳區塊傳播，取代 [Turbine](/solana/consensus/turbine/)）。Votor 使用鏈下 [BLS 聚合簽名](/solana/cryptography/bls-signatures-solana/) 實現單輪 finality，目標將 finality 時間從當前的 ~6.4 秒（rooted）大幅壓縮到約 150ms。2025 年 9 月的治理投票中，98.27% 的 validator 批准了 Alpenglow 的實施。

## 核心原理

### 為什麼需要 Alpenglow

當前 Tower BFT 的限制：

| 問題 | 當前狀態 | Alpenglow 目標 |
|------|----------|---------------|
| Finality 延遲 | ~6.4s (rooted) | ~150ms |
| 區塊傳播跳數 | O(log n) (Turbine) | 1 hop (Rotor) |
| 投票方式 | 鏈上交易（佔頻寬和 CU） | 鏈下 BLS 聚合 |
| Slashing | 有限 | 更嚴格 |
| 投票成本 | ~394 SOL/年 | 大幅降低（off-chain） |

### Votor: 投票聚合協議

Votor 取代 Tower BFT 的投票機制：

**核心設計**：
1. Validator 對區塊進行 BLS 簽名投票
2. 投票在鏈下（off-chain）聚合，不佔用鏈上空間
3. BLS 簽名可高效聚合為單一簽名

$$\text{aggregated\_sig} = \sum_{i \in \text{voters}} \text{BLS\_sig}_i$$

**兩種 Finality 路徑**：

| 路徑 | 條件 | 延遲 |
|------|------|------|
| Fast path（單輪） | 80%+ stake 投票一致 | ~150ms |
| Fallback（兩輪） | 60%+ stake（但不到 80%） | ~300ms |

**Fast path 流程**（最佳情況）：
```
1. Leader 提出區塊               (slot start)
2. Validator 收到區塊並驗證       (~50ms)
3. Validator 發送 BLS vote       (~10ms)
4. Aggregator 收集 80%+ 投票     (~50ms)
5. Aggregated proof 廣播         (~40ms)
6. Finality achieved             (~150ms total)
```

**Fallback 流程**（不到 80% 快速投票）：
```
Round 1: 收集 60%+ 的投票 -> "tentatively confirmed"
Round 2: 補充投票達到 finality -> ~300ms total
```

### Rotor: 一跳傳播協議

Rotor 取代 Turbine 的多跳樹狀傳播：

| 特性 | Turbine | Rotor |
|------|---------|-------|
| 傳播結構 | Fan-out tree | Direct broadcast |
| 跳數 | O(log n) | 1 hop |
| Leader 頻寬 | ~200x | ~Nx（需更高頻寬） |
| 延遲 | ~100-150ms | ~50ms |
| Erasure coding | Reed-Solomon | 保留 |

Rotor 的核心思路：利用現代網路基礎設施（10 Gbps+ 頻寬），讓 leader 直接向所有 validator 廣播 shred，省去中間轉發層。

### BLS Signature 聚合

Alpenglow 選擇 BLS 簽名（而非現有的 Ed25519）用於投票，原因在於其聚合特性：

| 特性 | Ed25519（當前） | BLS（Alpenglow） |
|------|----------------|------------------|
| 單一簽名大小 | 64 bytes | 96 bytes |
| N 個簽名 | 64N bytes | 96 bytes（聚合後） |
| 驗證效率 | N 次獨立驗證 | 1 次 pairing check |
| 鏈上空間 | 每票一筆交易 | 單一聚合證明 |

2000+ validator 的投票從 ~128 KB 壓縮為 96 bytes + bitmap。

### 治理投票和時間線

| 里程碑 | 時間 |
|--------|------|
| Alpenglow 提案公布 | 2025 Q1 |
| Testnet 部署 | 2025 Q2-Q3 |
| Validator 治理投票 | 2025 年 9 月 |
| 投票結果 | 98.27% 贊成 |
| Mainnet 部署 | 預計分階段 |

### 對生態的影響

Alpenglow 帶來的變化：

1. **DeFi**：150ms finality 使鏈上訂單簿更具競爭力
2. **Validator 經濟**：投票成本大幅降低
3. **跨鏈**：更快的 finality 減少 bridge 等待時間
4. **MEV**：更快的 finality 改變 MEV 策略
5. **硬體需求**：Rotor 可能要求更高的網路頻寬

## 程式碼範例

```typescript
// Alpenglow 尚未部署至 mainnet
// 以下為概念性程式碼，展示未來的 API 可能形式

import { Connection } from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");

// --- 1. 查詢 finality（未來 Alpenglow 啟用後） ---
// 目前使用 "finalized" commitment = Tower BFT rooted (~6.4s)
// Alpenglow 後 "finalized" 將代表 Votor finality (~150ms)
const slot = await connection.getSlot("finalized");

// --- 2. 比較當前不同 commitment level 的延遲 ---
async function measureFinalityLag() {
  const processed = await connection.getSlot("processed");
  const confirmed = await connection.getSlot("confirmed");
  const finalized = await connection.getSlot("finalized");

  return {
    processedToConfirmed: processed - confirmed,
    confirmedToFinalized: confirmed - finalized,
    processedToFinalized: processed - finalized,
    // 目前: processedToFinalized ~32 slots (~12.8s)
    // Alpenglow: 預期縮短至 <1 slot
  };
}

// --- 3. Validator 投票統計（反映共識參與） ---
const voteAccounts = await connection.getVoteAccounts();

// 計算全網 stake 參與率
const totalActiveStake = voteAccounts.current.reduce(
  (sum, v) => sum + v.activatedStake,
  0
);
const totalDelinquentStake = voteAccounts.delinquent.reduce(
  (sum, v) => sum + v.activatedStake,
  0
);

const participationRate =
  totalActiveStake / (totalActiveStake + totalDelinquentStake);
// 需要 > 80% 參與才能啟用 Alpenglow fast path
// 需要 > 60% 參與才能啟用 fallback path

// --- 4. 監控 finality 進度 ---
connection.onRootChange((newRoot) => {
  // 目前每 ~400ms 更新一次 root
  // Alpenglow 後更新頻率將大幅提升
});
```

```rust
// 概念性示範: BLS 簽名聚合（Alpenglow Votor 的核心原語）
// 注意: 實際 Alpenglow 實現在 Solana validator client 內部

// BLS 聚合的虛擬碼
struct VotorVote {
    slot: u64,
    block_hash: [u8; 32],
    validator_index: u16,
    bls_signature: [u8; 96],  // BLS signature over (slot, block_hash)
}

struct AggregatedProof {
    slot: u64,
    block_hash: [u8; 32],
    aggregated_signature: [u8; 96],  // 所有投票的 BLS 聚合
    voter_bitmap: Vec<u8>,           // 記錄哪些 validator 投了票
    total_stake_voted: u64,
}

// 聚合流程（概念）
fn aggregate_votes(votes: &[VotorVote]) -> AggregatedProof {
    // 1. 驗證每個 BLS 簽名
    // 2. 聚合所有有效簽名
    // 3. 記錄投票的 validator bitmap
    // 4. 計算投票的 stake 總量
    // 5. 如果 > 80% stake -> fast path finality
    // 6. 如果 > 60% stake -> fallback path
    todo!()
}
```

## 相關概念

- [BLS Signatures in Solana](/solana/cryptography/bls-signatures-solana/) - Alpenglow 使用的簽名聚合技術
- [Tower BFT](/solana/consensus/tower-bft/) - Alpenglow 取代的現有共識協議
- [Turbine](/solana/consensus/turbine/) - Rotor 取代的現有傳播協議
- [Proof of History](/solana/consensus/proof-of-history/) - Alpenglow 移除 PoH 的共識角色
- [Validators and Staking](/solana/consensus/validators-staking/) - Alpenglow 改變投票成本和 slashing
- [Leader Schedule](/solana/consensus/leader-schedule/) - Alpenglow 下 leader 的角色變化
- [Slots, Blocks, and Epochs](/solana/consensus/clock-and-slots/) - Finality 時間的根本改變
- [Solana Transaction Lifecycle](/solana/transactions/transaction-lifecycle-solana/) - 更快的 finality 改變交易確認體驗
- [Gulf Stream](/solana/consensus/gulf-stream/) - 與 Rotor 協同的交易轉發
- [BLS Signatures](/fundamentals/cryptography/bls-signatures/) - BLS 簽名的基礎原理
- [Casper FFG (ETH)](/ethereum/consensus/casper-ffg/) - Ethereum finality 機制的比較
