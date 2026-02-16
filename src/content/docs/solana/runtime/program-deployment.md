---
title: "Program Deployment"
description: "Program Deployment, BPFLoaderUpgradeable, upgrade authority, buffer accounts, immutable programs"
tags: [solana, runtime, deployment, upgrade, bpf-loader, buffer]
---

# Program Deployment

## 概述

Solana 程式透過 `BPFLoaderUpgradeable` 部署到鏈上，採用 program account + programdata account 的分離模式。部署者持有 upgrade authority，可以更新程式 bytecode；撤銷 upgrade authority 後程式變為不可變（immutable）。部署成本與程式大小成正比，需要存入足夠的 lamports 以達到 [rent-exempt](/solana/account-model/rent/) 門檻。Buffer accounts 支援分階段上傳大型程式。

## 核心原理

### 部署架構

```
Program Account (可執行, 36 bytes)
  |-- owner: BPFLoaderUpgradeable
  |-- executable: true
  |-- data: [variant(2), programdata_address(32)]
  |
  +-> Programdata Account (存放 bytecode)
        |-- owner: BPFLoaderUpgradeable
        |-- data: [variant(2), slot(8), upgrade_authority(33), bytecode...]
        |-- 需要 rent-exempt
```

Program account 僅存放指向 programdata 的指標，實際 bytecode 儲存在 programdata account。這讓升級只需替換 programdata 內容，不影響 program address。

### 部署流程

```
1. 建立 Buffer Account
   |-- 分配空間 = bytecode 大小 + header
   |-- 從部署者帳戶轉入 rent-exempt lamports
   |
2. 分段寫入 Bytecode
   |-- 將 .so 檔分成 ~1KB chunks
   |-- 逐段寫入 buffer account
   |-- 大型程式可能需要多筆交易
   |
3. Deploy (finalize)
   |-- 建立 program account (executable = true)
   |-- 建立 programdata account
   |-- 從 buffer 複製 bytecode 到 programdata
   |-- 關閉 buffer account
   |
4. Verify
   |-- Verifier 靜態分析 bytecode
   |-- 通過後程式可被呼叫
```

### CLI 部署命令

```bash
# 部署程式
solana program deploy target/deploy/my_program.so

# 指定 keypair（確定性 program address）
solana program deploy target/deploy/my_program.so \
  --program-id ./my_program-keypair.json

# 檢視程式資訊
solana program show <PROGRAM_ID>

# 輸出範例:
# Program Id: 5kTP...
# Owner: BPFLoaderUpgradeab1e11111111111111111111111
# ProgramData Address: 7hJK...
# Authority: FE2c... (upgrade authority)
# Last Deployed In Slot: 123456
# Data Length: 245760 bytes
# Balance: 1.7 SOL (rent-exempt)
```

### 升級流程

```
1. 建立新 Buffer Account
   |-- 寫入新版 bytecode
   |
2. Upgrade
   |-- 驗證呼叫者 == upgrade authority
   |-- 替換 programdata 的 bytecode
   |-- 關閉舊 buffer
   |
3. 原子性
   |-- 升級在單筆交易中完成
   |-- 失敗不會影響舊版程式
```

升級不改變 program address，所有引用該 program 的交易和 CPI 無需修改。

### 不可變程式

撤銷 upgrade authority 讓程式永久不可變：

```bash
# 撤銷 upgrade authority（不可逆!）
solana program set-upgrade-authority <PROGRAM_ID> --final

# 之後無人可升級此程式
# upgrade_authority 欄位設為 None
```

不可變程式的優勢：
- 使用者可信任程式行為不會被改變
- 適合 DeFi 核心合約（如 AMM pool）
- 類似 Ethereum 不可升級的合約

### 部署成本

```
programdata 空間 = bytecode 大小 + 45 bytes (header)

rent-exempt 最低餘額 = rent_per_byte * space + 基礎費用

典型成本:
  小程式 (~50 KB):   ~0.35 SOL
  中程式 (~200 KB):  ~1.4 SOL
  大程式 (~500 KB):  ~3.5 SOL
  最大程式 (~10 MB): ~70 SOL
```

### Buffer Accounts

Buffer accounts 用於分階段部署：

| 操作 | 說明 |
|------|------|
| CreateBuffer | 建立空 buffer，分配空間 |
| Write | 分段寫入 bytecode chunks |
| Deploy | 從 buffer 部署到新 program |
| Upgrade | 從 buffer 升級既有 program |
| Close | 關閉 buffer，回收 rent |

Buffer 在部署/升級完成後應關閉，回收 lamports。未關閉的 buffer 佔用鏈上空間且鎖定資金。

### 與 Ethereum 合約部署的比較

| 特性 | Solana | Ethereum |
|------|--------|----------|
| 部署方式 | BPFLoaderUpgradeable | CREATE / CREATE2 |
| 可升級 | 原生支援（upgrade authority） | 需 Proxy pattern |
| 地址確定 | Keypair 或 PDA | CREATE2 + initcode hash |
| 大小限制 | ~10 MB | 24 KB (EIP-170) |
| 成本 | rent-exempt（一次性） | gas（一次性, 較昂貴） |
| 不可變 | 撤銷 upgrade authority | 不用 proxy 即不可變 |

## 程式碼範例

```typescript
import {
  Connection,
  PublicKey,
  Keypair,
} from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");

// 查詢程式的部署資訊
async function getProgramInfo(programId: string) {
  const pubkey = new PublicKey(programId);
  const accountInfo = await connection.getAccountInfo(pubkey);

  if (!accountInfo || !accountInfo.executable) {
    throw new Error("Not an executable program");
  }

  const data = accountInfo.data;
  // BPFLoaderUpgradeable program account: variant(4) + programdata_address(32)
  const programdataAddress = new PublicKey(data.slice(4, 36));

  const programdata = await connection.getAccountInfo(programdataAddress);
  if (!programdata) {
    throw new Error("Programdata account not found");
  }

  const pdData = programdata.data;
  // Programdata: variant(4) + slot(8) + option<authority>(1+32)
  const deploySlot = Number(pdData.readBigUInt64LE(4));
  const hasAuthority = pdData[12] === 1;
  const upgradeAuthority = hasAuthority
    ? new PublicKey(pdData.slice(13, 45)).toBase58()
    : null;

  const bytecodeOffset = 45;
  const bytecodeSize = programdata.data.length - bytecodeOffset;

  return {
    programId: pubkey.toBase58(),
    programdataAddress: programdataAddress.toBase58(),
    deploySlot,
    upgradeAuthority,
    isImmutable: !hasAuthority,
    bytecodeSize,
    rentLamports: programdata.lamports,
    rentSOL: programdata.lamports / 1e9,
  };
}

// 列出所有由特定 authority 控制的程式
async function findProgramsByAuthority(
  connection: Connection,
  authority: PublicKey
) {
  const BPF_LOADER_UPGRADEABLE = new PublicKey(
    "BPFLoaderUpgradeab1e11111111111111111111111"
  );

  // 使用 getProgramAccounts 搜尋
  const accounts = await connection.getProgramAccounts(
    BPF_LOADER_UPGRADEABLE,
    {
      filters: [
        { dataSize: 36 }, // Program account size
      ],
    }
  );

  const programs = [];
  for (const { pubkey, account } of accounts) {
    if (account.executable) {
      const programdataAddr = new PublicKey(account.data.slice(4, 36));
      const pd = await connection.getAccountInfo(programdataAddr);
      if (pd && pd.data[12] === 1) {
        const auth = new PublicKey(pd.data.slice(13, 45));
        if (auth.equals(authority)) {
          programs.push(pubkey.toBase58());
        }
      }
    }
  }

  return programs;
}
```

```rust
use anchor_lang::prelude::*;

declare_id!("Deploy11111111111111111111111111111111111111");

// Anchor deploy 設定範例 (Anchor.toml)
// [programs.devnet]
// my_program = "Deploy11111111111111111111111111111111111111"
//
// [provider]
// cluster = "devnet"
// wallet = "~/.config/solana/id.json"

#[program]
pub mod deployable_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.version = 1;
        config.initialized = true;
        msg!("Program initialized, version: {}", config.version);
        Ok(())
    }

    // 升級後可以增加新功能
    // program address 不變，只有 bytecode 更新
    pub fn upgrade_compatible_function(
        ctx: Context<UpgradeCheck>,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        msg!("Running on version: {}", config.version);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpgradeCheck<'info> {
    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub version: u16,
    pub initialized: bool,
}
```

## 相關概念

- [BPF/SBF](/solana/runtime/bpf-sbf/) - 被部署的 bytecode 格式
- [Programs](/solana/account-model/programs/) - 程式帳戶的結構與 owner
- [Rent](/solana/account-model/rent/) - 部署成本取決於 rent-exempt 門檻
- [Account Model](/solana/account-model/account-model-overview/) - Program 和 programdata 的帳戶關係
- [Native Programs](/solana/runtime/native-programs/) - BPF Loader 是負責部署的 Native Program
- [SVM/Sealevel](/solana/runtime/svm-sealevel/) - 部署的程式在 SVM 中執行
- [CPI](/solana/runtime/cpi/) - 部署的程式可被其他程式呼叫
- [Solana Program Library](/solana/advanced/solana-program-library/) - SPL 程式的部署與維護
