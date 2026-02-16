---
title: "Validators and Staking"
description: "Solana Validators, Staking, Delegated PoS, stake accounts, commission, rewards, Nakamoto coefficient"
tags: [solana, consensus, validators, staking, delegation, rewards]
---

# Validators and Staking

## 概述

Solana 採用 Delegated Proof of Stake（DPoS）共識模型——SOL 持有者將代幣委託給 validator，validator 負責出塊和投票。Validator 需要高規格硬體、足夠的 stake、並持續支付投票交易費用。獎勵透過通膨發放（初始 ~8%，每年遞減 15%，目標長期 ~1.5%），validator 從 delegator 的獎勵中收取佣金（commission）。Nakamoto coefficient 衡量網路去中心化程度。

## 核心原理

### Delegated Proof of Stake

SOL 持有者不需要自己運行 validator，可以將 SOL 委託給信任的 validator：

```
SOL 持有者 (Delegator)
      |
      | 委託 SOL
      v
Validator Node
      |
      | 使用委託的 stake 參與共識
      | 出塊 + 投票
      v
獎勵分配: Validator 抽佣 -> 剩餘返還 Delegator
```

### 硬體要求

Validator 節點的最低建議規格（2024-2025）：

| 組件 | 建議規格 |
|------|----------|
| CPU | 16+ 核心，高單核效能（[PoH](/solana/consensus/proof-of-history/) 需要） |
| RAM | 512 GB |
| 儲存 | 2 TB NVMe SSD（帳本儲存） |
| 網路 | 1 Gbps（推薦 10 Gbps） |
| GPU | 可選，用於 SigVerify 加速 |

運營成本約 $500-2000/月（取決於資料中心和配置）。

### Stake Account

Stake account 是管理委託的鏈上帳戶，有明確的生命週期：

| 狀態 | 說明 |
|------|------|
| Initialized | 已建立但未委託 |
| Activating | 已委託，等待下個 epoch 生效 |
| Active | 正在參與共識，累積獎勵 |
| Deactivating | 已取消委託，等待下個 epoch 解除 |
| Inactive | 已完全解除委託，可提取 |

生效和解除各需等待一個完整 epoch（~2-3 天）。

### 投票成本

Validator 需要為每次投票交易支付費用：

| 項目 | 數值 |
|------|------|
| 每次投票費用 | ~5,000 lamports |
| 每 slot 投票一次 | ~216,000 次/天 |
| 日投票成本 | ~1.08 SOL/天 |
| 年投票成本 | ~394 SOL/年 |

投票成本是 validator 的固定營運支出，與 stake 量無關。

### Commission 和 Rewards

**通膨排程**：

| 項目 | 值 |
|------|-----|
| 初始通膨率 | 8% |
| 遞減率 | 每年 -15% |
| 長期目標 | 1.5% |
| 2024-2025 約 | ~5.5% |

**獎勵計算**：

$$\text{validator\_reward} = \text{staking\_reward} \times \text{commission\_rate}$$
$$\text{delegator\_reward} = \text{staking\_reward} \times (1 - \text{commission\_rate})$$

Staking reward 的大小取決於：
- Validator 的投票表現（uptime、正確率）
- 委託的 stake 比例
- 當前通膨率
- 全網 staking participation rate

### Slashing

截至目前（2025），Solana 的 slashing 機制仍然有限：

| 特性 | 現狀 |
|------|------|
| Double voting | 被偵測但懲罰有限 |
| Offline | 不獲獎勵但不被 slash |
| 惡意行為 | 主要靠社群和 stake delegation 市場淘汰 |

[Alpenglow](/solana/consensus/alpenglow/) 的提案包含更嚴格的 slashing 機制。

### Nakamoto Coefficient

Nakamoto coefficient 衡量需要多少個頂級 validator 才能控制 1/3+ 的 stake（足以阻止 finality）：

$$\text{Nakamoto Coefficient} = \min N : \sum_{i=1}^{N} \text{stake}_i > \frac{1}{3} \times \text{total\_stake}$$

Solana 的 Nakamoto coefficient 約為 20-30（2024-2025 數據），表示前 20-30 個最大的 validator 合計控制超過 1/3 的 stake。

### Validator 選擇考量

Delegator 在選擇 validator 時應考慮：

1. **Commission rate**：通常 0-10%
2. **Uptime**：可通過 validator explorer 查看
3. **Skip rate**：[Leader Schedule](/solana/consensus/leader-schedule/) 中的出塊成功率
4. **Vote success**：[Tower BFT](/solana/consensus/tower-bft/) 投票的參與率
5. **Stake concentration**：避免過度集中於少數 validator

## 程式碼範例

```typescript
import {
  Connection,
  Keypair,
  PublicKey,
  StakeProgram,
  Authorized,
  Lockup,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");

// --- 1. 建立 Stake Account 並委託 ---
const payer = Keypair.generate();
const stakeKeypair = Keypair.generate();
const validatorVotePubkey = new PublicKey("ValidatorVoteAccountPubkey...");

// 建立 stake account
const createStakeAccountTx = StakeProgram.createAccount({
  fromPubkey: payer.publicKey,
  stakePubkey: stakeKeypair.publicKey,
  authorized: new Authorized(
    payer.publicKey,    // staker authority
    payer.publicKey,    // withdrawer authority
  ),
  lockup: new Lockup(0, 0, payer.publicKey), // 無鎖定期
  lamports: 10 * LAMPORTS_PER_SOL,
});

// 委託給 validator
const delegateTx = StakeProgram.delegate({
  stakePubkey: stakeKeypair.publicKey,
  authorizedPubkey: payer.publicKey,
  votePubkey: validatorVotePubkey,
});

// --- 2. 查詢 Validator 資訊 ---
const voteAccounts = await connection.getVoteAccounts();

// 活躍 validator
for (const v of voteAccounts.current.slice(0, 5)) {
  // v.votePubkey: 投票帳戶
  // v.nodePubkey: validator identity
  // v.activatedStake: 委託的 stake (lamports)
  // v.commission: 佣金百分比
  // v.lastVote: 最後投票的 slot
  // v.rootSlot: validator 的 root slot
  // v.epochCredits: 各 epoch 的投票 credit
}

// 停用的 validator
const delinquent = voteAccounts.delinquent;

// --- 3. 查詢 Stake Account 狀態 ---
const stakeAccountInfo = await connection.getStakeActivation(
  stakeKeypair.publicKey
);
// stakeAccountInfo.state: "inactive" | "activating" | "active" | "deactivating"
// stakeAccountInfo.active: 已生效的 stake (lamports)
// stakeAccountInfo.inactive: 未生效的 stake (lamports)

// --- 4. 取消委託 ---
const deactivateTx = StakeProgram.deactivate({
  stakePubkey: stakeKeypair.publicKey,
  authorizedPubkey: payer.publicKey,
});

// 等一個 epoch 後提取
const withdrawTx = StakeProgram.withdraw({
  stakePubkey: stakeKeypair.publicKey,
  authorizedPubkey: payer.publicKey,
  toPubkey: payer.publicKey,
  lamports: 10 * LAMPORTS_PER_SOL,
});

// --- 5. 計算年化收益率估算 ---
function estimateAPY(
  inflationRate: number,
  commission: number,
  stakingParticipation: number
): number {
  // 有效 staking yield = inflation / staking_participation * (1 - commission)
  return (inflationRate / stakingParticipation) * (1 - commission / 100);
}

// 2024-2025 估算
const apy = estimateAPY(0.055, 5, 0.67);
// ~7.5% APY（扣除 5% 佣金後）
```

## 相關概念

- [Tower BFT](/solana/consensus/tower-bft/) - Validator 的投票和共識機制
- [Leader Schedule](/solana/consensus/leader-schedule/) - Stake 決定出塊機會的分配
- [Alpenglow](/solana/consensus/alpenglow/) - 改進 slashing 和 finality 的新共識
- [Proof of History](/solana/consensus/proof-of-history/) - Validator 驗證的 PoH hash chain
- [Gulf Stream](/solana/consensus/gulf-stream/) - Stake 影響 QUIC 連線優先級
- [Turbine](/solana/consensus/turbine/) - Stake 決定 fan-out tree 中的位置
- [Transaction Fees](/solana/transactions/fees-priority/) - Validator 收取的費用分配
- [Slots, Blocks, and Epochs](/solana/consensus/clock-and-slots/) - Staking 生效和獎勵的時間框架
- [Validators (ETH)](/ethereum/consensus/validators/) - Ethereum validator 機制的比較
