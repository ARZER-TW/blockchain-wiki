---
title: "Solana Program Library (SPL)"
description: "SPL, Solana Program Library, Token Program, Associated Token Account, Stake Pool, Governance"
tags: [solana, advanced, spl, token-program, governance, stake-pool, name-service]
---

# Solana Program Library (SPL)

## 概述

Solana Program Library（SPL）是 Solana 官方維護的鏈上程式集合，提供代幣管理、DeFi 基元、治理和身份等核心功能。最重要的是 Token Program（fungible token 標準）和 Associated Token Account Program（確定性帳戶派生）。此外還包括 Token Swap（AMM 模式）、Stake Pool（流動性質押）、Governance（鏈上 DAO）、Name Service（.sol 域名）和 Memo Program 等。SPL 程式構成了 Solana 生態系統的基礎。

## 核心原理

### SPL 程式列表

| 程式 | 功能 | 地位 |
|------|------|------|
| Token Program | Fungible token 標準 | 核心 |
| Token-2022 | 進階代幣功能 | 核心 |
| Associated Token Account | 確定性 token account | 核心 |
| Token Swap | AMM DEX 基元 | DeFi |
| Stake Pool | 流動性質押 | DeFi |
| Governance | 鏈上 DAO 治理 | 治理 |
| Name Service | .sol 域名 | 身份 |
| Memo Program | 交易附註 | 工具 |
| Account Compression | State Compression 基礎 | 儲存 |
| Feature Proposal | 功能提案投票 | 治理 |

### Token Program

Solana 的 fungible token 標準，相當於 Ethereum 的 ERC-20：

```
核心帳戶:
  Mint Account:
    - supply: u64           // 總發行量
    - decimals: u8          // 小數位數
    - mint_authority: Option<Pubkey>  // 鑄造權限
    - freeze_authority: Option<Pubkey> // 凍結權限

  Token Account:
    - mint: Pubkey           // 所屬代幣
    - owner: Pubkey          // 持有者
    - amount: u64            // 餘額
    - delegate: Option<Pubkey>  // 委託者
    - delegated_amount: u64  // 委託金額
    - state: AccountState    // Active/Frozen
    - close_authority: Option<Pubkey>
```

與 Ethereum ERC-20 的差異：
- ERC-20: 餘額存在合約的 `mapping(address => uint256)` 中
- SPL Token: 每個持有者有獨立的 Token Account

### Associated Token Account (ATA)

確定性產生使用者的 token account 地址：

```
ATA 推導:
  seeds = [
    wallet_address,
    TOKEN_PROGRAM_ID,
    mint_address,
  ]
  ATA = findProgramAddress(seeds, ATA_PROGRAM_ID)

優勢:
  - 無需記住 token account 地址
  - 任何人都能計算出正確地址
  - 一個 wallet + 一個 mint = 唯一 ATA
```

### Token Swap（AMM 模式）

SPL Token Swap 的常數乘積 AMM 實作：

```
x * y = k

swap(dx):
  dy = y - k / (x + dx)
  fee = dy * fee_rate
  actual_dy = dy - fee

pool tokens:
  LP deposit -> 鑄造 pool tokens
  LP withdraw -> 燃燒 pool tokens + 取回比例的 reserve
```

實際上，多數 DEX（Raydium、Orca、Jupiter）使用自己的 AMM 程式而非 SPL Token Swap，但概念相同。

### Stake Pool

流動性質押方案：

```
流程:
  1. 使用者存入 SOL 到 stake pool
  2. 收到 pool token（如 mSOL, jitoSOL, bSOL）
  3. Pool 將 SOL 分散質押給多個 validators
  4. 質押獎勵自動複利
  5. 使用者贖回 pool token -> 取回 SOL + 獎勵

帳戶結構:
  Stake Pool Account: 管理邏輯和參數
  Validator List: 委託的 validator 列表
  Reserve Stake: 未委託的 SOL 儲備
  Pool Token Mint: 液態質押代幣
```

主要 Stake Pool 提供者：
- Marinade (mSOL)
- Jito (jitoSOL)
- BlazeStake (bSOL)
- Sanctum (多個 LST)

### Governance Program

鏈上 DAO 治理系統：

```
組成:
  Realm: DAO 的頂層實體
  Governance: 管理特定資源的治理實例
  Proposal: 治理提案
  Vote Record: 投票記錄
  Token Owner Record: 代幣持有者的治理身份

流程:
  1. 建立 Realm (綁定治理代幣)
  2. 持有者存入代幣取得投票權
  3. 任何人建立 Proposal
  4. 投票期 (Voting / Cool-off / Finalizing)
  5. 提案通過 -> 執行指定的 instructions
```

Realms（realms.today）是最大的 Solana DAO 平台，基於 SPL Governance。

### Name Service

.sol 域名系統：

```
Registration:
  "alice.sol" -> 對應到 Pubkey
  支援子域名: "wallet.alice.sol"

解析:
  name -> PDA derivation -> Name Account -> 儲存的資料

結合 SNS SDK 查詢
```

### Memo Program

在交易中附加任意文字資料：

```
使用場景:
  - 交易備註（類似銀行轉帳的備註欄）
  - 合規記錄
  - Token-2022 Required Memo extension
  - 鏈上訊息

限制:
  - UTF-8 文字
  - 受交易大小限制（1232 bytes 包含 memo）
```

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
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccountIdempotent,
  getAssociatedTokenAddress,
  mintTo,
  transfer,
  getAccount,
  getMint,
} from "@solana/spl-token";

const connection = new Connection("https://api.mainnet-beta.solana.com");

// 完整的 SPL Token 操作流程
async function splTokenWorkflow(payer: Keypair) {
  // 1. 建立 Mint
  const mint = await createMint(
    connection,
    payer,
    payer.publicKey, // mint authority
    payer.publicKey, // freeze authority
    6               // decimals (like USDC)
  );

  // 2. 查詢 Mint 資訊
  const mintInfo = await getMint(connection, mint);
  // mintInfo.supply, mintInfo.decimals, mintInfo.mintAuthority

  // 3. 建立 ATA (idempotent: 已存在則不重建)
  const recipientWallet = Keypair.generate().publicKey;
  const ata = await createAssociatedTokenAccountIdempotent(
    connection,
    payer,
    mint,
    recipientWallet
  );

  // 4. 計算 ATA 地址 (不需建立)
  const expectedAta = await getAssociatedTokenAddress(
    mint,
    recipientWallet
  );
  // expectedAta 應等於 ata

  // 5. Mint tokens
  await mintTo(
    connection,
    payer,
    mint,
    ata,
    payer, // mint authority
    1_000_000 // 1 token (6 decimals)
  );

  // 6. 查詢餘額
  const accountInfo = await getAccount(connection, ata);
  return {
    mint: mint.toBase58(),
    ata: ata.toBase58(),
    balance: accountInfo.amount.toString(),
    decimals: mintInfo.decimals,
  };
}

// 查詢錢包的所有 SPL Token 餘額
async function getAllTokenBalances(walletAddress: string) {
  const wallet = new PublicKey(walletAddress);

  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    wallet,
    { programId: TOKEN_PROGRAM_ID }
  );

  return tokenAccounts.value.map((account) => {
    const parsed = account.account.data.parsed.info;
    return {
      mint: parsed.mint,
      balance: parsed.tokenAmount.uiAmount,
      decimals: parsed.tokenAmount.decimals,
      tokenAccount: account.pubkey.toBase58(),
    };
  });
}

// 解析 .sol 域名 (SNS)
async function resolveSolDomain(domain: string): Promise<string | null> {
  // SNS 使用 Name Service Program
  const SNS_PROGRAM_ID = new PublicKey(
    "namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX"
  );

  // 計算 name account PDA
  const hashedName = await getHashedName(domain.replace(".sol", ""));
  const [nameAccountKey] = PublicKey.findProgramAddressSync(
    [hashedName, Buffer.alloc(32), Buffer.alloc(32)],
    SNS_PROGRAM_ID
  );

  const accountInfo = await connection.getAccountInfo(nameAccountKey);
  if (!accountInfo) return null;

  // Name account data: header (96 bytes) + owner pubkey
  const owner = new PublicKey(accountInfo.data.slice(32, 64));
  return owner.toBase58();
}

async function getHashedName(name: string): Promise<Buffer> {
  const input = "SPL Name Service" + name;
  const buffer = Buffer.from(input, "utf-8");
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Buffer.from(hashBuffer);
}
```

```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Mint, TokenAccount, MintTo, Transfer};
use anchor_spl::associated_token::AssociatedToken;

declare_id!("SPLDemo111111111111111111111111111111111111");

#[program]
pub mod spl_demo {
    use super::*;

    // 使用 SPL Token 建立代幣並鑄造
    pub fn create_and_mint(
        ctx: Context<CreateAndMint>,
        amount: u64,
    ) -> Result<()> {
        // Mint 已在 derive accounts 中 init
        // 現在執行 mint_to
        let cpi_accounts = MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.token_account.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
        );
        token::mint_to(cpi_ctx, amount)?;

        msg!("Minted {} tokens", amount);
        Ok(())
    }

    // SPL Token 轉帳
    pub fn transfer_tokens(
        ctx: Context<TransferTokens>,
        amount: u64,
    ) -> Result<()> {
        let cpi_accounts = Transfer {
            from: ctx.accounts.from.to_account_info(),
            to: ctx.accounts.to.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
        );
        token::transfer(cpi_ctx, amount)?;

        msg!("Transferred {} tokens", amount);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateAndMint<'info> {
    #[account(
        init,
        payer = authority,
        mint::decimals = 6,
        mint::authority = authority,
    )]
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = authority,
    )]
    pub token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct TransferTokens<'info> {
    #[account(mut)]
    pub from: Account<'info, TokenAccount>,
    #[account(mut)]
    pub to: Account<'info, TokenAccount>,
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}
```

## 相關概念

- [Token Accounts](/solana/account-model/token-accounts/) - SPL Token 的帳戶結構
- [Native Programs](/solana/runtime/native-programs/) - Token Program 等核心 SPL 程式
- [PDA](/solana/account-model/pda/) - ATA 和 Governance 大量使用 PDA
- [Token Extensions](/solana/advanced/token-extensions/) - Token-2022 擴展功能
- [CPI](/solana/runtime/cpi/) - SPL 程式透過 CPI 互相呼叫
- [Rent](/solana/account-model/rent/) - Token account 的 rent-exempt 成本
- [State Compression](/solana/advanced/state-compression/) - SPL Account Compression 程式
- [Network Economics](/solana/advanced/network-economics/) - Stake Pool 與質押經濟
- [Validators and Staking](/solana/consensus/validators-staking/) - Stake Pool 分散質押
