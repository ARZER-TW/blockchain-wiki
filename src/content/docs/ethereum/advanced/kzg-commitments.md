---
title: "KZG Commitments"
description: "KZG Commitments, KZG, Kate Commitment, Polynomial Commitment"
tags: [ethereum, cryptography, polynomial-commitment, kzg, trusted-setup]
sidebar:
  order: 3
---

# KZG Commitments 在 Ethereum 中的應用

> 本文聚焦 Ethereum 特定的實現細節。通用理論請參見 [KZG Commitments 多項式承諾](/fundamentals/cryptography/kzg-commitments/)。

## 概述

Ethereum 在 [EIP-4844 Proto-Danksharding](/ethereum/advanced/eip-4844/) 中用 KZG 來承諾 blob 資料，在 [Verkle Trees](/ethereum/advanced/verkle-trees/) 中用它取代 Merkle hash。KZG 基於 [BLS12-381](/ethereum/cryptography/bls12-381/) 橢圓曲線上的 bilinear pairing 運算。關於 KZG 的數學原理（commitment、opening proof、verification），請參見[通用理論](/fundamentals/cryptography/kzg-commitments/)。

## Ethereum 的 KZG Ceremony

2023 年進行的 KZG trusted setup ceremony 是歷史上最大規模的 MPC ceremony：

- **參與者**：超過 141,000 人
- **安全假設**：只要其中一個參與者誠實刪除了自己的隨機值，$\tau$ 就不可知（1-of-141,000 trust assumption）
- **SRS 規模**：支援 degree 4096 的多項式（對應 blob 中的 4096 個 field elements）
- **曲線**：[BLS12-381](/ethereum/cryptography/bls12-381/)

## EIP-4844 中的 Blob KZG

### Blob 編碼為多項式

[EIP-4844 Proto-Danksharding](/ethereum/advanced/eip-4844/) 中，blob 被視為多項式的 evaluation form：

$$\text{blob} = [p(\omega^0), p(\omega^1), ..., p(\omega^{4095})]$$

其中 $\omega$ 是 order-4096 的 root of unity（在 BLS12-381 標量域中）。

### Commitment 計算

實際實作中直接用 Lagrange form 計算，避免 FFT：

$$C = \sum_{i=0}^{4095} f_i \cdot [L_i(\tau)]_1$$

其中 $L_i(x)$ 是 Lagrange basis，$[L_i(\tau)]_1$ 可以從 SRS 預計算。

### Versioned Hash

區塊中儲存的不是完整 commitment，而是 versioned hash：

```
versioned_hash = 0x01 || SHA256(commitment)[1:]
```

`0x01` 是 version byte，未來可支援其他 commitment scheme。

### Point Evaluation Precompile

EIP-4844 引入的 precompile `0x0A` 讓 L1 合約能驗證 blob 中特定位置的值：

- **輸入**：versioned hash、evaluation point $z$、claimed value $y$、commitment、proof
- **驗證**：$p(z) = y$（使用 KZG verification）
- **Gas**：50,000

這讓 Layer 2 rollup 可以在 L1 上證明 blob 中的資料，而不需要把整個 blob 上鏈。

### 流程

1. Blob producer 計算 KZG commitment
2. Versioned hash = `0x01 || SHA256(commitment)[1:]`
3. 區塊 proposer 驗證所有 blob 的 commitment
4. Point evaluation precompile 讓 L1 合約驗證 blob 中特定位置的值

## Verkle Trees 中的使用

[Verkle Trees](/ethereum/advanced/verkle-trees/) 用 KZG（或 IPA）作為 vector commitment：
- 每個 trie 節點的子節點值構成一個多項式
- 節點的 hash 是該多項式的 KZG commitment
- Proof 大小從 $O(\log n)$ 降到 $O(1)$（每層一個 opening proof）

## PeerDAS 中的 KZG（EIP-7594，Fusaka）

Fusaka 升級（2025/12/3）引入的 PeerDAS 大量依賴 KZG 來實現資料可用性取樣（Data Availability Sampling）。

**KZG 在 PeerDAS 中的角色：**

1. **Blob 編碼**：每個 blob 仍然用 KZG commitment 承諾，和 EIP-4844 相同
2. **Erasure coding 擴展**：blob 的多項式被 evaluate 在更多點上，產生額外的 data columns
3. **Column commitment**：每個 column 對應原始多項式在特定點的 evaluation，可以用 KZG opening proof 驗證
4. **取樣驗證**：節點隨機選擇若干 columns 下載，用 KZG proof 驗證每個 column 的值確實屬於 committed 的多項式

**數學上**：如果 blob 多項式是 $p(x)$（degree < 4096），PeerDAS 將 $p(x)$ evaluate 在更多點 $\{z_0, z_1, ..., z_{m-1}\}$ 上，產生 $m$ 個 columns。節點只需驗證少數幾個 $(z_i, p(z_i))$ 的 KZG opening proof，就能確信完整資料是可用的（在足夠誠實節點參與取樣的前提下）。

這個設計讓 blob 容量可以大幅提升（Fusaka 後透過 BPO 機制達到 target 14 / max 21），而不需要每個節點下載所有資料。

## 效能數據

| 操作 | 時間 |
|------|------|
| Blob commitment | ~5ms |
| Point evaluation proof | ~5ms |
| Verification | ~3ms（2 pairings） |
| Commitment 大小 | 48 bytes |
| Proof 大小 | 48 bytes |

## 程式碼範例

```javascript
// 使用 c-kzg-4844 庫（Ethereum 官方實作的 Node.js binding）
const cKzg = require("c-kzg");

// 初始化 trusted setup
cKzg.loadTrustedSetup("trusted_setup.txt");

// 建立 blob commitment
function commitToBlob(blobHex) {
  const blob = Buffer.from(blobHex, "hex");
  const commitment = cKzg.blobToKzgCommitment(blob);
  return commitment;
}

// 計算 versioned hash
function computeVersionedHash(commitment) {
  const hash = require("crypto").createHash("sha256").update(commitment).digest();
  hash[0] = 0x01;  // version byte
  return hash;
}

// 建立和驗證 proof
function createAndVerifyProof(blob, commitment, z) {
  const { proof, y } = cKzg.computeKzgProof(blob, z);
  const valid = cKzg.verifyKzgProof(commitment, z, y, proof);
  return { proof, y, valid };
}

// 驗證整個 blob
function verifyBlobProof(blob, commitment, proof) {
  return cKzg.verifyBlobKzgProof(blob, commitment, proof);
}
```

## 相關概念

- [KZG Commitments 通用理論](/fundamentals/cryptography/kzg-commitments/) - 數學原理、與其他 PCS 的比較
- [EIP-4844 Proto-Danksharding](/ethereum/advanced/eip-4844/) - KZG 在 blob transaction 中的應用
- [Verkle Trees](/ethereum/advanced/verkle-trees/) - KZG 在新 trie 結構中的應用
- [BLS12-381](/ethereum/cryptography/bls12-381/) - KZG 使用的橢圓曲線（pairing-friendly）
- [橢圓曲線密碼學](/fundamentals/cryptography/elliptic-curve-cryptography/) - KZG 的數學基礎
- [Precompiled Contracts](/ethereum/advanced/precompiled-contracts/) - Point evaluation precompile
- [zkSNARKs 支援](/ethereum/advanced/zksnarks/) - KZG 與 zk-proof 系統的關聯
- [Beacon Chain](/ethereum/consensus/beacon-chain/) - Blob sidecar 驗證使用 KZG
