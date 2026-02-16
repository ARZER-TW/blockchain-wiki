---
title: "簽名方案比較：ECDSA vs Schnorr vs Ed25519"
description: "Bitcoin ECDSA/Schnorr、Ethereum ECDSA/BLS、Solana Ed25519 三大簽名方案的密碼學原理與效能比較"
tags: [comparison, bitcoin, ethereum, solana, cryptography, ecdsa, schnorr, ed25519, bls, digital-signature]
---

# 簽名方案比較：ECDSA vs Schnorr vs Ed25519

## 概述

數位簽章是區塊鏈安全的基石——每筆交易都需要以密碼學方式證明發送者的身份和授權。三條主流公鏈選擇了不同的簽名方案：Bitcoin 使用 [ECDSA](/fundamentals/cryptography/ecdsa/) over [secp256k1](/fundamentals/cryptography/secp256k1/)，並在 Taproot 升級後引入 [Schnorr Signatures](/bitcoin/cryptography/schnorr-signatures/)；Ethereum 在執行層使用 [ECDSA](/ethereum/cryptography/ecdsa/) over secp256k1，在共識層使用 [BLS Signatures](/fundamentals/cryptography/bls-signatures/) over [BLS12-381](/ethereum/cryptography/bls12-381/)；Solana 則選擇了 [Ed25519](/solana/cryptography/ed25519/)——一種基於 Twisted Edwards 曲線的 Schnorr-type 簽名方案。

這些選擇不僅反映了各鏈面世時的密碼學最佳實踐，也深刻影響了交易大小、驗證效率、聚合能力與開發者體驗。本文從密碼學原理、安全屬性和實際效能三個層面進行系統性比較。

## 快速比較表

| 屬性 | ECDSA (secp256k1) | Schnorr (secp256k1) | Ed25519 | BLS (BLS12-381) |
|------|-------------------|---------------------|---------|-----------------|
| **使用鏈** | Bitcoin, Ethereum | Bitcoin (Taproot) | Solana | Ethereum (共識層) |
| **曲線** | secp256k1 | secp256k1 | Curve25519 | BLS12-381 |
| **公鑰大小** | 33 bytes (壓縮) | 32 bytes | 32 bytes | 48 bytes |
| **簽名大小** | 71-73 bytes (DER) | 64 bytes | 64 bytes | 96 bytes |
| **Nonce 生成** | 隨機 / RFC 6979 | 確定性 (BIP 340) | 確定性 | 確定性 |
| **簽名聚合** | 不原生支援 | 原生支援 (MuSig2) | 不原生支援 | 原生支援 |
| **批量驗證** | 無顯著加速 | 有加速 | 有顯著加速 | 有加速 |
| **安全等級** | ~128 bit | ~128 bit | ~128 bit | ~128 bit |

## Bitcoin：ECDSA + Schnorr

### 設計哲學

Bitcoin 最初選擇 ECDSA 是因為它在 2008 年是唯一廣泛可用的橢圓曲線簽名標準（Schnorr 當時仍受專利保護）。2021 年的 Taproot 升級（BIP 340/341/342）引入了 [Schnorr Signatures](/bitcoin/cryptography/schnorr-signatures/)，補齊了 ECDSA 缺乏的簽名聚合能力。

### 技術細節

#### ECDSA over secp256k1

[secp256k1](/fundamentals/cryptography/secp256k1/) 曲線方程：

$$y^2 = x^3 + 7 \pmod{p}$$

其中 $p = 2^{256} - 2^{32} - 977$。

**簽名 (Sign)**：
1. 選取隨機 $k$（或 RFC 6979 確定性生成）
2. 計算 $R = k \cdot G$，取 $r = R_x \mod n$
3. 計算 $s = k^{-1}(z + r \cdot d) \mod n$
4. 簽名為 $(r, s)$

**驗證 (Verify)**：
1. 計算 $u_1 = z \cdot s^{-1} \mod n$
2. 計算 $u_2 = r \cdot s^{-1} \mod n$
3. 計算 $R' = u_1 \cdot G + u_2 \cdot Q$
4. 驗證 $R'_x \equiv r \pmod{n}$

ECDSA 驗證需要**模反元素運算**（$s^{-1}$），這是其效率瓶頸之一。

#### Schnorr Signatures (BIP 340)

Schnorr 簽名基於一個更簡單的代數結構：

**簽名**：
1. 確定性生成 nonce：$k = H(\text{secret\_nonce\_key} \| P \| m)$
2. $R = k \cdot G$
3. $e = H(R \| P \| m)$
4. $s = k + e \cdot d \mod n$
5. 簽名為 $(R, s)$，共 64 bytes

**驗證**：
$$s \cdot G \stackrel{?}{=} R + H(R \| P \| m) \cdot P$$

#### Schnorr 的線性性質

Schnorr 簽名的核心優勢是**線性聚合性**：

$$\text{若 } s_1 = k_1 + e \cdot d_1, \quad s_2 = k_2 + e \cdot d_2$$

$$\text{則 } s_1 + s_2 = (k_1 + k_2) + e \cdot (d_1 + d_2)$$

這使得多方可以合作產生一個**聯合簽名**，在鏈上看起來與單一簽名完全相同（MuSig2 協議）。

### Bitcoin 簽名的演進

| 階段 | 方案 | Script 類型 | 特性 |
|------|------|------------|------|
| 2009 | ECDSA | [P2PKH](/bitcoin/transactions/p2pkh/) | 基礎簽名 |
| 2012 | ECDSA | [P2SH](/bitcoin/transactions/p2sh/) | 多簽支援 |
| 2017 | ECDSA | [P2WPKH/P2WSH](/bitcoin/transactions/p2wpkh-p2wsh/) | SegWit 簽名隔離 |
| 2021 | Schnorr | [P2TR](/bitcoin/transactions/p2tr/) | 簽名聚合、Tapscript |

### 優勢

- **雙重選擇**：ECDSA 向後相容 + Schnorr 提供聚合能力
- **Schnorr 聚合**：多簽在鏈上呈現為單一簽名，節省空間與費用
- **隱私提升**：MuSig2 讓多簽、Tapscript 路徑無法與普通轉帳區分
- **久經考驗**：secp256k1 + ECDSA 已運行 15+ 年

### 限制

- **ECDSA 無聚合性**：舊格式交易仍需逐一驗證
- **k-reuse 風險**：ECDSA 的隨機 nonce 若重複，私鑰洩露
- **DER 編碼開銷**：ECDSA 簽名 71-73 bytes（vs Schnorr 64 bytes）

## Ethereum：ECDSA + BLS

### 設計哲學

Ethereum 在執行層沿用了與 Bitcoin 相同的 ECDSA over secp256k1，確保與現有工具鏈的相容性。但在 PoS 共識層，Ethereum 選擇了 [BLS Signatures](/fundamentals/cryptography/bls-signatures/) over [BLS12-381](/ethereum/cryptography/bls12-381/) 曲線——因為 BLS 提供了原生的簽名聚合能力，對於需要聚合數十萬 [validator](/ethereum/consensus/validators/) 簽名的共識層至關重要。

### 技術細節

#### ECDSA on Ethereum

Ethereum 的 ECDSA 使用與 Bitcoin 相同的 secp256k1 曲線，但有幾個 Ethereum 特有的設計：

**地址推導**：
$$\text{address} = \text{keccak256}(pubkey_{uncompressed})[12:]$$

**[ecrecover](/ethereum/cryptography/ecrecover/) precompile**：
Ethereum 提供了原生的簽名恢復函數，可從簽名 $(r, s, v)$ 和訊息 hash 直接恢復公鑰：

```solidity
// Solidity 中的 ecrecover 使用
address signer = ecrecover(messageHash, v, r, s);
require(signer == expectedAddress, "Invalid signature");
```

其中 $v$ 是 recovery id（27 或 28），用於指示從哪個 $R$ 點恢復公鑰。Ethereum 的 [EIP-155](/ethereum/accounts/eip-155/) 進一步將 chain ID 編碼進 $v$ 值以防止跨鏈重放攻擊。

#### BLS Signatures on BLS12-381

BLS12-381 是一條 pairing-friendly 曲線，提供了雙線性映射：

$$e: \mathbb{G}_1 \times \mathbb{G}_2 \rightarrow \mathbb{G}_T$$

**BLS 簽名**：
- 私鑰 $sk \in \mathbb{F}_r$
- 公鑰 $pk = sk \cdot G_1 \in \mathbb{G}_1$
- 簽名：$\sigma = sk \cdot H(m) \in \mathbb{G}_2$

**BLS 驗證**：
$$e(pk, H(m)) \stackrel{?}{=} e(G_1, \sigma)$$

#### BLS 聚合的威力

BLS 的核心優勢是**非互動式簽名聚合**：

$$\sigma_{agg} = \sigma_1 + \sigma_2 + \cdots + \sigma_n$$

$$e\left(\sum_{i=1}^{n} pk_i, H(m)\right) \stackrel{?}{=} e(G_1, \sigma_{agg})$$

在 Ethereum 共識層，每個 epoch 有 ~100 萬個 attestation 需要驗證。BLS 聚合將這些壓縮為少量的聚合簽名，使得驗證成本從 $O(n)$ 降到近乎 $O(1)$。

### 優勢

- **雙層設計**：執行層用成熟的 ECDSA，共識層用高效的 BLS
- **BLS 聚合**：支撐大規模 validator 集合（~100 萬）
- **ecrecover**：智能合約可原生驗證 ECDSA 簽名
- **生態相容**：與 Bitcoin 使用相同曲線，工具可複用

### 限制

- **BLS 驗證較慢**：單次 pairing 運算比 ECDSA 慢 ~10x
- **BLS 金鑰管理複雜**：validator 需要管理獨立的 BLS 金鑰
- **兩套密碼系統**：增加了整體複雜度
- **Rogue key attack**：BLS 聚合需要 proof-of-possession 防護

## Solana：Ed25519

### 設計哲學

Solana 選擇 [Ed25519](/solana/cryptography/ed25519/) 反映了其對**性能至上**的設計原則。Ed25519 是目前已知最快的橢圓曲線簽名方案之一，具有確定性 nonce（消除 $k$-reuse 風險）、固定時間實作（防 side-channel attack）和出色的批量驗證能力。在 Solana 每秒處理數千筆交易的場景下，簽名驗證的效率至關重要。

### 技術細節

#### Twisted Edwards Curve (Curve25519)

$$-x^2 + y^2 = 1 + d \cdot x^2 y^2$$

其中 $d = -121665/121666$，$p = 2^{255} - 19$。

基點 $B$ 的階：

$$\ell = 2^{252} + 27742317777372353535851937790883648493$$

#### 金鑰生成

```
seed = random_32_bytes()
(a || nonce_key) = SHA-512(seed)
a = clamp(a)       // 清除低 3 bits, 設 bit 254 = 1, 清 bit 255
A = a * B          // 公鑰 = 壓縮的 32 bytes
```

#### 確定性 Nonce

Ed25519 最重要的安全特性——nonce 是**確定性**生成的：

$$r = H(\text{nonce\_key} \| M)$$

其中 $\text{nonce\_key}$ 是 $H(\text{seed})$ 的後 32 bytes，$M$ 是訊息。這**徹底消除**了 ECDSA 中 $k$-reuse 導致私鑰洩露的風險。

#### 簽名

1. $r = H(\text{nonce\_key} \| M) \mod \ell$
2. $R = r \cdot B$
3. $S = r + H(R \| A \| M) \cdot a \mod \ell$
4. 簽名為 $(R, S)$，共 64 bytes

#### 驗證

$$S \cdot B \stackrel{?}{=} R + H(R \| A \| M) \cdot A$$

注意驗證中**沒有模反元素運算**（不像 ECDSA 需要 $s^{-1}$），這是 Ed25519 驗證更快的原因之一。

#### 批量驗證

Ed25519 支援高效的批量驗證。驗證 $n$ 個簽名 $(R_i, S_i, A_i, M_i)$：

選取隨機因子 $z_i$，檢查：

$$\left(\sum_i z_i \cdot S_i\right) \cdot B \stackrel{?}{=} \sum_i z_i \cdot R_i + \sum_i z_i \cdot H(R_i \| A_i \| M_i) \cdot A_i$$

這只需要一次多標量乘法（multi-scalar multiplication），比逐一驗證快 ~2-3x。對 Solana 的高吞吐量場景尤為重要。

### 優勢

- **高性能**：簽名與驗證速度均為頂級
- **確定性安全**：不存在 nonce 相關攻擊向量
- **批量驗證**：支援高效的平行批量驗證
- **簡潔一致**：整條鏈只用一套密碼系統
- **固定時間實作**：抗 timing side-channel attack

### 限制

- **無原生聚合**：不像 BLS 或 Schnorr 支援簽名聚合
- **曲線不同**：無法直接與 Bitcoin/Ethereum 的 secp256k1 工具互通
- **Cofactor 問題**：Curve25519 的 cofactor = 8，需要額外處理（clamping）

## 深度比較

### 安全屬性比較

| 安全屬性 | ECDSA | Schnorr | Ed25519 | BLS |
|----------|-------|---------|---------|-----|
| **EUF-CMA 安全** | 是（Random Oracle 下） | 是（證明更直接） | 是 | 是 |
| **確定性 Nonce** | RFC 6979 (選用) | BIP 340 (強制) | 內建 | 內建 |
| **k-reuse 免疫** | 否（需 RFC 6979） | 是 | 是 | 是 |
| **Malleability** | 有（需 low-S 規範化） | 無 | 有（需 cofactor 處理） | 無 |
| **Side-channel 抗性** | 取決於實作 | 取決於實作 | 設計即固定時間 | 取決於實作 |
| **Rogue key attack** | N/A | 需 MuSig 協議 | N/A | 需 proof-of-possession |

### 性能基準比較

| 操作 | ECDSA (secp256k1) | Schnorr (secp256k1) | Ed25519 | BLS (BLS12-381) |
|------|-------------------|---------------------|---------|-----------------|
| **金鑰生成** | ~50 us | ~50 us | ~30 us | ~100 us |
| **簽名** | ~50 us | ~50 us | ~25 us | ~200 us |
| **單次驗證** | ~100 us | ~80 us | ~60 us | ~1500 us |
| **批量驗證 (per sig)** | ~100 us | ~50 us | ~30 us | ~200 us |
| **聚合驗證 (1000 sigs)** | N/A | ~80 us (total) | N/A | ~1500 us (total) |

註：數值為近似值，實際性能取決於硬體與實作。

### 簽名聚合能力

<pre class="mermaid">
graph TD
    subgraph "ECDSA (Bitcoin Legacy)"
        E1[Sig 1 - 72B]
        E2[Sig 2 - 72B]
        E3[Sig 3 - 72B]
        ET[Total: ~216 bytes<br/>3x 驗證時間]
    end

    subgraph "Schnorr/MuSig2 (Bitcoin Taproot)"
        S1[Sig 1]
        S2[Sig 2]
        S3[Sig 3]
        SA[Aggregated Sig - 64B<br/>1x 驗證時間]
        S1 -->|aggregate| SA
        S2 -->|aggregate| SA
        S3 -->|aggregate| SA
    end

    subgraph "BLS (Ethereum Consensus)"
        B1[Sig 1]
        B2[Sig 2]
        B3["Sig ... n"]
        BA[Aggregated Sig - 96B<br/>1 pairing 驗證]
        B1 -->|aggregate| BA
        B2 -->|aggregate| BA
        B3 -->|aggregate| BA
    end

    style E1 fill:#f7931a,color:#fff
    style E2 fill:#f7931a,color:#fff
    style E3 fill:#f7931a,color:#fff
    style SA fill:#f7931a,color:#fff
    style BA fill:#627eea,color:#fff
</pre>

### 跨鏈密碼學互通

Solana 提供了 [Ed25519 precompile](/solana/cryptography/ed25519-precompile/) 和 [secp256k1 precompile](/solana/cryptography/secp256k1-precompile/)，使得 Solana 程式可以驗證 Ethereum/Bitcoin 的 ECDSA 簽名。Ethereum 同樣透過 [precompiled contracts](/ethereum/advanced/precompiled-contracts/) 支援 ecrecover 和其他密碼學操作。

## 實際影響

### 對開發者

**Bitcoin 開發者**：Taproot 後可以選擇 ECDSA（相容舊格式）或 Schnorr（新格式，省空間）。多簽場景強烈建議使用 Schnorr/MuSig2。

**Ethereum 開發者**：執行層只需處理 ECDSA，[ecrecover](/ethereum/cryptography/ecrecover/) 是驗證鏈下簽名最常用的工具。BLS 對一般 DApp 開發者透明（由共識層處理）。

**Solana 開發者**：Ed25519 是唯一的帳戶簽名方案。如需驗證其他鏈的簽名，可使用 precompile programs。

### 對使用者

三種方案對終端使用者幾乎透明——錢包軟體處理所有密碼學細節。使用者應關心的是：
- **私鑰備份**：所有方案都依賴私鑰安全
- **硬體錢包支援**：secp256k1 (BTC/ETH) 支援最廣泛，Ed25519 (SOL) 也已普及
- **交易費用**：Schnorr 聚合可降低 Bitcoin 多簽費用

### 對生態系統

密碼學方案的選擇影響了帳戶抽象、跨鏈橋、零知識證明等高階功能的設計。secp256k1 的跨鏈通用性使 Bitcoin-Ethereum 橋接較為直接，而 Ed25519 的獨立性意味著 Solana 跨鏈橋需要額外的密碼學轉換。

## 相關概念

- [ECDSA](/fundamentals/cryptography/ecdsa/) - ECDSA 基礎原理
- [secp256k1](/fundamentals/cryptography/secp256k1/) - secp256k1 曲線參數
- [Schnorr Signatures](/bitcoin/cryptography/schnorr-signatures/) - Bitcoin Schnorr 簽名
- [Taproot Key Tweaking](/bitcoin/cryptography/taproot-key-tweaking/) - Taproot 金鑰調整
- [secp256k1 in Bitcoin](/bitcoin/cryptography/secp256k1-in-bitcoin/) - Bitcoin 的 secp256k1 使用
- [ECDSA (ETH)](/ethereum/cryptography/ecdsa/) - Ethereum 的 ECDSA 實作
- [ecrecover](/ethereum/cryptography/ecrecover/) - Ethereum 簽名恢復
- [BLS Signatures](/fundamentals/cryptography/bls-signatures/) - BLS 簽名原理
- [BLS12-381](/ethereum/cryptography/bls12-381/) - BLS12-381 曲線
- [Ed25519](/solana/cryptography/ed25519/) - Solana 的 Ed25519 實作
- [Ed25519 Precompile](/solana/cryptography/ed25519-precompile/) - Solana Ed25519 預編譯
- [secp256k1 Precompile](/solana/cryptography/secp256k1-precompile/) - Solana secp256k1 預編譯
- [Precompiled Contracts](/ethereum/advanced/precompiled-contracts/) - Ethereum 預編譯合約
- [共識機制比較](/comparisons/consensus-mechanisms/) - 三鏈共識機制對比
