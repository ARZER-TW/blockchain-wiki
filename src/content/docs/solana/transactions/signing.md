---
title: "Transaction Signing"
description: "Solana Transaction Signing, 交易簽名, Ed25519, multi-signer, partial signing, durable nonce"
tags: [solana, transactions, signing, ed25519, nonce]
---

# Transaction Signing

## 概述

Solana 使用 [Ed25519](/solana/cryptography/ed25519/) 橢圓曲線數位簽名對 serialized message 進行簽署。交易的第一個 signer 是 fee payer，負擔 [交易費用](/solana/transactions/fees-priority/)。多個 signer 各自對相同的 message 獨立簽署，支援 partial signing 以實現多方協作。對於離線簽署或延遲提交的場景，可使用 durable nonce 替代 recent blockhash 以避免過期問題。

## 核心原理

### Ed25519 簽名流程

Solana 的簽名流程：

1. 將 [Transaction Message](/solana/transactions/transaction-anatomy/) 序列化為 bytes
2. 每個 required signer 使用自己的 Ed25519 private key 對序列化的 message 進行簽名
3. 簽名（64 bytes）按照 `account_keys` 中 signer 的順序排列

$$\text{signature}_i = \text{Ed25519\_sign}(\text{private\_key}_i, \text{serialized\_message})$$

驗證時，validator 使用對應的 public key 驗證每個簽名：

$$\text{Ed25519\_verify}(\text{public\_key}_i, \text{serialized\_message}, \text{signature}_i) = \text{true}$$

### Fee Payer

Fee payer 是 `account_keys` 中的第一個帳戶，必須滿足：

- 是 signer（`is_signer = true`）
- 是 writable（`is_writable = true`）
- 擁有足夠的 SOL 支付 base fee + priority fee
- 在 header 排序中位於最前面

### Multi-Signer 交易

當交易涉及多個 signer 時（如多簽錢包操作），所有 signer 簽署相同的 serialized message：

```
Transaction with 3 signers:
  signatures[0] = Ed25519_sign(key_A, message)  // fee payer
  signatures[1] = Ed25519_sign(key_B, message)  // co-signer
  signatures[2] = Ed25519_sign(key_C, message)  // co-signer
```

### Partial Signing

Partial signing 允許不同參與方在不同時間地點簽署同一筆交易：

1. 構建者建立交易並設定 `recentBlockhash` 和 `feePayer`
2. 構建者簽署自己的部分（`partialSign`）
3. 序列化為 bytes 傳送給其他 signer
4. 其他 signer 反序列化、驗證、再 `partialSign`
5. 最後一個 signer 簽署後，交易就完整了

注意：partial signing 的交易必須在 blockhash 過期前收集所有簽名並提交。

### Durable Nonce

標準交易使用 `recentBlockhash`，約 300 slots（~2 分鐘）後過期。Durable nonce 機制解決離線和長時間簽署的需求：

1. 建立一個 nonce account（System Program 管理）
2. 交易的 `recentBlockhash` 替換為 nonce account 中儲存的 nonce 值
3. 交易的第一個 instruction 必須是 `AdvanceNonceAccount`
4. 只要 nonce 未被 advance，交易就不會過期

Nonce account 結構：
- `authority`: 有權 advance nonce 的公鑰
- `nonce`: 當前 nonce 值（一個 blockhash）
- `fee_calculator`: 建立時的費率

### 簽名驗證的效能

Solana validator 使用 GPU 加速進行批量 Ed25519 簽名驗證：

- 每個 validator 在收到交易後先進行 SigVerify
- GPU 並行處理大量簽名，吞吐量極高
- 無效簽名的交易在此階段被淘汰，不進入執行層

## 程式碼範例

```typescript
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  PublicKey,
  NONCE_ACCOUNT_LENGTH,
  NonceAccount,
} from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");

// --- 1. 基本簽名 ---
const payer = Keypair.generate();
const tx = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: new PublicKey("11111111111111111111111111111112"),
    lamports: 1_000_000,
  })
);
tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
tx.feePayer = payer.publicKey;
tx.sign(payer);

// --- 2. Multi-Signer ---
const signerA = Keypair.generate(); // fee payer
const signerB = Keypair.generate(); // co-signer

const multiTx = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: signerA.publicKey,
    toPubkey: signerB.publicKey,
    lamports: 500_000,
  })
);
multiTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
multiTx.feePayer = signerA.publicKey;
multiTx.sign(signerA, signerB);

// --- 3. Partial Signing ---
const partialTx = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: signerA.publicKey,
    toPubkey: signerB.publicKey,
    lamports: 100_000,
  })
);
partialTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
partialTx.feePayer = signerA.publicKey;

// 參與者 A 先簽
partialTx.partialSign(signerA);

// 序列化傳給參與者 B
const serialized = partialTx.serialize({ requireAllSignatures: false });

// 參與者 B 反序列化後簽署
const recovered = Transaction.from(serialized);
recovered.partialSign(signerB);

// --- 4. Durable Nonce ---
const nonceKeypair = Keypair.generate();
const nonceAuthority = payer;

// 建立 nonce account
const createNonceTx = new Transaction().add(
  SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: nonceKeypair.publicKey,
    lamports: await connection.getMinimumBalanceForRentExemption(NONCE_ACCOUNT_LENGTH),
    space: NONCE_ACCOUNT_LENGTH,
    programId: SystemProgram.programId,
  }),
  SystemProgram.nonceInitialize({
    noncePubkey: nonceKeypair.publicKey,
    authorizedPubkey: nonceAuthority.publicKey,
  })
);

// 使用 nonce 建構離線交易
const nonceAccountInfo = await connection.getAccountInfo(nonceKeypair.publicKey);
const nonceAccount = NonceAccount.fromAccountData(nonceAccountInfo.data);

const offlineTx = new Transaction().add(
  SystemProgram.nonceAdvance({
    noncePubkey: nonceKeypair.publicKey,
    authorizedPubkey: nonceAuthority.publicKey,
  }),
  SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: new PublicKey("11111111111111111111111111111112"),
    lamports: 1_000_000,
  })
);
offlineTx.recentBlockhash = nonceAccount.nonce; // 使用 nonce 而非 recent blockhash
offlineTx.feePayer = payer.publicKey;
offlineTx.sign(payer);
// 此交易不會過期，直到 nonce 被 advance
```

## 相關概念

- [Ed25519](/solana/cryptography/ed25519/) - Solana 使用的簽名演算法
- [Transaction Anatomy](/solana/transactions/transaction-anatomy/) - 簽名所針對的交易結構
- [Transaction Fees and Priority Fees](/solana/transactions/fees-priority/) - Fee payer 的費用責任
- [Transaction Errors](/solana/transactions/transaction-errors/) - Blockhash 過期等簽名相關錯誤
- [Transaction Lifecycle](/solana/transactions/transaction-lifecycle-solana/) - 簽名後的提交與確認流程
- [Versioned Transactions](/solana/transactions/versioned-transactions/) - v0 交易的簽名差異
- [Programs](/solana/account-model/programs/) - Durable nonce 由 System Program 管理
- [Hash Function Overview](/fundamentals/cryptography/hash-function-overview/) - 簽名中使用的雜湊函數
- [Transaction Signing (ETH)](/ethereum/transaction-lifecycle/transaction-signing/) - Ethereum ECDSA 簽名的比較
