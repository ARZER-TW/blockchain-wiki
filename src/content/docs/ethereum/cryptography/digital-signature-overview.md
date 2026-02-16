---
title: "數位簽章概述"
description: "Digital Signature, 數位簽名, 電子簽章"
tags: [ethereum, cryptography, digital-signature]
---

# 數位簽章概述

> 本文聚焦 Ethereum 特定的實現細節。通用理論請參見 [數位簽章概述](/fundamentals/cryptography/digital-signature-overview/)。

## 概述

Ethereum 使用雙簽章系統：執行層採用 [ECDSA](/ethereum/cryptography/ecdsa/)，共識層採用 [BLS Signatures](/ethereum/cryptography/bls-signatures/)。每筆交易都必須包含有效的數位簽章，證明發送者持有對應帳戶的私鑰。關於數位簽章的形式定義、EUF-CMA 安全模型和方案比較，請參見 [通用理論](/fundamentals/cryptography/digital-signature-overview/)。

## Ethereum 雙簽章系統

| 層 | 方案 | 曲線 | 特性 |
|----|------|------|------|
| 執行層 | [ECDSA](/ethereum/cryptography/ecdsa/) | [secp256k1](/ethereum/cryptography/secp256k1/) | 公鑰恢復（[ECRECOVER](/ethereum/cryptography/ecrecover/)） |
| 共識層 | [BLS Signatures](/ethereum/cryptography/bls-signatures/) | [BLS12-381](/ethereum/cryptography/bls12-381/) | 聚合簽名 |

### ECDSA vs BLS 在 Ethereum 中的比較

| 性質 | [ECDSA](/ethereum/cryptography/ecdsa/) | [BLS Signatures](/ethereum/cryptography/bls-signatures/) |
|------|----------|-------------------|
| 簽名大小 | 65 bytes $(r, s, v)$ | 96 bytes（$G_2$ 點） |
| 公鑰大小 | 64 bytes（未壓縮） | 48 bytes（$G_1$ 點） |
| 驗證速度 | 快 | 慢（需配對運算） |
| 聚合 | 不支援 | 原生支援 |
| 確定性 | 非確定性（需隨機 $k$） | 確定性 |
| 公鑰恢復 | 支援 | 不支援 |

### 歷史演進

Ethereum 選擇 ECDSA + secp256k1 是因為 Bitcoin 已驗證其安全性。在設計 Beacon Chain 時，為了解決大規模共識簽名的效率問題，選擇了 BLS 簽名方案。

### 未來發展

- **Pectra 升級**（2025/5）：EIP-2537 引入 BLS12-381 預編譯合約，執行層可原生驗證 BLS 簽名
- **Fusaka 升級**（2025/12）：EIP-7951 引入 secp256r1 預編譯合約，支援 Passkey/WebAuthn 簽名驗證
- **帳戶抽象**：允許合約帳戶使用任意簽章方案，不再限於 ECDSA

## 在 Ethereum 中的應用

- **[交易簽名](/ethereum/transaction-lifecycle/transaction-signing/)**：每筆交易必須包含 ECDSA 簽名 $(r, s, v)$
- **[交易廣播與驗證](/ethereum/transaction-lifecycle/broadcast-validation/)**：節點用 [ECRECOVER](/ethereum/cryptography/ecrecover/) 從簽名恢復發送者公鑰/地址
- **[EIP-155 重放保護](/ethereum/accounts/eip-155/)**：將 chain ID 編入簽名，防止跨鏈重放
- **[Attestation](/ethereum/consensus/attestation/)**：validator 用 BLS 簽署 attestation
- **[Casper FFG](/ethereum/consensus/casper-ffg/)**：finality 投票使用 BLS 簽名
- **合約層**：`ecrecover` precompile 允許合約驗證鏈下簽名（meta-transaction、permit 等）

## 相關概念

- [數位簽章原理](/fundamentals/cryptography/digital-signature-overview/) - 通用理論（形式定義、EUF-CMA 安全模型、方案比較表）
- [ECDSA](/ethereum/cryptography/ecdsa/) - Ethereum 執行層的簽章演算法
- [BLS Signatures](/ethereum/cryptography/bls-signatures/) - Ethereum 共識層的簽章演算法
- [ECRECOVER](/ethereum/cryptography/ecrecover/) - 從 ECDSA 簽名恢復公鑰
- [橢圓曲線密碼學](/fundamentals/cryptography/elliptic-curve-cryptography/) - 簽章演算法的數學基礎
- [公鑰密碼學](/fundamentals/cryptography/public-key-cryptography/) - 數位簽章是公鑰密碼學的核心應用
- [雜湊函數概述](/fundamentals/cryptography/hash-function-overview/) - 簽名前先雜湊訊息
- [交易簽名](/ethereum/transaction-lifecycle/transaction-signing/) - 數位簽章在交易中的應用
- [交易廣播與驗證](/ethereum/transaction-lifecycle/broadcast-validation/) - 簽名驗證是交易驗證的一環
- [EIP-155 重放保護](/ethereum/accounts/eip-155/) - 簽名中加入 chain ID
