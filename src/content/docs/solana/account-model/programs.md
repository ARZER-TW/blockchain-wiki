---
title: "Programs (Smart Contracts)"
description: "Solana programs - stateless executable accounts that define on-chain logic"
tags: [solana, account-model, programs, smart-contracts, BPF, upgradeable]
---

# Programs (Smart Contracts)

## 概述

Solana 的「程式」（Programs）等同於其他鏈上的「智能合約」。程式是 `executable = true` 的帳戶，包含編譯後的 BPF/SBF bytecode。Solana 程式的核心設計哲學是**無狀態**（stateless）——程式本身不儲存任何可變狀態，所有狀態都存放在獨立的資料帳戶中，由程式透過 owner 關係控制。這種分離使得 [Sealevel](/solana/runtime/svm-sealevel/) 能平行執行不衝突的交易。

## 核心原理

### 程式即帳戶

程式帳戶的結構：

| 欄位 | 值 |
|------|-----|
| `lamports` | Rent-exempt 的最低餘額 |
| `data` | 編譯後的 BPF/SBF bytecode |
| `owner` | BPF Loader（`BPFLoader2111111111111111111111111111111` 或 `BPFLoaderUpgradeab1e11111111111111111111111`） |
| `executable` | `true` |

程式的地址（Program ID）就是這個帳戶的公鑰。其他帳戶透過 `owner` 欄位指向此 Program ID，建立 ownership 關係。

### 無狀態架構

Solana 程式在執行時接收一組帳戶作為輸入：

```
Transaction:
  Instruction:
    program_id: MyProgram
    accounts: [AccountA(rw), AccountB(r), AccountC(rw)]
    data: [instruction_data...]
```

程式讀寫這些帳戶的 `data` 欄位——但程式自身的 `data` 不會被修改。這與 Ethereum 合約呼叫 `SSTORE` 修改自身 storage 的模式根本不同。

### BPF Loader

Solana 有兩個主要的 BPF Loader：

| Loader | 地址 | 特性 |
|--------|------|------|
| BPF Loader 2 | `BPFLoader2111...` | 不可升級，部署後 bytecode 固定 |
| BPF Loader Upgradeable | `BPFLoaderUpgradeab1e...` | 可升級，支援 upgrade authority |

#### Upgradeable Program 結構

可升級程式使用三個帳戶：

```
Program Account (executable=true)
  └── points to -> Program Data Account (contains bytecode)
                     └── upgrade_authority: Pubkey | None

Buffer Account (用於部署/升級過程的暫存)
```

- **Program Account**：固定地址，`data` 欄位指向 Program Data Account
- **Program Data Account**：儲存實際 bytecode + upgrade authority
- **Buffer Account**：部署或升級時先將 bytecode 寫入 buffer，再原子性替換

### 部署流程

```
1. solana program deploy program.so
   ├── 建立 Buffer Account
   ├── 分多次將 bytecode 寫入 Buffer
   ├── 建立 Program Account + Program Data Account
   └── 將 Buffer 內容複製到 Program Data
```

部署後的 bytecode 大小決定了帳戶的 rent-exempt 門檻。一個 100 KB 的程式大約需要 ~0.7 SOL 的 rent-exempt 費用。

### 升級與凍結

可升級程式的 upgrade authority 可以執行：

1. **Upgrade**：替換 bytecode（新版本大小可不同，但不能超過 buffer 預留空間）
2. **Set Authority**：轉移升級權限給另一個地址
3. **Freeze**：將 upgrade authority 設為 `None`，永久凍結程式（不可逆）

凍結後的程式行為等同於不可升級程式——用戶可以信任其邏輯不會改變。

### Program ID 與 PDA

程式的 Program ID 是一個普通的 [Ed25519](/solana/cryptography/ed25519/) 公鑰。程式可以透過 [PDA（Program Derived Address）](/solana/account-model/pda/) 衍生出確定性地址：

$$\text{PDA} = \text{findProgramAddress}(\text{seeds}, \text{program\_id})$$

PDA 不在 Ed25519 曲線上（沒有私鑰），因此只有程式自身可以透過 [CPI](/solana/runtime/cpi/) 為其「簽名」。

### Anchor Framework

Anchor 是 Solana 最流行的程式開發框架，提供：

- **Discriminator**：自動為每個 instruction 和 account type 生成 8-byte 識別碼
- **Account validation**：宣告式的帳戶約束（`#[account(mut, has_one = authority)]`）
- **Serialization**：自動 [Borsh 序列化](/solana/account-model/account-data-serialization/)
- **Error handling**：結構化錯誤碼
- **IDL generation**：自動生成 Interface Definition Language 供前端使用

### 執行環境

程式在 [SVM/Sealevel](/solana/runtime/svm-sealevel/) 虛擬機中執行：

- 編譯目標：[BPF/SBF](/solana/runtime/bpf-sbf/)（Solana Berkeley Filter）
- Compute Units 預算：每筆交易 1,400,000 CU（每個 instruction 預設 200,000 CU）
- 記憶體：stack 4 KB，heap 32 KB
- 不可直接存取網路、檔案系統等外部資源

### 與 Ethereum Smart Contract 的比較

| 面向 | Solana Program | [Ethereum Contract](/ethereum/accounts/contract-account/) |
|------|---------------|----------------------------------------------|
| 狀態儲存 | 外部帳戶 | 合約內 storage slots |
| 升級 | Upgrade authority | Proxy pattern (UUPS/Transparent) |
| 執行 | BPF/SBF | EVM bytecode |
| 語言 | Rust, C | Solidity, Vyper |
| 部署成本 | Rent-exempt SOL | Gas (CREATE/CREATE2) |
| 平行執行 | Sealevel 原生支援 | 困難 |

## 程式碼範例

### TypeScript（部署與互動）

```typescript
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');

// 檢查帳戶是否為可執行程式
async function isProgram(pubkey: PublicKey): Promise<boolean> {
  const info = await connection.getAccountInfo(pubkey);
  return info?.executable ?? false;
}

// 呼叫程式
async function callProgram(
  payer: Keypair,
  programId: PublicKey,
  accounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[],
  data: Buffer,
) {
  const ix = new TransactionInstruction({
    programId,
    keys: accounts,
    data,
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
  console.log('Transaction:', sig);
}

// 查詢程式的 upgrade authority
async function getUpgradeAuthority(programId: PublicKey) {
  const programInfo = await connection.getAccountInfo(programId);
  if (!programInfo) return null;

  // Program account 的 data 指向 program data account
  const programDataAddress = new PublicKey(programInfo.data.slice(4, 36));
  const programData = await connection.getAccountInfo(programDataAddress);

  if (!programData) return null;
  // Offset 13: 1 byte option + 32 bytes pubkey
  const hasAuthority = programData.data[12] === 1;
  if (hasAuthority) {
    return new PublicKey(programData.data.slice(13, 45));
  }
  return null; // frozen
}
```

### Rust / Anchor（基本程式結構）

```rust
use anchor_lang::prelude::*;

declare_id!("MyProg111111111111111111111111111111111111");

#[program]
pub mod my_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, value: u64) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.authority = ctx.accounts.authority.key();
        state.value = value;
        state.bump = ctx.bumps.state;
        msg!("Initialized with value: {}", value);
        Ok(())
    }

    pub fn update(ctx: Context<Update>, new_value: u64) -> Result<()> {
        let state = &mut ctx.accounts.state;
        msg!("Value updated: {} -> {}", state.value, new_value);
        state.value = new_value;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + State::INIT_SPACE,
        seeds = [b"state", authority.key().as_ref()],
        bump,
    )]
    pub state: Account<'info, State>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Update<'info> {
    #[account(
        mut,
        seeds = [b"state", authority.key().as_ref()],
        bump = state.bump,
        has_one = authority,
    )]
    pub state: Account<'info, State>,
    pub authority: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct State {
    pub authority: Pubkey,  // 32
    pub value: u64,         // 8
    pub bump: u8,           // 1
}
```

## 相關概念

- [Account Model](/solana/account-model/account-model-overview/) - 帳戶模型全貌與程式的角色
- [PDA](/solana/account-model/pda/) - 程式衍生地址的建立與用途
- [Account Data Serialization](/solana/account-model/account-data-serialization/) - Borsh 序列化與 Anchor discriminator
- [System Program](/solana/account-model/system-program/) - 帳戶建立的基礎設施
- [SVM/Sealevel](/solana/runtime/svm-sealevel/) - 程式的執行環境與平行化
- [BPF/SBF](/solana/runtime/bpf-sbf/) - 程式的編譯目標與虛擬機
- [CPI](/solana/runtime/cpi/) - 程式之間的跨程式呼叫
- [Token Accounts](/solana/account-model/token-accounts/) - SPL Token Program 的具體案例
- [Contract Account (Ethereum)](/ethereum/accounts/contract-account/) - Ethereum 智能合約的對比
- [Instructions](/solana/transactions/instructions/) - 程式如何被 instruction 呼叫
