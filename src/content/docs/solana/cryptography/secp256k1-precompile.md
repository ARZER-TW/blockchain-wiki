---
title: "Secp256k1 Precompile"
description: "Solana native program for Ethereum-compatible secp256k1 ECDSA signature verification"
tags: [solana, cryptography, secp256k1, precompile, cross-chain, ECDSA]
---

# Secp256k1 Precompile

## 概述

Secp256k1 Precompile 是 Solana 的原生程式，提供 Ethereum 相容的 [ECDSA](/fundamentals/cryptography/ecdsa/) 簽名驗證功能。程式地址為 `KeccakSecp256k11111111111111111111111111111`。它在 Solana 上實現了等效於 Ethereum 的 [ecrecover](/ethereum/cryptography/ecrecover/) 功能——從 ECDSA 簽名中恢復 [secp256k1](/fundamentals/cryptography/secp256k1/) 公鑰。這使得跨鏈訊息驗證成為可能，是 Wormhole 等跨鏈橋的核心基礎設施。

## 核心原理

### 為什麼 Solana 需要 secp256k1？

Solana 原生使用 [Ed25519](/solana/cryptography/ed25519/) 簽章，但跨鏈互操作性要求能驗證來自 Ethereum 生態系統的簽名：

- **跨鏈橋**：Wormhole Guardian 使用 secp256k1 簽署跨鏈訊息（VAA）
- **Ethereum 地址驗證**：證明使用者擁有某個 Ethereum 地址
- **多鏈 dApp**：允許 Ethereum 使用者用 MetaMask 簽名在 Solana 上操作

### 運作機制

與 [Ed25519 Precompile](/solana/cryptography/ed25519-precompile/) 類似，Secp256k1 Precompile 的 instruction 由 runtime 在交易執行前統一處理：

1. 構建 secp256k1 verification instruction
2. Runtime 執行 ECDSA ecrecover：從簽名 $(r, s, v)$ 和訊息雜湊恢復公鑰
3. 將恢復的公鑰與預期的 Ethereum 地址比對
4. 驗證失敗則整筆交易被拒絕

### ECDSA ecrecover 數學

給定 ECDSA 簽名 $(r, s, v)$ 和訊息雜湊 $z$：

1. 從 $r$ 和 $v$ 恢復簽名點 $R$
2. 計算公鑰：$Q = r^{-1}(s \cdot R - z \cdot G)$
3. 驗證：$Q$ 即為簽名者的公鑰

Ethereum 地址 = 公鑰的 Keccak-256 hash 的最後 20 bytes：

$$\text{addr} = \text{Keccak256}(Q_x \| Q_y)[12:]$$

### Instruction Data 格式

| Offset | 大小 | 欄位 |
|--------|------|------|
| 0 | 1 byte | `num_signatures` |
| 1 | 1 byte | `padding` |
| 2+ | 每組 11 bytes | Signature offsets |

每組 offset 結構：

| Offset | 大小 | 欄位 |
|--------|------|------|
| 0 | 2 bytes | `eth_address_offset` |
| 2 | 1 byte | `eth_address_instruction_index` |
| 3 | 2 bytes | `signature_offset` |
| 5 | 1 byte | `signature_instruction_index` |
| 6 | 2 bytes | `message_data_offset` |
| 8 | 2 bytes | `message_data_size` |
| 10 | 1 byte | `message_instruction_index` |

簽名資料包含 64 bytes 的 $(r, s)$ 加上 1 byte 的 recovery id $v$。

### 成本與限制

| 項目 | 數值 |
|------|------|
| 每次 ecrecover | ~25,000 CU |
| 包含 Keccak-256 雜湊 | 已含在內 |
| 單筆交易 CU 上限 | 1,400,000 CU |

注意：secp256k1 驗證比 Ed25519 貴約 5 倍，因為 ECDSA ecrecover 的計算複雜度更高。

### 跨鏈應用：Wormhole 案例

Wormhole 的 Guardian Network 使用 secp256k1 簽名驗證跨鏈訊息：

1. **觀察**：Guardian 節點觀察到源鏈上的事件（如 Ethereum 上的 token lock）
2. **簽名**：$\frac{2}{3}+1$ 的 Guardian 用 secp256k1 私鑰簽署 VAA（Verified Action Approval）
3. **提交**：Relayer 將 VAA 提交到 Solana
4. **驗證**：Solana 程式使用 Secp256k1 Precompile 驗證 Guardian 簽名
5. **執行**：驗證通過後釋放目標鏈上的資產

## 程式碼範例

### TypeScript（@solana/web3.js）

```typescript
import {
  Connection,
  Keypair,
  Transaction,
  Secp256k1Program,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { ethers } from 'ethers';
import { keccak256 } from 'ethers';

// 使用 Ethereum 錢包簽名
const ethWallet = ethers.Wallet.createRandom();
const ethAddress = ethWallet.address;

// 構建訊息
const message = Buffer.from('Verify Ethereum ownership on Solana');

// 用 Ethereum 私鑰簽名（ECDSA/secp256k1）
const messageHash = keccak256(message);
const ethSignature = ethWallet.signingKey.sign(messageHash);

// 構建 Solana 的 secp256k1 verification instruction
const secp256k1Ix = Secp256k1Program.createInstructionWithEthAddress({
  ethAddress: ethAddress,
  message: message,
  signature: Buffer.from(ethSignature.serialized.slice(2), 'hex').slice(0, 64),
  recoveryId: ethSignature.v - 27,
});

// 組合交易
const tx = new Transaction();
tx.add(secp256k1Ix);
// 加入業務邏輯 instruction...

const connection = new Connection('https://api.mainnet-beta.solana.com');
const payer = Keypair.generate();
await sendAndConfirmTransaction(connection, tx, [payer]);
```

### Rust / Anchor（鏈上驗證 secp256k1 instruction）

```rust
use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::{
    self, load_instruction_at_checked,
};
use anchor_lang::solana_program::secp256k1_program;

#[program]
pub mod cross_chain_verifier {
    use super::*;

    pub fn verify_eth_signature(
        ctx: Context<VerifyEth>,
        expected_eth_address: [u8; 20],
    ) -> Result<()> {
        let ix_sysvar = &ctx.accounts.instruction_sysvar;

        // 載入 secp256k1 instruction（假設在 index 0）
        let secp_ix = load_instruction_at_checked(0, ix_sysvar)
            .map_err(|_| ErrorCode::MissingSecp256k1Instruction)?;

        // 確認是 secp256k1 program
        require_keys_eq!(
            secp_ix.program_id,
            secp256k1_program::ID,
            ErrorCode::InvalidProgram
        );

        // 解析 instruction data 中的 Ethereum 地址
        let data = &secp_ix.data;
        require!(data.len() > 12, ErrorCode::InvalidData);

        let eth_addr_offset = u16::from_le_bytes(
            [data[2], data[3]]
        ) as usize;
        let recovered_addr = &data[eth_addr_offset..eth_addr_offset + 20];

        require!(
            recovered_addr == &expected_eth_address,
            ErrorCode::AddressMismatch
        );

        msg!("Ethereum address verified: 0x{}", hex::encode(recovered_addr));
        Ok(())
    }
}

#[derive(Accounts)]
pub struct VerifyEth<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: instruction sysvar
    #[account(address = instructions::ID)]
    pub instruction_sysvar: AccountInfo<'info>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Missing secp256k1 verification instruction")]
    MissingSecp256k1Instruction,
    #[msg("Invalid program")]
    InvalidProgram,
    #[msg("Invalid instruction data")]
    InvalidData,
    #[msg("Ethereum address mismatch")]
    AddressMismatch,
}
```

## 相關概念

- [Ed25519 Precompile](/solana/cryptography/ed25519-precompile/) - Solana 原生的 Ed25519 簽名驗證
- [secp256k1](/fundamentals/cryptography/secp256k1/) - secp256k1 橢圓曲線的數學基礎
- [ECDSA](/fundamentals/cryptography/ecdsa/) - ECDSA 簽章演算法原理
- [ecrecover (Ethereum)](/ethereum/cryptography/ecrecover/) - Ethereum 的 ecrecover precompile
- [ECDSA (Ethereum)](/ethereum/cryptography/ecdsa/) - Ethereum 上的 ECDSA 實作
- [Ed25519](/solana/cryptography/ed25519/) - Solana 原生簽章演算法
- [Keccak-256](/fundamentals/cryptography/keccak-256/) - secp256k1 precompile 使用的雜湊函數
- [Native Programs](/solana/runtime/native-programs/) - Solana 原生程式概覽
- [Instructions](/solana/transactions/instructions/) - Solana instruction 架構
- [Precompiled Contracts (Ethereum)](/ethereum/advanced/precompiled-contracts/) - Ethereum 的 precompile 對照
