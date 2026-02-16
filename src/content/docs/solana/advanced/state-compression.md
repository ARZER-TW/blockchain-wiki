---
title: "State Compression"
description: "State Compression, Concurrent Merkle Tree, cNFT, Bubblegum, DAS API, compressed NFT"
tags: [solana, advanced, state-compression, cnft, merkle-tree, bubblegum]
---

# State Compression

## 概述

State Compression 是 Solana 的鏈上資料壓縮技術：將資料的 Merkle root 存在鏈上，實際葉子資料存在鏈下。透過 Concurrent Merkle Trees 支援多方同時更新，避免傳統 Merkle tree 的序列化瓶頸。最成功的應用是 compressed NFTs（cNFTs），鑄造成本比傳統 NFTs 低 1000 倍以上。Bubblegum 程式處理 cNFT 的鑄造、轉帳和銷毀，DAS API 提供鏈下資料的查詢介面。

## 核心原理

### 壓縮原理

```
傳統方式:
  每個 NFT = 1 個鏈上帳戶 (~0.002 SOL rent)
  10,000 NFTs = 10,000 帳戶 (~20 SOL)

State Compression:
  鏈上: 1 個 Merkle tree 帳戶 (root + metadata)
  鏈下: 10,000 筆葉子資料 (indexer 儲存)
  成本: ~0.5 SOL (Merkle tree 帳戶 rent)

節省: ~97% 成本
```

### Concurrent Merkle Tree

傳統 Merkle tree 的問題：更新一個葉子需要整條路徑的 hash，如果兩人同時更新不同葉子，其中一人的 proof 會因 root 改變而失效。

Concurrent Merkle Tree 解法：

```
維護一個 changelog buffer:
  - 儲存最近 N 次更新的路徑
  - 新的更新可以參照 changelog 調整 proof
  - 不需要等前一筆更新完成

Changelog 結構:
  buffer[0]: {root, path: [h1, h2, h3, ...], leaf_index}
  buffer[1]: {root, path: [h1, h2, h3, ...], leaf_index}
  ...
  buffer[N]: 最多 N 筆並發更新
```

### Tree 參數

| 參數 | 說明 | 影響 |
|------|------|------|
| maxDepth | 樹的最大深度 | 決定最大葉子數（2^depth） |
| maxBufferSize | Changelog buffer 大小 | 決定並發更新數 |
| canopyDepth | 鏈上快取的層數 | 減少 proof 大小 |

常見配置：

| 配置 | maxDepth | maxBuffer | 最大葉子數 | 成本 |
|------|----------|-----------|-----------|------|
| 小型 | 14 | 64 | 16,384 | ~0.1 SOL |
| 中型 | 20 | 256 | 1,048,576 | ~1.5 SOL |
| 大型 | 30 | 1024 | 1,073,741,824 | ~50+ SOL |

### cNFT（Compressed NFTs）

```
鑄造 cNFT:
  1. 建立 Merkle tree 帳戶（一次性）
  2. 呼叫 Bubblegum program 的 mint_v1
  3. Bubblegum 計算 leaf hash 並插入 tree
  4. Noop program 發出 changelog event
  5. Indexer 監聽 event 並儲存葉子資料

轉帳 cNFT:
  1. 從 indexer 取得當前 proof（Merkle path）
  2. 呼叫 Bubblegum program 的 transfer
  3. Bubblegum 驗證 proof + 更新 leaf
  4. Indexer 更新鏈下狀態
```

### 成本比較

| 操作 | 傳統 NFT | cNFT |
|------|----------|------|
| 鑄造 1 個 | ~0.012 SOL | ~0.000005 SOL |
| 鑄造 10,000 個 | ~120 SOL | ~0.05 SOL + tree rent |
| 鑄造 1,000,000 個 | ~12,000 SOL | ~1.5 SOL + tree rent |
| 轉帳 | ~0.000005 SOL | ~0.000005 SOL |

### Bubblegum Program

SPL Account Compression 上層的 NFT 標準：

| Instruction | 功能 |
|-------------|------|
| create_tree | 建立 Merkle tree 並初始化 |
| mint_v1 | 鑄造新 cNFT |
| transfer | 轉移 cNFT 所有權 |
| burn | 銷毀 cNFT |
| delegate | 委託操作權限 |
| redeem | 解壓縮為傳統 NFT |
| decompress_v1 | 完全解壓縮 |
| verify_creator / verify_collection | 驗證創作者/系列 |

### DAS API（Digital Asset Standard）

由 indexer 提供的 API，用於查詢壓縮資產：

```
核心端點:
  getAsset(id)                -> 單一資產詳情
  getAssetsByOwner(owner)     -> 擁有者的所有資產
  getAssetsByGroup(group)     -> 系列內的所有資產
  getAssetProof(id)           -> 資產的 Merkle proof
  searchAssets(query)         -> 搜尋資產
```

DAS 提供者：Helius、Triton、Shyft 等 RPC 節點。

### Trade-offs

| 優勢 | 劣勢 |
|------|------|
| 成本低 1000x | 需要鏈下 indexer |
| 高吞吐鑄造 | 組合性受限（不能直接在 program 中讀取） |
| 適合大規模空投 | Proof 大小隨 tree depth 增加 |
| Tree 可擴展 | Indexer 故障時資料暫時不可用 |

## 程式碼範例

```typescript
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  createAllocTreeIx,
  ValidDepthSizePair,
  getConcurrentMerkleTreeAccountSize,
} from "@solana/spl-account-compression";

const connection = new Connection("https://api.mainnet-beta.solana.com");

// 計算 Merkle tree 帳戶的成本
async function calculateTreeCost(
  maxDepth: number,
  maxBufferSize: number,
  canopyDepth: number
): Promise<{ space: number; costSOL: number }> {
  const space = getConcurrentMerkleTreeAccountSize(
    maxDepth,
    maxBufferSize,
    canopyDepth
  );

  const rentExempt = await connection.getMinimumBalanceForRentExemption(space);

  return {
    space,
    costSOL: rentExempt / 1e9,
  };
}

// 建立 Merkle tree
async function createMerkleTree(
  connection: Connection,
  payer: Keypair,
  maxDepth: number,
  maxBufferSize: number,
  canopyDepth: number
): Promise<PublicKey> {
  const merkleTree = Keypair.generate();
  const depthSizePair: ValidDepthSizePair = {
    maxDepth,
    maxBufferSize,
  };

  const space = getConcurrentMerkleTreeAccountSize(
    maxDepth,
    maxBufferSize,
    canopyDepth
  );
  const rentExempt = await connection.getMinimumBalanceForRentExemption(space);

  const allocTreeIx = await createAllocTreeIx(
    connection,
    merkleTree.publicKey,
    payer.publicKey,
    depthSizePair,
    canopyDepth
  );

  const tx = new Transaction().add(allocTreeIx);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = payer.publicKey;

  await sendAndConfirmTransaction(connection, tx, [payer, merkleTree]);

  return merkleTree.publicKey;
}

// 使用 DAS API 查詢 cNFT
async function getCompressedNFTs(
  dasUrl: string,
  ownerAddress: string,
  page: number = 1,
  limit: number = 100
) {
  const response = await fetch(dasUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "query-cnfts",
      method: "getAssetsByOwner",
      params: {
        ownerAddress,
        page,
        limit,
        displayOptions: {
          showCollectionMetadata: true,
        },
      },
    }),
  });

  const result = await response.json();
  return result.result;
}

// 取得 cNFT 的 Merkle proof（用於轉帳）
async function getAssetProof(dasUrl: string, assetId: string) {
  const response = await fetch(dasUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "get-proof",
      method: "getAssetProof",
      params: { id: assetId },
    }),
  });

  const result = await response.json();
  return result.result;
}
```

```rust
// Anchor: 與 compressed state 互動的程式
use anchor_lang::prelude::*;

declare_id!("CompDemo111111111111111111111111111111111111");

#[program]
pub mod compression_demo {
    use super::*;

    // 驗證 compressed state 的 Merkle proof
    pub fn verify_compressed_data(
        ctx: Context<VerifyData>,
        root: [u8; 32],
        leaf: [u8; 32],
        proof: Vec<[u8; 32]>,
        index: u32,
    ) -> Result<()> {
        // 手動驗證 Merkle proof
        let mut computed_hash = leaf;
        let mut current_index = index;

        for sibling in proof.iter() {
            if current_index % 2 == 0 {
                // 當前節點在左邊
                computed_hash = anchor_lang::solana_program::hash::hashv(&[
                    &computed_hash,
                    sibling,
                ])
                .to_bytes();
            } else {
                // 當前節點在右邊
                computed_hash = anchor_lang::solana_program::hash::hashv(&[
                    sibling,
                    &computed_hash,
                ])
                .to_bytes();
            }
            current_index /= 2;
        }

        require!(
            computed_hash == root,
            ErrorCode::InvalidProof
        );

        msg!("Merkle proof verified for leaf at index {}", index);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct VerifyData<'info> {
    /// CHECK: Merkle tree account
    pub merkle_tree: UncheckedAccount<'info>,
    pub authority: Signer<'info>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid Merkle proof")]
    InvalidProof,
}
```

## 相關概念

- [ZK Compression](/solana/advanced/zk-compression/) - 使用零知識證明的進階壓縮技術
- [Merkle Tree](/fundamentals/data-structures/merkle-tree/) - 底層資料結構
- [Account Model](/solana/account-model/account-model-overview/) - 壓縮如何減少帳戶數量
- [Rent](/solana/account-model/rent/) - 壓縮減少的 rent 成本
- [Solana Program Library](/solana/advanced/solana-program-library/) - SPL Account Compression 程式
- [Token Extensions](/solana/advanced/token-extensions/) - 另一種擴展代幣功能的方式
- [Native Programs](/solana/runtime/native-programs/) - Noop Program 在壓縮中的角色
- [Programs](/solana/account-model/programs/) - Bubblegum 等壓縮相關程式
