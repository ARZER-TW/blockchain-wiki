---
title: "KZG Commitments（多項式承諾）"
description: "KZG polynomial commitment scheme: trusted setup, commit, open, verify, pairing-based proof, comparison with IPA and FRI"
tags: [fundamentals, cryptography, polynomial-commitment, kzg, trusted-setup, zero-knowledge]
---

# KZG Commitments

## 概述

KZG（Kate-Zaverucha-Goldberg）Commitment 是一種 polynomial commitment scheme（PCS），允許 prover 對多項式做出承諾（commitment），之後可以證明該多項式在任意點的 evaluation 值，而不洩露多項式本身。KZG 基於橢圓曲線上的 bilinear pairing 運算，以極簡潔的 proof（僅 48 bytes）和常數時間驗證著稱。

Polynomial commitment scheme 是許多現代密碼學協議的核心構件，包括 zero-knowledge proof 系統、資料可用性方案、以及 vector commitment（如 Verkle Trees）。

## 數學基礎

KZG 依賴以下密碼學工具：

### 橢圓曲線 Pairing

雙線性映射 $e: \mathbb{G}_1 \times \mathbb{G}_2 \rightarrow \mathbb{G}_T$，滿足：
$$e(aP, bQ) = e(P, Q)^{ab}$$

其中 $\mathbb{G}_1, \mathbb{G}_2$ 是 pairing-friendly 橢圓曲線上的兩個群，$\mathbb{G}_T$ 是目標群。常用的曲線包括 BLS12-381 和 BN254。

### 多項式

一個 degree-$d$ 的多項式：
$$p(x) = a_0 + a_1 x + a_2 x^2 + ... + a_d x^d$$

KZG 的安全性基於 discrete logarithm problem（DLP）和 $d$-Strong Diffie-Hellman assumption。

## Trusted Setup

KZG 需要一次性的 trusted setup（結構化參考字串，SRS）：

選擇秘密值 $\tau$（toxic waste），計算：

$$\text{SRS} = \{[\tau^0]_1, [\tau^1]_1, ..., [\tau^d]_1, [\tau^0]_2, [\tau^1]_2\}$$

其中 $[x]_1 = x \cdot g_1$（$g_1$ 是 $\mathbb{G}_1$ 的生成元），$[x]_2 = x \cdot g_2$。

**安全要求**：$\tau$ 必須在 setup 完成後銷毀。實務上透過 multi-party computation（MPC）ceremony 進行：多方依序貢獻隨機值，只要其中任何一方誠實地銷毀了自己的部分，整個 setup 就是安全的（1-of-N trust assumption）。

Trusted setup 是 KZG 的主要缺點之一。如果 $\tau$ 洩露，攻擊者可以偽造任意 proof。

## Commitment

對多項式 $p(x) = \sum_{i=0}^{d} a_i x^i$ 做 commitment：

$$C = [p(\tau)]_1 = \sum_{i=0}^{d} a_i [\tau^i]_1$$

注意：計算 $C$ 不需要知道 $\tau$，只需要 SRS 中的 $[\tau^i]_1$。

Commitment 的特性：
- **Binding**：不同多項式的 commitment 不同（在 DLP 假設下）
- **Hiding**：從 $C$ 無法推出 $p(x)$（資訊理論安全）
- **簡潔**：commitment 只有一個 $\mathbb{G}_1$ 元素（48 bytes）

## Opening / Evaluation Proof

要證明 $p(z) = y$：

利用多項式除法定理：如果 $p(z) = y$，則 $(x - z)$ 整除 $p(x) - y$：

$$q(x) = \frac{p(x) - y}{x - z}$$

$q(x)$ 稱為商多項式。計算 proof：

$$\pi = [q(\tau)]_1 = \sum_{i=0}^{d-1} b_i [\tau^i]_1$$

## Verification

驗證者檢查 pairing 等式：

$$e(\pi, [\tau - z]_2) = e(C - [y]_1, [1]_2)$$

展開：
$$e([q(\tau)]_1, [\tau - z]_2) = e([p(\tau) - y]_1, [1]_2)$$
$$e(g_1, g_2)^{q(\tau)(\tau - z)} = e(g_1, g_2)^{p(\tau) - y}$$
$$q(\tau)(\tau - z) = p(\tau) - y$$

這正是 $q(x)(x-z) = p(x) - y$ 在 $x = \tau$ 處的 evaluation。

驗證只需 2 次 pairing 運算，與多項式 degree 無關。

## Multi-Opening

可以一次證明多項式在多個點的值。給定 $\{(z_0, y_0), ..., (z_k, y_k)\}$：

1. 構造 vanishing polynomial：$Z(x) = \prod_{i=0}^{k} (x - z_i)$
2. 構造插值多項式：$I(x)$ 使得 $I(z_i) = y_i$
3. 商多項式：$q(x) = \frac{p(x) - I(x)}{Z(x)}$
4. 驗證：$e(\pi, [Z(\tau)]_2) = e(C - [I(\tau)]_1, [1]_2)$

## 與其他 Polynomial Commitment Scheme 的比較

| 特性 | KZG | IPA | FRI |
|------|-----|-----|-----|
| Trusted setup | 需要（SRS） | 不需要 | 不需要 |
| Proof 大小 | $O(1)$（48 bytes） | $O(\log n)$ | $O(\log^2 n)$ |
| 驗證時間 | $O(1)$（2 pairings） | $O(n)$ | $O(\log^2 n)$ |
| Prover 時間 | $O(n)$ | $O(n)$ | $O(n \log n)$ |
| 密碼學假設 | Pairing + DLP | DLP only | Hash function（可量子安全） |
| 適用場景 | 簡潔性優先 | 無 trusted setup 優先 | 量子安全優先 |

- **IPA**（Inner Product Argument）：不需要 trusted setup，但 proof 較大、驗證較慢。常與 Pedersen commitment 搭配，用於需要避免 trusted setup 的場景。
- **FRI**（Fast Reed-Solomon IOP of Proximity）：基於 hash function，可達量子安全，是 STARKs 的核心構件。Proof 大小和驗證時間較 KZG 大，但不需要任何代數結構假設。

## 程式碼範例

```python
# KZG commitment 與 verification（概念實作）
from py_ecc.bls12_381 import G1, G2, multiply, add, pairing, neg

class KZG:
    def __init__(self, srs_g1, srs_g2):
        """
        srs_g1: [tau^0 * G1, tau^1 * G1, ..., tau^d * G1]
        srs_g2: [G2, tau * G2]
        """
        self.srs_g1 = srs_g1
        self.srs_g2 = srs_g2

    def commit(self, coefficients):
        """計算多項式 commitment。"""
        commitment = None
        for i, coeff in enumerate(coefficients):
            term = multiply(self.srs_g1[i], coeff)
            commitment = term if commitment is None else add(commitment, term)
        return commitment

    def create_proof(self, coefficients, z):
        """
        證明 p(z) = y。
        計算 q(x) = (p(x) - y) / (x - z) 的 commitment。
        """
        y = evaluate_polynomial(coefficients, z)
        quotient_coeffs = polynomial_division(
            polynomial_sub(coefficients, [y]),
            [-z, 1]  # (x - z) 的係數
        )
        proof = self.commit(quotient_coeffs)
        return proof, y

    def verify(self, commitment, z, y, proof):
        """
        驗證 pairing：
        e(proof, [tau - z]_2) = e(C - [y]_1, G2)
        """
        tau_minus_z_g2 = add(self.srs_g2[1], neg(multiply(G2, z)))
        c_minus_y = add(commitment, neg(multiply(G1, y)))
        lhs = pairing(tau_minus_z_g2, proof)
        rhs = pairing(G2, c_minus_y)
        return lhs == rhs
```

## 相關概念

- [橢圓曲線密碼學](/fundamentals/cryptography/elliptic-curve-cryptography/) - KZG 的數學基礎
- [雜湊函數概述](/fundamentals/cryptography/hash-function-overview/) - FRI 等替代方案基於 hash function
- [Verkle Trees](/fundamentals/data-structures/verkle-trees/) - 使用 polynomial commitment 的樹狀結構
- [Merkle Tree](/fundamentals/data-structures/merkle-tree/) - 基於 hash 的傳統 commitment 結構
