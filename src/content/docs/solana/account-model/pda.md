---
title: "PDA (Program Derived Address)"
description: "Program Derived Address - deterministic off-curve addresses controlled by programs"
tags: [solana, account-model, PDA, seeds, program-derived-address]
---

# PDA (Program Derived Address)

## 概述

PDA（Program Derived Address）是 Solana 特有的地址機制——由 seeds 和 program ID 確定性推導出的地址，且保證**不在 [Ed25519](/solana/cryptography/ed25519/) 曲線上**。因為沒有對應的私鑰，PDA 帳戶只能由其衍生程式透過 [CPI（Cross-Program Invocation）](/solana/runtime/cpi/) 來「簽名」。PDA 是 Solana 程式設計的核心模式，廣泛用於 token vault、escrow、配置帳戶、authority delegation 等場景。

## 核心原理

### 推導公式

PDA 的推導過程：

$$\text{PDA} = \text{SHA-256}(\text{seeds} \| \text{program\_id} \| \text{"ProgramDerivedAddress"})$$

但有一個關鍵限制：**結果必須不在 Ed25519 曲線上**。如果 hash 結果恰好是一個有效的 Ed25519 公鑰，就必須重新嘗試。

### Bump Seed

為了確保地址離開曲線，引入 bump seed（1 byte）：

```
for bump in (0..=255).rev() {
    candidate = SHA-256(seed_1 || seed_2 || ... || [bump] || program_id || "ProgramDerivedAddress")
    if candidate is NOT on Ed25519 curve {
        return (candidate, bump)
    }
}
```

從 255 開始遞減嘗試，第一個不在曲線上的結果即為 canonical PDA。實際上，約 50% 的 hash 結果不在曲線上，所以通常 bump = 255 或 254 就能成功。

**Canonical bump**：`findProgramAddress` 回傳的 bump 是最大的有效值。儲存並使用 canonical bump 可以避免每次重新搜尋。

### 為什麼必須離開曲線

如果 PDA 在 Ed25519 曲線上，就意味著存在一個理論上的私鑰能直接簽名。這會破壞「只有程式可以控制 PDA」的安全假設。離開曲線確保：

- 沒有私鑰對應此地址
- 只有衍生程式可以透過 `invoke_signed`（CPI with seeds）為此地址「簽名」
- 其他程式和使用者無法偽造 PDA 的授權

### Seeds 規則

| 限制 | 值 |
|------|-----|
| 最大 seeds 數量 | 16 個 |
| 單一 seed 最大長度 | 32 bytes |
| Bump seed | 自動附加在最後（1 byte） |

常見 seed 模式：

```rust
// 使用者級別的帳戶
seeds = [b"user-state", user_pubkey.as_ref()]

// 全域配置
seeds = [b"config"]

// 多維度索引
seeds = [b"order", market.as_ref(), &order_id.to_le_bytes()]

// Token vault
seeds = [b"vault", mint.as_ref()]

// 帶 epoch 的時間性帳戶
seeds = [b"epoch", &epoch_number.to_le_bytes()]
```

### 程式簽名（invoke_signed）

PDA 帳戶不能用私鑰簽名，但程式可以透過 CPI 的 `invoke_signed` 為其提供授權：

```rust
invoke_signed(
    &transfer_instruction,
    &[source_account, dest_account, pda_authority],
    &[&[b"vault", mint.as_ref(), &[bump]]],  // signer seeds
)?;
```

Runtime 會驗證：
1. 提供的 seeds + bump 確實能推導出該 PDA 地址
2. 呼叫者的 program_id 與 PDA 衍生時使用的 program_id 一致
3. 如果兩者匹配，PDA 在此 CPI 中被視為「已簽名」

### ATA 作為 PDA 的實例

Associated Token Account (ATA) 是 PDA 最廣泛的應用：

$$\text{ATA} = \text{findProgramAddress}([\text{wallet}, \text{TOKEN\_PROGRAM\_ID}, \text{mint}], \text{ATA\_PROGRAM\_ID})$$

這保證了每個 (wallet, mint) 組合有唯一確定的 token 帳戶地址，無需使用者手動建立。

### 與 Ethereum 的 CREATE2 對比

| 面向 | Solana PDA | Ethereum CREATE2 |
|------|-----------|-----------------|
| 推導 | SHA-256(seeds \|\| program_id) | Keccak(0xff, sender, salt, bytecode_hash) |
| 確定性 | 是 | 是 |
| 控制 | 衍生程式透過 CPI | 部署者 |
| 私鑰 | 不存在（off-curve） | 合約帳戶無私鑰 |
| 用途 | 資料帳戶、vault、authority | 合約地址預測 |

## 程式碼範例

### TypeScript（@solana/web3.js）

```typescript
import { PublicKey } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('MyProg111111111111111111111111111111111111');

// 推導 PDA
const [pda, bump] = PublicKey.findProgramAddressSync(
  [
    Buffer.from('vault'),
    new PublicKey('So11111111111111111111111111111111111111112').toBuffer(),
  ],
  PROGRAM_ID
);
console.log('PDA:', pda.toBase58());
console.log('Bump:', bump);

// 驗證 PDA 確實不在曲線上
try {
  // Ed25519 public key validation would fail for PDA
  // PDA 不是有效的 Ed25519 public key
  console.log('PDA is off-curve (no private key)');
} catch {
  console.log('Error in curve check');
}

// 使用者 state PDA
function getUserStatePda(
  userPubkey: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('user-state'), userPubkey.toBuffer()],
    programId
  );
}

// ATA 推導
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
const mint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // USDC
const wallet = new PublicKey('...');
const ata = getAssociatedTokenAddressSync(mint, wallet);
console.log('ATA:', ata.toBase58());
```

### Rust / Anchor

```rust
use anchor_lang::prelude::*;

declare_id!("MyProg111111111111111111111111111111111111");

#[program]
pub mod vault_program {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.authority = ctx.accounts.authority.key();
        vault.mint = ctx.accounts.mint.key();
        vault.bump = ctx.bumps.vault;
        Ok(())
    }

    /// PDA 作為 authority，透過 CPI 轉移 token
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        let mint_key = ctx.accounts.mint.key();
        let seeds = &[
            b"vault",
            mint_key.as_ref(),
            &[ctx.accounts.vault.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        // PDA 透過 invoke_signed 為 CPI 簽名
        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.vault_token.to_account_info(),
                    to: ctx.accounts.user_token.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitVault<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault", mint.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, Vault>,
    pub mint: Account<'info, anchor_spl::token::Mint>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        seeds = [b"vault", mint.key().as_ref()],
        bump = vault.bump,
        has_one = authority,
        has_one = mint,
    )]
    pub vault: Account<'info, Vault>,
    pub mint: Account<'info, anchor_spl::token::Mint>,
    #[account(mut)]
    pub vault_token: Account<'info, anchor_spl::token::TokenAccount>,
    #[account(mut)]
    pub user_token: Account<'info, anchor_spl::token::TokenAccount>,
    pub authority: Signer<'info>,
    pub token_program: Program<'info, anchor_spl::token::Token>,
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub authority: Pubkey,  // 32
    pub mint: Pubkey,       // 32
    pub bump: u8,           // 1
}
```

## 相關概念

- [Ed25519](/solana/cryptography/ed25519/) - PDA 必須離開的曲線
- [Programs](/solana/account-model/programs/) - PDA 的衍生來源與控制者
- [Account Model](/solana/account-model/account-model-overview/) - PDA 在帳戶模型中的角色
- [CPI](/solana/runtime/cpi/) - 程式透過 CPI invoke_signed 為 PDA 簽名
- [Token Accounts](/solana/account-model/token-accounts/) - ATA 是 PDA 的典型應用
- [System Program](/solana/account-model/system-program/) - PDA 帳戶的建立仍需 System Program
- [Account Data Serialization](/solana/account-model/account-data-serialization/) - PDA 帳戶的資料格式
- [Address Derivation](/solana/account-model/address-derivation-solana/) - Solana 地址的推導方式總覽
- [SHA-256](/fundamentals/cryptography/sha-256/) - PDA 推導使用的雜湊函數
- [公鑰密碼學](/fundamentals/cryptography/public-key-cryptography/) - 理解「曲線上/曲線外」的密碼學背景
