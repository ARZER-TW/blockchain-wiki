---
title: "BPF and SBF Bytecode"
description: "BPF, SBF, eBPF, Solana Bytecode Format, LLVM, register-based VM, program compilation"
tags: [solana, runtime, bpf, sbf, bytecode, llvm, compilation]
---

# BPF and SBF Bytecode

## 概述

SBF（Solana Bytecode Format）源自 Linux 核心的 eBPF（extended Berkeley Packet Filter），是 Solana 程式的執行格式。eBPF 最初設計用於核心封包過濾，其高效的 register-based 架構被 Solana 借鑒並擴展為區塊鏈專用的 bytecode 格式。開發者以 Rust 或 C 撰寫程式，經 LLVM 編譯為 SBF bytecode，部署到鏈上由 [SVM](/solana/runtime/svm-sealevel/) 執行。

## 核心原理

### 從 eBPF 到 SBF

演進路線：

```
BPF (1992)          -> 封包過濾, 32-bit, 2 registers
  |
eBPF (2014)         -> 擴展版, 64-bit, 11 registers, JIT
  |
SBF (Solana fork)   -> 區塊鏈專用: 確定性執行, syscalls, compute metering
```

SBF 對 eBPF 的修改：
- 移除非確定性指令（如浮點運算）
- 新增 blockchain-specific syscalls（logging, CPI, crypto）
- 加入 compute unit metering
- 自訂 memory layout（heap, stack, input region）

### Register 架構

SBF 使用 11 個 64-bit registers：

| Register | 用途 |
|----------|------|
| r0 | 函式回傳值 / syscall 回傳碼 |
| r1 - r5 | 函式引數（caller-saved） |
| r6 - r9 | 通用（callee-saved） |
| r10 | Frame pointer（唯讀） |

與 EVM stack-based 架構的對比：

```
SBF (Register-based):
  add r1, r2, r3    // r1 = r2 + r3（直接存取）
  mov r0, r1        // return value

EVM (Stack-based):
  PUSH 3            // stack: [3]
  PUSH 2            // stack: [2, 3]
  ADD               // stack: [5]（pop 兩個, push 結果）
```

Register-based 指令數更少，執行效率更高。

### 編譯 Pipeline

```
Rust / C 原始碼
    |
    v
LLVM Frontend (rustc / clang)
    |
    v
LLVM IR (中間表示)
    |
    v
SBF Backend (solana-llvm)
    |
    v
SBF Object File (.so)
    |
    v
BPF Verifier（靜態分析）
    |
    v
JIT / Interpreter 執行
```

關鍵工具鏈：

| 工具 | 說明 |
|------|------|
| `cargo build-sbf` | 取代舊的 `cargo build-bpf` |
| `solana-llvm` | Solana fork 的 LLVM，含 SBF target |
| `rbpf` | Rust 實作的 BPF VM（JIT + interpreter） |

### Verifier 靜態分析

程式部署前，verifier 進行靜態檢查：

- **無界迴圈禁止**：所有迴圈必須有明確的 bound
- **記憶體越界檢查**：所有存取必須在合法區域內
- **指令合法性**：只允許 SBF 定義的 opcode
- **Stack depth**：確保不會 stack overflow
- **無未定義行為**：禁止除零、非法 shift 等

驗證失敗的程式無法部署。

### Syscalls

SBF 程式透過 syscalls 與 Solana runtime 互動：

| Syscall | 功能 | CU 成本 |
|---------|------|---------|
| `sol_log` | 輸出日誌 | ~100 |
| `sol_invoke_signed` | [CPI](/solana/runtime/cpi/) 呼叫 | ~1000+ |
| `sol_create_program_address` | 計算 PDA | ~1500 |
| `sol_sha256` | SHA-256 hash | ~200+len |
| `sol_keccak256` | Keccak-256 hash | ~200+len |
| `sol_secp256k1_recover` | 恢復 secp256k1 pubkey | ~25000 |
| `sol_get_clock_sysvar` | 取得 Clock sysvar | ~100 |
| `sol_set_return_data` | 設定回傳資料 | ~100 |

### Memory Layout

SBF 程式的記憶體空間：

```
0x100000000  +------------------+
             | Input Region     |  (帳戶資料, instruction data)
0x200000000  +------------------+
             | Stack            |  (4KB per frame, max 64 frames)
0x300000000  +------------------+
             | Heap             |  (32KB default, max 256KB)
0x400000000  +------------------+
             | Program Code     |  (唯讀)
             +------------------+
```

### BPF Loader 版本

| Loader | 特性 |
|--------|------|
| BPF Loader v2 | 舊版，程式不可升級 |
| BPFLoaderUpgradeable | 支援升級，program + programdata 分離 |
| Loader v4（開發中） | 更高效的部署和執行 |

BPFLoaderUpgradeable 是目前主流，program account 儲存 programdata address，programdata account 儲存實際 bytecode。

## 程式碼範例

```rust
// Anchor program 編譯流程範例
use anchor_lang::prelude::*;

declare_id!("SBFDemo1111111111111111111111111111111111111");

#[program]
pub mod sbf_demo {
    use super::*;

    // 此函式編譯後變成 SBF bytecode
    // LLVM 將 Rust 轉換為 register-based 指令
    pub fn initialize(ctx: Context<Initialize>, data: u64) -> Result<()> {
        let account = &mut ctx.accounts.data_account;
        account.value = data;
        account.authority = ctx.accounts.authority.key();
        account.bump = ctx.bumps.data_account;

        // sol_log syscall: 輸出到 validator 日誌
        msg!("Initialized with value: {}", data);

        Ok(())
    }

    pub fn compute_hash(ctx: Context<ComputeHash>, input: Vec<u8>) -> Result<()> {
        // sol_sha256 syscall
        let hash = anchor_lang::solana_program::hash::hash(&input);
        msg!("SHA-256: {:?}", hash);

        // 這些操作在 SBF VM 中以 register 指令執行
        let account = &mut ctx.accounts.data_account;
        account.value = u64::from_le_bytes(
            hash.to_bytes()[..8].try_into().unwrap()
        );

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + DataAccount::INIT_SPACE,
        seeds = [b"data", authority.key().as_ref()],
        bump,
    )]
    pub data_account: Account<'info, DataAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ComputeHash<'info> {
    #[account(mut, has_one = authority)]
    pub data_account: Account<'info, DataAccount>,
    pub authority: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct DataAccount {
    pub value: u64,
    pub authority: Pubkey,
    pub bump: u8,
}
```

```typescript
import { Connection, PublicKey } from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");

// 查詢程式帳戶資訊，檢視 BPF Loader 類型
async function inspectProgram(programId: string) {
  const pubkey = new PublicKey(programId);
  const accountInfo = await connection.getAccountInfo(pubkey);

  if (!accountInfo) {
    throw new Error("Program not found");
  }

  // 程式帳戶的 owner 是 BPF Loader
  const owner = accountInfo.owner.toBase58();
  const isUpgradeable =
    owner === "BPFLoaderUpgradeab1e11111111111111111111111";
  const isLegacy = owner === "BPFLoader2111111111111111111111111111111111";

  // 如果是 upgradeable，data 包含 programdata address
  if (isUpgradeable && accountInfo.data.length >= 36) {
    const programdataAddress = new PublicKey(accountInfo.data.slice(4, 36));
    const programdata = await connection.getAccountInfo(programdataAddress);

    return {
      loader: "BPFLoaderUpgradeable",
      programdataAddress: programdataAddress.toBase58(),
      bytecodeSize: programdata ? programdata.data.length - 45 : 0,
      isExecutable: accountInfo.executable,
    };
  }

  return {
    loader: isLegacy ? "BPFLoader2" : owner,
    bytecodeSize: accountInfo.data.length,
    isExecutable: accountInfo.executable,
  };
}
```

## 相關概念

- [SVM/Sealevel](/solana/runtime/svm-sealevel/) - 執行 SBF bytecode 的虛擬機和並行引擎
- [Programs](/solana/account-model/programs/) - 部署在鏈上的 SBF 程式
- [Compute Units](/solana/runtime/compute-units/) - SBF 指令的計算成本計量
- [Program Deployment](/solana/runtime/program-deployment/) - BPF bytecode 的部署流程
- [CPI](/solana/runtime/cpi/) - SBF 程式間透過 syscall 互相呼叫
- [Native Programs](/solana/runtime/native-programs/) - 非 SBF 的原生系統程式
- [Rent](/solana/account-model/rent/) - 部署 bytecode 的儲存成本
- [Ed25519](/solana/cryptography/ed25519/) - SBF 可呼叫的密碼學 syscall
