---
title: "交易簽名"
description: "Transaction Signing, 交易數位簽章"
tags: [ethereum, transaction, signature, ECDSA]
---

# 交易簽名

> 本文聚焦 Ethereum 特定的實現細節。通用交易簽名理論請參見 [交易簽名](/fundamentals/concepts/transaction-signing/)。

## 概述

Ethereum 交易簽名使用 [ECDSA](/ethereum/cryptography/ecdsa/) 演算法在 [secp256k1](/ethereum/cryptography/secp256k1/) 曲線上對交易雜湊進行簽章，產生 `(v, r, s)` 三個值。驗證者可以用 [ECRECOVER](/ethereum/cryptography/ecrecover/) 從簽名反推公鑰，進而推導出發送者地址 -- Ethereum 不需要在交易中顯式包含 `from` 欄位。

## Ethereum 簽名細節

### ECDSA 簽章流程

給定私鑰 $k$、待簽訊息雜湊 $z$：

1. 產生隨機數 $r_k$（ephemeral key），$1 \leq r_k < n$
2. 計算曲線點 $R = r_k \cdot G$，取 $r = R.x \mod n$
3. 計算 $s = r_k^{-1}(z + r \cdot k) \mod n$
4. 若 $r = 0$ 或 $s = 0$，重新選擇 $r_k$

簽章結果為 $(r, s)$，各 32 bytes。

### 訊息雜湊的計算（RLP 編碼）

依交易類型不同，待簽雜湊的輸入不同：

**Legacy（pre-EIP-155）**：
$$z = \text{Keccak-256}(\text{RLP}([\text{nonce}, \text{gasPrice}, \text{gasLimit}, \text{to}, \text{value}, \text{data}]))$$

**Legacy（EIP-155）**：
$$z = \text{Keccak-256}(\text{RLP}([\text{nonce}, \text{gasPrice}, \text{gasLimit}, \text{to}, \text{value}, \text{data}, \text{chainId}, 0, 0]))$$

**Typed Transaction（Type 2, EIP-1559）**：
$$z = \text{Keccak-256}(\texttt{0x02} \| \text{RLP}([\text{chainId}, \text{nonce}, ...]))$$

### v 值的含義

`v` 值（recovery ID）讓驗證者能從 `(r, s)` 唯一確定公鑰。一個 `r` 值對應兩個可能的公鑰（橢圓曲線的 $y$ 和 $-y$），`v` 指定是哪一個。

| 場景 | v 值 | 說明 |
|------|------|------|
| Pre-EIP-155 | 27 或 28 | recovery ID + 27 |
| EIP-155 | chainId * 2 + 35 或 36 | 包含 chain ID（[EIP-155 重放保護](/ethereum/accounts/eip-155/)） |
| Typed TX (Type 1/2/3) | 0 或 1 | 純 recovery ID，chain ID 在欄位中 |

EIP-155 的 `v` 值公式：
$$v = \text{recoveryId} + \text{chainId} \times 2 + 35$$

Mainnet（chainId = 1）的 `v` 值為 37 或 38。

### EIP-2718 Typed Transactions

EIP-2718 定義了交易的 envelope 格式，使新的交易類型可以擴展而不破壞向後相容：

- **Type 0**（Legacy）：傳統 RLP 編碼
- **Type 1**（EIP-2930）：Access list transaction
- **Type 2**（EIP-1559）：動態手續費交易
- **Type 3**（EIP-4844）：Blob transaction

Typed transaction 的簽名格式為 `TransactionType || RLP(...)`，chain ID 是交易欄位的一部分，不再編碼在 `v` 中。

### Signature Malleability（EIP-2）

[ECDSA](/ethereum/cryptography/ecdsa/) 簽章存在 malleability 問題：對於有效簽章 $(r, s)$，$(r, n - s)$ 也是有效簽章。Ethereum 透過 EIP-2 規定 $s$ 必須在曲線階的下半部分（$s \leq n/2$），消除這個問題。

### RFC 6979 確定性 k 值

為避免 $r_k$ 的隨機數品質問題，現代實作使用 RFC 6979：

$$r_k = \text{HMAC-DRBG}(k, z)$$

從私鑰和訊息雜湊確定性地推導 $r_k$，同一筆交易永遠產生相同簽章。

## 在 Ethereum 中的應用

- **交易認證**：每筆鏈上交易都必須有合法簽章
- **EIP-712 結構化簽章**：dApp 請求使用者對結構化資料簽章（permit、order 等）
- **EIP-191 個人簽章**：`personal_sign` 對任意訊息簽章，前綴 `\x19Ethereum Signed Message:\n`
- **合約驗證**：合約內用 `ecrecover` precompile（[ECRECOVER](/ethereum/cryptography/ecrecover/)）驗證簽章
- **Account Abstraction (ERC-4337)**：可自定義簽章驗證邏輯

## 程式碼範例

```javascript
import { ethers } from 'ethers';

const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const wallet = new ethers.Wallet(privateKey);

// --- 1. 簽署交易 ---
const tx = {
  type: 2,
  chainId: 1n,
  nonce: 0,
  to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  value: ethers.parseEther('1.0'),
  maxFeePerGas: ethers.parseUnits('30', 'gwei'),
  maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei'),
  gasLimit: 21000n,
};

const signedTx = await wallet.signTransaction(tx);
console.log('Signed TX (hex):', signedTx);

// 解析已簽名交易，查看 v, r, s
const parsed = ethers.Transaction.from(signedTx);
console.log('v:', parsed.signature.v);
console.log('r:', parsed.signature.r);
console.log('s:', parsed.signature.s);
console.log('Recovery ID:', parsed.signature.yParity);

// --- 2. 從簽名恢復地址（ECRECOVER） ---
const txHash = parsed.unsignedHash;
const recoveredAddress = ethers.recoverAddress(txHash, parsed.signature);
console.log('Recovered:', recoveredAddress);
console.log('Match:', recoveredAddress === wallet.address);

// --- 3. EIP-191 個人訊息簽章 ---
const message = 'Hello Ethereum';
const personalSig = await wallet.signMessage(message);
console.log('Personal Signature:', personalSig);

// 驗證
const recoveredFromMsg = ethers.verifyMessage(message, personalSig);
console.log('Verified signer:', recoveredFromMsg);

// --- 4. EIP-712 結構化資料簽章 ---
const domain = {
  name: 'MyDApp',
  version: '1',
  chainId: 1,
  verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
};

const types = {
  Transfer: [
    { name: 'to', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
};

const transferData = {
  to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  amount: ethers.parseEther('100'),
  nonce: 0n,
};

const typedSig = await wallet.signTypedData(domain, types, transferData);
const typedSigner = ethers.verifyTypedData(domain, types, transferData, typedSig);
console.log('EIP-712 Signer:', typedSigner);
```

## 相關概念

- [交易簽名（通用概念）](/fundamentals/concepts/transaction-signing/) - 跨鏈通用的簽名理論
- [交易生命週期](/ethereum/transaction-lifecycle/transaction-lifecycle/) - 本筆記是流程第三步
- [交易構建](/ethereum/transaction-lifecycle/transaction-construction/) - 流程上一步：產生待簽資料
- [交易廣播與驗證](/ethereum/transaction-lifecycle/broadcast-validation/) - 流程下一步：簽好的交易送出
- [ECDSA](/ethereum/cryptography/ecdsa/) - 簽章演算法的數學原理
- [secp256k1](/ethereum/cryptography/secp256k1/) - 使用的橢圓曲線
- [Keccak-256](/ethereum/cryptography/keccak-256/) - 計算交易雜湊
- [ECRECOVER](/ethereum/cryptography/ecrecover/) - 從簽章恢復公鑰
- [EIP-155 重放保護](/ethereum/accounts/eip-155/) - v 值中編碼 chain ID
- [數位簽章概述](/ethereum/cryptography/digital-signature-overview/) - 數位簽章的通用概念
