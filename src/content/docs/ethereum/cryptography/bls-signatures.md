---
title: "BLS Signatures"
description: "BLS 簽名, BLS Signature, Boneh-Lynn-Shacham"
tags: [ethereum, cryptography, digital-signature, BLS, beacon-chain]
---

# BLS Signatures

> 本文聚焦 Ethereum 特定的實現細節。通用理論請參見 [BLS Signatures 原理](/fundamentals/cryptography/bls-signatures/)。

## 概述

Ethereum [Beacon Chain](/ethereum/consensus/beacon-chain/) 選擇 BLS 簽名的核心原因是其聚合特性——數千個 [Validators](/ethereum/consensus/validators/) 的簽名可以聚合為一個 96-byte 的簽名，大幅降低共識通訊和驗證成本。底層曲線為 [BLS12-381](/ethereum/cryptography/bls12-381/)。關於 BLS 簽名的數學原理（簽名/驗證/聚合公式、正確性證明、rogue key attack 防護），請參見 [通用理論](/fundamentals/cryptography/bls-signatures/)。

## Ethereum 的 BLS 方案選擇

Ethereum 選擇公鑰在 $G_1$（48 bytes 壓縮）、簽名在 $G_2$（96 bytes 壓縮），因為 Beacon Chain 需要頻繁聚合公鑰，較短的公鑰減少儲存成本。

Hash-to-curve 使用 [draft-irtf-cfrg-hash-to-curve](https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-hash-to-curve) 的 `hash_to_G2` 方法，Domain Separation Tag 為 `BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_`。

Rogue key attack 防護採用 Proof of Possession（PoP）方案：每個 validator 在註冊時提供 $\text{PoP} = \text{sk} \cdot H_{\text{PoP}}(\text{pk})$。

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

# === Beacon Chain Attestation 模擬 ===

# 生成 validator 金鑰
NUM_VALIDATORS = 128  # 一個 committee 的大小
keys = [secrets.token_bytes(32) for _ in range(NUM_VALIDATORS)]
pubkeys = [bls.SkToPk(k) for k in keys]

# 所有 validator 對同一 attestation data 簽名
attestation_data = b"slot:3200|index:0|beacon_block_root:0xabcd|source:99|target:100"
signatures = [bls.Sign(k, attestation_data) for k in keys]

# 聚合
aggregated_sig = bls.Aggregate(signatures)
print(f"Aggregated {NUM_VALIDATORS} signatures into {len(aggregated_sig)} bytes")

# 驗證聚合簽名（同一訊息，高效路徑）
assert bls.FastAggregateVerify(pubkeys, attestation_data, aggregated_sig)
print("[OK] Fast aggregate verify passed")

# === Proof of Possession（Validator 註冊時需要）===
private_key = keys[0]
public_key = pubkeys[0]
pop = bls.PopProve(private_key)
assert bls.PopVerify(public_key, pop)
print("[OK] Proof of Possession verified")

# === RANDAO 模擬 ===
# 每個 epoch 的 reveal 是 BLS(sk, epoch_number)
epoch = 100
randao_reveal = bls.Sign(private_key, epoch.to_bytes(8, 'big'))
# 因為 BLS 是確定性的，同一個 proposer 在同一 epoch 只能產生一個 reveal
print(f"RANDAO reveal for epoch {epoch}: {randao_reveal.hex()[:40]}...")
```

## 相關概念

- [BLS Signatures 原理](/fundamentals/cryptography/bls-signatures/) - 通用 BLS 理論（簽名/驗證/聚合數學、rogue key attack、與 ECDSA 比較）
- [BLS12-381](/ethereum/cryptography/bls12-381/) - BLS 簽名使用的底層曲線
- [數位簽章概述](/ethereum/cryptography/digital-signature-overview/) - Ethereum 的雙簽章系統
- [ECDSA](/ethereum/cryptography/ecdsa/) - 執行層使用的替代簽章方案
- [Beacon Chain](/ethereum/consensus/beacon-chain/) - 使用 BLS 簽名的共識層
- [Validators](/ethereum/consensus/validators/) - BLS 金鑰的持有者
- [Attestation](/ethereum/consensus/attestation/) - 使用 BLS 簽署的投票
- [Casper FFG](/ethereum/consensus/casper-ffg/) - finality 投票使用 BLS
- [RANDAO](/ethereum/consensus/randao/) - 利用 BLS 確定性的隨機性混合
- [Slashing](/ethereum/consensus/slashing/) - 衝突 BLS 簽名作為證據
- [KZG Commitments](/ethereum/advanced/kzg-commitments/) - 同樣基於 BLS12-381 的配對
