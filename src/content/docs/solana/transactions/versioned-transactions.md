---
title: "Versioned Transactions"
description: "Versioned Transactions, v0 交易, Address Lookup Tables, ALT, MessageV0"
tags: [solana, transactions, versioned, address-lookup-table, v0]
---

# Versioned Transactions

## 概述

Versioned Transactions 是 Solana 在 2022 年 10 月（Epoch 358）引入的交易格式升級，最重要的改變是 v0 格式支援 **Address Lookup Tables（ALTs）**。Legacy 交易因為 1232 bytes 的大小限制，最多只能包含約 35 個帳戶。v0 交易透過 ALT 讓帳戶以 1-byte 索引引用鏈上儲存的地址表，大幅提升單筆交易可引用的帳戶數量（最多 256 個）。未來 SIMD-0296 提出的 v1 格式還將擴大交易的總體積上限。

## 核心原理

### Legacy vs v0

| 特性 | Legacy | v0 |
|------|--------|----|
| 帳戶引用方式 | 全部內嵌 32-byte Pubkey | 內嵌 + ALT 1-byte 索引 |
| 最大帳戶數 | ~35 | 256 |
| Message 格式 | `Message` | `MessageV0` |
| 啟用時間 | Genesis | 2022/10 Epoch 358 |
| 相容性 | 所有版本 | 需要支援 v0 的 RPC 和 wallet |

### Address Lookup Tables (ALTs)

ALT 是鏈上帳戶，儲存一個 Pubkey 陣列（最多 256 個地址）。交易只需嵌入 ALT 的地址和 1-byte 索引，即可引用 ALT 中的帳戶：

```
傳統方式（每帳戶 32 bytes）：
  account_keys: [Pubkey_A, Pubkey_B, Pubkey_C, ...]  // 32 * N bytes

ALT 方式（每帳戶 1 byte）：
  account_keys: [fee_payer, ...]            // 只嵌入必要的帳戶
  address_table_lookups: [
    {
      account_key: ALT_address,             // 32 bytes（ALT 本身）
      writable_indexes: [0, 2],             // 可寫帳戶的索引
      readonly_indexes: [1, 3, 5],          // 只讀帳戶的索引
    }
  ]
```

空間節省計算：假設引用 20 個額外帳戶
- 傳統：20 * 32 = 640 bytes
- ALT：32（ALT 地址）+ 20（索引）= 52 bytes
- 節省：588 bytes（92%）

### ALT 生命週期

| 階段 | 說明 |
|------|------|
| Create | 使用 `AddressLookupTable.createLookupTable` 建立，需要 rent-exempt 費用 |
| Extend | 向 ALT 新增地址，新地址需等待一個 slot 的 warmup 才可使用 |
| Deactivate | 標記為停用，進入冷卻期（約一個 epoch） |
| Close | 冷卻期結束後可關閉回收 rent |

重要限制：
- 新增的地址在同一 slot 內無法使用（需等待 activation slot）
- ALT 的 authority 可以新增地址和 deactivate
- 任何人都可以在交易中引用已啟用的 ALT

### MessageV0 結構

```
MessageV0 {
    header: MessageHeader,
    account_keys: Vec<Pubkey>,           // 直接嵌入的帳戶
    recent_blockhash: Hash,
    instructions: Vec<CompiledInstruction>,
    address_table_lookups: Vec<MessageAddressTableLookup>,  // v0 新增
}

MessageAddressTableLookup {
    account_key: Pubkey,           // ALT 帳戶的地址
    writable_indexes: Vec<u8>,     // ALT 中可寫帳戶的索引
    readonly_indexes: Vec<u8>,     // ALT 中只讀帳戶的索引
}
```

Runtime 在執行交易前會：
1. 載入所有引用的 ALT
2. 根據索引解析出完整的 Pubkey 列表
3. 將解析後的帳戶合併到 instruction 的帳戶列表中

### 版本識別

交易的第一個 byte 決定版本：
- `0x80`（最高 bit 為 1）：versioned transaction，低 7 bits 為版本號
- 其他值：legacy transaction（向後相容）

v0 的 prefix byte 為 `0x80`（版本 0）。

### SIMD-0296: v1 格式展望

SIMD-0296 提議的 v1 格式將：
- 交易大小上限從 1232 bytes 提高到 4096 bytes
- 利用 QUIC 傳輸不受 UDP MTU 限制
- 支援更大的 instruction data 和更多帳戶
- 向後相容 v0 和 legacy

## 程式碼範例

```typescript
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableProgram,
  AddressLookupTableAccount,
} from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const payer = Keypair.generate();

// --- 1. 建立 Address Lookup Table ---
const slot = await connection.getSlot();
const [createIx, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
  authority: payer.publicKey,
  payer: payer.publicKey,
  recentSlot: slot,
});

// --- 2. 向 ALT 新增地址 ---
const addressesToAdd = [
  new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
  new PublicKey("11111111111111111111111111111112"),
];

const extendIx = AddressLookupTableProgram.extendLookupTable({
  payer: payer.publicKey,
  authority: payer.publicKey,
  lookupTable: lookupTableAddress,
  addresses: addressesToAdd,
});

// --- 3. 使用 ALT 建構 v0 交易 ---
// 先取得 ALT 帳戶資料
const lookupTableAccount = await connection
  .getAddressLookupTable(lookupTableAddress)
  .then((res) => res.value);

const transferIx = SystemProgram.transfer({
  fromPubkey: payer.publicKey,
  toPubkey: addressesToAdd[2],
  lamports: 1_000_000,
});

// 建構 v0 message
const messageV0 = new TransactionMessage({
  payerKey: payer.publicKey,
  recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
  instructions: [transferIx],
}).compileToV0Message([lookupTableAccount]); // 傳入 ALT

// 建構 versioned transaction
const versionedTx = new VersionedTransaction(messageV0);
versionedTx.sign([payer]);

// 發送
const txId = await connection.sendTransaction(versionedTx);

// --- 4. ALT 生命週期管理 ---
// Deactivate
const deactivateIx = AddressLookupTableProgram.deactivateLookupTable({
  lookupTable: lookupTableAddress,
  authority: payer.publicKey,
});

// Close（需等冷卻期結束）
const closeIx = AddressLookupTableProgram.closeLookupTable({
  lookupTable: lookupTableAddress,
  authority: payer.publicKey,
  recipient: payer.publicKey,
});

// --- 5. 查詢 ALT 內容 ---
const altInfo = await connection.getAddressLookupTable(lookupTableAddress);
if (altInfo.value) {
  const addresses = altInfo.value.state.addresses;
  // addresses[0], addresses[1], ... 對應索引 0, 1, ...
}
```

## 相關概念

- [Transaction Anatomy](/solana/transactions/transaction-anatomy/) - 交易結構基礎與大小限制
- [Instructions](/solana/transactions/instructions/) - CompiledInstruction 如何引用 ALT 中的帳戶
- [Transaction Signing](/solana/transactions/signing/) - v0 交易的簽名方式
- [Transaction Fees](/solana/transactions/fees-priority/) - ALT 建立和維護的費用
- [Transaction Errors](/solana/transactions/transaction-errors/) - ALT 相關的錯誤情境
- [Account Model](/solana/account-model/account-model-overview/) - ALT 作為鏈上帳戶的儲存方式
- [Rent](/solana/account-model/rent/) - ALT 帳戶的 rent-exempt 要求
- [Solana Transaction Lifecycle](/solana/transactions/transaction-lifecycle-solana/) - v0 交易的處理流程
- [Compute Units](/solana/runtime/compute-units/) - ALT 解析的計算開銷
