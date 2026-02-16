---
title: "zkSNARKs"
description: "zk-SNARK theory, R1CS constraint system, QAP transformation, Groth16, PLONK, trusted setup"
tags: [fundamentals, zero-knowledge, zk-snark, proof-system, cryptography]
---

# zkSNARKs

## 概述

zkSNARK（Zero-Knowledge Succinct Non-interactive Argument of Knowledge）是一種密碼學證明系統，允許 prover 在不揭露任何額外資訊的情況下，向 verifier 證明某個計算結果是正確的。zkSNARK 是零知識證明中最廣泛部署的方案，被區塊鏈用於隱私保護、擴容（ZK Rollup）、身份驗證等場景。

## 核心原理

### zk-SNARK 的特性

- **Zero-Knowledge**：verifier 除了知道 statement 為真，學不到任何額外資訊
- **Succinct**：proof 大小是常數（與計算複雜度無關），驗證時間也是常數
- **Non-interactive**：只需要 prover 發送一個 proof，不需要多輪互動
- **Argument of Knowledge**：prover 確實「知道」某個 witness，而非僅知道 statement 為真

### 算術電路（Arithmetic Circuit）

任何計算問題都可以表示為在有限域 $\mathbb{F}_p$ 上的算術電路：

- **Gate**：加法或乘法
- **Wire**：連接 gate 的值
- **Input wire**：public input（verifier 知道）和 private input（witness，只有 prover 知道）
- **Output wire**：計算結果

例如，證明「我知道 $x$ 使得 $x^3 + x + 5 = 35$」：

```
Gate 1: a = x * x       (x^2)
Gate 2: b = a * x       (x^3)
Gate 3: c = b + x       (x^3 + x)
Gate 4: d = c + 5       (x^3 + x + 5)
Assert: d == 35
```

### R1CS（Rank-1 Constraint System）

算術電路轉化為 R1CS，每個乘法 gate 對應一個約束：

$$\vec{a}_i \cdot \vec{s} \times \vec{b}_i \cdot \vec{s} = \vec{c}_i \cdot \vec{s}$$

其中 $\vec{s} = [1, \text{out}, x, x^2, x^3, ...]$ 是 witness vector。

$\vec{a}_i, \vec{b}_i, \vec{c}_i$ 是由電路結構決定的係數向量。

整個 R1CS 可以寫成矩陣形式：

$$(A \cdot \vec{s}) \circ (B \cdot \vec{s}) = C \cdot \vec{s}$$

其中 $\circ$ 是逐元素乘法（Hadamard product）。

### QAP（Quadratic Arithmetic Program）

R1CS 透過 Lagrange 插值轉化為 QAP：將矩陣的每一列轉成多項式。

定義多項式 $A_j(x), B_j(x), C_j(x)$，使得對每個約束 $i$：

$$A_j(r_i) = a_{i,j}, \quad B_j(r_i) = b_{i,j}, \quad C_j(r_i) = c_{i,j}$$

QAP 滿足條件：

$$\left(\sum_j s_j A_j(x)\right) \cdot \left(\sum_j s_j B_j(x)\right) - \left(\sum_j s_j C_j(x)\right) = H(x) \cdot T(x)$$

其中 $T(x) = \prod_i (x - r_i)$ 是 vanishing polynomial，$H(x)$ 是商多項式。

### Groth16

Groth16 是目前最廣泛使用的 zk-SNARK 系統。

**Trusted Setup**（per-circuit）：
1. 選擇 toxic waste $\tau, \alpha, \beta, \gamma, \delta$
2. 在 $\mathbb{G}_1, \mathbb{G}_2$ 上計算 SRS（Structured Reference String）
3. 銷毀 toxic waste

**Proof 結構**：
$$\pi = (A \in \mathbb{G}_1, B \in \mathbb{G}_2, C \in \mathbb{G}_1)$$

Proof 大小固定（例如 BN254 曲線上為 192 bytes）。

**Verification**：
$$e(A, B) = e(\alpha, \beta) \cdot e(\sum_{i=0}^{l} x_i \cdot IC_i, \gamma) \cdot e(C, \delta)$$

其中：
- $e$ 是 bilinear pairing
- $x_0, ..., x_l$ 是 public input
- $IC_i$ 是 verification key 中的常數
- 驗證只需 3-4 次 pairing 運算

#### Groth16 的優缺點

| 優點 | 缺點 |
|------|------|
| Proof 最小（192 bytes） | 需要 per-circuit trusted setup |
| 驗證速度最快 | 更換電路需重新 setup |
| 成熟、審計充分 | Trusted setup 的安全假設 |

### Trusted Setup

Trusted setup 是許多 zk-SNARK 系統的必要步驟。其安全性依賴於至少一個參與者誠實銷毀了 toxic waste。

**Powers of Tau 儀式**：
1. 多方參與（MPC），每人貢獻隨機性
2. 只要有一個參與者是誠實的，整個 setup 就是安全的
3. Zcash 的 Powers of Tau 有數百位參與者

### PLONK

PLONK 是一種 universal zk-SNARK 系統，解決了 Groth16 需要 per-circuit setup 的問題。

**Universal Setup**：
- 一次 setup 可用於任意電路（大小有上限）
- 更換電路不需要重新 setup
- 使用 polynomial commitment（如 KZG）而非 Groth16 的 QAP

**Arithmetization**：
- PLONK 使用 plonkish arithmetization 而非 R1CS
- 支援 custom gate 和 lookup table
- 更靈活但 proof 稍大

### Knowledge Soundness

Knowledge soundness 保證：如果 prover 能產生有效的 proof，那麼他一定「知道」witness。形式化定義為存在一個 extractor 演算法，能從任何成功的 prover 中提取出 witness。

這比一般的 soundness（statement 為真）更強——不僅 statement 為真，prover 還必須知道為什麼為真。

### 其他 Proof System 比較

| 系統 | Trusted Setup | Proof 大小 | 驗證時間 | 特點 |
|------|--------------|-----------|---------|------|
| Groth16 | Per-circuit | 最小 | 最快 | 最廣泛部署 |
| PLONK | Universal | 中等 | 快 | 靈活、custom gate |
| STARK | 無 | 大 | 快 | 抗量子、透明 |
| Bulletproofs | 無 | 小 | 慢 | 無 trusted setup |

## 應用場景

### 隱私保護

- 證明交易有效但不揭露金額或參與者（隱私幣）
- 證明身份屬性（年齡 > 18）而不揭露完整身份
- 匿名投票：證明有投票權而不揭露身份

### 區塊鏈擴容（ZK Rollup）

- L2 sequencer 收集交易並執行
- Prover 為批次交易生成 zk proof
- 將 proof 提交到 L1 驗證
- 驗證通過後更新 L1 上的 state root
- 數千筆交易壓縮為一個 proof，大幅降低鏈上成本

### 可驗證計算

- 委託計算給不受信任的第三方，透過 zk proof 驗證結果正確
- 適用於計算密集但驗證簡單的場景

## 相關概念

- [橢圓曲線密碼學](/fundamentals/cryptography/elliptic-curve-cryptography/) - Pairing 運算的數學基礎
- [雜湊函數概述](/fundamentals/cryptography/hash-function-overview/) - ZK-friendly hash（Poseidon 等）
- [公鑰密碼學](/fundamentals/cryptography/public-key-cryptography/) - 零知識證明建立在公鑰密碼學之上
