---
title: "Transaction Anatomy"
description: "Solana Transaction Anatomy, 交易結構, Signatures, Message, Header, Instructions"
tags: [solana, transactions, anatomy, message, signatures]
---

# Transaction Anatomy

## 概述

Solana 的交易（Transaction）是一個原子操作單元，由 **Signatures** 和 **Message** 兩部分組成。Message 內含 Header、Account Keys、Recent Blockhash 和 [Instructions](/solana/transactions/instructions/)。所有 instruction 在同一筆交易中原子執行——任何一個失敗，整筆交易 revert。Legacy 交易的最大尺寸為 1232 bytes（IPv6 MTU），而 SIMD-0296 提出的 v1 格式將上限提高至 4096 bytes。

## 核心原理

### Transaction 結構

一筆完整的 Solana 交易由以下兩層組成：

```
Transaction
  +-- signatures: Vec<Signature>    // 64 bytes each (Ed25519)
  +-- message: Message
        +-- header: MessageHeader
        +-- account_keys: Vec<Pubkey>   // 32 bytes each
        +-- recent_blockhash: Hash      // 32 bytes
        +-- instructions: Vec<CompiledInstruction>
```

### Signatures

每個 signature 是 64 bytes 的 [Ed25519](/solana/cryptography/ed25519/) 簽名，對 serialized message 進行簽署。簽名數量必須等於 `header.num_required_signatures`。第一個 signer 為 fee payer，負擔交易的 [base fee 和 priority fee](/solana/transactions/fees-priority/)。

### Message Header

Header 由三個 `u8` 欄位描述帳戶的角色分類：

| 欄位 | 說明 |
|------|------|
| `num_required_signatures` | 需要簽名的帳戶數量 |
| `num_readonly_signed_accounts` | 在簽名帳戶中，只讀的數量 |
| `num_readonly_unsigned_accounts` | 在未簽名帳戶中，只讀的數量 |

帳戶在 `account_keys` 陣列中按以下順序排列：

1. 可寫且已簽名（writable + signer）
2. 只讀且已簽名（readonly + signer）
3. 可寫且未簽名（writable + non-signer）
4. 只讀且未簽名（readonly + non-signer）

這種排序讓 runtime 能快速判定每個帳戶的權限，也是 [SVM/Sealevel](/solana/runtime/svm-sealevel/) 並行排程的基礎。

### Recent Blockhash

`recent_blockhash` 是最近 300 個 slot 內的某個 blockhash，用途包含：

- **防重放**：相同交易在 blockhash 過期後無法再次提交
- **有效期限**：約 300 slots（~2 分鐘），過期交易被丟棄
- **去重**：結合 blockhash 和 signatures 進行交易去重

若需要離線簽署或延遲提交，可改用 durable nonce 取代 recent blockhash（參見 [Transaction Signing](/solana/transactions/signing/)）。

### Compiled Instructions

每個 `CompiledInstruction` 以索引引用 `account_keys`：

```
CompiledInstruction {
    program_id_index: u8,       // account_keys 中 program 的索引
    accounts: Vec<u8>,          // account_keys 中各帳戶的索引
    data: Vec<u8>,              // 傳給 program 的 instruction data
}
```

一筆交易可包含多個 instruction，它們共用同一個 `account_keys` 表，達到帳戶去重和空間壓縮的效果。

### 大小限制

| 項目 | 限制 |
|------|------|
| Legacy/v0 交易大小 | 1232 bytes（IPv6 minimum MTU） |
| SIMD-0296 v1 格式 | 4096 bytes |
| 帳戶數量（legacy） | ~35 個（受限於 1232 bytes） |
| 帳戶數量（v0 + ALT） | 256 個（u8 索引） |
| Instructions 數量 | 無固定上限，受 size 和 [Compute Units](/solana/runtime/compute-units/) 限制 |

### SIMD-0296: v1 Transaction Format

SIMD-0296 提案引入新的 v1 交易格式，將大小上限從 1232 bytes 提高到 4096 bytes：

- 使用 QUIC 傳輸（不受 UDP MTU 限制）
- 支援更多帳戶和更大的 instruction data
- 向後相容，v0 交易持續有效

## 程式碼範例

```typescript
import {
  Connection,
  Transaction,
  TransactionMessage,
  SystemProgram,
  PublicKey,
  Keypair,
} from "@solana/web3.js";

// --- 建構 Legacy Transaction ---
const connection = new Connection("https://api.mainnet-beta.solana.com");
const payer = Keypair.generate();

const legacyTx = new Transaction();
legacyTx.add(
  SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: new PublicKey("11111111111111111111111111111112"),
    lamports: 1_000_000,
  })
);
legacyTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
legacyTx.feePayer = payer.publicKey;

// 檢視交易結構
const compiledMessage = legacyTx.compileMessage();
const header = compiledMessage.header;

// header 資訊
// header.numRequiredSignatures: 需要的簽名數
// header.numReadonlySignedAccounts: 只讀已簽名帳戶數
// header.numReadonlyUnsignedAccounts: 只讀未簽名帳戶數

// 檢查交易大小是否在限制內
const serialized = legacyTx.serialize({
  requireAllSignatures: false,
  verifySignatures: false,
});
const txSize = serialized.length;
// txSize 必須 <= 1232 bytes
```

```rust
// Anchor program: 從 instruction context 存取交易資訊
use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod tx_anatomy_example {
    use super::*;

    pub fn process_transfer(ctx: Context<Transfer>, amount: u64) -> Result<()> {
        // 每個 instruction 可存取其帳戶列表
        let from = &ctx.accounts.from;
        let to = &ctx.accounts.to;

        // 驗證 signer
        require!(from.is_signer, ErrorCode::MissingSigner);

        // 執行轉帳邏輯
        **from.try_borrow_mut_lamports()? -= amount;
        **to.try_borrow_mut_lamports()? += amount;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Transfer<'info> {
    #[account(mut, signer)]
    pub from: AccountInfo<'info>,
    #[account(mut)]
    pub to: AccountInfo<'info>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Missing required signer")]
    MissingSigner,
}
```

## 相關概念

- [Instructions](/solana/transactions/instructions/) - 交易內的個別操作單元
- [Transaction Signing](/solana/transactions/signing/) - Ed25519 簽名流程與多方簽署
- [Versioned Transactions](/solana/transactions/versioned-transactions/) - v0 格式與 Address Lookup Tables
- [Transaction Fees and Priority Fees](/solana/transactions/fees-priority/) - 費用計算與 Compute Budget
- [Transaction Errors](/solana/transactions/transaction-errors/) - Blockhash 過期等常見錯誤
- [Solana Transaction Lifecycle](/solana/transactions/transaction-lifecycle-solana/) - 從提交到確認的完整流程
- [Account Model](/solana/account-model/account-model-overview/) - 帳戶在交易中的角色
- [SVM/Sealevel](/solana/runtime/svm-sealevel/) - 交易的並行執行引擎
- [Compute Units](/solana/runtime/compute-units/) - 計算資源限制
- [Transaction Construction (ETH)](/ethereum/transaction-lifecycle/transaction-construction/) - Ethereum 交易構建的比較
