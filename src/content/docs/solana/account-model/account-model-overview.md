---
title: "Solana Account Model"
description: "Solana's account-based data model where everything is an account"
tags: [solana, account-model, architecture, state]
---

# Solana Account Model

## 概述

Solana 的帳戶模型是其架構的基礎——**一切皆帳戶（everything is an account）**。程式（smart contracts）、使用者錢包、token 餘額、NFT metadata、程式配置……所有鏈上資料都以帳戶的形式存在。與 Ethereum 將程式碼和狀態綁定在同一個 [合約帳戶](/ethereum/accounts/contract-account/) 中不同，Solana 採用**程式與資料分離**的架構：[程式](/solana/account-model/programs/) 是無狀態的可執行帳戶，狀態儲存在獨立的資料帳戶中。

## 核心原理

### 帳戶結構

每個 Solana 帳戶包含以下欄位：

| 欄位 | 大小 | 說明 |
|------|------|------|
| `lamports` | 8 bytes | SOL 餘額（1 SOL = $10^9$ lamports） |
| `data` | 可變 | 任意二進位資料（帳戶建立時指定大小） |
| `owner` | 32 bytes | 擁有此帳戶的程式 ID |
| `executable` | 1 byte | 是否為可執行程式 |
| `rent_epoch` | 8 bytes | 下次收取 [租金](/solana/account-model/rent/) 的 epoch |

帳戶的 `data` 欄位大小在建立時由 [System Program](/solana/account-model/system-program/) 的 `allocate` 指定，後續只能透過 `realloc` 有限調整（每次最多增加 10 KB）。

### Owner 模型

Solana 的安全模型建立在 ownership 規則上：

1. **只有 owner 程式可以修改帳戶的 `data` 欄位**
2. **只有 owner 程式可以扣減帳戶的 `lamports`**（任何人可以增加）
3. **只有 System Program 可以指派新的 owner**
4. **只有 BPF Loader 可以修改 `executable` 欄位**

新建帳戶的 owner 預設是 [System Program](/solana/account-model/system-program/)（`11111111111111111111111111111111`）。透過 `Assign` 或 `CreateAccount` 指令可以將 ownership 轉移給其他程式。

```
User Wallet (owned by System Program)
  |
  |-- Token Account (owned by Token Program)
  |-- Game State (owned by Game Program)
  |-- Config PDA (owned by Config Program)
```

### 帳戶類型

雖然底層結構相同，帳戶可依用途分類：

| 類型 | `executable` | `data` | Owner |
|------|-------------|--------|-------|
| 錢包帳戶 | false | 空 | System Program |
| 程式帳戶 | true | BPF bytecode | BPF Loader |
| 資料帳戶 | false | 序列化資料 | 擁有的程式 |
| [PDA](/solana/account-model/pda/) | false | 序列化資料 | 擁有的程式 |
| [Token 帳戶](/solana/account-model/token-accounts/) | false | mint/amount/owner | Token Program |
| Mint 帳戶 | false | supply/decimals | Token Program |

### 帳戶大小限制

| 項目 | 限制 |
|------|------|
| 最大帳戶大小 | 10 MB |
| 最大 realloc 增量 | 10 KB/次 |
| PDA 最大 seeds 數 | 16 個 |
| PDA 單一 seed 最大 | 32 bytes |

### 程式與資料分離

這是 Solana 與 Ethereum 最根本的架構差異：

**Ethereum 模型**：
```
Contract Account
├── code (bytecode)
├── storage (state)
└── balance (ETH)
```

**Solana 模型**：
```
Program Account (executable=true, no mutable state)
│
Data Account A (executable=false, state for user A)
Data Account B (executable=false, state for user B)
Data Account C (executable=false, shared config)
```

這種分離帶來的優勢：

1. **平行執行**：不同使用者的資料帳戶互不衝突，[Sealevel](/solana/runtime/svm-sealevel/) 可以平行執行
2. **程式複用**：一個程式服務所有使用者，無需部署多個合約
3. **明確的存取聲明**：交易必須預先列出所有讀寫的帳戶，runtime 據此排程

### 帳戶生命週期

1. **建立**：透過 System Program 的 `CreateAccount` — 指定大小、owner、lamports
2. **初始化**：owner 程式寫入初始資料（如 Anchor 的 discriminator）
3. **使用**：owner 程式讀寫 `data`，其他程式唯讀
4. **關閉**：owner 程式將 lamports 轉出，帳戶在 slot 結束時被回收

### 與 Ethereum Account Model 的比較

| 面向 | Solana | Ethereum |
|------|--------|----------|
| 帳戶類型 | 統一結構 | [EOA](/ethereum/accounts/eoa/) vs [Contract](/ethereum/accounts/contract-account/) |
| 狀態位置 | 獨立帳戶 | 合約內 [Storage Trie](/ethereum/data-structures/storage-trie/) |
| 地址格式 | 32-byte Ed25519 pubkey | 20-byte Keccak-256 hash |
| 狀態存取 | 交易預先聲明 | EVM runtime 動態存取 |
| 存儲成本 | [Rent exemption](/solana/account-model/rent/)（一次性） | 持續 gas 消耗 |
| 平行化 | 帳戶級別 | 困難（共享 state trie） |

## 程式碼範例

### TypeScript（@solana/web3.js）

```typescript
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');

// 查詢帳戶資訊
async function inspectAccount(pubkey: PublicKey) {
  const info = await connection.getAccountInfo(pubkey);
  if (!info) {
    console.log('Account does not exist');
    return;
  }
  console.log('Lamports:', info.lamports);
  console.log('Owner:', info.owner.toBase58());
  console.log('Executable:', info.executable);
  console.log('Data length:', info.data.length, 'bytes');
  console.log('Rent epoch:', info.rentEpoch);
}

// 建立新帳戶（分配空間、指派 owner）
async function createDataAccount(
  payer: Keypair,
  newAccount: Keypair,
  space: number,
  programId: PublicKey,
) {
  const lamports = await connection.getMinimumBalanceForRentExemption(space);

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: newAccount.publicKey,
      lamports,
      space,
      programId,
    })
  );

  await sendAndConfirmTransaction(connection, tx, [payer, newAccount]);
  console.log('Created account:', newAccount.publicKey.toBase58());
  console.log('Space:', space, 'bytes');
  console.log('Rent-exempt lamports:', lamports);
}
```

### Rust / Anchor

```rust
use anchor_lang::prelude::*;

declare_id!("MyProg111111111111111111111111111111111111");

#[program]
pub mod my_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, data: u64) -> Result<()> {
        let account = &mut ctx.accounts.my_account;
        account.authority = ctx.accounts.authority.key();
        account.data = data;
        account.bump = ctx.bumps.my_account;
        Ok(())
    }

    pub fn update(ctx: Context<Update>, new_data: u64) -> Result<()> {
        let account = &mut ctx.accounts.my_account;
        account.data = new_data;
        Ok(())
    }

    pub fn close(_ctx: Context<Close>) -> Result<()> {
        // Anchor 的 close constraint 自動將 lamports 轉給 receiver
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + MyAccount::INIT_SPACE, // 8 = Anchor discriminator
        seeds = [b"my-account", authority.key().as_ref()],
        bump,
    )]
    pub my_account: Account<'info, MyAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Update<'info> {
    #[account(
        mut,
        has_one = authority,
    )]
    pub my_account: Account<'info, MyAccount>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct Close<'info> {
    #[account(
        mut,
        close = receiver,
        has_one = authority,
    )]
    pub my_account: Account<'info, MyAccount>,
    pub authority: Signer<'info>,
    /// CHECK: receives lamports on close
    #[account(mut)]
    pub receiver: AccountInfo<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct MyAccount {
    pub authority: Pubkey,  // 32 bytes
    pub data: u64,          // 8 bytes
    pub bump: u8,           // 1 byte
}
```

## 相關概念

- [System Program](/solana/account-model/system-program/) - 帳戶建立與基礎操作
- [Programs](/solana/account-model/programs/) - 可執行帳戶（Solana 的智能合約）
- [PDA](/solana/account-model/pda/) - 程式衍生地址（確定性帳戶地址）
- [Token Accounts](/solana/account-model/token-accounts/) - SPL Token 的帳戶結構
- [Rent](/solana/account-model/rent/) - 帳戶的租金與 rent-exempt 機制
- [Account Data Serialization](/solana/account-model/account-data-serialization/) - Borsh 序列化與 Anchor discriminator
- [Address Derivation](/solana/account-model/address-derivation-solana/) - Solana 地址的推導方式
- [SVM/Sealevel](/solana/runtime/svm-sealevel/) - 帳戶模型如何支撐平行執行
- [EOA (Ethereum)](/ethereum/accounts/eoa/) - Ethereum 的外部帳戶對比
- [Contract Account (Ethereum)](/ethereum/accounts/contract-account/) - Ethereum 的合約帳戶對比
- [Storage Trie (Ethereum)](/ethereum/data-structures/storage-trie/) - Ethereum 的狀態儲存方式
