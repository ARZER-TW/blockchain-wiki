---
title: "Network Economics"
description: "Solana Network Economics, inflation, staking yield, fee distribution, rent economics, SOL supply"
tags: [solana, advanced, economics, inflation, staking, fees, rent, tokenomics]
---

# Network Economics

## 概述

Solana 的經濟模型圍繞 SOL 代幣設計：初始供應 500M SOL，通膨率從約 5.5% 開始每年遞減 15%，長期收斂至 1.5%。交易費用分為 base fee（50% 燒毀 / 50% 給 validator）和 priority fee（SIMD-0096 後 100% 給 validator）。質押收益來自通膨新發行的 SOL 減去 validator 佣金。Rent 機制要求帳戶存入最低 lamports，形成對 SOL 的隱性需求。整體設計在激勵驗證者、控制通膨和降低使用成本之間取得平衡。

## 核心原理

### SOL 供應與通膨

```
初始供應: 500,000,000 SOL (genesis, 2020)

通膨率:
  Year 0: ~8% (初始)
  Year 1: ~6.8%
  Year 2: ~5.78%
  ...
  Current (~Year 5): ~5.5%
  Long-term target: 1.5%

遞減公式:
  inflation_rate(year) = max(
    initial_rate * (1 - disinflation_rate)^year,
    terminal_rate
  )

  initial_rate = 8%
  disinflation_rate = 15% per year
  terminal_rate = 1.5%
```

### 通膨時程

| 年份 | 大約通膨率 | 新發行 SOL/年 |
|------|-----------|--------------|
| 2020 (launch) | 8.0% | ~40M |
| 2022 | 5.8% | ~33M |
| 2024 | 4.2% | ~25M |
| 2026 | ~3.0% | ~19M |
| 2030 | ~1.5% | ~10M |
| 2030+ | 1.5% (固定) | 持續微幅增加 |

### 費用分配

```
交易費用構成:
  Base fee: 5,000 lamports/signature (固定)
  Priority fee: CU_limit * CU_price (使用者設定)

分配規則 (Post SIMD-0096):
  Base fee:
    50% -> burned (永久銷毀)
    50% -> leader validator

  Priority fee:
    100% -> leader validator (SIMD-0096 改動)
    (原本: 50% burn / 50% validator)

Jito tips:
    100% -> leader validator (鏈下結算)
    不走 fee 機制, 是額外的 SOL 轉帳
```

### Fee 收入估算

```
假設:
  平均每 slot ~2,000 筆交易
  每秒 ~2.5 slots
  每天 ~216,000 slots
  每筆交易 base fee: 5,000 lamports = 0.000005 SOL

Daily base fee revenue:
  216,000 slots * 2,000 txs * 0.000005 SOL
  = ~2,160 SOL/day

Daily priority fee + Jito tips:
  波動大, 高峰期可達 10,000+ SOL/day
  平時約 2,000-5,000 SOL/day

Total daily fee burn (base fee 50%):
  ~1,080 SOL/day (base fee portion)
```

### 質押經濟學

```
質押收益計算:
  gross_yield = inflation_rate * (total_supply / total_staked)
  net_yield = gross_yield * (1 - validator_commission)

範例 (2025):
  inflation_rate = ~5.5%
  total_staked / total_supply = ~67%
  gross_yield = 5.5% / 0.67 = ~8.2%
  average commission = ~7%
  net_yield = 8.2% * 0.93 = ~7.6%

加上 MEV/tips 收益:
  total_yield = staking_yield + mev_tips_share
  -> 約 7-9% APY
```

### 質押收益影響因素

| 因素 | 影響 |
|------|------|
| 通膨率降低 | 收益逐年下降 |
| 質押參與率上升 | 每個質押者分到更少 |
| Validator commission | 直接減少 delegator 收益 |
| MEV/Tips | 額外收入，隨交易活動波動 |
| SOL 價格 | 不影響 SOL 計價收益，但影響法幣收益 |

### Rent 經濟學

```
Rent 機制:
  每個帳戶需存入足夠 lamports 達到 rent-exempt
  rent_exempt = base_rent + rent_per_byte * data_length

目前參數:
  rent per byte per year: 3.48 SOL / MB / year
  rent-exempt = 2 years worth of rent

常見帳戶 rent:
  空帳戶 (0 bytes data): 890,880 lamports (~0.00089 SOL)
  Token Account (165 bytes): 2,039,280 lamports (~0.002 SOL)
  Mint (82 bytes): 1,461,600 lamports (~0.0015 SOL)
  Program (typical 200KB): ~1.4 SOL
```

### Rent 對 SOL 需求的影響

```
Rent 鎖定:
  每個帳戶鎖定 lamports -> SOL 供應減少
  數億帳戶 * 平均 0.002 SOL = 大量 SOL 鎖定

帳戶統計 (估計):
  Token Accounts: ~數億個
  其他帳戶: ~數百萬個
  鎖定 SOL: 數百萬 SOL

帳戶關閉:
  關閉帳戶回收 rent -> SOL 回到流通
  清理不用的帳戶有經濟激勵
```

### 與 Ethereum 經濟模型的比較

| 特性 | Solana | Ethereum |
|------|--------|----------|
| 供應上限 | 無上限（持續通膨） | 無硬上限（但可通縮） |
| 當前通膨 | ~5.5% (遞減) | ~0.5% (post-Merge) |
| 通縮機制 | Base fee 50% burn | EIP-1559 base fee 100% burn |
| 是否通縮 | 否（通膨 > burn） | 視交易活動而定 |
| 質押收益 | ~7-8% APY | ~3-4% APY |
| 最低質押 | 無（delegation） | 32 ETH (~$100K+) |
| 費用水準 | ~$0.001 | ~$1-50 |
| State 成本 | Rent-exempt（可回收） | 無 rent（永久佔用） |
| 發行方式 | 通膨分配給 stakers | 每 slot 固定發行 |

### 經濟模型演進

```
重要的 SIMD 提案:

SIMD-0096 (已實施):
  Priority fee 100% 給 validator
  -> 增加 validator 收入
  -> 減少 MEV side-dealing 動機

SIMD-0123 (討論中):
  動態 base fee（類似 EIP-1559）
  -> 根據區塊使用率調整 base fee
  -> 更好的擁塞定價

SIMD-0228 (討論中):
  根據質押率調整通膨
  -> 質押率高 -> 降低通膨
  -> 質押率低 -> 提高通膨
  -> 動態平衡
```

## 程式碼範例

```typescript
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");

// 計算當前通膨率和質押收益
async function getNetworkEconomics() {
  const epochInfo = await connection.getEpochInfo();
  const inflationRate = await connection.getInflationRate();
  const supply = await connection.getSupply();
  const voteAccounts = await connection.getVoteAccounts();

  // 計算總質押量
  const totalStaked = voteAccounts.current.reduce(
    (sum, v) => sum + v.activatedStake,
    0
  );

  const totalSupply = supply.value.total / LAMPORTS_PER_SOL;
  const circulatingSupply = supply.value.circulating / LAMPORTS_PER_SOL;
  const stakedSOL = totalStaked / LAMPORTS_PER_SOL;
  const stakingRatio = stakedSOL / totalSupply;

  // 質押收益估算 (不含 commission)
  const grossYield = inflationRate.total / stakingRatio;

  return {
    epoch: epochInfo.epoch,
    totalSupply: Math.round(totalSupply),
    circulatingSupply: Math.round(circulatingSupply),
    stakedSOL: Math.round(stakedSOL),
    stakingRatio: (stakingRatio * 100).toFixed(1) + "%",
    inflation: {
      total: (inflationRate.total * 100).toFixed(2) + "%",
      validator: (inflationRate.validator * 100).toFixed(2) + "%",
      foundation: (inflationRate.foundation * 100).toFixed(2) + "%",
    },
    estimatedGrossYield: (grossYield * 100).toFixed(2) + "%",
  };
}

// 計算帳戶 rent 成本
async function calculateRentCosts(dataSizes: number[]) {
  const results = [];
  for (const size of dataSizes) {
    const lamports = await connection.getMinimumBalanceForRentExemption(size);
    results.push({
      dataSize: size,
      rentExemptLamports: lamports,
      rentExemptSOL: lamports / LAMPORTS_PER_SOL,
    });
  }
  return results;
}

// 分析 validator 經濟
async function analyzeValidatorEconomics() {
  const voteAccounts = await connection.getVoteAccounts();

  const validators = voteAccounts.current.map((v) => ({
    votePubkey: v.votePubkey,
    nodePubkey: v.nodePubkey,
    activatedStake: v.activatedStake / LAMPORTS_PER_SOL,
    commission: v.commission,
    lastVote: v.lastVote,
  }));

  // 按質押量排序
  validators.sort((a, b) => b.activatedStake - a.activatedStake);

  // 計算中本係數
  const totalStake = validators.reduce((sum, v) => sum + v.activatedStake, 0);
  let cumulativeStake = 0;
  let nakamotoCoefficient = 0;
  for (const v of validators) {
    cumulativeStake += v.activatedStake;
    nakamotoCoefficient++;
    if (cumulativeStake > totalStake / 3) break;
  }

  // Commission 分佈
  const commissions = validators.map((v) => v.commission);
  const avgCommission =
    commissions.reduce((a, b) => a + b, 0) / commissions.length;

  return {
    totalValidators: validators.length,
    totalStakeSOL: Math.round(totalStake),
    nakamotoCoefficient,
    averageCommission: avgCommission.toFixed(1) + "%",
    top10: validators.slice(0, 10).map((v) => ({
      stake: Math.round(v.activatedStake),
      commission: v.commission + "%",
    })),
  };
}

// 估算交易費用燒毀率
async function estimateBurnRate(numSlots: number) {
  const currentSlot = await connection.getSlot();
  let totalFees = 0;
  let txCount = 0;

  for (let i = 0; i < numSlots; i++) {
    try {
      const block = await connection.getBlock(currentSlot - i, {
        maxSupportedTransactionVersion: 0,
        transactionDetails: "full",
        rewards: true,
      });

      if (block) {
        txCount += block.transactions.length;
        for (const tx of block.transactions) {
          totalFees += tx.meta?.fee ?? 0;
        }
      }
    } catch {
      // skip missing slots
    }
  }

  const avgFeePerTx = txCount > 0 ? totalFees / txCount : 0;
  const burnedLamports = totalFees * 0.5; // 50% of base fee burned

  return {
    slotsAnalyzed: numSlots,
    totalTransactions: txCount,
    totalFeesLamports: totalFees,
    totalFeesSOL: totalFees / LAMPORTS_PER_SOL,
    avgFeePerTxLamports: Math.round(avgFeePerTx),
    estimatedBurnedSOL: burnedLamports / LAMPORTS_PER_SOL,
  };
}
```

```rust
use anchor_lang::prelude::*;

declare_id!("EconDemo1111111111111111111111111111111111");

#[program]
pub mod economics_demo {
    use super::*;

    // 展示 rent 回收機制
    pub fn create_temporary_account(
        ctx: Context<CreateTemp>,
        data: Vec<u8>,
    ) -> Result<()> {
        let temp = &mut ctx.accounts.temp_account;
        temp.authority = ctx.accounts.authority.key();
        temp.data = data;
        temp.created_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    // 關閉帳戶, 回收 rent lamports
    pub fn close_and_reclaim(ctx: Context<CloseAndReclaim>) -> Result<()> {
        // Anchor 的 close constraint 會:
        // 1. 將帳戶的所有 lamports 轉給 authority
        // 2. 將帳戶 data 歸零
        // 3. 將 owner 設為 System Program
        msg!(
            "Reclaimed rent from account: {}",
            ctx.accounts.temp_account.key()
        );
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(data: Vec<u8>)]
pub struct CreateTemp<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 4 + data.len() + 8,
    )]
    pub temp_account: Account<'info, TempData>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseAndReclaim<'info> {
    #[account(
        mut,
        has_one = authority,
        close = authority,  // 關閉帳戶, lamports 退還 authority
    )]
    pub temp_account: Account<'info, TempData>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[account]
pub struct TempData {
    pub authority: Pubkey,
    pub data: Vec<u8>,
    pub created_at: i64,
}
```

## 相關概念

- [Validators and Staking](/solana/consensus/validators-staking/) - 驗證者收入與質押機制
- [Fees and Priority Fees](/solana/transactions/fees-priority/) - 交易費用的詳細計算
- [Rent](/solana/account-model/rent/) - Rent-exempt 機制與帳戶成本
- [Jito MEV](/solana/advanced/jito-mev/) - MEV 收入對驗證者的影響
- [Solana vs Ethereum](/solana/advanced/solana-vs-ethereum/) - 與 Ethereum 經濟模型的比較
- [Firedancer](/solana/advanced/firedancer/) - 驗證者硬體成本與效能
- [State Compression](/solana/advanced/state-compression/) - 降低狀態成本的技術
- [ZK Compression](/solana/advanced/zk-compression/) - 進一步壓縮成本
- [EIP-1559 (ETH)](/ethereum/accounts/eip-1559/) - Ethereum 的費用燃燒機制
