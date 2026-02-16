---
title: "Ed25519 Precompile"
description: "Solana native program for on-chain Ed25519 signature verification"
tags: [solana, cryptography, ed25519, precompile, native-program]
---

# Ed25519 Precompile

## 概述

Ed25519 Precompile 是 Solana 的原生程式（Native Program），允許在鏈上驗證 [Ed25519](/solana/cryptography/ed25519/) 簽名。程式地址為 `Ed25519SigVerify111111111111111111111111111`。與直接在智能合約中實作簽名驗證不同，使用原生 precompile 大幅降低計算成本——每次驗證僅需約 5,000 lamports 的計算預算。這使得鏈下簽名的鏈上驗證成為可行的設計模式。

## 核心原理

### 運作機制

Ed25519 Precompile 不像一般 Solana 程式那樣被直接呼叫。它的 instruction 被放入交易中，由 runtime 在交易執行前統一驗證。如果驗證失敗，整筆交易會被拒絕。

流程如下：

1. 構建 Ed25519 verification instruction，包含簽名、公鑰、訊息的 offset 資訊
2. 將此 instruction 與業務邏輯 instruction 放入同一筆交易
3. Runtime 在執行任何 instruction 之前驗證所有 Ed25519 instructions
4. 業務邏輯程式透過 `load_instruction_at` 檢查同一交易中是否存在成功的驗證

### Instruction Data 格式

Ed25519 instruction 的 data layout 如下：

| Offset | 大小 | 欄位 | 說明 |
|--------|------|------|------|
| 0 | 1 byte | `num_signatures` | 本次驗證的簽名數量 |
| 1 | 1 byte | `padding` | 填充（必須為 0） |
| 2+ | 每組 14 bytes | Signature offsets | 每組簽名的 offset 結構 |

每組 signature offset 結構（14 bytes）：

| Offset | 大小 | 欄位 |
|--------|------|------|
| 0 | 2 bytes | `signature_offset` |
| 2 | 2 bytes | `signature_instruction_index` |
| 4 | 2 bytes | `public_key_offset` |
| 6 | 2 bytes | `public_key_instruction_index` |
| 8 | 2 bytes | `message_data_offset` |
| 10 | 2 bytes | `message_data_size` |
| 12 | 2 bytes | `message_instruction_index` |

`instruction_index` 欄位指向交易中哪個 instruction 的 data 包含對應的資料。設為 `0xFFFF` 表示使用當前 instruction 自身的 data。

### 成本分析

| 操作 | Compute Units |
|------|---------------|
| 每次簽名驗證 | ~5,000 CU |
| 基礎交易成本 | 5,000 lamports |
| 單筆交易 CU 上限 | 1,400,000 CU |

相比在 BPF 程式中用 Rust 實作 Ed25519 驗證（數十萬 CU），precompile 方式節省約 98% 的計算資源。

### 使用場景

1. **Airdrop 與白名單驗證**：伺服器用私鑰簽署允許列表，鏈上驗證簽名
2. **Oracle 簽名**：價格預言機用 Ed25519 簽署資料，合約驗證真實性
3. **鏈下授權**：dApp 後端簽署授權訊息，合約驗證使用者是否獲准操作
4. **Gasless 交易**：中繼者驗證使用者的鏈下簽名後代為提交

### 與交易簽名的區別

交易的 Ed25519 簽名和 Ed25519 Precompile 驗證是兩件不同的事：

- **交易簽名**：由錢包自動處理，驗證者在共識層驗證，用於確認交易發送者
- **Precompile 驗證**：應用層的任意 Ed25519 簽名驗證，用於業務邏輯（如驗證 oracle 簽名）

## 程式碼範例

### TypeScript（@solana/web3.js）

```typescript
import {
  Connection,
  Keypair,
  Transaction,
  Ed25519Program,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import nacl from 'tweetnacl';

// 建立驗證用的 Ed25519 instruction
const signer = Keypair.generate();
const message = Buffer.from('Claim airdrop for wallet XYZ');

// 鏈下簽名
const signature = nacl.sign.detached(message, signer.secretKey);

// 建立 Ed25519 verification instruction
const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
  publicKey: signer.publicKey.toBytes(),
  message: message,
  signature: signature,
});

// 組合交易：先 Ed25519 驗證，再執行業務邏輯
const tx = new Transaction();
tx.add(ed25519Ix);
tx.add(
  new TransactionInstruction({
    keys: [
      { pubkey: signer.publicKey, isSigner: false, isWritable: false },
    ],
    programId: YOUR_PROGRAM_ID,
    data: Buffer.from([/* claim instruction data */]),
  })
);

// 發送交易（runtime 會先驗證 Ed25519 instruction）
const connection = new Connection('https://api.mainnet-beta.solana.com');
const payer = Keypair.generate();
await sendAndConfirmTransaction(connection, tx, [payer]);
```

### Rust / Anchor（鏈上程式驗證 Ed25519 instruction 存在）

```rust
use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::{
    self, load_instruction_at_checked,
};
use anchor_lang::solana_program::ed25519_program;

#[program]
pub mod claim_program {
    use super::*;

    pub fn claim_airdrop(
        ctx: Context<ClaimAirdrop>,
        expected_signer: [u8; 32],
    ) -> Result<()> {
        // 從 instructions sysvar 載入前一個 instruction
        let ix_sysvar = &ctx.accounts.instruction_sysvar;
        let ed25519_ix = load_instruction_at_checked(0, ix_sysvar)
            .map_err(|_| ErrorCode::MissingEd25519Instruction)?;

        // 確認是 Ed25519 program
        require_keys_eq!(
            ed25519_ix.program_id,
            ed25519_program::ID,
            ErrorCode::InvalidProgram
        );

        // 解析 instruction data 驗證公鑰
        let sig_data = &ed25519_ix.data;
        require!(sig_data.len() > 16, ErrorCode::InvalidInstructionData);

        // 提取公鑰 offset 並驗證
        let pubkey_offset = u16::from_le_bytes(
            [sig_data[6], sig_data[7]]
        ) as usize;
        let pubkey_bytes = &sig_data[pubkey_offset..pubkey_offset + 32];
        require!(
            pubkey_bytes == &expected_signer,
            ErrorCode::UnauthorizedSigner
        );

        msg!("Ed25519 signature verified on-chain");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct ClaimAirdrop<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,
    /// CHECK: instruction sysvar
    #[account(address = instructions::ID)]
    pub instruction_sysvar: AccountInfo<'info>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Missing Ed25519 verification instruction")]
    MissingEd25519Instruction,
    #[msg("Invalid program in instruction")]
    InvalidProgram,
    #[msg("Invalid instruction data")]
    InvalidInstructionData,
    #[msg("Unauthorized signer")]
    UnauthorizedSigner,
}
```

## 相關概念

- [Ed25519](/solana/cryptography/ed25519/) - Ed25519 簽章演算法的數學原理
- [Secp256k1 Precompile](/solana/cryptography/secp256k1-precompile/) - Ethereum 相容的 secp256k1 簽名驗證
- [數位簽章概述](/fundamentals/cryptography/digital-signature-overview/) - 數位簽章的通用安全性質
- [ecrecover (Ethereum)](/ethereum/cryptography/ecrecover/) - Ethereum 的簽名恢復 precompile
- [Precompiled Contracts (Ethereum)](/ethereum/advanced/precompiled-contracts/) - Ethereum 的 precompile 設計
- [Instructions](/solana/transactions/instructions/) - Solana instruction 格式與組合
- [Native Programs](/solana/runtime/native-programs/) - Solana 原生程式概覽
- [Programs](/solana/account-model/programs/) - Solana 程式與合約架構
- [PDA](/solana/account-model/pda/) - 搭配 Ed25519 precompile 常用的地址模式
