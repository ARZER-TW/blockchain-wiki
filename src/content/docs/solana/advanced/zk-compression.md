---
title: "ZK Compression"
description: "ZK Compression, Light Protocol, compressed accounts, zero-knowledge proofs, Light Token"
tags: [solana, advanced, zk-compression, light-protocol, zero-knowledge, compressed-accounts]
---

# ZK Compression

## 概述

ZK Compression 是 Light Protocol 開發的 Solana 狀態壓縮技術，使用零知識證明（ZK proofs）驗證壓縮帳戶的狀態轉換。與 [State Compression](/solana/advanced/state-compression/) 類似，資料的 [Merkle root](/fundamentals/data-structures/merkle-tree/) 存在鏈上，但 ZK Compression 透過鏈上驗證的 ZK proof 保證狀態轉換的正確性，無需信任 indexer。ZK Compression V2（2025 年）引入 batched Merkle trees，效能提升 250 倍。Light Token 提供壓縮版 SPL tokens，成本降低 200 倍以上。

## 核心原理

### 壓縮帳戶架構

```
鏈上:
  State Merkle Tree: 儲存所有 compressed accounts 的 root
  Address Merkle Tree: 儲存所有帳戶地址的 root
  Nullifier (作廢) 機制: 防止雙重花費

鏈下:
  Compressed account 資料: 由 indexer 儲存
  每次狀態更新: ZK proof 驗證正確性
```

### 與 State Compression 的差異

| 特性 | State Compression | ZK Compression |
|------|------------------|----------------|
| 驗證方式 | Merkle proof（被呼叫程式驗證） | ZK proof（密碼學驗證） |
| 信任模型 | 需信任 indexer 提供正確 proof | ZK proof 自證正確性 |
| 通用性 | 主要用於 cNFT | 通用：任何帳戶資料 |
| 可程式性 | 有限 | 支援任意程式邏輯 |
| 成本 | 便宜（Merkle proof） | 更便宜（ZK 批次驗證） |

### ZK Proof 工作流

```
1. 使用者要修改 compressed account
   |
2. Indexer 提供當前 account 資料 + Merkle proof
   |
3. 客戶端建構狀態轉換
   |-- 舊狀態 + 操作 = 新狀態
   |
4. 生成 ZK proof
   |-- 證明: 舊 leaf 在 tree 中（inclusion proof）
   |-- 證明: 新 leaf 由合法操作產生
   |-- 證明: 舊 leaf 被正確作廢
   |
5. 提交交易: ZK proof + 新 leaf
   |
6. 鏈上驗證
   |-- 驗證 ZK proof
   |-- 更新 Merkle root
   |-- 記錄 nullifier
```

### ZK Compression V2 (2025)

V2 的關鍵改進：

```
V1:
  每次更新需要 CPI 到 compression program
  每個 leaf 更新是獨立交易
  Merkle tree 更新是序列化的

V2 (Batched Merkle Trees):
  多個 leaf 更新可批次處理
  單筆交易可更新多個 accounts
  250x 效能提升

技術細節:
  - Batched append: 一次插入多個 leaves
  - Batched nullify: 一次作廢多個 leaves
  - 減少 CPI 呼叫次數
  - 更小的 proof size
```

### Light Token

壓縮版 SPL Token，使用 ZK Compression：

| 操作 | 傳統 SPL Token | Light Token |
|------|---------------|-------------|
| 建立帳戶 | ~0.002 SOL | ~0.00001 SOL |
| 轉帳 | ~0.000005 SOL | ~0.000005 SOL |
| 空投 10,000 人 | ~20 SOL (帳戶 rent) | ~0.1 SOL |
| 空投 1,000,000 人 | ~2,000 SOL | ~5 SOL |

### 使用場景

```
大規模空投:
  傳統: 每人需 0.002 SOL token account rent
  Light Token: 壓縮帳戶, 幾乎無 rent

DePIN (Decentralized Physical Infrastructure):
  數百萬裝置的狀態管理
  每個裝置 = 1 個 compressed account
  成本: 傳統方式的 1/200

社交應用:
  每個使用者的 profile = compressed account
  百萬級使用者的鏈上資料
  保持去中心化而不犧牲成本
```

### 與 Ethereum Calldata/Blob DA 的比較

| 特性 | ZK Compression (Solana) | Calldata / Blob (Ethereum) |
|------|------------------------|---------------------------|
| 目的 | 壓縮 L1 狀態 | Rollup 資料可用性 |
| 驗證 | ZK proof 鏈上驗證 | 由 rollup 自行驗證 |
| 成本節省 | ~95%+ | Blob ~10x cheaper than calldata |
| 層級 | L1 原生 | L1 為 L2 提供 DA |
| 通用性 | 任何帳戶 | Blob 專為 rollup 設計 |

## 程式碼範例

```typescript
import { Connection, PublicKey, Keypair } from "@solana/web3.js";

// ZK Compression 使用 Light Protocol SDK
// 以下展示概念性的壓縮帳戶操作

// 概念: 建立 compressed token mint
async function createCompressedMint(
  connection: Connection,
  payer: Keypair,
  decimals: number
) {
  // Light Protocol 提供高階 API
  // 實際使用需安裝 @lightprotocol/stateless.js
  // 和 @lightprotocol/compressed-token

  // 概念流程:
  // 1. 建立 State Merkle Tree (如果尚未建立)
  // 2. 呼叫 Light Protocol 的 createMint
  // 3. mint 資料儲存為 compressed account

  const mint = Keypair.generate();
  return {
    mint: mint.publicKey.toBase58(),
    decimals,
    type: "compressed",
  };
}

// 概念: 壓縮 token 轉帳
async function compressedTransfer(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  sender: PublicKey,
  recipient: PublicKey,
  amount: bigint
) {
  // 流程:
  // 1. 從 indexer 取得 sender 的 compressed token account + proof
  // 2. 建構轉帳: 舊 balance - amount = 新 sender balance
  //              recipient 新 balance = 舊 balance + amount
  // 3. 生成 ZK proof 證明:
  //    - sender account 存在於 Merkle tree
  //    - sender 有足夠 balance
  //    - 新 balances 計算正確
  // 4. 提交交易: ZK proof + 新 leaves
  // 5. 鏈上: 驗證 proof, 更新 root, 記錄 nullifiers

  return {
    mint: mint.toBase58(),
    from: sender.toBase58(),
    to: recipient.toBase58(),
    amount: amount.toString(),
    type: "compressed-transfer",
  };
}

// 查詢壓縮帳戶（透過 RPC indexer）
async function getCompressedAccounts(
  rpcUrl: string,
  owner: PublicKey
) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "get-compressed-accounts",
      method: "getCompressedAccountsByOwner",
      params: {
        owner: owner.toBase58(),
      },
    }),
  });

  const result = await response.json();
  return result.result;
}

// 查詢壓縮 token 餘額
async function getCompressedTokenBalances(
  rpcUrl: string,
  owner: PublicKey,
  mint: PublicKey
) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "get-compressed-balance",
      method: "getCompressedTokenBalancesByOwner",
      params: {
        owner: owner.toBase58(),
        mint: mint.toBase58(),
      },
    }),
  });

  const result = await response.json();
  return result.result;
}
```

```rust
// 概念範例: 使用 ZK compressed accounts 的程式
use anchor_lang::prelude::*;

declare_id!("ZKComp1111111111111111111111111111111111111");

#[program]
pub mod zk_compression_demo {
    use super::*;

    // 概念: 與 compressed account 互動
    // 實際實作需要 Light Protocol 的 SDK
    pub fn process_compressed_data(
        ctx: Context<ProcessCompressed>,
        proof: Vec<u8>,          // ZK proof bytes
        new_data: Vec<u8>,       // 新狀態資料
        old_leaf: [u8; 32],      // 舊 leaf hash
        new_leaf: [u8; 32],      // 新 leaf hash
    ) -> Result<()> {
        // 驗證流程:
        // 1. 驗證 ZK proof（透過 CPI 到 Light Protocol）
        // 2. 確認 old_leaf 在 Merkle tree 中
        // 3. 確認 new_leaf 由合法操作產生
        // 4. 更新 Merkle root
        // 5. 記錄 nullifier (防止舊 leaf 被重複使用)

        msg!("Processing compressed state transition");
        msg!("Old leaf: {:?}", &old_leaf[..8]);
        msg!("New leaf: {:?}", &new_leaf[..8]);
        msg!("Proof size: {} bytes", proof.len());
        msg!("New data size: {} bytes", new_data.len());

        Ok(())
    }
}

#[derive(Accounts)]
pub struct ProcessCompressed<'info> {
    /// CHECK: Merkle tree account managed by Light Protocol
    #[account(mut)]
    pub merkle_tree: UncheckedAccount<'info>,
    pub authority: Signer<'info>,
    /// CHECK: Light Protocol program
    pub light_program: UncheckedAccount<'info>,
}
```

## 相關概念

- [State Compression](/solana/advanced/state-compression/) - 基礎壓縮技術，ZK Compression 的前身
- [Merkle Tree](/fundamentals/data-structures/merkle-tree/) - 底層資料結構
- [zkSNARKs (ETH)](/ethereum/advanced/zksnarks/) - 相關的零知識證明技術
- [Rent](/solana/account-model/rent/) - ZK Compression 大幅降低 rent 成本
- [Account Model](/solana/account-model/account-model-overview/) - Compressed accounts 與傳統帳戶的關係
- [Token Accounts](/solana/account-model/token-accounts/) - Light Token 壓縮版的 token 帳戶
- [Network Economics](/solana/advanced/network-economics/) - 壓縮對經濟模型的影響
- [Solana vs Ethereum](/solana/advanced/solana-vs-ethereum/) - 與 Ethereum DA 方案的比較
