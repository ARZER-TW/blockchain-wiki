---
title: "BitVM"
description: "Bitcoin 上的圖靈完備計算驗證：樂觀執行、fraud proof、Taproot 驗證電路與 BitVM2 信任模型"
tags: [bitcoin, advanced, bitvm, fraud-proof, taproot, verification, bridge]
---

# BitVM

## 概述

BitVM 是由 Robin Linus 於 2023 年 10 月提出的框架，實現了在 Bitcoin 上的圖靈完備計算驗證。BitVM 不是在鏈上執行任意計算（Bitcoin Script 本身不是圖靈完備的），而是採用樂觀（Optimistic）模式：計算在鏈下執行，僅在出現爭議時才在鏈上進行 fraud proof 驗證。

這個設計哲學與 Ethereum 的 Optimistic Rollup 相似：假設鏈下執行是正確的，只有在被挑戰時才需要鏈上證明。BitVM 的突破在於證明了 Bitcoin Script 雖然受限，但搭配 [Taproot](/bitcoin/transactions/p2tr/) 的巨大 Taproot tree 結構，足以驗證任意計算。

## 核心原理

### 從 NAND Gate 到圖靈完備

任何布林函數都可以用 NAND 門（Not AND）組合表達，而 NAND 門可以用 Bitcoin Script 的 hash-lock 實現。這是 BitVM 的理論基礎。

一個 bit commitment 的 Script 實現：

```
OP_IF
    OP_SHA256 <hash_1> OP_EQUALVERIFY  # bit = 1
OP_ELSE
    OP_SHA256 <hash_0> OP_EQUALVERIFY  # bit = 0
OP_ENDIF
```

揭露 `preimage_1` 代表 bit = 1，揭露 `preimage_0` 代表 bit = 0。

### NAND Gate Script

NAND 門的真值表 $\text{NAND}(a, b) = \neg(a \wedge b)$：

| $a$ | $b$ | $\text{NAND}(a,b)$ |
|-----|-----|---------------------|
| 0 | 0 | 1 |
| 0 | 1 | 1 |
| 1 | 0 | 1 |
| 1 | 1 | 0 |

透過 hash-lock 將 $a$、$b$ 和輸出 $c$ 綁定，如果 prover 宣稱的輸入/輸出組合違反 NAND 真值表，verifier 就可以構造一筆挑戰交易證明 prover 作弊。

### 複雜度

對於一個需要 $n$ 個 NAND 門的計算：

$$\text{Taproot leaves} = O(n)$$
$$\text{Taproot tree depth} = O(\log n)$$
$$\text{Challenge rounds} = O(\log n) \quad \text{(binary search)}$$

## Taproot 驗證電路

### 架構

每個 NAND 門對應 Taproot tree 中的一個或多個葉節點。整個計算電路被編碼為一棵巨大的 Taproot tree，使用 [Tapscript](/bitcoin/advanced/tapscript/) 中的腳本。

```
              Internal Key (MuSig of prover + verifier)
                              |
                    [Taproot Tree]
                   /              \
            [Gate 1]          [Gate 2]
           /        \        /        \
     [input_a]  [input_b]  ...      ...
```

### Key-path vs Script-path

- **Key-path**（正常情況）：prover 和 verifier 合作簽名，使用 [MuSig](/bitcoin/advanced/multisig-musig/) 的聚合公鑰。這對應「計算結果被接受」的樂觀路徑。
- **Script-path**（爭議情況）：verifier 揭露某個 Taproot 葉節點的腳本，證明 prover 作弊。

### Equivocation 懲罰

BitVM 的安全性依賴於偵測 equivocation（對同一個 bit 宣稱矛盾的值）。如果 prover 對某個 bit 同時揭露了 `preimage_0` 和 `preimage_1`，verifier 可以：

1. 用兩個 preimage 構造懲罰交易
2. 取走 prover 的全部保證金

$$\text{equivocation detected} \iff \exists b: \text{SHA-256}(r_0) = h_0 \wedge \text{SHA-256}(r_1) = h_1$$

其中 prover 在不同的挑戰輪中分別揭露了 $r_0$ 和 $r_1$。

## BitVM2

### 改進的信任模型

原始 BitVM 需要 prover 和 verifier 之間的 1-of-1 信任假設（雙方必須在線上互動）。BitVM2 將信任模型改進為 1-of-$n$：

$$\text{security} = 1 - \text{Pr}[\text{all } n \text{ verifiers collude}]$$

只要 $n$ 個 verifier 中有至少一個誠實且在線上，就能確保計算正確性。

### 二階段協議

1. **Assert 階段**：prover 在鏈上發布計算結果及保證金
2. **Challenge 階段**：任何 verifier 可以在挑戰期內發起 fraud proof

如果沒有挑戰，prover 在挑戰期結束後取回保證金。如果有有效的 fraud proof，挑戰者獲得保證金。

### Groth16 Verifier

BitVM2 的一個關鍵應用是在 Bitcoin 上驗證 Groth16 ZK-SNARK proof。這允許將任意複雜的計算壓縮為一個 ZK proof，然後在 Bitcoin 上驗證，大幅減少鏈上驗證的複雜度。

## 應用場景

### Trust-Minimized Bridges

BitVM 最受矚目的應用是 Bitcoin bridge：

$$\text{BTC (L1)} \xrightarrow{\text{peg-in}} \text{Sidechain/Rollup} \xrightarrow{\text{peg-out (BitVM verify)}} \text{BTC (L1)}$$

peg-out 時，bridge operator（prover）宣稱在 sidechain 上的 burn 交易有效。如果宣稱有誤，任何 verifier 可以發起 fraud proof。

### Bitcoin Rollups

BitVM 使得 Bitcoin 上的 rollup 成為可能：
- 交易在 rollup 中執行
- State root 定期提交到 Bitcoin
- 有效性透過 BitVM fraud proof 保證

### 與 Ethereum Bridge 的比較

| 特徵 | BitVM Bridge | Multisig Bridge | Ethereum Rollup Bridge |
|------|-------------|-----------------|------------------------|
| 信任模型 | 1-of-n (optimistic) | m-of-n (federated) | 1-of-n 或 validity proof |
| 爭議期 | 約 2 週 | 無 | 7 天（optimistic） |
| 資本效率 | 需要保證金 | 中等 | 高 |
| 安全性基礎 | Bitcoin Script + Taproot | 委員會誠實 | L1 finality |

## 程式碼範例

### JavaScript（Bit Commitment 模擬）

```javascript
const crypto = require('crypto');

class BitCommitment {
  constructor() {
    this.preimage0 = crypto.randomBytes(32);
    this.preimage1 = crypto.randomBytes(32);
    this.hash0 = crypto.createHash('sha256').update(this.preimage0).digest();
    this.hash1 = crypto.createHash('sha256').update(this.preimage1).digest();
  }

  getCommitment() {
    return { hash0: this.hash0.toString('hex'), hash1: this.hash1.toString('hex') };
  }

  reveal(bit) {
    return bit === 0 ? this.preimage0 : this.preimage1;
  }

  static verify(preimage, expectedHash) {
    const hash = crypto.createHash('sha256').update(preimage).digest();
    return hash.equals(expectedHash);
  }
}

// 模擬 NAND gate 驗證
function verifyNANDGate(commitA, revealA, commitB, revealB, commitC, revealC) {
  const a = BitCommitment.verify(revealA, commitA.hash1) ? 1 : 0;
  const b = BitCommitment.verify(revealB, commitB.hash1) ? 1 : 0;
  const c = BitCommitment.verify(revealC, commitC.hash1) ? 1 : 0;

  const expected = (a & b) === 0 ? 1 : 0;  // NAND
  return c === expected;
}

// 建立三個 bit commitment (a, b, c = NAND(a, b))
const bitA = new BitCommitment();
const bitB = new BitCommitment();
const bitC = new BitCommitment();

// Prover 宣稱: a=1, b=0, c=NAND(1,0)=1
const valid = verifyNANDGate(
  bitA.getCommitment(), bitA.reveal(1),
  bitB.getCommitment(), bitB.reveal(0),
  bitC.getCommitment(), bitC.reveal(1)
);
console.log('NAND(1,0)=1 valid:', valid);

// 偵測 equivocation
function detectEquivocation(commitment, preimage0, preimage1) {
  const valid0 = BitCommitment.verify(preimage0, Buffer.from(commitment.hash0, 'hex'));
  const valid1 = BitCommitment.verify(preimage1, Buffer.from(commitment.hash1, 'hex'));
  return valid0 && valid1; // 兩個都有效 = equivocation
}
```

### Python（驗證電路模擬）

```python
import hashlib
import os
from dataclasses import dataclass

@dataclass
class BitCommit:
    preimage_0: bytes
    preimage_1: bytes
    hash_0: bytes
    hash_1: bytes

    @classmethod
    def create(cls):
        p0 = os.urandom(32)
        p1 = os.urandom(32)
        h0 = hashlib.sha256(p0).digest()
        h1 = hashlib.sha256(p1).digest()
        return cls(p0, p1, h0, h1)

def nand(a: int, b: int) -> int:
    return 1 - (a & b)

def build_circuit(num_gates: int) -> dict:
    """建立一個簡單的 NAND 電路"""
    gates = []
    wires = {}
    for i in range(num_gates):
        commit = BitCommit.create()
        wires[f'gate_{i}'] = commit
        gates.append({
            'id': i,
            'commitment': (commit.hash_0.hex()[:16], commit.hash_1.hex()[:16]),
        })
    return {'gates': gates, 'wires': wires, 'depth': num_gates}

def estimate_taproot_tree_size(num_gates: int) -> dict:
    """估算 Taproot tree 的大小"""
    leaves = num_gates * 4  # 每個 gate 約 4 個挑戰葉節點
    depth = (leaves - 1).bit_length()
    # 每個葉節點約 100 bytes script
    total_script_size = leaves * 100
    # Merkle proof 大小
    proof_size = depth * 32  # 每層 32 bytes hash

    return {
        'num_gates': num_gates,
        'tree_leaves': leaves,
        'tree_depth': depth,
        'total_script_bytes': total_script_size,
        'merkle_proof_bytes': proof_size,
        'challenge_rounds': depth,
    }

# 模擬不同規模的電路
for gates in [100, 1_000, 10_000, 100_000]:
    info = estimate_taproot_tree_size(gates)
    print(f"Gates: {gates:>7,} | Leaves: {info['tree_leaves']:>9,} | "
          f"Depth: {info['tree_depth']:>2} | Challenge rounds: {info['challenge_rounds']}")
```

## 相關概念

- [Tapscript](/bitcoin/advanced/tapscript/) - BitVM 驗證腳本的執行環境
- [P2TR](/bitcoin/transactions/p2tr/) - Taproot tree 編碼驗證電路的交易格式
- [Taproot Key Tweaking](/bitcoin/cryptography/taproot-key-tweaking/) - 將 Taproot tree 承諾嵌入公鑰
- [Multisig/MuSig](/bitcoin/advanced/multisig-musig/) - BitVM 的 key-path 合作路徑
- [Covenants/OP_CAT](/bitcoin/advanced/covenants-opcat/) - 增強 BitVM 能力的腳本升級提案
- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - hash-lock NAND gate 的底層語言
- [SHA-256d](/bitcoin/cryptography/sha-256d/) - bit commitment 的雜湊函數
- [Schnorr Signatures](/bitcoin/cryptography/schnorr-signatures/) - key-path 的簽名方案
- [Hash Function Overview](/fundamentals/cryptography/hash-function-overview/) - bit commitment 的密碼學基礎
- [ECDSA](/fundamentals/cryptography/ecdsa/) - 傳統 Bitcoin 簽名（BitVM 偏好 Schnorr）
