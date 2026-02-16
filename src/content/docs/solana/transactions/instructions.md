---
title: "Instructions"
description: "Solana Instructions, 指令, program_id, accounts, data, Anchor discriminator"
tags: [solana, transactions, instructions, anchor, cpi]
---

# Instructions

## 概述

Instruction 是 Solana 交易中的最小執行單元。每個 instruction 指定要呼叫的 [Program](/solana/account-model/programs/)（`program_id`）、該 program 需要存取的帳戶列表（每個標註 `is_signer` 和 `is_writable`）、以及傳遞的二進位資料（`data`）。一筆 [Transaction](/solana/transactions/transaction-anatomy/) 可包含多個 instruction，它們按順序執行且具備原子性——任何一個 instruction 失敗會導致整筆交易回滾。

## 核心原理

### Instruction 結構

```
Instruction {
    program_id: Pubkey,           // 要呼叫的 program 地址
    accounts: Vec<AccountMeta>,   // 帳戶列表及其權限
    data: Vec<u8>,                // 傳給 program 的任意資料
}
```

### AccountMeta

每個帳戶附帶兩個布林旗標：

| 旗標 | 說明 |
|------|------|
| `is_signer` | 此帳戶必須簽署交易 |
| `is_writable` | Program 可以修改此帳戶的資料或 lamport 餘額 |

這四種組合形成帳戶的權限矩陣：

| is_signer | is_writable | 用途範例 |
|-----------|-------------|----------|
| true | true | Fee payer、代幣轉出方 |
| true | false | 只讀授權者 |
| false | true | 被寫入的 PDA 帳戶 |
| false | false | Program ID、Sysvar |

Runtime 在執行前驗證所有權限——如果帳戶標為 `is_signer` 但交易中沒有對應簽名，交易會立即失敗。

### Instruction Data 格式

`data` 欄位是 program 自定義的二進位資料。不同框架有不同的序列化慣例：

**Native Program**：自定義 byte layout，通常第一個 byte 或 u32 表示 instruction variant。

**Anchor Framework**：前 8 bytes 是 discriminator，用於識別要呼叫的函數：

$$\text{discriminator} = \text{SHA-256}(\texttt{"global:function\_name"})[0..8]$$

例如 `initialize` 函數的 discriminator：
```
SHA-256("global:initialize") -> af af 6d 1f 0d 98 9b ed ...
discriminator = [af, af, 6d, 1f, 0d, 98, 9b, ed]
```

其餘 bytes 是 Borsh 序列化的函數參數。

### 多 Instruction 原子性

單筆交易中的多個 instruction 具有以下特性：

1. **按順序執行**：instruction 0 先於 instruction 1
2. **原子性**：任一 instruction 失敗，所有狀態變更回滾
3. **共享帳戶表**：所有 instruction 的帳戶合併到 [Transaction](/solana/transactions/transaction-anatomy/) 的 `account_keys`
4. **CPI 可組合**：instruction 內部可通過 [CPI](/solana/runtime/cpi/) 呼叫其他 program

這讓開發者能在單筆交易中組合多個 DeFi 操作（如 swap + deposit + stake），實現類似 Ethereum 中的 multicall 效果。

### System Program 內建指令

System Program（`11111111111111111111111111111111`）提供最基礎的操作：

| Instruction | 說明 |
|-------------|------|
| `CreateAccount` | 建立新帳戶，分配空間和 owner |
| `Transfer` | 轉移 SOL（lamports） |
| `Assign` | 變更帳戶的 owner program |
| `Allocate` | 為帳戶分配資料空間 |

### Compiled Instruction（鏈上格式）

在序列化後的交易中，instruction 使用索引而非完整的 Pubkey：

```
CompiledInstruction {
    program_id_index: u8,   // 指向 account_keys 的索引
    accounts: Vec<u8>,      // 各帳戶在 account_keys 中的索引
    data: Vec<u8>,          // 原始 instruction data
}
```

這種壓縮方式有效減少交易大小，因為同一個帳戶在多個 instruction 中只需出現一次。

## 程式碼範例

```typescript
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import * as borsh from "borsh";

// --- 1. System Program Transfer ---
const transferIx = SystemProgram.transfer({
  fromPubkey: payer.publicKey,
  toPubkey: recipient,
  lamports: 1_000_000,
});

// --- 2. 自定義 Instruction（Native Program） ---
// 假設 program 接受 [u8 variant, u64 amount] 格式
const data = Buffer.alloc(9);
data.writeUInt8(0, 0);                  // variant: Transfer = 0
data.writeBigUInt64LE(500_000n, 1);     // amount

const customIx = new TransactionInstruction({
  keys: [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: recipient, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  programId: new PublicKey("YourProgramId11111111111111111111"),
  data: data,
});

// --- 3. 多 Instruction 原子交易 ---
const tx = new Transaction();
tx.add(transferIx);      // instruction 0: SOL 轉帳
tx.add(customIx);        // instruction 1: 自定義邏輯
// 兩個 instruction 原子執行
```

```rust
use anchor_lang::prelude::*;

declare_id!("YourProgramId11111111111111111111");

#[program]
pub mod instruction_example {
    use super::*;

    // Anchor 自動生成 discriminator = SHA-256("global:initialize")[0..8]
    pub fn initialize(ctx: Context<Initialize>, value: u64) -> Result<()> {
        let account = &mut ctx.accounts.data_account;
        account.value = value;
        account.authority = ctx.accounts.authority.key();
        Ok(())
    }

    // discriminator = SHA-256("global:update")[0..8]
    pub fn update(ctx: Context<Update>, new_value: u64) -> Result<()> {
        let account = &mut ctx.accounts.data_account;
        require_keys_eq!(
            account.authority,
            ctx.accounts.authority.key(),
            CustomError::Unauthorized
        );
        account.value = new_value;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + DataAccount::INIT_SPACE
    )]
    pub data_account: Account<'info, DataAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Update<'info> {
    #[account(mut)]
    pub data_account: Account<'info, DataAccount>,
    pub authority: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct DataAccount {
    pub value: u64,
    pub authority: Pubkey,
}

#[error_code]
pub enum CustomError {
    #[msg("Unauthorized access")]
    Unauthorized,
}
```

## 相關概念

- [Transaction Anatomy](/solana/transactions/transaction-anatomy/) - Instruction 所屬的交易結構
- [Programs](/solana/account-model/programs/) - 執行 instruction 的鏈上程式
- [CPI (Cross-Program Invocation)](/solana/runtime/cpi/) - Instruction 內部呼叫其他 program
- [Account Data Serialization](/solana/account-model/account-data-serialization/) - Borsh 等序列化格式
- [Transaction Signing](/solana/transactions/signing/) - 簽署包含 instruction 的交易
- [Compute Units](/solana/runtime/compute-units/) - 每個 instruction 的計算資源限制
- [Transaction Fees](/solana/transactions/fees-priority/) - 多 instruction 交易的費用計算
- [Versioned Transactions](/solana/transactions/versioned-transactions/) - 擴展帳戶數量的 v0 格式
- [Transaction Errors](/solana/transactions/transaction-errors/) - Instruction 失敗時的錯誤處理
