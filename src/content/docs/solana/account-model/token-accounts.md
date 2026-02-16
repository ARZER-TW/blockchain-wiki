---
title: "Token Accounts"
description: "SPL Token Program accounts - mint accounts, token accounts, and ATAs"
tags: [solana, account-model, SPL-token, token-account, ATA, mint]
---

# Token Accounts

## 概述

Solana 的 token 系統由 SPL Token Program 管理，與 Ethereum 的 [ERC-20](/ethereum/data-structures/storage-trie/) 截然不同。在 Ethereum 上，每個 ERC-20 token 是一個獨立的合約，在自身 storage 中維護 `mapping(address => uint256)` 的餘額表。Solana 則使用**單一 Token Program** 搭配**多個帳戶**的模式——每個 token 餘額都是一個獨立的帳戶。Mint 帳戶定義 token 的屬性，Token 帳戶持有具體的餘額，而 ATA（Associated Token Account）提供確定性的地址映射。

## 核心原理

### 三層帳戶結構

```
Token Program (SPL Token / Token-2022)
├── Mint Account (定義 token 屬性)
│   ├── Token Account A (Alice 的 USDC)
│   ├── Token Account B (Bob 的 USDC)
│   └── Token Account C (Vault PDA 的 USDC)
├── Mint Account (另一個 token)
│   └── ...
```

### Mint Account

Mint Account 定義一種 token 的全域屬性：

| 欄位 | 大小 | 說明 |
|------|------|------|
| `mint_authority` | 36 bytes | 可鑄造新 token 的帳戶（COption\<Pubkey\>） |
| `supply` | 8 bytes | 當前總供應量 |
| `decimals` | 1 byte | 小數位數（如 USDC = 6, SOL wrapped = 9） |
| `is_initialized` | 1 byte | 是否已初始化 |
| `freeze_authority` | 36 bytes | 可凍結 token 帳戶的帳戶（COption\<Pubkey\>） |

總大小：82 bytes。Mint 帳戶的 owner 是 Token Program。

Mint 地址即為 token 的唯一識別——等同於 Ethereum 上的 token contract address。

### Token Account

Token Account 持有特定使用者的特定 token 餘額：

| 欄位 | 大小 | 說明 |
|------|------|------|
| `mint` | 32 bytes | 對應的 Mint 地址 |
| `owner` | 32 bytes | 此 token 帳戶的擁有者（錢包地址） |
| `amount` | 8 bytes | 餘額（最小單位） |
| `delegate` | 36 bytes | 委託帳戶（COption\<Pubkey\>） |
| `state` | 1 byte | 帳戶狀態（Initialized/Frozen） |
| `is_native` | 12 bytes | 是否為 wrapped SOL（COption\<u64\>） |
| `delegated_amount` | 8 bytes | 委託額度 |
| `close_authority` | 36 bytes | 可關閉此帳戶的地址（COption\<Pubkey\>） |

總大小：165 bytes。Token Account 的 `owner` 欄位（program owner）是 Token Program，而 `owner` 資料欄位指向控制此帳戶的錢包。

注意 owner 的兩層含義：
- **Account owner**（帳戶層）= Token Program（控制 data 修改權）
- **Token owner**（資料層）= 使用者錢包（控制 token 操作權）

### Associated Token Account (ATA)

ATA 是一個確定性的 [PDA](/solana/account-model/pda/)，為每個 (wallet, mint) 組合提供唯一的 token 帳戶地址：

$$\text{ATA} = \text{findProgramAddress}([\text{wallet}, \text{TOKEN\_PROGRAM\_ID}, \text{mint}], \text{ATA\_PROGRAM\_ID})$$

ATA 的優勢：
- **確定性**：給定錢包和 mint，任何人都能算出 ATA 地址
- **無需查詢**：直接計算目標帳戶，不需要鏈上查詢
- **自動建立**：ATA Program 的 `create` 指令自動建立（如果不存在）
- **標準化**：錢包、DEX、橋都使用 ATA 作為預設

### Token 操作

SPL Token Program 提供的核心指令：

| 指令 | 說明 |
|------|------|
| `InitializeMint` | 初始化 Mint Account |
| `InitializeAccount` | 初始化 Token Account |
| `Transfer` | Token 轉帳（需要 owner 簽名） |
| `Approve` | 授權 delegate 操作一定額度 |
| `Revoke` | 撤銷 delegate 授權 |
| `MintTo` | 鑄造新 token（需要 mint_authority） |
| `Burn` | 銷毀 token |
| `CloseAccount` | 關閉 token 帳戶，回收 rent |
| `FreezeAccount` | 凍結帳戶（需要 freeze_authority） |
| `ThawAccount` | 解凍帳戶 |

### Token-2022 擴展

Token-2022（Token Extensions Program）是 SPL Token 的下一代，支援透過 extensions 為 token 添加功能：

| Extension | 功能 |
|-----------|------|
| Transfer Fee | 每筆轉帳自動收取手續費 |
| Confidential Transfer | 隱藏轉帳金額（使用零知識證明） |
| Transfer Hook | 轉帳時自動呼叫自訂程式 |
| Permanent Delegate | 永久委託權限（用於合規凍結/沒收） |
| Non-transferable | 靈魂綁定 token（Soulbound） |
| Interest-bearing | 自動計算利息的顯示金額 |
| Default Account State | 新建帳戶的預設狀態（如預設凍結） |
| Metadata | 鏈上 metadata（無需 Metaplex） |

### 與 ERC-20 的比較

| 面向 | Solana SPL Token | Ethereum ERC-20 |
|------|-----------------|----------------|
| 合約數量 | 單一 Token Program | 每個 token 一個合約 |
| 餘額儲存 | 獨立帳戶 | 合約 storage mapping |
| 帳戶建立 | 需要預先建立 + rent | 自動（mapping 預設 0） |
| 標準化 | 強制（單一程式） | 約定俗成（interface） |
| 升級 | Token-2022 extensions | 各合約自行設計 |
| 列舉 | 可直接查詢所有 token 帳戶 | 需要 event indexing |

Solana 的模式使得餘額查詢更直接（`getProgramAccounts` 直接列舉），但帳戶建立需要額外的 rent 成本。

## 程式碼範例

### TypeScript（@solana/web3.js + @solana/spl-token）

```typescript
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  transfer,
  getAccount,
  getMint,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';

const connection = new Connection('https://api.mainnet-beta.solana.com');

// === 建立 Mint ===
async function createToken(payer: Keypair, decimals: number) {
  const mint = await createMint(
    connection,
    payer,
    payer.publicKey,   // mint authority
    payer.publicKey,   // freeze authority
    decimals,
  );
  console.log('Mint:', mint.toBase58());
  return mint;
}

// === 取得或建立 ATA ===
async function getOrCreateATA(
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
) {
  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    owner,
  );
  console.log('ATA:', ata.address.toBase58());
  console.log('Balance:', ata.amount.toString());
  return ata;
}

// === 鑄造 Token ===
async function mintTokens(
  payer: Keypair,
  mint: PublicKey,
  destination: PublicKey,
  amount: number,
) {
  const sig = await mintTo(
    connection,
    payer,
    mint,
    destination,
    payer,  // mint authority
    amount,
  );
  console.log('Minted:', sig);
}

// === 轉帳 ===
async function transferTokens(
  payer: Keypair,
  source: PublicKey,
  destination: PublicKey,
  owner: Keypair,
  amount: number,
) {
  const sig = await transfer(
    connection,
    payer,
    source,
    destination,
    owner,
    amount,
  );
  console.log('Transferred:', sig);
}

// === 查詢 Mint 資訊 ===
async function inspectMint(mint: PublicKey) {
  const info = await getMint(connection, mint);
  console.log('Supply:', info.supply.toString());
  console.log('Decimals:', info.decimals);
  console.log('Mint authority:', info.mintAuthority?.toBase58());
  console.log('Freeze authority:', info.freezeAuthority?.toBase58());
}
```

### Rust / Anchor

```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer, MintTo};
use anchor_spl::associated_token::AssociatedToken;

#[program]
pub mod token_vault {
    use super::*;

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token.to_account_info(),
                    to: ctx.accounts.vault_token.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        let mint_key = ctx.accounts.mint.key();
        let seeds = &[
            b"vault",
            mint_key.as_ref(),
            &[ctx.accounts.vault.bump],
        ];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_token.to_account_info(),
                    to: ctx.accounts.user_token.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        seeds = [b"vault", mint.key().as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, VaultState>,
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user,
    )]
    pub user_token: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault,
    )]
    pub vault_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

// Withdraw accounts similar, with PDA signer seeds

#[account]
#[derive(InitSpace)]
pub struct VaultState {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub bump: u8,
}
```

## 相關概念

- [PDA](/solana/account-model/pda/) - ATA 是 PDA 的典型應用
- [Programs](/solana/account-model/programs/) - SPL Token Program 的架構
- [Account Model](/solana/account-model/account-model-overview/) - Token 帳戶在帳戶模型中的定位
- [Rent](/solana/account-model/rent/) - Token 帳戶需要 rent-exempt 餘額
- [Account Data Serialization](/solana/account-model/account-data-serialization/) - Token 帳戶的資料格式
- [Token Extensions](/solana/advanced/token-extensions/) - Token-2022 的擴展功能
- [System Program](/solana/account-model/system-program/) - Token 帳戶建立的基礎
- [Address Derivation](/solana/account-model/address-derivation-solana/) - ATA 地址推導
- [Storage Trie (Ethereum)](/ethereum/data-structures/storage-trie/) - Ethereum 的 token 餘額儲存方式（mapping in storage）
- [CPI](/solana/runtime/cpi/) - 程式與 Token Program 的互動
