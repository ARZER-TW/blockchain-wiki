---
title: "Account Data Serialization"
description: "Borsh binary serialization, Anchor discriminators, and zero-copy deserialization in Solana"
tags: [solana, account-model, serialization, borsh, anchor, zero-copy]
---

# Account Data Serialization

## 概述

Solana 帳戶的 `data` 欄位是一個原始的 byte array，程式必須自行定義資料的序列化和反序列化方式。Solana 生態系統的標準是 **Borsh**（Binary Object Representation Serializer for Hashing）——一種確定性的二進位序列化格式。Anchor framework 在 Borsh 之上加入了 8-byte discriminator 用於型別識別。與 Ethereum 的 [ABI Encoding](/ethereum/data-structures/abi-encoding/) 和 [RLP Encoding](/ethereum/data-structures/rlp-encoding/) 相比，Borsh 更緊湊且計算效率更高。

## 核心原理

### Borsh 序列化規則

Borsh 的設計原則是**確定性**和**緊湊**：相同的資料永遠產生相同的 bytes。

| 型別 | 序列化格式 | 大小 |
|------|-----------|------|
| `u8` | 直接寫入 | 1 byte |
| `u16` | Little-endian | 2 bytes |
| `u32` | Little-endian | 4 bytes |
| `u64` | Little-endian | 8 bytes |
| `u128` | Little-endian | 16 bytes |
| `i8` ~ `i128` | Little-endian, two's complement | 同上 |
| `bool` | 0 或 1 | 1 byte |
| `f32` / `f64` | IEEE 754, little-endian | 4 / 8 bytes |
| `[T; N]` (固定陣列) | 直接串接 N 個 T | N * sizeof(T) |
| `Vec<T>` | 4-byte length + 串接 | 4 + len * sizeof(T) |
| `String` | 4-byte length + UTF-8 bytes | 4 + len |
| `Option<T>` | 1-byte tag (0=None, 1=Some) + T | 1 + sizeof(T) if Some |
| `Pubkey` | 直接 32 bytes | 32 bytes |
| `enum` | 1-byte variant index + fields | 1 + sizeof(variant) |

### Fixed vs Dynamic Layout

**固定大小帳戶**（所有欄位大小已知）：

```rust
#[account]
pub struct GameState {
    pub player: Pubkey,    // 32 bytes
    pub score: u64,        // 8 bytes
    pub level: u8,         // 1 byte
    pub is_active: bool,   // 1 byte
}
// Total: 32 + 8 + 1 + 1 = 42 bytes (+ 8 discriminator = 50)
```

**動態大小帳戶**（含 Vec, String 等）：

```rust
#[account]
pub struct Profile {
    pub owner: Pubkey,          // 32 bytes
    pub name: String,           // 4 + len bytes
    pub scores: Vec<u64>,       // 4 + 8*len bytes
}
// 帳戶建立時必須預留最大空間
```

動態帳戶需要在建立時估算最大 space，預留足夠的 [rent-exempt](/solana/account-model/rent/) 餘額。

### Anchor Discriminator

Anchor 為每個帳戶型別和 instruction 自動生成 8-byte discriminator：

$$\text{discriminator} = \text{SHA-256}(\text{"account:"} \| \text{StructName})[0:8]$$

Instruction 的 discriminator：

$$\text{discriminator} = \text{SHA-256}(\text{"global:"} \| \text{function\_name})[0:8]$$

Discriminator 的用途：
1. **型別安全**：防止將錯誤型別的帳戶傳入 instruction
2. **反序列化路由**：根據 discriminator 選擇正確的反序列化器
3. **帳戶驗證**：Anchor 自動驗證 discriminator 是否匹配

帳戶 data layout（Anchor）：

```
| discriminator (8 bytes) | Borsh serialized fields |
```

### Space 計算

在 Anchor 中，`INIT_SPACE` 自動計算固定大小欄位：

```rust
#[account]
#[derive(InitSpace)]
pub struct MyAccount {
    pub authority: Pubkey,    // 32
    pub value: u64,           // 8
    pub bump: u8,             // 1
    #[max_len(50)]
    pub name: String,         // 4 + 50
    #[max_len(10)]
    pub scores: Vec<u64>,     // 4 + 10 * 8
}
// INIT_SPACE = 32 + 8 + 1 + 54 + 84 = 179
// Total space = 8 (discriminator) + 179 = 187
```

手動計算規則：

| 欄位 | 計算 |
|------|------|
| `Pubkey` | 32 |
| `u8` / `bool` | 1 |
| `u16` | 2 |
| `u32` | 4 |
| `u64` | 8 |
| `u128` | 16 |
| `Option<T>` | 1 + sizeof(T) |
| `String` (max N) | 4 + N |
| `Vec<T>` (max N) | 4 + N * sizeof(T) |
| Anchor discriminator | 8 |

### Zero-Copy Deserialization

對於大型帳戶（數 KB 以上），完整反序列化會消耗大量 compute units。Anchor 提供 `zero_copy` 模式，直接將帳戶 data 作為記憶體映射存取：

```rust
#[account(zero_copy)]
#[repr(C)]   // 確保 C-compatible memory layout
pub struct OrderBook {
    pub head: u32,
    pub count: u32,
    pub orders: [Order; 256],
}

#[zero_copy]
#[repr(C)]
pub struct Order {
    pub price: u64,
    pub amount: u64,
    pub owner: Pubkey,
}
```

Zero-copy 的限制：
- 所有欄位必須是固定大小（不能用 `Vec`, `String`）
- 必須使用 `#[repr(C)]` 確保記憶體佈局
- 帳戶型別使用 `AccountLoader` 而非 `Account`
- 需要手動管理 padding 和 alignment

### 與 Ethereum 序列化的比較

| 面向 | Solana (Borsh) | Ethereum ABI | Ethereum RLP |
|------|---------------|-------------|-------------|
| 用途 | 帳戶資料 + instruction | Function calls + events | 交易 + 區塊 |
| 確定性 | 是 | 是 | 是 |
| Padding | 無 | 32-byte slot 對齊 | 無 |
| 動態型別 | 4-byte length prefix | Offset + length | Length prefix |
| 效率 | 緊湊 | 較浪費空間 | 緊湊 |
| Schema | 外部定義 | ABI JSON | 隱式 |
| 型別識別 | Discriminator (8 bytes) | Selector (4 bytes) | 無 |

Ethereum 的 ABI encoding 使用 32-byte slot 對齊，即使 `uint8` 也佔 32 bytes。Borsh 則按實際大小序列化，更節省空間。

### IDL（Interface Definition Language）

Anchor 自動從程式碼生成 IDL（JSON 格式），描述每個 instruction 的 discriminator、accounts 和 args，以及每個 account type 的 discriminator 和 fields。IDL 的作用等同於 Ethereum 的 ABI JSON，前端 SDK 據此自動生成 instruction builders 和 account decoders。

## 程式碼範例

### TypeScript（@solana/web3.js + Borsh）

```typescript
import * as borsh from 'borsh';
import { PublicKey } from '@solana/web3.js';
import { createHash } from 'crypto';

// Borsh schema 定義
const gameStateSchema: borsh.Schema = {
  struct: {
    player: { array: { type: 'u8', len: 32 } },
    score: 'u64',
    level: 'u8',
    isActive: 'bool',
  },
};

// 序列化
const state = {
  player: new PublicKey('11111111111111111111111111111111').toBytes(),
  score: BigInt(1000),
  level: 5,
  isActive: true,
};
const serialized = borsh.serialize(gameStateSchema, state);
console.log('Serialized:', serialized.length, 'bytes'); // 42

// 反序列化（跳過 8-byte Anchor discriminator）
function deserializeAnchorAccount<T>(data: Buffer, schema: borsh.Schema): T {
  return borsh.deserialize(schema, data.slice(8)) as T;
}

// Anchor discriminator 計算
function accountDiscriminator(name: string): Buffer {
  return createHash('sha256').update(`account:${name}`).digest().slice(0, 8);
}
console.log('Discriminator:', accountDiscriminator('GameState').toString('hex'));
```

### Rust / Anchor

```rust
use anchor_lang::prelude::*;

// === Fixed layout ===
#[account]
#[derive(InitSpace)]
pub struct FixedAccount {
    pub authority: Pubkey,  // 32
    pub value: u64,         // 8
    pub bump: u8,           // 1
}
// space = 8 (discriminator) + 32 + 8 + 1 = 49 bytes

// === Dynamic layout（需要 #[max_len] 標註）===
#[account]
#[derive(InitSpace)]
pub struct DynamicAccount {
    pub authority: Pubkey,  // 32
    #[max_len(50)]
    pub name: String,       // 4 + 50
    #[max_len(20)]
    pub scores: Vec<u64>,   // 4 + 20 * 8
}

// === Zero-copy（大型帳戶，避免完整反序列化）===
#[account(zero_copy)]
#[repr(C)]
pub struct OrderBook {
    pub head: u32,
    pub count: u32,
    pub orders: [Order; 256],
}

#[zero_copy]
#[repr(C)]
pub struct Order {
    pub price: u64,
    pub amount: u64,
    pub owner: Pubkey,
}

// Zero-copy 使用 AccountLoader 而非 Account
#[derive(Accounts)]
pub struct ReadZeroCopy<'info> {
    pub order_book: AccountLoader<'info, OrderBook>,
}
```

## 相關概念

- [Account Model](/solana/account-model/account-model-overview/) - 帳戶 data 欄位的儲存架構
- [Programs](/solana/account-model/programs/) - 定義帳戶序列化格式的程式
- [Rent](/solana/account-model/rent/) - space 計算影響 rent-exempt 費用
- [PDA](/solana/account-model/pda/) - PDA 帳戶同樣使用 Borsh 序列化
- [Token Accounts](/solana/account-model/token-accounts/) - SPL Token 的序列化格式
- [ABI Encoding (Ethereum)](/ethereum/data-structures/abi-encoding/) - Ethereum 的 function call 序列化方式
- [RLP Encoding (Ethereum)](/ethereum/data-structures/rlp-encoding/) - Ethereum 的交易/區塊序列化方式
- [SSZ Encoding (Ethereum)](/ethereum/data-structures/ssz-encoding/) - Ethereum Beacon Chain 的序列化方式
- [Instructions](/solana/transactions/instructions/) - Instruction data 的序列化格式
- [SHA-256](/fundamentals/cryptography/sha-256/) - Anchor discriminator 使用的雜湊函數
