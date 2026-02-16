---
title: "Token Extensions (Token-2022)"
description: "Token Extensions, Token-2022, transfer fees, confidential transfers, transfer hooks, soulbound tokens"
tags: [solana, advanced, token-extensions, token-2022, transfer-fees, confidential-transfers]
---

# Token Extensions (Token-2022)

## 概述

Token Extensions（Token-2022 program）是 SPL Token 的超集，在協定層級提供進階代幣功能。包含 transfer fees（轉帳手續費）、confidential transfers（使用 ElGamal + Pedersen 的隱私轉帳）、transfer hooks（自訂轉帳邏輯）、permanent delegate、interest-bearing tokens、non-transferable tokens（soulbound）等。這些功能在 Ethereum 上需要複雜的 smart contract 自訂實作，而 Token-2022 將其內建於程式層級。

## 核心原理

### Token-2022 vs SPL Token

```
SPL Token (原版):
  基本功能: mint, transfer, burn, approve
  Program ID: TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA

Token-2022 (擴展版):
  原版所有功能 + extensions
  Program ID: TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb
  向下相容，但帳戶不共用
```

### Extension 類型

#### Mint Extensions（作用於 Mint 帳戶）

| Extension | 功能 |
|-----------|------|
| Transfer Fee | 每筆轉帳收取比例手續費 |
| Confidential Transfer | ElGamal 加密金額 |
| Transfer Hook | 轉帳時觸發自訂程式 |
| Permanent Delegate | 不可撤銷的委託者 |
| Interest Bearing | 顯示帶利息的餘額 |
| Non-Transferable | 不可轉讓（soulbound） |
| Close Authority | 允許關閉 mint 帳戶 |
| Default Account State | 新帳戶預設狀態（frozen） |
| Metadata Pointer | 指向鏈上/鏈下 metadata |
| Group/Member Pointer | Token group 分組 |

#### Account Extensions（作用於 Token Account）

| Extension | 功能 |
|-----------|------|
| Required Memo | 轉帳必須附帶 memo |
| Immutable Owner | 帳戶擁有者不可變更 |
| CPI Guard | 限制透過 CPI 操作 |

### Transfer Fees

協定層級的轉帳手續費：

```
配置:
  transfer_fee_basis_points: u16   // 費率 (basis points, 1 bp = 0.01%)
  maximum_fee: u64                 // 最大手續費 (absolute cap)

計算:
  fee = min(
    amount * transfer_fee_basis_points / 10000,
    maximum_fee
  )

  實際轉帳金額 = amount - fee
  fee 保留在接收者的 token account 中
  mint authority 可提取累積的 fees
```

特點：
- 無法繞過（協定強制執行）
- 支援排程更新（設定未來生效的新費率）
- Ethereum ERC-20 需自行在 transfer 函式中實作

### Confidential Transfers

使用 ElGamal 加密和 Pedersen commitments 實現隱私交易：

```
原理:
  帳戶餘額 = ElGamal 加密的 ciphertext
  轉帳金額 = Pedersen commitment
  ZK proof 證明:
    - 發送者有足夠餘額
    - 金額非負
    - ciphertext 更新正確

流程:
  1. 存入: 明文 -> 加密 (deposit)
  2. 轉帳: 加密 -> 加密 (confidential transfer)
  3. 提取: 加密 -> 明文 (withdraw)
  4. 適用: 只隱藏金額, 不隱藏地址
```

### Transfer Hooks

允許在每次轉帳時執行自訂程式邏輯：

```
配置:
  mint 帳戶設定 transfer_hook_program_id
  每次 transfer/transferChecked 時
  Token-2022 透過 CPI 呼叫 hook program

Hook program 必須實作:
  fn execute(
    source: AccountInfo,
    mint: AccountInfo,
    destination: AccountInfo,
    authority: AccountInfo,
    amount: u64,
    extra_accounts: &[AccountInfo],
  ) -> Result<()>

使用場景:
  - KYC/合規檢查
  - 黑名單/白名單
  - 動態手續費
  - 轉帳紀錄
  - 版稅執行
```

### 與 Ethereum ERC-20 Extensions 的比較

| 功能 | Token-2022 | Ethereum |
|------|-----------|----------|
| Transfer fee | 內建 extension | 自訂 ERC-20（如 SafeMoon） |
| 隱私轉帳 | 內建 (ElGamal) | Tornado Cash / zk-based |
| Transfer hook | 內建 extension | ERC-777 hooks / custom |
| Soulbound | Non-transferable ext | ERC-5192 / custom |
| Interest bearing | 內建 extension | Rebase tokens (custom) |
| Freeze authority | 兩版都支援 | Custom implementation |
| Metadata | Metadata pointer ext | ERC-721 tokenURI pattern |

Token-2022 的優勢：功能標準化、不需要每個專案自己實作、減少 audit 成本。

### Permanent Delegate

```
配置:
  mint 帳戶設定永久 delegate
  delegate 可以轉出/燒毀任何持有者的 tokens

使用場景:
  - 法幣穩定幣: 合規凍結/沒收
  - 遊戲道具: 回收機制
  - 機構代幣: 強制執行策略
```

### Non-Transferable (Soulbound)

```
配置:
  mint 設定 non_transferable extension
  token 只能 mint 和 burn
  無法 transfer 到其他帳戶

使用場景:
  - 身份認證 (KYC 證明)
  - 成就/徽章
  - 投票權 (不可交易)
  - 會員資格
```

## 程式碼範例

```typescript
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  getMintLen,
  createMint,
  createAssociatedTokenAccountIdempotent,
  mintTo,
  transferCheckedWithFee,
  getTransferFeeConfig,
  getMint,
} from "@solana/spl-token";

const connection = new Connection("https://api.mainnet-beta.solana.com");

// 建立帶 Transfer Fee 的 Token
async function createTransferFeeToken(
  connection: Connection,
  payer: Keypair,
  mintAuthority: Keypair,
  decimals: number,
  feeBasisPoints: number,   // 例: 250 = 2.5%
  maxFee: bigint
) {
  const mintKeypair = Keypair.generate();
  const extensions = [ExtensionType.TransferFeeConfig];
  const mintLen = getMintLen(extensions);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const tx = new Transaction().add(
    // 1. 建立帳戶
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    // 2. 初始化 transfer fee config
    createInitializeTransferFeeConfigInstruction(
      mintKeypair.publicKey,
      mintAuthority.publicKey,     // transfer fee config authority
      mintAuthority.publicKey,     // withdraw withheld authority
      feeBasisPoints,
      maxFee,
      TOKEN_2022_PROGRAM_ID
    ),
    // 3. 初始化 mint
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      mintAuthority.publicKey,
      null, // freeze authority
      TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(connection, tx, [payer, mintKeypair]);

  return {
    mint: mintKeypair.publicKey,
    feeBasisPoints,
    maxFee: maxFee.toString(),
  };
}

// Transfer with fee
async function transferWithFee(
  connection: Connection,
  payer: Keypair,
  source: any,
  destination: any,
  owner: Keypair,
  mint: any,
  amount: bigint,
  decimals: number
) {
  // 取得 fee config
  const mintInfo = await getMint(
    connection,
    mint,
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
  const feeConfig = getTransferFeeConfig(mintInfo);
  if (!feeConfig) {
    throw new Error("No transfer fee config found");
  }

  // 計算 fee
  const feeBps = feeConfig.newerTransferFee.transferFeeBasisPoints;
  const maxFee = feeConfig.newerTransferFee.maximumFee;
  const calculatedFee = (amount * BigInt(feeBps)) / 10000n;
  const fee = calculatedFee > maxFee ? maxFee : calculatedFee;

  const sig = await transferCheckedWithFee(
    connection,
    payer,
    source,
    mint,
    destination,
    owner,
    amount,
    decimals,
    fee,
    undefined,
    undefined,
    TOKEN_2022_PROGRAM_ID
  );

  return { signature: sig, fee: fee.toString() };
}
```

```rust
use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022};
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

declare_id!("TokExt111111111111111111111111111111111111");

#[program]
pub mod token_extensions_demo {
    use super::*;

    // 使用 Token-2022 進行轉帳（支援 extensions）
    pub fn transfer_with_extensions(
        ctx: Context<TransferExt>,
        amount: u64,
    ) -> Result<()> {
        // Token interface 支援 Token 和 Token-2022
        let cpi_accounts = token_2022::TransferChecked {
            from: ctx.accounts.source.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.destination.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        // transfer_checked 會自動處理 transfer fee extension
        token_2022::transfer_checked(
            cpi_ctx,
            amount,
            ctx.accounts.mint.decimals,
        )?;

        msg!("Transferred {} tokens (fees may apply)", amount);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct TransferExt<'info> {
    #[account(mut)]
    pub source: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub destination: InterfaceAccount<'info, TokenAccount>,
    pub authority: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}
```

## 相關概念

- [Token Accounts](/solana/account-model/token-accounts/) - Token-2022 帳戶結構的擴展
- [Programs](/solana/account-model/programs/) - Token-2022 作為鏈上程式
- [CPI](/solana/runtime/cpi/) - Transfer hooks 透過 CPI 呼叫自訂程式
- [Native Programs](/solana/runtime/native-programs/) - SPL Token 與 Token-2022 的關係
- [Solana Program Library](/solana/advanced/solana-program-library/) - SPL 生態中的 Token-2022
- [Compute Units](/solana/runtime/compute-units/) - Extensions 增加交易的 CU 消耗
- [PDA](/solana/account-model/pda/) - Transfer hook program 常使用 PDA
- [State Compression](/solana/advanced/state-compression/) - 另一種降低代幣成本的方式
- [ZK Compression](/solana/advanced/zk-compression/) - Light Token 的壓縮代幣方案
