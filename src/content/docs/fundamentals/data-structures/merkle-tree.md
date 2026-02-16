---
title: "Merkle Tree"
description: "Merkle Tree, Hash Tree, 默克爾樹"
tags: [fundamentals, data-structure, merkle-tree, cryptography]
---

# Merkle Tree

## 概述

Merkle Tree 是一種樹狀雜湊結構，每個葉子節點是資料的 hash，每個非葉子節點是其子節點 hash 的 hash。根節點（Merkle root）可以用來高效驗證任一資料是否存在於集合中，驗證成本為 $O(\log n)$。

## 核心原理

### 結構

一棵二元 Merkle Tree 的建構方式：

1. 對每筆資料計算 hash，作為葉子節點
2. 每兩個相鄰節點合併 hash 產生父節點
3. 若節點數為奇數，最後一個節點自我複製（或向上提升）
4. 遞迴至只剩一個根節點

```
           Root
         /      \
       H(AB)   H(CD)
      /    \   /    \
    H(A)  H(B) H(C) H(D)
     |     |    |     |
     A     B    C     D
```

$$\text{Root} = H(H(H(A) \| H(B)) \| H(H(C) \| H(D)))$$

其中 $H$ 是 hash 函數，$\|$ 是 concatenation。

### Merkle Proof（Inclusion Proof）

要證明 $B$ 存在於 Merkle Tree 中，只需提供：

1. $H(A)$ — B 的 sibling
2. $H(CD)$ — 上一層的 sibling

驗證步驟：
1. 計算 $H(B)$
2. 計算 $H(AB) = H(H(A) \| H(B))$
3. 計算 $\text{Root}' = H(H(AB) \| H(CD))$
4. 比對 $\text{Root}' == \text{Root}$

Proof 大小為 $O(\log_2 n)$，對 $n = 2^{20}$（約 100 萬筆資料），只需 20 個 hash。

### 安全性質

- **Preimage resistance**：無法從 root 反推原始資料
- **Tamper detection**：修改任一葉子會改變 root
- **Binding**：相同的 root 必定對應相同的資料集（在固定結構下）

### 與 Binary Hash Tree 的差異

普通 hash chain（如 `H(A || B || C || D)`）驗證任一元素都需要所有資料。Merkle Tree 把驗證成本從 $O(n)$ 降到 $O(\log n)$。

## 在區塊鏈中的應用

Merkle Tree 是幾乎所有區塊鏈的核心資料結構：

### Bitcoin
- **交易 Merkle Tree**：區塊內所有交易的 Merkle root 存於 block header（使用 SHA-256d）
- **SPV 驗證**：輕節點用 Merkle proof 驗證交易是否包含在區塊中
- **Witness Merkle Tree**：SegWit 引入的 wtxid 基 Merkle tree

### Ethereum
- **[Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/)**：結合 Merkle Tree 和 Patricia Trie 的進階結構
- **三棵 Trie**：[State Trie](/ethereum/data-structures/state-trie/)、[Transaction Trie](/ethereum/data-structures/transaction-trie/)、[Receipt Trie](/ethereum/data-structures/receipt-trie/)
- **SSZ Merkleization**：Beacon Chain 用二元 Merkle Tree 計算 `hash_tree_root`
- **[Verkle Trees](/fundamentals/data-structures/verkle-trees/)**：下一代替代方案，用 vector commitment 取代 Merkle proof

### Solana
- **Transaction Merkle Tree**：每個 entry 的交易構成 Merkle tree
- **Account State**：使用 append-only Merkle tree 驗證帳戶狀態

## 程式碼範例

### JavaScript

```javascript
import { keccak256 } from 'ethers';

function buildMerkleTree(leaves) {
  if (leaves.length === 0) return { root: null, layers: [] };

  let layer = leaves.map(leaf =>
    typeof leaf === 'string' ? leaf : keccak256(leaf)
  );
  const layers = [layer];

  while (layer.length > 1) {
    const nextLayer = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = i + 1 < layer.length ? layer[i + 1] : layer[i];
      // 排序以確保確定性（OpenZeppelin 風格）
      const pair = [left, right].sort();
      const combined = keccak256(
        new Uint8Array([
          ...Buffer.from(pair[0].slice(2), 'hex'),
          ...Buffer.from(pair[1].slice(2), 'hex'),
        ])
      );
      nextLayer.push(combined);
    }
    layers.push(nextLayer);
    layer = nextLayer;
  }

  return { root: layer[0], layers };
}

function getMerkleProof(layers, index) {
  const proof = [];
  for (let i = 0; i < layers.length - 1; i++) {
    const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
    if (siblingIndex < layers[i].length) {
      proof.push(layers[i][siblingIndex]);
    }
    index = Math.floor(index / 2);
  }
  return proof;
}

function verifyProof(leaf, proof, root) {
  let hash = leaf;
  for (const sibling of proof) {
    const pair = [hash, sibling].sort();
    hash = keccak256(
      new Uint8Array([
        ...Buffer.from(pair[0].slice(2), 'hex'),
        ...Buffer.from(pair[1].slice(2), 'hex'),
      ])
    );
  }
  return hash === root;
}

// 使用
const data = ['0xaabb', '0xccdd', '0xeeff', '0x1122'];
const leaves = data.map(d => keccak256(d));
const { root, layers } = buildMerkleTree(leaves);

const proof = getMerkleProof(layers, 1);
const valid = verifyProof(leaves[1], proof, root);
console.log('root:', root);
console.log('proof valid:', valid); // true
```

### Python

```python
from eth_utils import keccak

def build_merkle_tree(leaves: list[bytes]) -> tuple[bytes, list]:
    layer = [keccak(leaf) if len(leaf) != 32 else leaf for leaf in leaves]
    layers = [layer[:]]

    while len(layer) > 1:
        next_layer = []
        for i in range(0, len(layer), 2):
            left = layer[i]
            right = layer[i + 1] if i + 1 < len(layer) else layer[i]
            pair = sorted([left, right])
            next_layer.append(keccak(pair[0] + pair[1]))
        layers.append(next_layer)
        layer = next_layer

    return layer[0], layers

def get_proof(layers: list, index: int) -> list[bytes]:
    proof = []
    for i in range(len(layers) - 1):
        sibling = index + 1 if index % 2 == 0 else index - 1
        if sibling < len(layers[i]):
            proof.append(layers[i][sibling])
        index //= 2
    return proof

def verify(leaf: bytes, proof: list[bytes], root: bytes) -> bool:
    current = leaf
    for sibling in proof:
        pair = sorted([current, sibling])
        current = keccak(pair[0] + pair[1])
    return current == root

# 使用
data = [b'alice', b'bob', b'charlie', b'dave']
leaves = [keccak(d) for d in data]
root, layers = build_merkle_tree(leaves)

proof = get_proof(layers, 1)  # proof for 'bob'
assert verify(leaves[1], proof, root)
print(f"root: 0x{root.hex()}")
print(f"proof length: {len(proof)}")
```

## 相關概念

- [雜湊函數概述](/fundamentals/cryptography/hash-function-overview/) - Merkle Tree 的基礎建構元件
- [Keccak-256](/fundamentals/cryptography/keccak-256/) - Ethereum Merkle Tree 使用的 hash 函數
- [SHA-256](/fundamentals/cryptography/sha-256/) - Bitcoin Merkle Tree 使用的 hash 函數
- [Bloom Filter](/fundamentals/data-structures/bloom-filter/) - 另一種機率型資料結構
- [Verkle Trees](/fundamentals/data-structures/verkle-trees/) - 用 vector commitment 取代 hash-based proof 的下一代結構
- [KZG Commitments](/fundamentals/cryptography/kzg-commitments/) - 多項式承諾方案
