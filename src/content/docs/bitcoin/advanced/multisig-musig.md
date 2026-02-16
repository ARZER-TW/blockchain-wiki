---
title: "Multisig & MuSig"
description: "Bitcoin 多簽技術：傳統 OP_CHECKMULTISIG、Schnorr 金鑰聚合 MuSig/MuSig2、FROST 門檻簽名"
tags: [bitcoin, advanced, multisig, musig, musig2, frost, schnorr, key-aggregation, threshold]
---

# Multisig & MuSig

## 概述

多重簽名（Multisig）是 Bitcoin 安全的基石之一，要求 $m$-of-$n$ 個授權方中至少 $m$ 個提供有效簽名才能花費資金。從最早的 `OP_CHECKMULTISIG`（2012 年 P2SH 啟用）到 MuSig2 的 Schnorr 金鑰聚合（2021 年 Taproot 啟用），多簽技術經歷了根本性的演進。

MuSig 系列協議利用 [Schnorr 簽名](/bitcoin/cryptography/schnorr-signatures/) 的線性特性，將多個公鑰聚合為單一公鑰、多個簽名聚合為單一簽名。在鏈上觀察者看來，MuSig 交易與普通的單簽 [P2TR](/bitcoin/transactions/p2tr/) 交易完全相同，大幅提升了隱私性和效率。

## 傳統多簽：OP_CHECKMULTISIG

### 運作方式

Legacy 多簽使用 `OP_CHECKMULTISIG` 操作碼，在鏈上顯式暴露所有公鑰和簽名：

```
# 2-of-3 多簽 scriptPubKey（P2SH 內部）
OP_2
<pubkey_1>
<pubkey_2>
<pubkey_3>
OP_3
OP_CHECKMULTISIG
```

花費時的 scriptSig：
```
OP_0  # dummy element (off-by-one bug)
<sig_1>
<sig_2>
```

### 問題

1. **Off-by-one bug**：`OP_CHECKMULTISIG` 會從堆疊多消耗一個元素，需要加一個無用的 `OP_0`
2. **隱私差**：所有 $n$ 個公鑰在鏈上公開，外部觀察者知道這是 m-of-n 多簽
3. **效率低**：$n$ 個公鑰 + $m$ 個簽名佔用大量區塊空間
4. **費用高**：隨著 $n$ 增加，交易體積線性增長

一個 2-of-3 多簽的 witness 大小約為：

$$\text{witness} \approx 1 + 2 \times 72 + 3 \times 33 = 244 \text{ bytes}$$

而等效的 MuSig2 Taproot key-path 只需：

$$\text{witness} = 64 \text{ bytes (single Schnorr signature)}$$

## MuSig（BIP-327）

### Schnorr 金鑰聚合

MuSig 利用 Schnorr 簽名的線性代數特性，將 $n$ 個公鑰聚合為一個聚合公鑰：

$$P_{\text{agg}} = \sum_{i=1}^{n} a_i \cdot P_i$$

其中 $a_i$ 是公鑰相關的聚合係數，用於防禦 rogue key attack：

$$a_i = H_{\text{agg}}(L \| P_i) \quad \text{where} \quad L = H(P_1 \| P_2 \| \ldots \| P_n)$$

### Rogue Key Attack 防禦

如果不使用聚合係數，攻擊者 Mallory 可以選擇公鑰：

$$P_M' = P_M - P_A$$

使得 $P_{\text{agg}} = P_A + P_M' = P_M$，Mallory 就能獨自簽名。聚合係數 $a_i$ 使這種攻擊在計算上不可行。

## MuSig2：兩輪簽名協議

### 為何需要 MuSig2

原始 MuSig 需要三輪通訊（nonce commitment、nonce reveal、partial signature）。MuSig2 將前兩輪合併為一輪預處理，實現兩輪（甚至可預處理為一輪）簽名。

### 協議流程

**Round 1（Nonce 交換，可預處理）：**

每個簽名者 $i$ 產生兩個 nonce pair：

$$(r_{i,1}, R_{i,1}) \quad \text{and} \quad (r_{i,2}, R_{i,2})$$

並廣播 $(R_{i,1}, R_{i,2})$。

**Round 2（簽名）：**

聚合 nonce：

$$R = \sum_{i} R_{i,1} + b \cdot \sum_{i} R_{i,2}$$

其中 $b = H_{\text{non}}(P_{\text{agg}} \| R_1 \| R_2 \| \ldots \| m)$。

每個簽名者計算 partial signature：

$$s_i = r_{i,1} + b \cdot r_{i,2} + e \cdot a_i \cdot x_i$$

聚合簽名：

$$s = \sum_{i} s_i$$

最終簽名 $(R, s)$ 與普通的 Schnorr 簽名完全相同，驗證方程不變：

$$s \cdot G = R + e \cdot P_{\text{agg}}$$

## FROST：門檻 Schnorr 簽名

### $t$-of-$n$ 門檻簽名

MuSig/MuSig2 是 $n$-of-$n$ 方案（所有參與者都必須簽名）。FROST（Flexible Round-Optimized Schnorr Threshold signatures）實現了 $t$-of-$n$ 門檻簽名。

FROST 使用 Shamir's Secret Sharing 將密鑰分為 $n$ 份，其中任意 $t$ 份可重建簽名能力：

$$f(x) = a_0 + a_1 x + a_2 x^2 + \ldots + a_{t-1} x^{t-1}$$

每個參與者 $i$ 持有 share $f(i)$，$a_0$ 即為群體密鑰。

### Lagrange 插值

$t$ 個簽名者透過 Lagrange 插值係數協作產生簽名：

$$\lambda_i = \prod_{j \in S, j \neq i} \frac{j}{j - i}$$

partial signature：$s_i = r_i + e \cdot \lambda_i \cdot f(i)$

聚合後的簽名同樣是標準 Schnorr 簽名。

## 與 Ethereum Gnosis Safe 的比較

| 特徵 | Bitcoin MuSig2 | Bitcoin OP_CHECKMULTISIG | Ethereum Gnosis Safe |
|------|----------------|--------------------------|----------------------|
| 鏈上足跡 | 1 pubkey + 1 sig | $n$ pubkeys + $m$ sigs | Smart contract + sigs |
| 隱私 | 與單簽相同 | 暴露所有公鑰 | 暴露所有 signer |
| Gas/費用 | 最低 | 中等 | 較高（EVM 執行） |
| 靈活性 | 僅 $n$-of-$n$ | 任意 $m$-of-$n$ | 任意 $m$-of-$n$ + 模組 |
| 密鑰輪換 | 需新通道/地址 | 需新地址 | 合約內更新 |
| 門檻方案 | FROST（鏈下） | 原生支援 | 合約內支援 |
| 程式化策略 | 限於 Script | 限於 Script | 圖靈完備 |

## Taproot 中的多簽策略

Taproot 的 MAST（Merkelized Alternative Script Trees）允許將多種多簽策略組合在同一個地址中：

```
Key-path: MuSig2(Alice, Bob, Carol)  # 3-of-3 (最常見路徑)
Script-path leaf 1: 2-of-3 CHECKSIGADD  # 任二人（備用）
Script-path leaf 2: Alice + after(52560) # Alice 單簽（回退）
```

正常情況使用 key-path（MuSig2 聚合簽名），鏈上看起來像單簽交易。只有在某方離線時才使用 script-path。

## 程式碼範例

### JavaScript（MuSig2 金鑰聚合模擬）

```javascript
const crypto = require('crypto');

function taggedHash(tag, data) {
  const tagHash = crypto.createHash('sha256').update(tag).digest();
  return crypto.createHash('sha256')
    .update(Buffer.concat([tagHash, tagHash, data]))
    .digest();
}

function computeAggCoefficient(pubkeys, targetPubkey) {
  // L = H(P1 || P2 || ... || Pn)
  const L = crypto.createHash('sha256')
    .update(Buffer.concat(pubkeys))
    .digest();

  // a_i = H_agg(L || P_i)
  return taggedHash(
    'KeyAgg coefficient',
    Buffer.concat([L, targetPubkey])
  );
}

// 模擬 3 個參與者
const pubkeys = [
  crypto.randomBytes(33), // Alice
  crypto.randomBytes(33), // Bob
  crypto.randomBytes(33), // Carol
];

// 計算聚合係數
const coefficients = pubkeys.map(pk =>
  computeAggCoefficient(pubkeys, pk)
);

console.log('MuSig2 Key Aggregation:');
pubkeys.forEach((pk, i) => {
  console.log(`  Signer ${i}: pk=${pk.toString('hex').slice(0, 16)}...`);
  console.log(`    coeff=${coefficients[i].toString('hex').slice(0, 16)}...`);
});

// 比較交易大小
function compareTxSizes(m, n) {
  const legacyWitness = 1 + m * 72 + n * 33;    // dummy + sigs + pubkeys
  const checksigaddWitness = m * 65 + n * 33;    // Schnorr sigs + pubkeys
  const musigWitness = 64;                        // single Schnorr sig

  return { legacy: legacyWitness, checksigadd: checksigaddWitness, musig: musigWitness };
}

for (const [m, n] of [[2, 3], [3, 5], [5, 7], [11, 15]]) {
  const sizes = compareTxSizes(m, n);
  console.log(`\n${m}-of-${n}:`);
  console.log(`  Legacy CHECKMULTISIG: ${sizes.legacy} bytes`);
  console.log(`  Tapscript CHECKSIGADD: ${sizes.checksigadd} bytes`);
  console.log(`  MuSig2 key-path: ${sizes.musig} bytes`);
}
```

### Python（FROST 門檻簽名概念）

```python
from dataclasses import dataclass
from typing import List

@dataclass
class FROSTShare:
    index: int
    share: int  # f(index) mod q

def generate_polynomial(degree: int, secret: int, modulus: int) -> list:
    """產生隨機多項式，常數項為 secret"""
    import random
    coeffs = [secret]
    for _ in range(degree):
        coeffs.append(random.randint(1, modulus - 1))
    return coeffs

def evaluate_polynomial(coeffs: list, x: int, modulus: int) -> int:
    """在 x 點評估多項式"""
    result = 0
    for i, c in enumerate(coeffs):
        result = (result + c * pow(x, i, modulus)) % modulus
    return result

def lagrange_coefficient(i: int, participants: List[int], modulus: int) -> int:
    """計算 Lagrange 插值係數"""
    numerator = 1
    denominator = 1
    for j in participants:
        if j != i:
            numerator = (numerator * j) % modulus
            denominator = (denominator * (j - i)) % modulus
    return (numerator * pow(denominator, -1, modulus)) % modulus

# 模擬 2-of-3 FROST
MODULUS = 2**256 - 2**32 - 977  # secp256k1 order (approx)
SECRET = 12345

# 產生 degree-1 多項式 (t=2, so degree=t-1=1)
poly = generate_polynomial(degree=1, secret=SECRET, modulus=MODULUS)

# 分發 shares
shares = []
for i in range(1, 4):  # 3 個參與者
    share = evaluate_polynomial(poly, i, MODULUS)
    shares.append(FROSTShare(index=i, share=share))
    print(f"Share {i}: {share % 10**10}... (truncated)")

# 用任意 2 個 share 重建 secret
participants = [shares[0].index, shares[2].index]  # participant 1 and 3
reconstructed = 0
for s in [shares[0], shares[2]]:
    lam = lagrange_coefficient(s.index, participants, MODULUS)
    reconstructed = (reconstructed + lam * s.share) % MODULUS

print(f"\nOriginal secret: {SECRET}")
print(f"Reconstructed:   {reconstructed}")
print(f"Match: {reconstructed == SECRET}")
```

## 相關概念

- [Schnorr Signatures](/bitcoin/cryptography/schnorr-signatures/) - MuSig/FROST 的簽名數學基礎
- [P2TR](/bitcoin/transactions/p2tr/) - MuSig2 key-path spending 的交易格式
- [PSBT](/bitcoin/advanced/psbt/) - 多簽簽名流程的標準化格式
- [Tapscript](/bitcoin/advanced/tapscript/) - OP_CHECKSIGADD 的執行環境
- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - 傳統 OP_CHECKMULTISIG 的底層語言
- [Payment Channels](/bitcoin/advanced/payment-channels/) - 2-of-2 MuSig 通道 funding
- [Lightning Network](/bitcoin/advanced/lightning-network/) - MuSig2 改善通道隱私
- [ECDSA](/fundamentals/cryptography/ecdsa/) - 傳統多簽使用的簽名方案
- [Elliptic Curve Cryptography](/fundamentals/cryptography/elliptic-curve-cryptography/) - 金鑰聚合的橢圓曲線數學
- [secp256k1](/fundamentals/cryptography/secp256k1/) - Bitcoin 使用的橢圓曲線參數
- [Public Key Cryptography](/fundamentals/cryptography/public-key-cryptography/) - 公鑰密碼學基礎
