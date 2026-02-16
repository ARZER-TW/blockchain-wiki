---
title: "Native Programs"
description: "Native Programs, System Program, BPF Loader, SPL Token, Sysvars, Ed25519 Program"
tags: [solana, runtime, native-programs, system-program, spl-token, sysvars]
---

# Native Programs

## 概述

Solana 的 Native Programs 是內建在 validator runtime 中的核心程式，不透過 [BPF/SBF](/solana/runtime/bpf-sbf/) 執行而是以原生程式碼運行，效率極高。包括 System Program（帳戶建立、SOL 轉帳）、BPF Loader（程式部署）、SPL Token Program（代幣標準）等。此外，Sysvars 提供鏈上全域狀態（Clock、Rent、Epoch Schedule 等）。這些角色類似 Ethereum 的 precompiled contracts，但涵蓋範圍更廣。

## 核心原理

### 核心 Native Programs

| Program | Address | 功能 |
|---------|---------|------|
| System Program | `11111111111111111111111111111112` | 帳戶建立、SOL 轉帳、分配空間 |
| BPF Loader Upgradeable | `BPFLoaderUpgradeab1e11111111111111111111111` | 程式部署與升級 |
| BPF Loader v2 | `BPFLoader2111111111111111111111111111111111` | 舊版程式部署（不可升級） |
| Config Program | `Config1111111111111111111111111111111111111` | 鏈上設定存取 |
| Stake Program | `Stake11111111111111111111111111111111111111` | 質押管理 |
| Vote Program | `Vote111111111111111111111111111111111111111` | 驗證者投票 |
| Address Lookup Table | `AddressLookupTab1e1111111111111111111111111` | v0 交易的地址查找表 |

### System Program

最基礎的 Native Program，負責：

```
CreateAccount:
  分配空間、設定 owner、轉入租金
  所有新帳戶都透過 System Program 建立

Transfer:
  SOL（lamports）轉帳
  只能轉出 System Program owned 的帳戶

Assign:
  將帳戶的 owner 指定給另一個程式

Allocate:
  分配帳戶的 data 空間（不轉帳）

CreateAccountWithSeed:
  使用 seed 確定性建立帳戶
```

### SPL Token Program

Solana 的代幣標準，相當於 Ethereum 的 ERC-20（但是獨立程式而非合約標準）：

| Instruction | 說明 |
|-------------|------|
| InitializeMint | 建立新代幣（mint authority, decimals） |
| InitializeAccount | 建立 token account |
| Transfer | 代幣轉帳 |
| MintTo | 鑄造新代幣 |
| Burn | 銷毀代幣 |
| Approve / Revoke | 授權委託 |
| SetAuthority | 變更權限 |
| CloseAccount | 關閉帳戶並回收租金 |

SPL Token address: `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`

### Associated Token Account Program

確定性產生使用者的 token account address：

```
ATA = findProgramAddress(
    [wallet_pubkey, TOKEN_PROGRAM_ID, mint_pubkey],
    ASSOCIATED_TOKEN_PROGRAM_ID
)
```

ATA address: `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL`

### Ed25519 和 Secp256k1 Programs

| Program | 功能 | 使用場景 |
|---------|------|---------|
| [Ed25519 Program](/solana/cryptography/ed25519-precompile/) | 驗證 Ed25519 簽名 | 鏈上簽名驗證 |
| [Secp256k1 Program](/solana/cryptography/secp256k1-precompile/) | 驗證 secp256k1 簽名 | 以太坊相容簽名 |

這些是 precompile-style 的程式，直接在 sigverify 階段執行，不消耗 CU。

### Sysvars

提供全域鏈上狀態的特殊帳戶：

| Sysvar | Address | 內容 |
|--------|---------|------|
| Clock | `SysvarC1ock11111111111111111111111111111111` | slot, epoch, timestamp |
| Rent | `SysvarRent111111111111111111111111111111111` | 租金參數 |
| Epoch Schedule | `SysvarEpochScheworEpochScworEpochSche111111` | epoch 長度設定 |
| Slot Hashes | `SysvarS1otHashes111111111111111111111111111` | 最近 slot hashes |
| Stake History | `SysvarStakeHistory1111111111111111111111111` | 質押歷史 |
| Recent Blockhashes | `SysvarRecentB1teleEEEEEEEEEEEEEEEEEEEEEEE` | 最近的 blockhash |
| Instructions | `Sysvar1nstructions1111111111111111111111111` | 當前交易的 instructions |

### 與 Ethereum Precompiled Contracts 的比較

| 特性 | Solana Native Programs | Ethereum Precompiled Contracts |
|------|----------------------|-------------------------------|
| 數量 | ~10+ 核心程式 | 9 個 precompiles (地址 0x01-0x09) |
| 範圍 | 帳戶管理、代幣、質押 | 密碼學、模運算 |
| 代幣標準 | SPL Token（Native Program） | ERC-20（smart contract） |
| 可升級 | 透過硬分叉 | 透過硬分叉 |
| 呼叫方式 | Instruction | CALL to address |

Ethereum 的代幣標準（ERC-20）是 smart contract 層級的介面，而 Solana 的 SPL Token 是 runtime 層級的 Native Program，效率更高但彈性較低（因此有了 [Token Extensions](/solana/advanced/token-extensions/)）。

## 程式碼範例

```typescript
import {
  Connection,
  SystemProgram,
  PublicKey,
  Keypair,
  Transaction,
  LAMPORTS_PER_SOL,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  transfer,
  getAccount,
} from "@solana/spl-token";

const connection = new Connection("https://api.mainnet-beta.solana.com");

// System Program: 建立帳戶
function createAccountInstruction(
  payer: PublicKey,
  newAccount: PublicKey,
  lamports: number,
  space: number,
  owner: PublicKey
) {
  return SystemProgram.createAccount({
    fromPubkey: payer,
    newAccountPubkey: newAccount,
    lamports,
    space,
    programId: owner,
  });
}

// 查詢 Sysvar 資料
async function getSysvarData(connection: Connection) {
  // Clock sysvar
  const clockAccount = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  if (clockAccount) {
    const data = clockAccount.data;
    const slot = data.readBigUInt64LE(0);
    const epochStartTimestamp = data.readBigInt64LE(8);
    const epoch = data.readBigUInt64LE(16);
    const leaderScheduleEpoch = data.readBigUInt64LE(24);
    const unixTimestamp = data.readBigInt64LE(32);

    return { slot, epoch, unixTimestamp };
  }
  return null;
}

// SPL Token 完整操作流程
async function tokenOperations(
  connection: Connection,
  payer: Keypair,
  mintAuthority: Keypair,
  recipient: PublicKey
) {
  // 1. 建立 Mint
  const mint = await createMint(
    connection,
    payer,
    mintAuthority.publicKey,
    null, // freeze authority
    9     // decimals
  );

  // 2. 建立 Associated Token Account
  const ata = await createAssociatedTokenAccount(
    connection,
    payer,
    mint,
    recipient
  );

  // 3. Mint tokens
  await mintTo(
    connection,
    payer,
    mint,
    ata,
    mintAuthority,
    1_000_000_000 // 1 token (9 decimals)
  );

  // 4. 查詢餘額
  const accountInfo = await getAccount(connection, ata);
  return {
    mint: mint.toBase58(),
    ata: ata.toBase58(),
    balance: accountInfo.amount.toString(),
  };
}
```

```rust
use anchor_lang::prelude::*;

declare_id!("NtvDemo111111111111111111111111111111111111");

#[program]
pub mod native_programs_demo {
    use super::*;

    // 使用 System Program 建立帳戶
    pub fn create_data_account(
        ctx: Context<CreateData>,
        data: Vec<u8>,
    ) -> Result<()> {
        let account = &mut ctx.accounts.data_account;
        account.authority = ctx.accounts.authority.key();
        account.data = data;
        Ok(())
    }

    // 讀取 Clock sysvar
    pub fn check_time(ctx: Context<CheckTime>) -> Result<()> {
        let clock = Clock::get()?;
        msg!("Current slot: {}", clock.slot);
        msg!("Current epoch: {}", clock.epoch);
        msg!("Unix timestamp: {}", clock.unix_timestamp);

        let account = &mut ctx.accounts.data_account;
        account.last_updated = clock.unix_timestamp;

        Ok(())
    }

    // 讀取 Rent sysvar
    pub fn check_rent(_ctx: Context<CheckRent>, data_len: usize) -> Result<()> {
        let rent = Rent::get()?;
        let minimum = rent.minimum_balance(data_len);
        msg!(
            "Minimum balance for {} bytes: {} lamports ({} SOL)",
            data_len,
            minimum,
            minimum as f64 / 1_000_000_000.0
        );
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(data: Vec<u8>)]
pub struct CreateData<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 4 + data.len() + 8,
    )]
    pub data_account: Account<'info, DataStorage>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CheckTime<'info> {
    #[account(mut, has_one = authority)]
    pub data_account: Account<'info, DataStorage>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CheckRent<'info> {
    pub authority: Signer<'info>,
}

#[account]
pub struct DataStorage {
    pub authority: Pubkey,
    pub data: Vec<u8>,
    pub last_updated: i64,
}
```

## 相關概念

- [System Program](/solana/account-model/system-program/) - 帳戶建立與 SOL 轉帳的詳細說明
- [Ed25519 Precompile](/solana/cryptography/ed25519-precompile/) - 鏈上 Ed25519 簽名驗證
- [Secp256k1 Precompile](/solana/cryptography/secp256k1-precompile/) - 以太坊相容簽名驗證
- [Precompiled Contracts (ETH)](/ethereum/advanced/precompiled-contracts/) - Ethereum 的預編譯合約
- [Token Accounts](/solana/account-model/token-accounts/) - SPL Token 的帳戶結構
- [Token Extensions](/solana/advanced/token-extensions/) - Token-2022 擴展功能
- [Program Deployment](/solana/runtime/program-deployment/) - BPF Loader 的部署機制
- [Solana Program Library](/solana/advanced/solana-program-library/) - 基於 Native Programs 構建的 SPL 生態
- [Rent](/solana/account-model/rent/) - Rent sysvar 與帳戶租金
