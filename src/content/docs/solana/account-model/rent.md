---
title: "Rent and Rent Exemption"
description: "Solana's rent mechanism for on-chain storage cost and rent-exempt accounts"
tags: [solana, account-model, rent, rent-exemption, economics, storage]
---

# Rent and Rent Exemption

## 概述

Solana 的 rent 機制是帳戶持有鏈上資料的經濟成本。每個帳戶按其 `data` 大小收取 lamports 作為「租金」。然而，自 2022 年起，所有新建帳戶**必須是 rent-exempt**——一次性存入足夠的 lamports（覆蓋 2 年的租金），帳戶就永久存在，不再被收取。Rent 機制確保閒置帳戶不會無限增長 validator 的儲存負擔，同時 rent-exempt 設計消除了帳戶被「蒸發」的風險。

## 核心原理

### Rent 計算公式

Rent 的年費率：

$$\text{rent}_{\text{annual}} = (\text{account\_size} + 128) \times \text{lamports\_per\_byte\_year}$$

其中：
- `account_size`：帳戶的 `data` 欄位大小（bytes）
- 128：帳戶 metadata 的固定開銷（lamports, owner, executable, rent_epoch 等）
- `lamports_per_byte_year`：目前為 3,480 lamports

Rent-exempt 門檻（2 年預付）：

$$\text{rent\_exempt} = \text{rent}_{\text{annual}} \times 2 = (\text{account\_size} + 128) \times 3{,}480 \times 2$$

### 常見帳戶的 Rent-Exempt 費用

| 帳戶類型 | Data 大小 | Rent-Exempt (lamports) | 約 SOL |
|----------|----------|----------------------|--------|
| 系統帳戶（空） | 0 bytes | 890,880 | ~0.00089 |
| Token Account | 165 bytes | 2,039,280 | ~0.00204 |
| Mint Account | 82 bytes | 1,461,600 | ~0.00146 |
| Anchor 小帳戶 | 100 bytes | 1,586,880 | ~0.00159 |
| 1 KB 帳戶 | 1,024 bytes | 8,011,776 | ~0.00801 |
| 10 KB 帳戶 | 10,240 bytes | 72,192,000 | ~0.0722 |
| 10 MB（最大） | 10,485,760 bytes | 73,785,768,960 | ~73.8 |

### 經濟學原理

Rent-exempt 門檻為何是 2 年？這基於硬體成本的「摩爾定律」假設：

$$\text{儲存成本在 2 年後減半} \Rightarrow \sum_{n=0}^{\infty} \frac{1}{2^n} = 2$$

這是一個等比級數（geometric series），收斂於 2。意思是：如果儲存成本每 2 年減半，預付 2 年的租金在理論上足以覆蓋無限長的存儲成本：

$$\text{Total cost} = C + \frac{C}{2} + \frac{C}{4} + \frac{C}{8} + \cdots = 2C$$

這就是「2 年 rent-exempt」的數學基礎。

### Rent Collection（已棄用）

歷史上，Solana 的 rent 機制允許定期收取帳戶的 lamports：

1. 每個 epoch（約 2-3 天），validator 會檢查帳戶的 `rent_epoch`
2. 如果帳戶餘額低於 rent-exempt 門檻，扣除相應的 rent
3. 如果帳戶餘額歸零，帳戶被回收（purged）

**當前狀態（2022 年後）**：rent collection 已被停用。所有新建帳戶必須滿足 rent-exempt 門檻。`rent_epoch` 欄位仍存在但不再更新。

### Rent 回收

帳戶可以被「關閉」以回收 rent-exempt lamports：

1. Owner 程式將帳戶的所有 lamports 轉出
2. 帳戶在 slot 結束時被 runtime 回收
3. 回收的 lamports 回到指定的接收者

這是一個重要的成本管理策略——不再需要的帳戶應該被關閉以回收 SOL。

### 與 Ethereum 存儲成本的比較

| 面向 | Solana Rent | Ethereum Storage |
|------|------------|-----------------|
| 計費方式 | 一次性 rent-exempt | 每次 SSTORE 消耗 gas |
| 持續成本 | 無（rent-exempt 後） | 每次讀寫都消耗 gas |
| 空間回收 | 關閉帳戶回收 SOL | SSTORE(0) 退 gas refund |
| 狀態膨脹 | rent 限制，但可回收 | 永久（state rent 提案未通過） |
| 成本方向 | 按空間大小 | 按操作次數 + 冷/熱 slot |

Ethereum 社群長期討論 state rent 或 state expiry，但至今未實施。Solana 的 rent-exempt 機制是一個折衷——前置成本換取永久存儲，同時允許帳戶關閉回收。

### 在程式中處理 Rent

Anchor 的 `init` constraint 自動計算 rent-exempt 費用：

```rust
#[account(
    init,
    payer = user,
    space = 8 + MyAccount::INIT_SPACE, // 8 = discriminator
)]
pub my_account: Account<'info, MyAccount>,
```

Anchor 在初始化時：
1. 計算 `8 + MyAccount::INIT_SPACE` bytes 所需的 rent-exempt lamports
2. 從 `payer` 轉入 lamports
3. 分配空間並設定 owner

## 程式碼範例

### TypeScript（@solana/web3.js）

```typescript
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');

// 查詢 rent-exempt 門檻
async function getRentExempt(space: number): Promise<number> {
  const lamports = await connection.getMinimumBalanceForRentExemption(space);
  console.log(`Space: ${space} bytes`);
  console.log(`Rent-exempt: ${lamports} lamports (${lamports / 1e9} SOL)`);
  return lamports;
}

// 常見帳戶大小的 rent-exempt 費用
async function printCommonRents() {
  const sizes = [
    { name: 'Empty account', space: 0 },
    { name: 'Token Account', space: 165 },
    { name: 'Mint Account', space: 82 },
    { name: '1 KB data', space: 1024 },
    { name: '10 KB data', space: 10240 },
  ];

  for (const { name, space } of sizes) {
    const lamports = await connection.getMinimumBalanceForRentExemption(space);
    console.log(`${name} (${space}B): ${lamports} lamports = ${(lamports / 1e9).toFixed(6)} SOL`);
  }
}

// 建立 rent-exempt 帳戶
async function createRentExemptAccount(
  payer: Keypair,
  space: number,
) {
  const newAccount = Keypair.generate();
  const lamports = await connection.getMinimumBalanceForRentExemption(space);

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: newAccount.publicKey,
      lamports,
      space,
      programId: SystemProgram.programId,
    })
  );

  await sendAndConfirmTransaction(connection, tx, [payer, newAccount]);
  return newAccount;
}

// 關閉帳戶回收 rent
async function closeAccount(
  connection: Connection,
  account: Keypair,
  receiver: Keypair,
) {
  // 需要 owner program 的 close instruction
  // 此處以 System Program 帳戶為例
  const info = await connection.getAccountInfo(account.publicKey);
  if (info) {
    console.log(`Reclaimable: ${info.lamports} lamports`);
  }
}
```

### Rust / Anchor

```rust
use anchor_lang::prelude::*;

#[program]
pub mod rent_example {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        // Anchor 自動處理 rent-exempt 計算和付款
        let data = &mut ctx.accounts.data_account;
        data.authority = ctx.accounts.payer.key();
        data.value = 0;
        data.bump = ctx.bumps.data_account;
        Ok(())
    }

    pub fn close_account(_ctx: Context<CloseAccount>) -> Result<()> {
        // Anchor 的 close constraint 自動：
        // 1. 將帳戶的所有 lamports 轉給 receiver
        // 2. 將 data 清零
        // 3. 將 owner 設回 System Program
        msg!("Account closed, rent reclaimed");
        Ok(())
    }

    pub fn check_rent(ctx: Context<CheckRent>, space: u64) -> Result<()> {
        let rent = Rent::get()?;
        let min_balance = rent.minimum_balance(space as usize);
        msg!("Space: {} bytes", space);
        msg!("Minimum rent-exempt balance: {} lamports", min_balance);
        msg!("Is rent-exempt: {}", rent.is_exempt(
            ctx.accounts.target.lamports(),
            ctx.accounts.target.data_len(),
        ));
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + DataAccount::INIT_SPACE,
        seeds = [b"data", payer.key().as_ref()],
        bump,
    )]
    pub data_account: Account<'info, DataAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseAccount<'info> {
    #[account(
        mut,
        close = receiver,   // lamports go to receiver
        has_one = authority,
    )]
    pub data_account: Account<'info, DataAccount>,
    pub authority: Signer<'info>,
    /// CHECK: receives lamports
    #[account(mut)]
    pub receiver: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct CheckRent<'info> {
    /// CHECK: any account
    pub target: AccountInfo<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct DataAccount {
    pub authority: Pubkey,  // 32
    pub value: u64,         // 8
    pub bump: u8,           // 1
}
```

## 相關概念

- [Account Model](/solana/account-model/account-model-overview/) - 帳戶模型與 rent 的關係
- [System Program](/solana/account-model/system-program/) - CreateAccount 時指定 rent-exempt lamports
- [Programs](/solana/account-model/programs/) - 程式帳戶也需要 rent-exempt
- [Token Accounts](/solana/account-model/token-accounts/) - Token 帳戶的 rent 回收策略
- [Fees](/solana/transactions/fees-priority/) - 交易手續費與 rent 的區別
- [PDA](/solana/account-model/pda/) - PDA 帳戶的 rent 由 payer 支付
- [Account Data Serialization](/solana/account-model/account-data-serialization/) - space 計算與 rent 的關聯
- [Address Derivation](/solana/account-model/address-derivation-solana/) - 地址與帳戶存在性的關係
- [State Trie (Ethereum)](/ethereum/data-structures/state-trie/) - Ethereum 的永久狀態儲存（無 rent 機制）
