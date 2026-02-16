---
title: "CPI (Cross-Program Invocation)"
description: "CPI, Cross-Program Invocation, invoke, invoke_signed, PDA signing, program composability"
tags: [solana, runtime, cpi, cross-program-invocation, composability, pda]
---

# CPI (Cross-Program Invocation)

## 概述

CPI（Cross-Program Invocation）是 Solana 程式之間互相呼叫的機制。一個程式可以透過 `invoke()` 直接呼叫另一個程式的 instruction，或透過 `invoke_signed()` 讓 [PDA](/solana/account-model/pda/) 作為簽名者。CPI 最多允許 4 層巢狀呼叫，且被呼叫的程式只能修改其 owner 的帳戶。這類似於 Ethereum 的 `CALL`/`DELEGATECALL`，但 Solana 的所有權模型帶來根本不同的安全特性。

## 核心原理

### invoke() 與 invoke_signed()

兩種 CPI 方式：

```
invoke():
  直接呼叫目標程式
  所有 signer 權限從呼叫者傳遞
  不需要額外簽名

invoke_signed():
  使用 PDA seeds 作為「虛擬簽名」
  讓 PDA 帳戶可以作為 signer
  常用於程式控制的 token 轉帳
```

### CPI 呼叫流程

```
User 發送 TX
    |
    v
Program A (被直接呼叫)
    |
    | invoke() / invoke_signed()
    v
Program B (CPI depth 1)
    |
    | invoke()
    v
Program C (CPI depth 2)
    |
    | invoke()
    v
Program D (CPI depth 3)
    |
    X-- depth 4: 最大限制，不可再往下呼叫
```

### 帳戶權限規則

CPI 中的帳戶權限遵循嚴格的規則：

| 規則 | 說明 |
|------|------|
| Signer 權限傳遞 | 呼叫者的 signer 權限會傳遞給被呼叫者 |
| Writable 權限傳遞 | 呼叫者的 writable 權限會傳遞 |
| 權限不可升級 | 不能將 readonly 帳戶變成 writable |
| Owner 限制 | 被呼叫的程式只能修改其 own 的帳戶 |

### PDA 簽名（invoke_signed）

PDA 沒有私鑰，但程式可以透過 seeds 證明其「擁有」該 PDA：

```
invoke_signed(
    instruction,        // 要呼叫的 instruction
    accounts,           // 帳戶列表
    &[signer_seeds],    // PDA 的 seeds
)

signer_seeds = &[
    b"vault",              // 固定前綴
    user_pubkey.as_ref(),  // 使用者公鑰
    &[bump_seed],          // bump seed
]

Runtime 驗證:
  create_program_address(seeds, program_id) == PDA pubkey
  -> 若相符，PDA 被視為此交易的 signer
```

### 深度限制

| 層級 | 說明 |
|------|------|
| Depth 0 | 交易直接呼叫的程式 |
| Depth 1 | 第一層 CPI |
| Depth 2 | 第二層 CPI |
| Depth 3 | 第三層 CPI |
| Depth 4 | 最大深度，禁止再呼叫 |

超過深度限制會回傳 `CallDepthExceeded` 錯誤。

### 重入保護

Solana 禁止直接遞迴 CPI：

```
Program A -> CPI -> Program A   // 禁止!（重入）
Program A -> CPI -> Program B -> CPI -> Program A  // 也禁止!
```

這與 Ethereum 的 reentrancy guard 不同。Ethereum 允許重入（開發者需自行防護），Solana 在 runtime 層面直接禁止。

### 與 Ethereum CALL 系列的比較

| 特性 | Solana CPI | Ethereum CALL | Ethereum DELEGATECALL |
|------|-----------|---------------|----------------------|
| 執行上下文 | 被呼叫者 | 被呼叫者 | 呼叫者 |
| 狀態修改 | 被呼叫者的帳戶 | 被呼叫者的 storage | 呼叫者的 storage |
| msg.sender | 程式 ID | 呼叫者 | 原始 sender |
| 重入保護 | Runtime 強制 | 開發者自行處理 | 開發者自行處理 |
| 深度限制 | 4 | 1024 | 1024 |
| Gas/CU 傳遞 | 共享 TX 的 CU 預算 | 可指定 gas limit | 可指定 gas limit |

Solana 沒有 `DELEGATECALL` 的等價機制。程式只能修改自己 own 的帳戶，不能代替另一個程式修改其帳戶。

### 回傳資料

CPI 被呼叫的程式可以透過 `set_return_data` 回傳資料：

```
被呼叫者: sol_set_return_data(data, len)
呼叫者:   sol_get_return_data() -> (program_id, data)
```

回傳資料大小上限為 1024 bytes。

## 程式碼範例

```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("CPIDemo111111111111111111111111111111111111");

#[program]
pub mod cpi_demo {
    use super::*;

    // 範例 1: 使用 invoke() 進行 SPL Token 轉帳
    pub fn transfer_tokens(ctx: Context<TransferTokens>, amount: u64) -> Result<()> {
        let cpi_accounts = Transfer {
            from: ctx.accounts.source.to_account_info(),
            to: ctx.accounts.destination.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        // CPI: 呼叫 SPL Token Program 的 transfer instruction
        token::transfer(cpi_ctx, amount)?;

        msg!("Transferred {} tokens via CPI", amount);
        Ok(())
    }

    // 範例 2: 使用 invoke_signed() 讓 PDA vault 轉帳
    pub fn withdraw_from_vault(
        ctx: Context<WithdrawFromVault>,
        amount: u64,
    ) -> Result<()> {
        let authority_key = ctx.accounts.authority.key();
        let bump = ctx.accounts.vault.bump;

        // PDA seeds 用於 invoke_signed
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"vault",
            authority_key.as_ref(),
            &[bump],
        ]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault_token.to_account_info(),
            to: ctx.accounts.destination.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(), // PDA 作為 authority
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(
            cpi_program,
            cpi_accounts,
            signer_seeds, // PDA 簽名
        );

        token::transfer(cpi_ctx, amount)?;

        msg!("Withdrew {} tokens from vault via PDA-signed CPI", amount);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct TransferTokens<'info> {
    #[account(mut)]
    pub source: Account<'info, TokenAccount>,
    #[account(mut)]
    pub destination: Account<'info, TokenAccount>,
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawFromVault<'info> {
    #[account(
        seeds = [b"vault", authority.key().as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        mut,
        associated_token::mint = vault.mint,
        associated_token::authority = vault,
    )]
    pub vault_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub destination: Account<'info, TokenAccount>,
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct Vault {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub bump: u8,
}
```

```typescript
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";

// 建構包含 CPI 的交易
// 客戶端不需要知道 CPI 細節，只需呼叫外層程式
async function buildVaultWithdrawTx(
  connection: Connection,
  programId: PublicKey,
  authority: PublicKey,
  mint: PublicKey,
  destination: PublicKey,
  amount: bigint
): Promise<Transaction> {
  // 計算 PDA
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), authority.toBuffer()],
    programId
  );

  // vault 的 associated token account
  const vaultAta = await getAssociatedTokenAddress(mint, vaultPda, true);

  // 建構 instruction data (Anchor discriminator + amount)
  const discriminator = Buffer.from([
    183, 18, 70, 156, 148, 109, 161, 34, // withdraw_from_vault discriminator
  ]);
  const data = Buffer.alloc(8 + 8);
  discriminator.copy(data, 0);
  data.writeBigUInt64LE(amount, 8);

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: vaultPda, isSigner: false, isWritable: false },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = authority;

  return tx;
}
```

## 相關概念

- [Programs](/solana/account-model/programs/) - CPI 的呼叫者和被呼叫者
- [PDA](/solana/account-model/pda/) - invoke_signed 使用 PDA 作為虛擬簽名者
- [Instructions](/solana/transactions/instructions/) - CPI 呼叫的是 instruction
- [SVM/Sealevel](/solana/runtime/svm-sealevel/) - CPI 在 SVM 中的執行環境
- [Token Accounts](/solana/account-model/token-accounts/) - CPI 常用於 SPL Token 操作
- [Compute Units](/solana/runtime/compute-units/) - CPI 消耗額外的 compute units
- [Native Programs](/solana/runtime/native-programs/) - System Program 等常被 CPI 呼叫
- [Token Extensions](/solana/advanced/token-extensions/) - Token-2022 的 transfer hooks 透過 CPI
- [Solana Program Library](/solana/advanced/solana-program-library/) - SPL 程式間透過 CPI 互動
