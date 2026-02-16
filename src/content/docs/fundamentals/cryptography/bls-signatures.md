---
title: "BLS Signatures"
description: "BLS Signature scheme - Boneh-Lynn-Shacham, pairing-based signatures with aggregation"
tags: [fundamentals, cryptography, digital-signature, BLS, pairing]
---

# BLS Signatures

## 概述

BLS（Boneh-Lynn-Shacham）簽名是基於雙線性配對（bilinear pairing）的 [數位簽章](/fundamentals/cryptography/digital-signature-overview/) 方案，由 Dan Boneh、Ben Lynn 和 Hovav Shacham 於 2001 年提出。BLS 簽名最強大的特性是其原生聚合能力——任意數量的簽名可以聚合為一個固定大小的簽名，大幅降低驗證和儲存成本。底層曲線通常使用 [BLS12-381](/fundamentals/cryptography/bls12-381/)。

## 核心原理

### 前置知識

BLS 簽名依賴 pairing-friendly 橢圓曲線的雙線性配對 $e: G_1 \times G_2 \rightarrow G_T$，滿足：

$$e(aP, bQ) = e(P, Q)^{ab}$$

關於配對數學的詳細說明，請參見 [BLS12-381](/fundamentals/cryptography/bls12-381/)。

### 金鑰生成（KeyGen）

1. 隨機選取私鑰 $\text{sk} \in [1, r-1]$（$r$ 是群的階），使用 [CSPRNG](/fundamentals/cryptography/csprng/)
2. 計算公鑰 $\text{pk} = \text{sk} \cdot G_1 \in G_1$

公鑰與簽名的群分配取決於實作方案：
- 公鑰在 $G_1$（較短，48 bytes）、簽名在 $G_2$（較長，96 bytes）——適合需要頻繁聚合公鑰的場景
- 公鑰在 $G_2$、簽名在 $G_1$——適合需要更短簽名的場景

### 簽名（Sign）

1. 將訊息 $m$ 映射到 $G_2$ 上的一個點：$H(m) \in G_2$（Hash-to-curve）
2. 計算簽名：$\sigma = \text{sk} \cdot H(m) \in G_2$

BLS 簽名是**確定性**的——同樣的私鑰和訊息永遠產生同樣的簽名，不像 [ECDSA](/fundamentals/cryptography/ecdsa/) 需要隨機數 $k$。這是一個重要的安全優勢，消除了 $k$ 重用攻擊的風險。

### 驗證（Verify）

驗證等式：

$$e(G_1, \sigma) = e(\text{pk}, H(m))$$

**正確性證明：**

$$e(G_1, \sigma) = e(G_1, \text{sk} \cdot H(m)) = e(G_1, H(m))^{\text{sk}}$$

$$e(\text{pk}, H(m)) = e(\text{sk} \cdot G_1, H(m)) = e(G_1, H(m))^{\text{sk}}$$

兩邊相等，驗證通過。

實際實作中，更常用的等效形式是：

$$e(G_1, \sigma) \cdot e(-\text{pk}, H(m)) = 1_{G_T}$$

### 簽名聚合（Aggregation）

這是 BLS 最強大的特性。

**同一訊息的聚合：**

$n$ 個簽名者對同一個訊息 $m$ 簽名：

$$\sigma_{\text{agg}} = \sigma_1 + \sigma_2 + \cdots + \sigma_n = \sum_{i=1}^{n} \text{sk}_i \cdot H(m)$$

聚合公鑰：

$$\text{pk}_{\text{agg}} = \text{pk}_1 + \text{pk}_2 + \cdots + \text{pk}_n$$

驗證：

$$e(G_1, \sigma_{\text{agg}}) = e(\text{pk}_{\text{agg}}, H(m))$$

一次配對運算驗證所有簽名。

**不同訊息的聚合：**

$$\sigma_{\text{agg}} = \sum_{i=1}^{n} \sigma_i$$

驗證需要 $n + 1$ 次配對：

$$e(G_1, \sigma_{\text{agg}}) = \prod_{i=1}^{n} e(\text{pk}_i, H(m_i))$$

### Hash-to-Curve

將任意訊息映射到橢圓曲線群上的點，必須是安全的（不能洩漏離散對數關係）。標準方法定義在 [draft-irtf-cfrg-hash-to-curve](https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-hash-to-curve)：

1. 用 `expand_message_xmd`（基於 SHA-256 等）將訊息擴展
2. 映射到曲線上的兩個點
3. 相加得到最終的曲線點

不同應用使用不同的 Domain Separation Tag（DST）以確保跨協議安全。

### Rogue Key Attack 防護

聚合簽名面臨 rogue key attack：攻擊者可以選擇惡意公鑰 $\text{pk}' = \text{pk}_{\text{attacker}} - \text{pk}_{\text{victim}}$，使聚合後看起來像是 victim 也簽了。

防護方案：

1. **Proof of Possession（PoP）**：每個簽名者在註冊時證明擁有私鑰，提交 $\text{PoP} = \text{sk} \cdot H_{\text{PoP}}(\text{pk})$。PoP 使用與普通簽名不同的 DST，防止混淆。
2. **Message Augmentation**：將公鑰附加到訊息中，$\sigma_i = \text{sk}_i \cdot H(\text{pk}_i \| m)$
3. **KOSK（Knowledge of Secret Key）**：在金鑰註冊時證明知道私鑰

### 安全性

BLS 簽名的安全性基於：
- **CDH（Computational Diffie-Hellman）假設**在 $G_1, G_2$ 上的困難性
- **co-CDH 假設**：給定 $aP \in G_1$ 和 $Q \in G_2$，計算 $aQ$ 不可行

### 與 ECDSA 的比較

| 性質 | [ECDSA](/fundamentals/cryptography/ecdsa/) | BLS |
|------|-------|-----|
| 簽名大小 | 64 bytes | 48 或 96 bytes（取決於群分配） |
| 驗證速度 | 快 | 慢（需配對運算） |
| 聚合 | 不支援 | 原生支援 |
| 確定性 | 非確定性（需隨機 $k$） | 確定性 |
| 公鑰恢復 | 支援 | 不支援 |
| 批量驗證 | 有限 | 高效（聚合後一次驗證） |

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
message = b"Hello, BLS!"
signature = bls.Sign(private_key, message)
print(f"Signature:   {signature.hex()[:40]}... ({len(signature)} bytes)")

# 驗證
assert bls.Verify(public_key, message, signature)
print("[OK] Single signature verified")

# === 簽名聚合 ===
NUM_SIGNERS = 10

# 生成所有簽名者的金鑰
keys = [secrets.token_bytes(32) for _ in range(NUM_SIGNERS)]
pubkeys = [bls.SkToPk(k) for k in keys]

# 所有簽名者對同一訊息簽名
signatures = [bls.Sign(k, message) for k in keys]

# 聚合
aggregated_sig = bls.Aggregate(signatures)
print(f"\nAggregated {NUM_SIGNERS} signatures into {len(aggregated_sig)} bytes")

# 驗證聚合簽名
assert bls.FastAggregateVerify(pubkeys, message, aggregated_sig)
print("[OK] Aggregated signature verified")

# === 確定性驗證 ===
sig1 = bls.Sign(private_key, message)
sig2 = bls.Sign(private_key, message)
assert sig1 == sig2
print("\n[OK] BLS signatures are deterministic")

# === Proof of Possession ===
pop = bls.PopProve(private_key)
assert bls.PopVerify(public_key, pop)
print("[OK] Proof of Possession verified")
```

## 相關概念

- [BLS12-381](/fundamentals/cryptography/bls12-381/) - BLS 簽名最常使用的底層曲線
- [數位簽章概述](/fundamentals/cryptography/digital-signature-overview/) - 數位簽章的通用概念
- [ECDSA](/fundamentals/cryptography/ecdsa/) - 另一種常見的橢圓曲線簽章方案
- [橢圓曲線密碼學](/fundamentals/cryptography/elliptic-curve-cryptography/) - 底層數學基礎
- [公鑰密碼學](/fundamentals/cryptography/public-key-cryptography/) - 非對稱密碼學的通用概念
- [CSPRNG](/fundamentals/cryptography/csprng/) - 私鑰生成的隨機數來源
