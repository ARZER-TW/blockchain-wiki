---
title: "Tower BFT"
description: "Tower BFT, pBFT variant, vote tower, exponential lockout, optimistic confirmation, switch proof"
tags: [solana, consensus, tower-bft, pbft, finality, voting]
---

# Tower BFT

## 概述

Tower BFT 是 Solana 的共識協議，本質上是 practical BFT（pBFT）的變體，利用 [Proof of History（PoH）](/solana/consensus/proof-of-history/) 作為同步時鐘來大幅減少通訊輪次。Validator 維護一個「vote tower」——一個投票堆疊，每一票都有指數增長的 lockout 期。當投票深度達到 32 時，最底層的投票被視為 rooted（finalized）。Optimistic confirmation 在 2/3 以上 stake 投票後約 400ms 達成，而完整的 rooted finality 約需 6.4 秒。

## 核心原理

### Vote Tower 結構

每個 validator 維護一個投票堆疊（最多 32 層）：

```
Vote Tower（由上到下 = 由新到舊）：

  depth 0: vote for slot 1000  (lockout = 2 slots)
  depth 1: vote for slot 998   (lockout = 4 slots)
  depth 2: vote for slot 995   (lockout = 8 slots)
  ...
  depth 31: vote for slot 800  (lockout = 2^32 slots) -> ROOTED
```

### Lockout Doubling

每次 validator 對新 slot 投票，如果新投票與堆疊頂部的投票在同一 fork 上，頂部的投票會被「確認」，其 lockout 翻倍：

$$\text{lockout}(\text{depth } d) = 2^{d+1} \text{ slots}$$

| Depth | Lockout (slots) | 約等時間 |
|-------|-----------------|----------|
| 0 | 2 | 0.8s |
| 1 | 4 | 1.6s |
| 5 | 64 | 25.6s |
| 10 | 2,048 | ~13.6 min |
| 31 | 2^32 (~4.3B) | ~54 年 |

Depth 31 的 lockout 實際上意味著永遠不會過期——這就是 **root**（finality）。

### 投票流程

1. Validator 接收到新 slot 的區塊
2. 驗證 PoH hash chain 和交易
3. 重放交易確認狀態正確
4. 決定投票：
   - 如果新 slot 在當前 fork 上 -> 投票，堆疊頂部投票的 lockout 翻倍
   - 如果需要切換 fork -> 檢查 switch proof

### 單輪投票 vs pBFT 多輪

傳統 pBFT 需要三個階段的通訊（pre-prepare, prepare, commit），每階段需 $O(n^2)$ 訊息。Tower BFT 利用 PoH 將這簡化為單輪：

| 特性 | pBFT | Tower BFT |
|------|------|-----------|
| 通訊輪次 | 3 輪 | 1 輪 |
| 訊息複雜度 | $O(n^2)$ 每輪 | $O(n)$ 投票 |
| 時間同步 | 需額外機制 | PoH 提供 |
| 安全性 | 1/3 容錯 | 1/3 容錯 |

### Optimistic Confirmation

當一個 slot 收到超過 2/3 總 stake 的投票時，達成 **optimistic confirmation**：

$$\frac{\sum_{\text{voters}} \text{stake}_i}{\text{total\_stake}} > \frac{2}{3} \implies \text{optimistically confirmed}$$

特性：
- 延遲約 400ms-1s
- 極高的安全性（需要 > 1/3 stake 的 validator 違規才能回滾）
- 大多數應用以 `confirmed` commitment level 使用此確認等級

### Rooted（Finalized）

當投票深度達到 32 時，最底層的 slot 被 root：

- Root 的投票 lockout 超過 2^32 slots（約 54 年）
- 實際上等同於不可逆
- 對應 `finalized` commitment level
- 從投票到 root 約需 6.4 秒（32 個 slot）

### Switch Proof

Validator 有時需要從一個 fork 切換到另一個。Switch proof 機制確保這是安全的：

1. Validator 必須證明當前 fork 已經無法達到 finality（< 1/3 stake 繼續投票）
2. 收集足夠的證據（其他 validator 已切換的投票）
3. 只有在安全的情況下才允許 fork switch
4. 防止惡意 validator 頻繁切換 fork 來造成混亂

### Fork Choice Rule

Tower BFT 的 fork choice 基於 stake-weighted 投票：

```
fork_weight(slot) = sum of stake voting for slot and its descendants
```

Validator 選擇權重最大的 fork 繼續建設，除非被 lockout 限制在當前 fork。

## 程式碼範例

```typescript
import { Connection } from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");

// --- 1. 查詢不同 commitment level ---
// Processed: 單一 validator 確認
const processedSlot = await connection.getSlot("processed");

// Confirmed: 2/3+ stake optimistic confirmation
const confirmedSlot = await connection.getSlot("confirmed");

// Finalized: 32-depth rooted
const finalizedSlot = await connection.getSlot("finalized");

// slot 差距反映 finality 延遲
// confirmedSlot - finalizedSlot 通常約 16-32 slots

// --- 2. 查詢 vote accounts ---
const voteAccounts = await connection.getVoteAccounts();

// 活躍 validator 的投票資訊
for (const validator of voteAccounts.current.slice(0, 3)) {
  // validator.votePubkey: 投票帳戶地址
  // validator.activatedStake: 委託的 stake 量
  // validator.lastVote: 最後投票的 slot
  // validator.rootSlot: 此 validator 認為的 root slot
  // validator.commission: 佣金比率
}

// --- 3. 監聽 root 變化 ---
const rootSubscriptionId = connection.onRootChange((root) => {
  // root: 最新的 finalized slot number
  // 每當有新 slot 被 root，此 callback 觸發
});

// --- 4. 等待特定 commitment level ---
async function waitForFinality(signature: string): Promise<void> {
  const latestBlockhash = await connection.getLatestBlockhash("finalized");
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    "finalized"
  );
}
```

```rust
// Anchor: 在 program 中利用 Clock sysvar 讀取 slot 資訊
use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod tower_example {
    use super::*;

    pub fn check_slot_info(ctx: Context<CheckSlot>) -> Result<()> {
        let clock = Clock::get()?;

        msg!("Current slot: {}", clock.slot);
        msg!("Current epoch: {}", clock.epoch);
        msg!("Unix timestamp: {}", clock.unix_timestamp);

        // 在 program 中無法直接存取 vote tower
        // 但可以利用 slot 資訊做時間相關的邏輯
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CheckSlot {}
```

## 相關概念

- [Proof of History](/solana/consensus/proof-of-history/) - Tower BFT 依賴的同步時鐘
- [Leader Schedule](/solana/consensus/leader-schedule/) - 決定哪個 validator 在哪個 slot 出塊
- [Alpenglow](/solana/consensus/alpenglow/) - 取代 Tower BFT 的下一代共識協議
- [Validators and Staking](/solana/consensus/validators-staking/) - 投票的主體和 stake 機制
- [Slots, Blocks, and Epochs](/solana/consensus/clock-and-slots/) - Tower BFT 運作的時間框架
- [Turbine](/solana/consensus/turbine/) - 投票和區塊的傳播機制
- [Gulf Stream](/solana/consensus/gulf-stream/) - 利用共識資訊的交易轉發
- [Solana Transaction Lifecycle](/solana/transactions/transaction-lifecycle-solana/) - Tower BFT 在交易確認中的角色
- [Casper FFG (ETH)](/ethereum/consensus/casper-ffg/) - Ethereum 的 finality 機制比較
