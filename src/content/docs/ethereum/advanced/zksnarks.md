---
title: "zkSNARKs 支援"
description: "zkSNARKs, zk-SNARKs, Zero Knowledge Proofs, 零知識證明"
tags: [ethereum, cryptography, zero-knowledge, zk-snark, proof-system]
---

# zkSNARKs 支援

## 概述

zkSNARK（Zero-Knowledge Succinct Non-interactive Argument of Knowledge）是一種密碼學證明系統，允許 prover 在不揭露任何額外資訊的情況下，向 verifier 證明某個計算結果是正確的。Ethereum 透過 BN254 曲線的 [Precompiled Contracts](/ethereum/advanced/precompiled-contracts/)（ecAdd/ecMul/ecPairing）原生支援 Groth16 等 proof system 的鏈上驗證，為 ZK Rollup、隱私交易、身份證明等應用提供基礎設施。

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

Groth16 是目前最廣泛使用的 zk-SNARK 系統，也是 Ethereum precompile 直接支援的方案。

**Trusted Setup**（per-circuit）：
1. 選擇 toxic waste $\tau, \alpha, \beta, \gamma, \delta$
2. 在 $\mathbb{G}_1, \mathbb{G}_2$ 上計算 SRS（Structured Reference String）
3. 銷毀 toxic waste

**Proof 結構**：
$$\pi = (A \in \mathbb{G}_1, B \in \mathbb{G}_2, C \in \mathbb{G}_1)$$

Proof 大小固定：192 bytes（BN254 上：$A$ 64B, $B$ 128B, $C$ 64B）。

**Verification**：
$$e(A, B) = e(\alpha, \beta) \cdot e(\sum_{i=0}^{l} x_i \cdot IC_i, \gamma) \cdot e(C, \delta)$$

其中：
- $e$ 是 bilinear pairing
- $x_0, ..., x_l$ 是 public input
- $IC_i$ 是 verification key 中的常數（$\mathbb{G}_1$ 點）
- $\alpha, \beta, \gamma, \delta$ 是 verification key 中的常數

驗證只需 3-4 次 pairing 運算，正好對應 ecPairing precompile。

### BN254 vs BLS12-381

Ethereum 的 precompile 使用 BN254 曲線（也稱 alt_bn128）：

| 特性 | BN254 | [BLS12-381](/ethereum/cryptography/bls12-381/) |
|------|-------|--------------|
| 安全等級 | ~100 bits | ~128 bits |
| $\mathbb{G}_1$ 元素大小 | 64 bytes | 96 bytes |
| $\mathbb{G}_2$ 元素大小 | 128 bytes | 192 bytes |
| Pairing cost | 較低 | 較高 |
| EVM 支援 | 有（0x06-0x08，Genesis） | 有（0x0B-0x13，Pectra 2025/5） |

BN254 的安全等級低於推薦的 128 bits（Kim-Barbulescu 攻擊），但目前仍被認為足夠安全。

### EIP-2537：BLS12-381 Precompile 對 ZK 的影響

EIP-2537 在 Pectra 升級（2025/5/7）正式上線，新增了 9 個 [BLS12-381](/ethereum/cryptography/bls12-381/) 曲線操作的 [Precompiled Contracts](/ethereum/advanced/precompiled-contracts/)（地址 0x0B-0x13），包括 G1/G2 的加法、乘法、multi-scalar multiplication、pairing 和 map-to-curve。

這對 ZK 生態系的影響是根本性的：

**直接影響**：
- ZK proof system 可以直接基於 BLS12-381（~128 bit 安全）而非 BN254（~100 bit 安全）
- PLONK、Groth16 等 proof 的鏈上驗證可以使用更安全的曲線
- 消除了 ZK Rollup 項目在安全性和 EVM 相容性之間的取捨

**跨層驗證**：
- 執行層現在可以驗證共識層的 [BLS Signatures](/ethereum/cryptography/bls-signatures/)，因為兩者使用相同曲線
- 輕客戶端合約可以在鏈上驗證 Beacon Chain 的 validator 簽名
- 跨鏈橋可以更安全地驗證 Ethereum finality proof

**新的 proof 系統**：
- 基於 BLS12-381 的遞迴 SNARK 變得可行（Bandersnatch 嵌入 BLS12-381）
- 與 [Verkle Trees](/ethereum/advanced/verkle-trees/) 的 IPA proof（使用 Bandersnatch 曲線）整合更自然

### 在 EVM 上的驗證流程

```
1. 合約接收 proof (A, B, C) 和 public inputs
2. 計算 vk_x = IC[0] + sum(input[i] * IC[i+1]) using ecAdd + ecMul
3. 構造 pairing check:
   e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1
4. 呼叫 ecPairing precompile (0x08) 驗證
5. 返回驗證結果
```

## 在 Ethereum 中的應用

### ZK Rollup

ZK Rollup 是 zkSNARK 在 Ethereum 上最重要的應用：

| 項目 | Proof System | 曲線 |
|------|-------------|------|
| zkSync Era | PLONK + FRI | BN254 |
| Scroll | zkEVM (Halo2) | BN254 |
| Polygon zkEVM | STARK + SNARK | BN254 (final wrapping) |
| Linea | PLONK | BN254 |

流程：
1. L2 sequencer 收集交易並執行
2. Prover 為批次交易生成 zk proof
3. 將 proof + public inputs 提交到 L1 verifier 合約
4. Verifier 合約用 precompile 驗證 proof
5. 驗證通過後更新 L1 上的 state root

### 隱私應用

- **Tornado Cash**（已制裁）：用 zk proof 斷開存款和提款的連結
- **Semaphore**：匿名投票/信號，用 Merkle tree membership proof
- **zkKYC**：證明滿足 KYC 條件而不揭露身份細節

### 身份與憑證

- **ZK identity**：證明年齡 > 18 而不揭露生日
- **ZK credentials**：證明持有某機構頒發的憑證
- **WorldID**：用 zk proof 證明是真人而不揭露身份

### Gas 成本

以 Groth16 為例（BN254）：

| 操作 | Gas |
|------|-----|
| 每個 public input 的 ecMul | 6000 |
| 每個 public input 的 ecAdd | 150 |
| 4-pair pairing check | 214,000 |
| **總計（10 public inputs）** | **~280,000 gas** |

相較之下，直接在 EVM 中驗證同樣的計算可能需要數百萬甚至數十億 gas。

## 程式碼範例

```solidity
// Groth16 verifier 合約（簡化版）
pragma solidity ^0.8.0;

contract Groth16Verifier {
    // Verification key（由 trusted setup 產生）
    struct VerifyingKey {
        uint256[2] alpha;     // G1
        uint256[2][2] beta;   // G2
        uint256[2][2] gamma;  // G2
        uint256[2][2] delta;  // G2
        uint256[2][] IC;      // G1 array, length = num_public_inputs + 1
    }

    struct Proof {
        uint256[2] A;         // G1
        uint256[2][2] B;      // G2
        uint256[2] C;         // G1
    }

    VerifyingKey private vk;

    function verify(
        Proof memory proof,
        uint256[] memory publicInputs
    ) external view returns (bool) {
        require(publicInputs.length + 1 == vk.IC.length, "Invalid inputs");

        // 計算 vk_x = IC[0] + sum(input[i] * IC[i+1])
        uint256[2] memory vk_x = vk.IC[0];
        for (uint256 i = 0; i < publicInputs.length; i++) {
            // ecMul: input[i] * IC[i+1]
            uint256[2] memory term = ecMul(vk.IC[i + 1], publicInputs[i]);
            // ecAdd: vk_x += term
            vk_x = ecAdd(vk_x, term);
        }

        // Pairing check:
        // e(A, B) == e(alpha, beta) * e(vk_x, gamma) * e(C, delta)
        // 等價於: e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1
        return ecPairing(
            negate(proof.A), proof.B,
            vk.alpha, vk.beta,
            vk_x, vk.gamma,
            proof.C, vk.delta
        );
    }

    function ecAdd(uint256[2] memory p1, uint256[2] memory p2)
        internal view returns (uint256[2] memory r)
    {
        uint256[4] memory input = [p1[0], p1[1], p2[0], p2[1]];
        assembly {
            if iszero(staticcall(gas(), 0x06, input, 128, r, 64)) {
                revert(0, 0)
            }
        }
    }

    function ecMul(uint256[2] memory p, uint256 s)
        internal view returns (uint256[2] memory r)
    {
        uint256[3] memory input = [p[0], p[1], s];
        assembly {
            if iszero(staticcall(gas(), 0x07, input, 96, r, 64)) {
                revert(0, 0)
            }
        }
    }

    function ecPairing(
        uint256[2] memory a1, uint256[2][2] memory b1,
        uint256[2] memory a2, uint256[2][2] memory b2,
        uint256[2] memory a3, uint256[2][2] memory b3,
        uint256[2] memory a4, uint256[2][2] memory b4
    ) internal view returns (bool) {
        uint256[24] memory input;
        // Pack all 4 pairs (each: G1 point + G2 point = 192 bytes)
        // ... (assembly packing omitted for clarity)

        uint256[1] memory result;
        assembly {
            if iszero(staticcall(gas(), 0x08, input, 768, result, 32)) {
                revert(0, 0)
            }
        }
        return result[0] == 1;
    }

    function negate(uint256[2] memory p)
        internal pure returns (uint256[2] memory)
    {
        // BN254 的 p
        uint256 q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
        return [p[0], q - p[1]];
    }
}
```

```python
# 用 snarkjs 生成和驗證 Groth16 proof（概念流程）
"""
完整流程：
1. 寫 circom 電路
2. trusted setup (Powers of Tau + circuit-specific)
3. 生成 proof
4. 驗證 proof
5. 生成 Solidity verifier
"""

# circom 電路範例：證明知道 hash 的原像
# template HashPreimage() {
#     signal input preimage;
#     signal output hash;
#     component hasher = Poseidon(1);
#     hasher.inputs[0] <== preimage;
#     hash <== hasher.out;
# }

# 生成 proof（使用 snarkjs CLI）
# snarkjs groth16 prove circuit.zkey witness.wtns proof.json public.json

# 驗證 proof
# snarkjs groth16 verify verification_key.json public.json proof.json

# 生成 Solidity verifier
# snarkjs zkey export solidityverifier circuit.zkey verifier.sol

# Python 中組裝 calldata
def format_proof_for_evm(proof, public_inputs):
    """將 snarkjs 輸出轉換為 EVM calldata 格式。"""
    # Groth16 proof 有 A (G1), B (G2), C (G1)
    a = (int(proof["pi_a"][0]), int(proof["pi_a"][1]))
    b = (
        (int(proof["pi_b"][0][1]), int(proof["pi_b"][0][0])),  # 注意 G2 座標順序
        (int(proof["pi_b"][1][1]), int(proof["pi_b"][1][0])),
    )
    c = (int(proof["pi_c"][0]), int(proof["pi_c"][1]))

    inputs = [int(x) for x in public_inputs]

    return {
        "proof": {"A": a, "B": b, "C": c},
        "publicInputs": inputs,
    }
```

```javascript
// 用 snarkjs 在瀏覽器/Node.js 中生成 proof
const snarkjs = require("snarkjs");

async function generateAndVerifyProof() {
  // 載入 circuit
  const wasmPath = "circuit.wasm";
  const zkeyPath = "circuit.zkey";
  const vkeyPath = "verification_key.json";

  // Witness: private input
  const input = { preimage: "12345" };

  // 生成 proof
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    wasmPath,
    zkeyPath
  );

  // 驗證 proof（離線）
  const vkey = JSON.parse(require("fs").readFileSync(vkeyPath));
  const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);

  // 生成 Solidity calldata
  const calldata = await snarkjs.groth16.exportSolidityCallData(
    proof,
    publicSignals
  );

  return { proof, publicSignals, valid, calldata };
}
```

## 相關概念

- [Precompiled Contracts](/ethereum/advanced/precompiled-contracts/) - ecAdd/ecMul/ecPairing precompile
- [橢圓曲線密碼學](/ethereum/cryptography/elliptic-curve-cryptography/) - BN254 配對運算的數學基礎
- [BLS12-381](/ethereum/cryptography/bls12-381/) - 未來可能取代 BN254 的曲線（EIP-2537）
- [KZG Commitments](/ethereum/advanced/kzg-commitments/) - 基於 pairing 的 polynomial commitment（PLONK 等使用）
- [EIP-4844 Proto-Danksharding](/ethereum/advanced/eip-4844/) - Point evaluation precompile 支援 blob 驗證
- [Keccak-256](/ethereum/cryptography/keccak-256/) - 常與 zk proof 搭配使用的 hash（但 zk-unfriendly）
- [交易廣播與驗證](/ethereum/transaction-lifecycle/broadcast-validation/) - ZK Rollup 的 proof 驗證是交易驗證的一部分
