---
title: "System Program"
description: "Solana System Program - account creation, SOL transfers, and system-level operations"
tags: [solana, account-model, system-program, native-program]
---

# System Program

## 概述

System Program 是 Solana 最基礎的原生程式，地址為 `11111111111111111111111111111111`（32 個 '1'）。它負責帳戶的建立、空間分配、owner 指派和 SOL 轉帳。所有新建帳戶的預設 owner 都是 System Program，直到被明確轉移。可以說，System Program 是 Solana [帳戶模型](/solana/account-model/account-model-overview/) 的管家——沒有它，任何帳戶都無法誕生。

## 核心原理

### SystemInstruction 指令集

System Program 提供以下核心指令：

| 指令 | 功能 |
|------|------|
| `CreateAccount` | 建立新帳戶：分配空間、設定 owner、注入 lamports |
| `Transfer` | SOL 轉帳（從簽名者帳戶到目標帳戶） |
| `Assign` | 變更帳戶的 owner（需簽名者是帳戶本身） |
| `Allocate` | 為已存在的帳戶分配 data 空間 |
| `CreateAccountWithSeed` | 用 seed 確定性地建立帳戶 |
| `AdvanceNonceAccount` | 推進 nonce 帳戶的值 |
| `InitializeNonceAccount` | 初始化 durable nonce 帳戶 |
| `AuthorizeNonceAccount` | 變更 nonce 帳戶的授權者 |
| `WithdrawNonceAccount` | 從 nonce 帳戶提取 SOL |
| `TransferWithSeed` | 用 seed-derived 地址進行轉帳 |

### CreateAccount 流程

`CreateAccount` 是最常用的指令，它一次完成三件事：

1. **Allocate**：為新帳戶分配 `space` bytes 的 `data` 空間
2. **Assign**：將帳戶 owner 設為指定的 `programId`
3. **Transfer**：從 payer 轉入足夠的 lamports（至少達到 [rent-exempt](/solana/account-model/rent/) 門檻）

```
Before:
  Payer: lamports=5_000_000_000, owner=System

After CreateAccount(space=100, owner=MyProgram, lamports=1_461_600):
  Payer: lamports=3_538_400_000, owner=System
  NewAccount: lamports=1_461_600, data=[0;100], owner=MyProgram
```

所需的 rent-exempt lamports 計算：

$$\text{lamports} = \left\lceil \frac{(128 + \text{space}) \times 3480 \times 2}{1} \right\rceil$$

其中 128 是帳戶 metadata 的固定開銷（lamports + owner + executable + rent_epoch 等），3480 是 lamports per byte-year，乘以 2 代表 2 年的 rent exemption。

### SOL Transfer

SOL（lamports）轉帳只需要發送者的簽名：

- System Program 從發送者的 `lamports` 扣減
- 加到接收者的 `lamports`
- 接收者帳戶不需要存在——如果不存在，自動建立一個 0-data 帳戶

這與 Ethereum 的 ETH 轉帳類似——接收方不需要先「初始化」。

### Nonce Account（Durable Transaction）

Solana 的交易預設使用 recent blockhash 作為過期機制（~60 秒有效）。Nonce Account 提供「durable transaction」功能，讓交易在更長時間內保持有效：

1. 初始化一個 nonce 帳戶，儲存一個持久的 nonce 值
2. 交易使用 nonce 值替代 recent blockhash
3. 交易中必須包含 `AdvanceNonceAccount` 指令作為第一個指令
4. 執行時，nonce 值被推進，防止重放

使用場景：
- 多重簽名：收集簽名可能需要數天
- 硬體錢包：離線簽名再上傳
- 排程交易：預先簽名、延後提交

### Owner 的權限邊界

System Program 作為帳戶的初始 owner 時：

| 操作 | 需要的簽名 |
|------|-----------|
| Transfer SOL | 帳戶本身的簽名 |
| Assign（改 owner） | 帳戶本身的簽名 |
| Allocate space | 帳戶本身的簽名 |
| CreateAccount | Payer + 新帳戶的簽名 |

一旦帳戶的 owner 被 Assign 給其他程式，System Program 就無法再修改該帳戶（除了增加 lamports）。

## 程式碼範例

### TypeScript（@solana/web3.js）

```typescript
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  PublicKey,
  NonceAccount,
} from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');

// === CreateAccount ===
async function createAccount(
  payer: Keypair,
  space: number,
  programId: PublicKey,
): Promise<Keypair> {
  const newAccount = Keypair.generate();
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
  return newAccount;
}

// === SOL Transfer ===
async function transferSol(
  from: Keypair,
  to: PublicKey,
  amount: number,
) {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: to,
      lamports: amount * LAMPORTS_PER_SOL,
    })
  );
  await sendAndConfirmTransaction(connection, tx, [from]);
}

// === Durable Nonce ===
async function createNonceAccount(
  payer: Keypair,
  authority: PublicKey,
): Promise<Keypair> {
  const nonceAccount = Keypair.generate();
  const lamports = await connection.getMinimumBalanceForRentExemption(
    NonceAccount.NONCE_ACCOUNT_LENGTH
  );

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: nonceAccount.publicKey,
      lamports,
      space: NonceAccount.NONCE_ACCOUNT_LENGTH,
      programId: SystemProgram.programId,
    }),
    SystemProgram.nonceInitialize({
      noncePubkey: nonceAccount.publicKey,
      authorizedPubkey: authority,
    })
  );

  await sendAndConfirmTransaction(connection, tx, [payer, nonceAccount]);
  return nonceAccount;
}

// === Assign owner ===
async function assignOwner(
  account: Keypair,
  newOwner: PublicKey,
) {
  const tx = new Transaction().add(
    SystemProgram.assign({
      accountPubkey: account.publicKey,
      programId: newOwner,
    })
  );
  await sendAndConfirmTransaction(connection, tx, [account]);
}
```

### Rust / Anchor

```rust
use anchor_lang::prelude::*;
use anchor_lang::system_program;

#[program]
pub mod my_program {
    use super::*;

    /// 透過 CPI 呼叫 System Program 進行 SOL 轉帳
    pub fn transfer_sol(ctx: Context<TransferSol>, amount: u64) -> Result<()> {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.from.to_account_info(),
                    to: ctx.accounts.to.to_account_info(),
                },
            ),
            amount,
        )?;
        Ok(())
    }

    /// 透過 CPI 建立帳戶
    pub fn create_data_account(
        ctx: Context<CreateData>,
        space: u64,
    ) -> Result<()> {
        let rent = Rent::get()?;
        let lamports = rent.minimum_balance(space as usize);

        system_program::create_account(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::CreateAccount {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.new_account.to_account_info(),
                },
            ),
            lamports,
            space,
            ctx.accounts.owner_program.key,
        )?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct TransferSol<'info> {
    #[account(mut)]
    pub from: Signer<'info>,
    /// CHECK: any account can receive SOL
    #[account(mut)]
    pub to: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateData<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub new_account: Signer<'info>,
    /// CHECK: target program
    pub owner_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}
```

## 相關概念

- [Account Model](/solana/account-model/account-model-overview/) - Solana 帳戶模型全貌
- [Rent](/solana/account-model/rent/) - 帳戶的租金機制與 rent-exempt 計算
- [Programs](/solana/account-model/programs/) - Solana 程式（帳戶的 owner）
- [PDA](/solana/account-model/pda/) - 程式衍生地址與 seed-based 帳戶建立
- [Instructions](/solana/transactions/instructions/) - System Program 指令的格式與組合
- [Fees](/solana/transactions/fees-priority/) - 交易費用結構
- [Native Programs](/solana/runtime/native-programs/) - Solana 原生程式清單
- [CPI](/solana/runtime/cpi/) - 其他程式透過 CPI 呼叫 System Program
- [Token Accounts](/solana/account-model/token-accounts/) - Token 帳戶的建立也依賴 System Program
