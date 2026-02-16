---
title: "KZG Commitments"
description: "KZG Commitments, KZG, Kate Commitment, Polynomial Commitment"
tags: [ethereum, cryptography, polynomial-commitment, kzg, trusted-setup]
---

# KZG Commitments

## 概述

KZG（Kate-Zaverucha-Goldberg）Commitment 是一種 polynomial commitment scheme，允許 prover 對多項式做出承諾，之後可以證明該多項式在任意點的 evaluation 值。Ethereum 在 [EIP-4844 Proto-Danksharding](/ethereum/advanced/eip-4844/) 中用 KZG 來承諾 blob 資料，在 [Verkle Trees](/ethereum/advanced/verkle-trees/) 中用它取代 Merkle hash。KZG 基於 [BLS12-381](/ethereum/cryptography/bls12-381/) 橢圓曲線上的 bilinear pairing 運算。

## 核心原理

### 數學基礎

KZG 依賴以下密碼學工具：

**橢圓曲線 Pairing**：
雙線性映射 $e: \mathbb{G}_1 \times \mathbb{G}_2 \rightarrow \mathbb{G}_T$，滿足：
$$e(aP, bQ) = e(P, Q)^{ab}$$

其中 $\mathbb{G}_1, \mathbb{G}_2$ 是 [BLS12-381](/ethereum/cryptography/bls12-381/) 上的兩個群，$\mathbb{G}_T$ 是目標群。

**多項式**：
一個 degree-$d$ 的多項式：
$$p(x) = a_0 + a_1 x + a_2 x^2 + ... + a_d x^d$$

### Trusted Setup

KZG 需要一次性的 trusted setup（結構化參考字串，SRS）：

選擇秘密值 $\tau$（toxic waste），計算：

$$\text{SRS} = \{[\tau^0]_1, [\tau^1]_1, ..., [\tau^d]_1, [\tau^0]_2, [\tau^1]_2\}$$

其中 $[x]_1 = x \cdot g_1$（$g_1$ 是 $\mathbb{G}_1$ 的生成元），$[x]_2 = x \cdot g_2$。

**安全要求**：$\tau$ 必須在 setup 完成後銷毀。只要參與 setup 的任何一方誠實地銷毀了自己的部分，整個 setup 就是安全的。

**Ethereum 的 KZG Ceremony**：2023 年進行，超過 141,000 人參與，是歷史上最大規模的 trusted setup ceremony。只要其中一個參與者誠實刪除了自己的隨機值，$\tau$ 就不可知。

### Commitment

對多項式 $p(x) = \sum_{i=0}^{d} a_i x^i$ 做 commitment：

$$C = [p(\tau)]_1 = \sum_{i=0}^{d} a_i [\tau^i]_1$$

注意：計算 $C$ 不需要知道 $\tau$，只需要 SRS 中的 $[\tau^i]_1$。

Commitment 的特性：
- **Binding**：不同多項式的 commitment 不同（在 DLP 假設下）
- **Hiding**：從 $C$ 無法推出 $p(x)$（資訊理論安全）
- **簡潔**：commitment 只有一個 $\mathbb{G}_1$ 元素（48 bytes）

### Opening / Evaluation Proof

要證明 $p(z) = y$：

利用多項式除法定理：如果 $p(z) = y$，則 $(x - z)$ 整除 $p(x) - y$：

$$q(x) = \frac{p(x) - y}{x - z}$$

$q(x)$ 稱為商多項式。計算 proof：

$$\pi = [q(\tau)]_1 = \sum_{i=0}^{d-1} b_i [\tau^i]_1$$

### Verification

驗證者檢查 pairing 等式：

$$e(\pi, [\tau - z]_2) = e(C - [y]_1, [1]_2)$$

展開：
$$e([q(\tau)]_1, [\tau - z]_2) = e([p(\tau) - y]_1, [1]_2)$$
$$e(g_1, g_2)^{q(\tau)(\tau - z)} = e(g_1, g_2)^{p(\tau) - y}$$
$$q(\tau)(\tau - z) = p(\tau) - y$$

這正是 $q(x)(x-z) = p(x) - y$ 在 $x = \tau$ 處的 evaluation。

驗證只需 2 次 pairing 運算，與多項式 degree 無關。

### Multi-Opening

可以一次證明多項式在多個點的值。給定 $\{(z_0, y_0), ..., (z_k, y_k)\}$：

1. 構造 vanishing polynomial：$Z(x) = \prod_{i=0}^{k} (x - z_i)$
2. 構造插值多項式：$I(x)$ 使得 $I(z_i) = y_i$
3. 商多項式：$q(x) = \frac{p(x) - I(x)}{Z(x)}$
4. 驗證：$e(\pi, [Z(\tau)]_2) = e(C - [I(\tau)]_1, [1]_2)$

### Blob 中的 KZG

[EIP-4844 Proto-Danksharding](/ethereum/advanced/eip-4844/) 中，blob 被視為多項式的 evaluation form：

$$\text{blob} = [p(\omega^0), p(\omega^1), ..., p(\omega^{4095})]$$

其中 $\omega$ 是 order-4096 的 root of unity（在 BLS12-381 標量域中）。

要計算 commitment：
1. 用 inverse FFT 從 evaluations 恢復多項式係數
2. 用 SRS 計算 $C = [p(\tau)]_1$

實際實作中直接用 Lagrange form 計算，避免 FFT：

$$C = \sum_{i=0}^{4095} f_i \cdot [L_i(\tau)]_1$$

其中 $L_i(x)$ 是 Lagrange basis，$[L_i(\tau)]_1$ 可以從 SRS 預計算。

## 在 Ethereum 中的應用

### EIP-4844 中的使用

1. Blob producer 計算 KZG commitment
2. Versioned hash = `0x01 || SHA256(commitment)[1:]`
3. 區塊 proposer 驗證所有 blob 的 commitment
4. Point evaluation precompile（`0x0A`）讓 L1 合約驗證 blob 中特定位置的值

### Verkle Trees 中的使用

[Verkle Trees](/ethereum/advanced/verkle-trees/) 用 KZG（或 IPA）作為 vector commitment：
- 每個 trie 節點的子節點值構成一個多項式
- 節點的 hash 是該多項式的 KZG commitment
- Proof 大小從 $O(\log n)$ 降到 $O(1)$（每層一個 opening proof）

### PeerDAS 中的 KZG（EIP-7594，Fusaka）

Fusaka 升級（2025/12/3）引入的 PeerDAS 大量依賴 KZG 來實現資料可用性取樣（Data Availability Sampling）。

**KZG 在 PeerDAS 中的角色：**

1. **Blob 編碼**：每個 blob 仍然用 KZG commitment 承諾，和 EIP-4844 相同
2. **Erasure coding 擴展**：blob 的多項式被 evaluate 在更多點上，產生額外的 data columns
3. **Column commitment**：每個 column 對應原始多項式在特定點的 evaluation，可以用 KZG opening proof 驗證
4. **取樣驗證**：節點隨機選擇若干 columns 下載，用 KZG proof 驗證每個 column 的值確實屬於 committed 的多項式

**數學上**：如果 blob 多項式是 $p(x)$（degree < 4096），PeerDAS 將 $p(x)$ evaluate 在更多點 $\{z_0, z_1, ..., z_{m-1}\}$ 上，產生 $m$ 個 columns。節點只需驗證少數幾個 $(z_i, p(z_i))$ 的 KZG opening proof，就能確信完整資料是可用的（在足夠誠實節點參與取樣的前提下）。

這個設計讓 blob 容量可以大幅提升（Fusaka 後透過 BPO 機制達到 target 14 / max 21），而不需要每個節點下載所有資料。

### 效能數據

| 操作 | 時間 |
|------|------|
| Blob commitment | ~5ms |
| Point evaluation proof | ~5ms |
| Verification | ~3ms（2 pairings） |
| Commitment 大小 | 48 bytes |
| Proof 大小 | 48 bytes |

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
        # 多項式除法：(p(x) - y) / (x - z)
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
        # [tau - z]_2 = tau*G2 - z*G2
        tau_minus_z_g2 = add(self.srs_g2[1], neg(multiply(G2, z)))

        # C - y*G1
        c_minus_y = add(commitment, neg(multiply(G1, y)))

        # Pairing check
        lhs = pairing(tau_minus_z_g2, proof)
        rhs = pairing(G2, c_minus_y)

        return lhs == rhs
```

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
  // 建立 proof
  const { proof, y } = cKzg.computeKzgProof(blob, z);

  // 驗證 proof
  const valid = cKzg.verifyKzgProof(commitment, z, y, proof);
  return { proof, y, valid };
}

// 驗證整個 blob
function verifyBlobProof(blob, commitment, proof) {
  return cKzg.verifyBlobKzgProof(blob, commitment, proof);
}
```

## 相關概念

- [EIP-4844 Proto-Danksharding](/ethereum/advanced/eip-4844/) - KZG 在 blob transaction 中的應用
- [Verkle Trees](/ethereum/advanced/verkle-trees/) - KZG 在新 trie 結構中的應用
- [BLS12-381](/ethereum/cryptography/bls12-381/) - KZG 使用的橢圓曲線（pairing-friendly）
- [橢圓曲線密碼學](/ethereum/cryptography/elliptic-curve-cryptography/) - KZG 的數學基礎
- [Precompiled Contracts](/ethereum/advanced/precompiled-contracts/) - Point evaluation precompile
- [zkSNARKs 支援](/ethereum/advanced/zksnarks/) - KZG 與 zk-proof 系統的關聯
- [Beacon Chain](/ethereum/consensus/beacon-chain/) - Blob sidecar 驗證使用 KZG
