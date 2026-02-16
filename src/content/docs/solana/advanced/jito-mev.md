---
title: "Jito and MEV on Solana"
description: "Jito, MEV, bundles, tips, Block Engine, searcher, sandwich, arbitrage, SIMD-0096"
tags: [solana, advanced, jito, mev, bundles, tips, block-engine, searcher]
---

# Jito and MEV on Solana

## 概述

Jito 是 Solana 上最大的 MEV（Maximal Extractable Value）基礎設施，其修改版 validator client 佔據約 95% 的 staked SOL（2025 年）。Jito 的 Block Engine 提供交易模擬、排序拍賣和 bundle 功能，讓 searchers 可以提交最多 5 筆原子性且有序的交易，並附帶 SOL tips 作為出價。SIMD-0096 將 100% 的 priority fees 分配給 validators，進一步影響 MEV 經濟學。

## 核心原理

### Solana MEV 的特殊性

Solana 與 Ethereum MEV 的根本差異：

```
Ethereum:
  - 全域 mempool: 所有人可看到待處理交易
  - PBS: Builder 建構區塊, Proposer 選擇
  - Flashbots: 私密交易通道

Solana:
  - 無全域 mempool: 交易直接發送給 leader
  - 無 PBS: Leader 直接處理所有交易
  - 持續出塊: ~400ms slots
  - Jito: 在 leader 的 Banking Stage 中插入 bundles
```

### Jito 架構

```
+------------------+     +------------------+     +------------------+
|    Searcher      | --> |   Block Engine   | --> | Jito Validator   |
|  (偵測機會)       |     |  (模擬+拍賣)     |     | (Banking Stage)  |
+------------------+     +------------------+     +------------------+
        |                        |                         |
  偵測套利/清算           模擬 bundle 結果          插入 bundles
  建構 bundle            收集 bids                 到區塊中
  提交 + tip             選擇最高出價              執行交易
```

### Block Engine 流程

```
1. Ingestion
   |-- 接收 searchers 的 bundles
   |-- 每個 bundle 最多 5 筆交易
   |
2. Simulation
   |-- 模擬 bundle 執行結果
   |-- 過濾失敗的 bundles
   |-- 驗證 tip 金額
   |
3. Auction
   |-- 按 tip 金額排序
   |-- 同一 slot 多個 bundles 競標
   |-- 每 200ms 一輪拍賣
   |
4. Delivery
   |-- 獲勝 bundles 送到 leader
   |-- leader 在 Banking Stage 中執行
   |-- bundles 內的交易保證原子性和順序
```

### Bundles

Bundle 是 Jito 的核心概念：

| 特性 | 說明 |
|------|------|
| 交易數量 | 最多 5 筆 |
| 原子性 | 全部成功或全部失敗 |
| 順序性 | 交易按提交順序執行 |
| Tip | 最小 1,000 lamports |
| 時效 | 綁定特定 slot |
| 私密性 | Bundle 不進入 mempool |

### Tips（小費）

```
Tip 機制:
  - 在 bundle 的最後一筆交易中
  - SOL transfer 到 Jito tip 帳戶 (8 個輪換地址)
  - 最低 1,000 lamports (~$0.00015)
  - 無上限, 競爭激烈時可能數百萬 lamports

Tip 分配:
  - Pre SIMD-0096: 50% burn, 50% validator
  - Post SIMD-0096 (priority fee): 100% validator
  - Jito tips: 額外收入, 不走 priority fee 通道
```

### Searcher 工作流

```
1. 偵測機會
   |-- 監聽鏈上狀態變化
   |-- DEX 價格差異（套利）
   |-- 借貸協定清算線（清算）
   |-- Pending 交易（sandwich, 在 Solana 較困難）
   |
2. 建構 Bundle
   |-- TX1: 買入低價資產
   |-- TX2: 賣出高價資產
   |-- TX3: tip 支付
   |-- 確保原子性: 全部成功或失敗
   |
3. 提交
   |-- 透過 Jito Block Engine API
   |-- gRPC 或 JSON-RPC
   |-- 指定目標 slot
   |
4. 結果
   |-- Bundle 上鏈: 賺取利潤 - tip
   |-- Bundle 落選: 沒有損失（原子性）
```

### MEV 類型

| 類型 | 說明 | Solana 特性 |
|------|------|------------|
| Arbitrage | 跨 DEX 價格差異 | 最常見，競爭激烈 |
| Liquidation | 清算低抵押借貸 | 需要快速偵測 |
| Sandwich | 前後夾擊使用者交易 | 較 Ethereum 困難（無全域 mempool） |
| JIT Liquidity | 即時提供流動性 | 在 Solana CLMMs 上有效 |
| Back-running | 緊跟大額交易 | 利用價格衝擊 |

### SIMD-0096: Priority Fee 分配

```
Before SIMD-0096:
  Base fee: 50% burned, 50% to validator
  Priority fee: 50% burned, 50% to validator

After SIMD-0096 (2024):
  Base fee: 50% burned, 50% to validator (不變)
  Priority fee: 100% to validator

影響:
  - Validators 收入增加
  - 減少 validator 做 MEV 的經濟動機（官方收入已增加）
  - Staking yield 提升
```

### 與 Ethereum Flashbots/MEV-Boost 的比較

| 特性 | Jito (Solana) | Flashbots/MEV-Boost (Ethereum) |
|------|-------------|-------------------------------|
| 架構 | Block Engine + modified validator | Relay + Builder + Proposer |
| PBS | 無 | 有（Builder/Proposer 分離） |
| Bundle 大小 | 最多 5 txs | 整個區塊 |
| 拍賣頻率 | ~200ms | ~12s（每 slot） |
| Mempool | 無全域 mempool | 有全域 mempool |
| Sandwich 難度 | 較高（需預測 leader） | 較低（mempool 可見） |
| 客戶端佔比 | ~95% staked SOL | MEV-Boost ~90% validators |

## 程式碼範例

```typescript
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

// Jito tip 帳戶（8 個輪換地址）
const JITO_TIP_ACCOUNTS = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4bVqkfRtQ7NmXwkiNPLYkNm",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSLXFDCZkrl5ewwT6x2",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
];

// 建構帶 Jito tip 的交易 bundle
async function buildArbBundleWithTip(
  connection: Connection,
  searcher: Keypair,
  arbInstructions: TransactionInstruction[],
  tipLamports: number
): Promise<Transaction[]> {
  const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  // TX1: 執行套利操作
  const arbTx = new Transaction();
  for (const ix of arbInstructions) {
    arbTx.add(ix);
  }
  arbTx.recentBlockhash = recentBlockhash;
  arbTx.feePayer = searcher.publicKey;

  // TX2: 支付 Jito tip
  const tipAccountIndex = Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length);
  const tipAccount = new PublicKey(JITO_TIP_ACCOUNTS[tipAccountIndex]);

  const tipTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: searcher.publicKey,
      toPubkey: tipAccount,
      lamports: tipLamports,
    })
  );
  tipTx.recentBlockhash = recentBlockhash;
  tipTx.feePayer = searcher.publicKey;

  return [arbTx, tipTx];
}

// 提交 bundle 到 Jito Block Engine
async function submitBundle(
  blockEngineUrl: string,
  serializedTransactions: string[]
) {
  const response = await fetch(`${blockEngineUrl}/api/v1/bundles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sendBundle",
      params: [serializedTransactions],
    }),
  });

  const result = await response.json();
  return result;
}

// 查詢 bundle 狀態
async function getBundleStatus(blockEngineUrl: string, bundleId: string) {
  const response = await fetch(`${blockEngineUrl}/api/v1/bundles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getBundleStatuses",
      params: [[bundleId]],
    }),
  });

  const result = await response.json();
  return result;
}

// 計算交易的 priority fee 和 Jito tip 策略
function calculateOptimalFees(
  expectedProfit: number,
  competitionLevel: "low" | "medium" | "high"
): { priorityFee: number; jitoTip: number } {
  const strategies = {
    low: { priorityPct: 0.05, tipPct: 0.1 },
    medium: { priorityPct: 0.1, tipPct: 0.3 },
    high: { priorityPct: 0.15, tipPct: 0.5 },
  };

  const strategy = strategies[competitionLevel];
  return {
    priorityFee: Math.floor(expectedProfit * strategy.priorityPct),
    jitoTip: Math.floor(expectedProfit * strategy.tipPct),
  };
}
```

```rust
// Anchor: 設計防 MEV 的程式
use anchor_lang::prelude::*;

declare_id!("JitoDemo1111111111111111111111111111111111");

#[program]
pub mod mev_protection_demo {
    use super::*;

    // 使用 slippage 保護防止 sandwich 攻擊
    pub fn swap_with_protection(
        ctx: Context<ProtectedSwap>,
        amount_in: u64,
        minimum_amount_out: u64,  // slippage 保護
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;

        // 常數乘積 AMM
        let k = pool.reserve_a as u128 * pool.reserve_b as u128;
        let new_reserve_a = pool.reserve_a + amount_in;
        let new_reserve_b = (k / new_reserve_a as u128) as u64;
        let amount_out = pool.reserve_b - new_reserve_b;

        // 滑點保護: 防止 sandwich 攻擊
        require!(
            amount_out >= minimum_amount_out,
            ErrorCode::SlippageExceeded
        );

        pool.reserve_a = new_reserve_a;
        pool.reserve_b = new_reserve_b;

        msg!(
            "Swap: {} in -> {} out (min: {})",
            amount_in,
            amount_out,
            minimum_amount_out
        );

        Ok(())
    }
}

#[derive(Accounts)]
pub struct ProtectedSwap<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub user_token_a: AccountInfo<'info>,
    #[account(mut)]
    pub user_token_b: AccountInfo<'info>,
    pub user: Signer<'info>,
}

#[account]
pub struct Pool {
    pub reserve_a: u64,
    pub reserve_b: u64,
    pub mint_a: Pubkey,
    pub mint_b: Pubkey,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
}
```

## 相關概念

- [Fees and Priority Fees](/solana/transactions/fees-priority/) - Priority fee 是 MEV 經濟學的基礎
- [Leader Schedule](/solana/consensus/leader-schedule/) - Searcher 需預測 leader 來提交 bundles
- [Gulf Stream](/solana/consensus/gulf-stream/) - 交易直接發送給 leader 的機制
- [Banking Stage](/solana/runtime/banking-stage/) - Jito 在 Banking Stage 中插入 bundles
- [Mempool (ETH)](/ethereum/transaction-lifecycle/mempool/) - Ethereum 的公開 mempool 是 MEV 的來源
- [Network Economics](/solana/advanced/network-economics/) - SIMD-0096 改變收入分配
- [Validators and Staking](/solana/consensus/validators-staking/) - Jito validator 佔 95% staked SOL
- [Firedancer](/solana/advanced/firedancer/) - Firedancer 與 Jito 的整合挑戰
- [Solana vs Ethereum](/solana/advanced/solana-vs-ethereum/) - MEV 機制的跨鏈比較
