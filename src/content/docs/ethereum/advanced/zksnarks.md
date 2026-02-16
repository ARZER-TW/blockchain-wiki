---
title: "zkSNARKs 支援"
description: "zkSNARKs, zk-SNARKs, Zero Knowledge Proofs, 零知識證明"
tags: [ethereum, cryptography, zero-knowledge, zk-snark, proof-system]
---

# zkSNARKs 支援

> 本文聚焦 Ethereum 特定的實現細節。通用 zkSNARK 理論請參見 [zkSNARKs](/fundamentals/zero-knowledge/zksnarks/)。

## 概述

Ethereum 透過 BN254 曲線的 [Precompiled Contracts](/ethereum/advanced/precompiled-contracts/)（ecAdd/ecMul/ecPairing）原生支援 Groth16 等 proof system 的鏈上驗證，為 ZK Rollup、隱私交易、身份證明等應用提供基礎設施。

## BN254 Precompile

Ethereum 的 precompile 使用 BN254 曲線（也稱 alt_bn128），自 Genesis 起即可用：

| Precompile | 地址 | 功能 | Gas Cost |
|------------|------|------|----------|
| ecAdd | 0x06 | BN254 G1 點加法 | 150 |
| ecMul | 0x07 | BN254 G1 標量乘法 | 6,000 |
| ecPairing | 0x08 | BN254 pairing check | 34,000 * k + 45,000 |

### BN254 vs BLS12-381

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

### 在 EVM 上的 Groth16 驗證流程

```
1. 合約接收 proof (A, B, C) 和 public inputs
2. 計算 vk_x = IC[0] + sum(input[i] * IC[i+1]) using ecAdd + ecMul
3. 構造 pairing check:
   e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1
4. 呼叫 ecPairing precompile (0x08) 驗證
5. 返回驗證結果
```

## ZK Rollup 生態系

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

- [zkSNARKs（通用理論）](/fundamentals/zero-knowledge/zksnarks/) - 跨鏈通用的 zkSNARK 理論
- [Precompiled Contracts](/ethereum/advanced/precompiled-contracts/) - ecAdd/ecMul/ecPairing precompile
- [橢圓曲線密碼學](/fundamentals/cryptography/elliptic-curve-cryptography/) - BN254 配對運算的數學基礎
- [BLS12-381](/ethereum/cryptography/bls12-381/) - 未來可能取代 BN254 的曲線（EIP-2537）
- [KZG Commitments](/ethereum/advanced/kzg-commitments/) - 基於 pairing 的 polynomial commitment（PLONK 等使用）
- [EIP-4844 Proto-Danksharding](/ethereum/advanced/eip-4844/) - Point evaluation precompile 支援 blob 驗證
- [Keccak-256](/ethereum/cryptography/keccak-256/) - 常與 zk proof 搭配使用的 hash（但 zk-unfriendly）
- [交易廣播與驗證](/ethereum/transaction-lifecycle/broadcast-validation/) - ZK Rollup 的 proof 驗證是交易驗證的一部分
