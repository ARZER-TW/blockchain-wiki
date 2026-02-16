---
title: "BLS Signatures"
description: "BLS 簽名, BLS Signature, Boneh-Lynn-Shacham"
tags: [ethereum, cryptography, digital-signature, BLS, beacon-chain]
---

# BLS Signatures

## 概述

BLS（Boneh-Lynn-Shacham）簽名是基於雙線性配對（bilinear pairing）的數位簽章方案。Ethereum [Beacon Chain](/ethereum/consensus/beacon-chain/) 選擇 BLS 簽名的核心原因是其聚合特性——數千個 [Validators](/ethereum/consensus/validators/) 的簽名可以聚合為一個 96-byte 的簽名，大幅降低共識通訊和驗證成本。底層曲線為 [BLS12-381](/ethereum/cryptography/bls12-381/)。

## 核心原理

### 前置知識

BLS 簽名依賴 [BLS12-381](/ethereum/cryptography/bls12-381/) 的雙線性配對 $e: G_1 \times G_2 \rightarrow G_T$，滿足：

$$e(aP, bQ) = e(P, Q)^{ab}$$

### 金鑰生成（KeyGen）

1. 隨機選取私鑰 $\text{sk} \in [1, r-1]$（$r$ 是群的階），使用 [CSPRNG](/ethereum/cryptography/csprng/)
2. 計算公鑰 $\text{pk} = \text{sk} \cdot G_1 \in G_1$（48 bytes 壓縮）

Ethereum 選擇公鑰在 $G_1$（更短）、簽名在 $G_2$（更長），因為 Beacon Chain 需要頻繁聚合公鑰，較短的公鑰減少儲存成本。

### 簽名（Sign）

1. 將訊息 $m$ 映射到 $G_2$ 上的一個點：$H(m) \in G_2$（Hash-to-curve，見下文）
2. 計算簽名：$\sigma = \text{sk} \cdot H(m) \in G_2$（96 bytes 壓縮）

BLS 簽名是**確定性**的——同樣的私鑰和訊息永遠產生同樣的簽名，不像 [ECDSA](/ethereum/cryptography/ecdsa/) 需要隨機數 $k$。

### 驗證（Verify）

驗證等式：

$$e(G_1, \sigma) = e(\text{pk}, H(m))$$

**正確性證明：**

$$e(G_1, \sigma) = e(G_1, \text{sk} \cdot H(m)) = e(G_1, H(m))^{\text{sk}}$$

$$e(\text{pk}, H(m)) = e(\text{sk} \cdot G_1, H(m)) = e(G_1, H(m))^{\text{sk}}$$

兩邊相等，驗證通過。

實際實作中，更常用的等效形式是：

$$e(G_1, \sigma) \cdot e(-\text{pk}, H(m)) = 1_{G_T}$$

或

$$e(\text{pk}, H(m)) \stackrel{?}{=} e(G_1, \sigma)$$

### 簽名聚合（Aggregation）

這是 BLS 最強大的特性。

**同一訊息的聚合（Attestation 場景）：**

$n$ 個 validator 對同一個 attestation data $m$ 簽名：

$$\sigma_{\text{agg}} = \sigma_1 + \sigma_2 + \cdots + \sigma_n = \sum_{i=1}^{n} \text{sk}_i \cdot H(m)$$

聚合公鑰：

$$\text{pk}_{\text{agg}} = \text{pk}_1 + \text{pk}_2 + \cdots + \text{pk}_n$$

驗證：

$$e(G_1, \sigma_{\text{agg}}) = e(\text{pk}_{\text{agg}}, H(m))$$

一次配對運算驗證數千個簽名。

**不同訊息的聚合：**

$$\sigma_{\text{agg}} = \sum_{i=1}^{n} \sigma_i$$

驗證需要 $n + 1$ 次配對：

$$e(G_1, \sigma_{\text{agg}}) = \prod_{i=1}^{n} e(\text{pk}_i, H(m_i))$$

### Hash-to-Curve

將任意訊息映射到 $G_2$ 上的點，必須是安全的（不能洩漏離散對數關係）。Ethereum 使用 [draft-irtf-cfrg-hash-to-curve](https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-hash-to-curve) 的 `hash_to_G2` 方法：

1. 用 `expand_message_xmd`（基於 SHA-256）將訊息擴展
2. 映射到曲線上的兩個點
3. 相加得到最終的 $G_2$ 點

Domain Separation Tag（DST）：`BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_`

### Rogue Key Attack 防護

攻擊者可以選擇惡意公鑰 $\text{pk}' = \text{pk}_{\text{attacker}} - \text{pk}_{\text{victim}}$，使聚合後看起來像是 victim 也簽了。

防護方案（Ethereum 使用 Proof of Possession）：

1. 每個 validator 在註冊時必須提供其公鑰的 PoP：$\text{PoP} = \text{sk} \cdot H_{\text{PoP}}(\text{pk})$
2. 這證明 validator 確實擁有該公鑰對應的私鑰
3. DST 與普通簽名不同，防止混淆

### 安全性

BLS 簽名的安全性基於：
- **CDH（Computational Diffie-Hellman）假設**在 $G_1, G_2$ 上的困難性
- **co-CDH 假設**：給定 $aP \in G_1$ 和 $Q \in G_2$，計算 $aQ$ 不可行

## 在 Ethereum 中的應用

- **[Attestation](/ethereum/consensus/attestation/)**：每個 slot 約有數千個 validator 簽署 attestation，同一 committee 的簽名聚合為一個
- **Sync Committee**：512 個 validator 的 BLS 簽名聚合，用於輕客戶端驗證
- **[Casper FFG](/ethereum/consensus/casper-ffg/)**：finality 投票使用 BLS 簽名
- **[RANDAO](/ethereum/consensus/randao/)**：每個 block proposer 提供 BLS 簽名作為隨機性來源（BLS 的確定性保證同一 epoch reveal 值唯一）
- **Validator Deposit**：存入 32 ETH 時附帶 BLS 公鑰和 PoP
- **[Slashing](/ethereum/consensus/slashing/)**：被 slash 的證據中包含衝突的 BLS 簽名

### 效率數據

| 場景 | 無聚合 | 有聚合 |
|------|--------|--------|
| 每 slot 簽名大小 | ~32,000 * 96B = 3MB | 96B |
| 公鑰儲存 | 48B per validator | 48B per validator |
| 驗證（同訊息） | 32,000 次配對 | 1 次配對 |

## 程式碼範例

```python
from py_ecc.bls import G2ProofOfPossession as bls
import secrets

# === 基本 BLS 簽名 ===

# 金鑰生成
private_key = secrets.token_bytes(32)
public_key = bls.SkToPk(private_key)
print(f"Public key:  {public_key.hex()[:40]}... ({len(public_key)} bytes)")

# 簽名
message = b"epoch:100|slot:3200|source:99|target:100"
signature = bls.Sign(private_key, message)
print(f"Signature:   {signature.hex()[:40]}... ({len(signature)} bytes)")

# 驗證
assert bls.Verify(public_key, message, signature)
print("[OK] Single signature verified")

# === 簽名聚合（模擬 Beacon Chain attestation）===
NUM_VALIDATORS = 128  # 一個 committee 的大小

# 生成所有 validator 的金鑰
keys = [secrets.token_bytes(32) for _ in range(NUM_VALIDATORS)]
pubkeys = [bls.SkToPk(k) for k in keys]

# 所有 validator 對同一 attestation data 簽名
attestation_data = b"slot:3200|index:0|beacon_block_root:0xabcd|source:99|target:100"
signatures = [bls.Sign(k, attestation_data) for k in keys]

# 聚合
aggregated_sig = bls.Aggregate(signatures)
print(f"\nAggregated {NUM_VALIDATORS} signatures into {len(aggregated_sig)} bytes")

# 驗證聚合簽名（所有 validator 簽同一訊息）
assert bls.AggregateVerify(pubkeys, [attestation_data] * NUM_VALIDATORS, aggregated_sig)
print("[OK] Aggregated signature verified")

# Fast aggregate verify（同一訊息，更高效）
assert bls.FastAggregateVerify(pubkeys, attestation_data, aggregated_sig)
print("[OK] Fast aggregate verify passed")

# === 確定性驗證 ===
sig1 = bls.Sign(private_key, message)
sig2 = bls.Sign(private_key, message)
assert sig1 == sig2
print("\n[OK] BLS signatures are deterministic")

# === Proof of Possession ===
# Ethereum validator 註冊時需要提供 PoP
pop = bls.PopProve(private_key)
assert bls.PopVerify(public_key, pop)
print("[OK] Proof of Possession verified")

# === RANDAO 模擬 ===
# 每個 epoch 的 reveal 是 BLS(sk, epoch_number)
epoch = 100
randao_reveal = bls.Sign(private_key, epoch.to_bytes(8, 'big'))
# 因為 BLS 是確定性的，同一個 proposer 在同一 epoch 只能產生一個 reveal
# 這防止了 proposer 選擇性揭示
print(f"\nRANDAO reveal for epoch {epoch}: {randao_reveal.hex()[:40]}...")
```

## 相關概念

- [BLS12-381](/ethereum/cryptography/bls12-381/) - BLS 簽名使用的底層曲線
- [數位簽章概述](/ethereum/cryptography/digital-signature-overview/) - 數位簽章的通用概念
- [ECDSA](/ethereum/cryptography/ecdsa/) - 執行層使用的替代簽章方案
- [橢圓曲線密碼學](/ethereum/cryptography/elliptic-curve-cryptography/) - 底層數學基礎
- [Beacon Chain](/ethereum/consensus/beacon-chain/) - 使用 BLS 簽名的共識層
- [Validators](/ethereum/consensus/validators/) - BLS 金鑰的持有者
- [Attestation](/ethereum/consensus/attestation/) - 使用 BLS 簽署的投票
- [Casper FFG](/ethereum/consensus/casper-ffg/) - finality 投票使用 BLS
- [RANDAO](/ethereum/consensus/randao/) - 利用 BLS 確定性的隨機性混合
- [Slashing](/ethereum/consensus/slashing/) - 衝突 BLS 簽名作為證據
- [CSPRNG](/ethereum/cryptography/csprng/) - 私鑰生成的隨機數來源
- [KZG Commitments](/ethereum/advanced/kzg-commitments/) - 同樣基於 BLS12-381 的配對
