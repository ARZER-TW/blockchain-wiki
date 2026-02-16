---
title: "Precompiled Contracts"
description: "Precompiled Contracts, Precompile, 預編譯合約"
tags: [ethereum, evm, precompile, cryptography]
---

# Precompiled Contracts

## 概述

Precompiled Contracts 是 EVM 中部署在固定地址的特殊合約，以原生程式碼實作高效的密碼學運算。它們的 gas cost 經過精確計算以反映實際計算量，避免在 EVM bytecode 中執行這些運算的高昂成本。截至 Fusaka 升級（2025/12），precompile 地址範圍擴展到 0x01-0x13，涵蓋 ecRecover（[ECRECOVER](/ethereum/cryptography/ecrecover/)）、SHA-256、bn128 配對運算（用於 [zkSNARKs 支援](/ethereum/advanced/zksnarks/)）、blake2f、KZG point evaluation，以及 Pectra 新增的 [BLS12-381](/ethereum/cryptography/bls12-381/) 曲線操作。

## 核心原理

### 完整 Precompile 列表

| 地址 | 名稱 | EIP | 功能 | 上線時間 |
|------|------|-----|------|---------|
| `0x01` | ecRecover | - | [ECDSA](/ethereum/cryptography/ecdsa/) 簽名恢復 | Genesis |
| `0x02` | SHA-256 | - | [SHA-256](/ethereum/cryptography/sha-256/) hash | Genesis |
| `0x03` | RIPEMD-160 | - | RIPEMD-160 hash | Genesis |
| `0x04` | identity | - | 資料複製（memcpy） | Genesis |
| `0x05` | modexp | EIP-198 | 大數模冪運算 | Byzantium |
| `0x06` | ecAdd | EIP-196 | BN254 橢圓曲線點加法 | Byzantium |
| `0x07` | ecMul | EIP-196 | BN254 橢圓曲線純量乘法 | Byzantium |
| `0x08` | ecPairing | EIP-197 | BN254 配對運算 | Byzantium |
| `0x09` | blake2f | EIP-152 | BLAKE2b F 壓縮函數 | Istanbul |
| `0x0A` | pointEvaluation | EIP-4844 | [KZG Commitments](/ethereum/advanced/kzg-commitments/) point evaluation | Dencun |
| `0x0B` | bls12381G1Add | EIP-2537 | [BLS12-381](/ethereum/cryptography/bls12-381/) G1 點加法 | Pectra |
| `0x0C` | bls12381G1Mul | EIP-2537 | [BLS12-381](/ethereum/cryptography/bls12-381/) G1 純量乘法 | Pectra |
| `0x0D` | bls12381G1MultiExp | EIP-2537 | [BLS12-381](/ethereum/cryptography/bls12-381/) G1 multi-scalar multiplication | Pectra |
| `0x0E` | bls12381G2Add | EIP-2537 | [BLS12-381](/ethereum/cryptography/bls12-381/) G2 點加法 | Pectra |
| `0x0F` | bls12381G2Mul | EIP-2537 | [BLS12-381](/ethereum/cryptography/bls12-381/) G2 純量乘法 | Pectra |
| `0x10` | bls12381G2MultiExp | EIP-2537 | [BLS12-381](/ethereum/cryptography/bls12-381/) G2 multi-scalar multiplication | Pectra |
| `0x11` | bls12381Pairing | EIP-2537 | [BLS12-381](/ethereum/cryptography/bls12-381/) 配對運算 | Pectra |
| `0x12` | bls12381MapG1 | EIP-2537 | 將 field element 映射到 G1 點 | Pectra |
| `0x13` | bls12381MapG2 | EIP-2537 | 將 field element 映射到 G2 點 | Pectra |

### 0x01: ecRecover

恢復 [ECDSA](/ethereum/cryptography/ecdsa/) 簽名的公鑰/地址。

**輸入**（128 bytes）：
| 偏移 | 大小 | 欄位 |
|------|------|------|
| 0 | 32 | message hash |
| 32 | 32 | v（recovery id，27 或 28） |
| 64 | 32 | r |
| 96 | 32 | s |

**輸出**（32 bytes）：恢復出的地址（左填零到 32 bytes）

**Gas**：3000

這是 Solidity `ecrecover()` 函數的底層實作，用於驗證 [交易簽名](/ethereum/transaction-lifecycle/transaction-signing/) 和鏈下簽名。

### 0x02: SHA-256

計算 [SHA-256](/ethereum/cryptography/sha-256/) hash，Bitcoin 和許多協議使用的 hash 函數。

**輸入**：任意長度 bytes
**輸出**：32 bytes hash
**Gas**：$60 + 12 \times \lceil\text{len} / 64\rceil$

### 0x03: RIPEMD-160

Bitcoin 地址生成使用的 hash 函數（SHA256 + RIPEMD160）。

**輸入**：任意長度 bytes
**輸出**：32 bytes（RIPEMD-160 輸出 20 bytes，左填零）
**Gas**：$600 + 120 \times \lceil\text{len} / 64\rceil$

### 0x04: identity

簡單的資料複製，主要用於 gas-efficient 的記憶體操作。

**Gas**：$15 + 3 \times \lceil\text{len} / 32\rceil$

### 0x05: modexp

大數模冪運算：$\text{base}^{\text{exp}} \mod \text{mod}$

**輸入格式**：
```
[32 bytes: base_length]
[32 bytes: exp_length]
[32 bytes: mod_length]
[base_length bytes: base]
[exp_length bytes: exponent]
[mod_length bytes: modulus]
```

**Gas**（EIP-2565 修訂後）：
$$\text{gas} = \max\left(200, \frac{f(\max(\text{base\_len}, \text{mod\_len})) \times \max(\text{adj\_exp\_len}, 1)}{3}\right)$$

其中 $f(x) = \lceil x/8 \rceil^2$。

用途：RSA 驗證、大數運算、密碼學協議。

### 0x06: ecAdd（BN254 / alt_bn128）

BN254 曲線上的點加法。

$$P_3 = P_1 + P_2$$

**輸入**（128 bytes）：兩個 $\mathbb{G}_1$ 點（各 64 bytes，x 和 y 各 32 bytes）
**輸出**（64 bytes）：結果點
**Gas**：150（EIP-1108 降價後）

BN254 曲線方程：$y^2 = x^3 + 3$，定義在 $\mathbb{F}_p$ 上，$p$ 約 254 bits。

### 0x07: ecMul（BN254）

BN254 曲線上的純量乘法。

$$Q = s \cdot P$$

**輸入**（96 bytes）：一個 $\mathbb{G}_1$ 點（64 bytes）+ 純量 $s$（32 bytes）
**輸出**（64 bytes）：結果點
**Gas**：6000（EIP-1108 降價後）

### 0x08: ecPairing（BN254）

BN254 曲線上的配對檢查。驗證：

$$\prod_{i=1}^{k} e(P_i, Q_i) = 1$$

**輸入**：$k$ 組 $(P_i, Q_i)$，每組 192 bytes
- $P_i$：$\mathbb{G}_1$ 點（64 bytes）
- $Q_i$：$\mathbb{G}_2$ 點（128 bytes，x 和 y 各是 $\mathbb{F}_{p^2}$ 元素）

**輸出**：32 bytes（1 = 成功，0 = 失敗）
**Gas**：$45000 \times k + 34000$（EIP-1108 降價後）

這是 [zkSNARKs 支援](/ethereum/advanced/zksnarks/) 的核心 precompile，讓 Groth16 等 proof 系統能在鏈上驗證。

### 0x09: blake2f

BLAKE2b 的 F 壓縮函數。

**輸入**（213 bytes）：
```
[4 bytes: rounds]
[64 bytes: h]
[128 bytes: m]
[16 bytes: t]
[1 byte: f (final block flag)]
```

**Gas**：$\text{rounds}$（每輪 1 gas）

用途：與 Zcash 的互操作、跨鏈驗證。

### 0x0A: Point Evaluation（EIP-4844）

[KZG Commitments](/ethereum/advanced/kzg-commitments/) 的 point evaluation 驗證。

**輸入**（192 bytes）：
```
[32 bytes: versioned_hash]
[32 bytes: z (evaluation point)]
[32 bytes: y (claimed value)]
[48 bytes: commitment]
[48 bytes: proof]
```

驗證：
1. `versioned_hash == 0x01 || SHA256(commitment)[1:]`
2. KZG proof 驗證 $p(z) = y$

**輸出**：`FIELD_ELEMENTS_PER_BLOB || BLS_MODULUS`（各 32 bytes）
**Gas**：50000

用途：L2 rollup 在 L1 合約中驗證 blob 資料。

### 0x0B-0x13: BLS12-381 Operations（EIP-2537，Pectra）

EIP-2537 在 Pectra 升級（2025/5/7）正式上線，新增 9 個 [BLS12-381](/ethereum/cryptography/bls12-381/) 曲線操作的 precompile。這是長期以來社群期待的重大補充——BLS12-381 的安全強度（~128 bit）優於 BN254（~100 bit），且是共識層已在使用的曲線。

**9 個操作及 gas cost：**

| 地址 | 操作 | Gas Cost |
|------|------|----------|
| `0x0B` | G1 Add | 375 |
| `0x0C` | G1 Mul | 12000 |
| `0x0D` | G1 MultiExp | 依輸入數量動態計算 |
| `0x0E` | G2 Add | 600 |
| `0x0F` | G2 Mul | 22500 |
| `0x10` | G2 MultiExp | 依輸入數量動態計算 |
| `0x11` | Pairing | 依配對數量動態計算 |
| `0x12` | Map to G1 | 5500 |
| `0x13` | Map to G2 | 23800 |

這些 precompile 使得 BLS12-381 上的 [zkSNARKs 支援](/ethereum/advanced/zksnarks/)（如 PLONK、Groth16）可以直接在 EVM 中高效驗證，不再依賴安全強度較低的 BN254。也為跨層驗證（執行層驗證共識層的 BLS 簽名）開啟了可能性。

### 未來：secp256r1 簽名驗證（EIP-7951，Fusaka）

EIP-7951 預計在 Fusaka 升級（2025/12/3）上線，新增 secp256r1（P-256 / NIST P-256）簽名驗證的 precompile。

secp256r1 與 Ethereum 現有的 [secp256k1](/ethereum/cryptography/secp256k1/) 不同——它是 NIST 標準曲線，被廣泛用於：

- **WebAuthn / FIDO2**：瀏覽器和硬體安全金鑰的認證標準
- **Passkey**：Apple、Google、Microsoft 的無密碼認證
- **TEE（Trusted Execution Environment）**：安全飛地產生的簽名
- **行動裝置 Secure Enclave**：iOS/Android 硬體安全模組

有了 secp256r1 precompile，智能合約錢包可以直接驗證 passkey 簽名，實現真正的無助記詞帳戶抽象。

### 呼叫方式

Precompile 像普通合約一樣透過 `CALL` / `STATICCALL` 呼叫：

```solidity
(bool success, bytes memory result) = address(0x01).staticcall(input);
```

如果 precompile 執行失敗（輸入格式錯誤或 gas 不足），返回 `success = false`。

## 在 Ethereum 中的應用

### 簽名驗證

ecRecover（0x01）是最常用的 precompile：
- 每筆交易的簽名驗證（EVM 外部，但邏輯相同）
- EIP-712 typed data 簽名驗證
- Multisig 錢包的鏈下簽名
- Meta-transaction 的 relayer 驗證

### zk-SNARK 驗證

ecAdd（0x06）+ ecMul（0x07）+ ecPairing（0x08）組合用於：
- Zcash 風格的隱私交易
- ZK Rollup 的 proof 驗證（zkSync、Scroll、Polygon zkEVM）
- 鏈上身份證明

### Gas 最佳化案例

在 EVM bytecode 中實作 SHA-256：約 100,000+ gas
使用 0x02 precompile：72 gas（對 64 bytes 輸入）

在 EVM 中實作 BN254 pairing：幾乎不可能
使用 0x08 precompile：79,000 gas（單對配對）

## 程式碼範例

```javascript
// 在 ethers.js 中呼叫 precompile
const { ethers } = require("ethers");

// ecRecover
async function callEcRecover(provider, msgHash, v, r, s) {
  const input = ethers.concat([
    msgHash,
    ethers.zeroPadValue(ethers.toBeHex(v), 32),
    r,
    s,
  ]);

  const result = await provider.call({
    to: "0x0000000000000000000000000000000000000001",
    data: input,
  });

  return "0x" + result.slice(-40);  // 取最後 20 bytes 作為地址
}

// SHA-256
async function callSha256(provider, data) {
  const result = await provider.call({
    to: "0x0000000000000000000000000000000000000002",
    data: data,
  });
  return result;
}

// BN254 pairing check
async function callEcPairing(provider, pairs) {
  // pairs: [{g1: {x, y}, g2: {x: [x_im, x_re], y: [y_im, y_re]}}]
  let input = "0x";
  for (const pair of pairs) {
    input += ethers.zeroPadValue(pair.g1.x, 32).slice(2);
    input += ethers.zeroPadValue(pair.g1.y, 32).slice(2);
    input += ethers.zeroPadValue(pair.g2.x[1], 32).slice(2);  // x_re
    input += ethers.zeroPadValue(pair.g2.x[0], 32).slice(2);  // x_im
    input += ethers.zeroPadValue(pair.g2.y[1], 32).slice(2);  // y_re
    input += ethers.zeroPadValue(pair.g2.y[0], 32).slice(2);  // y_im
  }

  const result = await provider.call({
    to: "0x0000000000000000000000000000000000000008",
    data: input,
  });

  return result === ethers.zeroPadValue("0x01", 32);
}
```

```solidity
// Solidity 中使用 precompile
pragma solidity ^0.8.0;

contract PrecompileExamples {
    // ecRecover 包裝
    function recoverSigner(bytes32 hash, uint8 v, bytes32 r, bytes32 s)
        external pure returns (address)
    {
        return ecrecover(hash, v, r, s);
    }

    // modexp: base^exp % mod
    function modExp(bytes memory base, bytes memory exp, bytes memory mod)
        external view returns (bytes memory)
    {
        bytes memory input = abi.encodePacked(
            uint256(base.length),
            uint256(exp.length),
            uint256(mod.length),
            base, exp, mod
        );

        (bool success, bytes memory result) = address(0x05).staticcall(input);
        require(success, "modexp failed");
        return result;
    }

    // BN254 ecAdd
    function bn254Add(uint256[2] memory p1, uint256[2] memory p2)
        external view returns (uint256[2] memory)
    {
        uint256[4] memory input = [p1[0], p1[1], p2[0], p2[1]];
        uint256[2] memory result;

        assembly {
            let success := staticcall(gas(), 0x06, input, 128, result, 64)
            if iszero(success) { revert(0, 0) }
        }

        return result;
    }
}
```

## 相關概念

- [ECRECOVER](/ethereum/cryptography/ecrecover/) - ecRecover precompile 的詳細說明
- [ECDSA](/ethereum/cryptography/ecdsa/) - ecRecover 驗證的簽名方案
- [SHA-256](/ethereum/cryptography/sha-256/) - 0x02 precompile 的 hash function
- [橢圓曲線密碼學](/fundamentals/cryptography/elliptic-curve-cryptography/) - BN254 相關 precompile 的數學基礎
- [zkSNARKs 支援](/ethereum/advanced/zksnarks/) - ecAdd/ecMul/ecPairing 的主要用途
- [KZG Commitments](/ethereum/advanced/kzg-commitments/) - Point evaluation precompile 的應用
- [EIP-4844 Proto-Danksharding](/ethereum/advanced/eip-4844/) - 0x0A precompile 的來源
- [BLS12-381](/ethereum/cryptography/bls12-381/) - EIP-2537 BLS12-381 precompile（0x0B-0x13，Pectra 上線）
- [secp256k1](/ethereum/cryptography/secp256k1/) - 與 EIP-7951 新增的 secp256r1 對照
- [交易簽名](/ethereum/transaction-lifecycle/transaction-signing/) - ecRecover 在簽名驗證中的角色
