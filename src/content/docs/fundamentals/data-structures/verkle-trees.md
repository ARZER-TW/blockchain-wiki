---
title: "Verkle Trees（向量承諾樹）"
description: "Verkle trees: vector commitment concept, IPA vs KZG commitment, tree structure, proof size comparison with Merkle trees"
tags: [fundamentals, data-structures, verkle-tree, vector-commitment, polynomial-commitment]
---

# Verkle Trees

## 概述

Verkle Trees 是一種基於 vector commitment 的樹狀資料結構，名稱來自 **Vec**tor commitment + Me**rkle** 的混成。核心改進是用 polynomial commitment（如 IPA 或 [KZG Commitments](/fundamentals/cryptography/kzg-commitments/)）取代 hash-based commitment，使得 proof 大小從 $O(k \log n)$ 縮減到 $O(k)$（$k$ 是查詢的 key 數量）。

Verkle Trees 解決了傳統 [Merkle Tree](/fundamentals/data-structures/merkle-tree/) 在大寬度（high branching factor）時 proof 過大的問題，為 stateless client 和輕量級驗證鋪路。

## Merkle Tree 的瓶頸

在傳統 Merkle Tree 中，證明某個 leaf 的存在需要提供從葉到根的所有 sibling hash。對於 branching factor $b$ 和深度 $d$ 的樹：

$$\text{proof size} = O(d \times (b - 1)) = O(\log_b n \times (b - 1))$$

如果增大 $b$ 來減少深度 $d$，每層需要更多 sibling hash，proof 反而變大。例如：
- $b = 2$（binary tree），深度 32，每層 1 個 sibling：proof ~1 KB
- $b = 16$，深度 8，每層 15 個 sibling：proof ~3.5 KB
- $b = 256$，深度 4，每層 255 個 sibling：proof ~32 KB

Merkle Tree 無法同時享有「淺深度」和「小 proof」的好處。

## Vector Commitment 的突破

Verkle Tree 的關鍵洞見：使用 polynomial commitment 作為 vector commitment，proof 大小與 vector 長度無關。

- 每個內部節點有最多 $b$ 個子節點
- 子節點值 $[v_0, v_1, ..., v_{b-1}]$ 構成多項式 $p(x)$，使得 $p(i) = v_i$
- 節點的 commitment $C = \text{Commit}(p)$
- 要證明第 $i$ 個子節點的值，只需一個 opening proof，大小與 $b$ 無關

因此 Verkle Tree 可以使用很大的 $b$（如 256 甚至 1024），得到極淺的深度，同時 proof 仍然很小。

## Proof 大小比較

| 結構 | Branching Factor | 深度（~$2^{32}$ 葉） | 每層 Proof | 總 Proof（單 key） |
|------|-----------------|---------------------|-----------|-------------------|
| Binary Merkle Tree | 2 | 32 | 32 bytes | ~1 KB |
| Wide Merkle Tree | 16 | 8 | 480 bytes | ~3.5 KB |
| Verkle Tree (b=256) | 256 | 4 | ~32-48 bytes | ~150 bytes |

Verkle 的 proof 如此小是因為：polynomial commitment opening 的大小與多項式 degree 無關，每層只需一個 opening proof（~32-48 bytes），而不需要所有 sibling。

## Commitment Scheme 選擇：IPA vs KZG

Verkle Tree 可以搭配不同的 polynomial commitment scheme：

| 特性 | IPA（Pedersen） | KZG |
|------|----------------|-----|
| Trusted setup | 不需要 | 需要（MPC ceremony） |
| Proof 大小 | 稍大（$O(\log n)$ group elements） | 固定 48 bytes |
| 驗證時間 | 較慢（$O(n)$ multi-scalar multiplication） | 較快（2 pairings） |
| 適用曲線 | 任何支援 Pedersen commitment 的曲線 | 需要 pairing-friendly 曲線 |
| 量子安全 | 否（同 DLP） | 否（同 DLP） |

選擇 IPA 的主要理由是避免 trusted setup 的額外信任假設。常用的搭配是 IPA + Bandersnatch 曲線（一條嵌入 BLS12-381 標量域的 twisted Edwards 曲線），支援高效的 multi-scalar multiplication。

## 樹結構

### 基本組成

- **Inner node**：包含 $b$ 個子節點的 polynomial commitment
- **Leaf / Extension node**：包含實際的 key-value 資料
- **Width parameter** $b$：通常為 256 或 1024

### Key 路徑

32-byte key 在樹中的路徑由各層 index 決定。例如 $b = 256$ 時：
- 第 1 層：取 key 的第 1 byte（0-255）
- 第 2 層：取 key 的第 2 byte（0-255）
- 以此類推，直到葉節點

### 多重 Proof 合併

Verkle Tree 的一大優勢：多個 key 的 proof 可以高效合併。

給定要證明的 key 集合 $\{k_1, k_2, ..., k_m\}$，它們的路徑可能共享中間節點。合併 proof 只需要：

1. 收集所有涉及的節點
2. 對每個節點產生一個 multi-opening proof
3. 用隨機線性組合壓縮為單一 proof

最終 proof 大小約 $O(d)$（樹的深度），與 key 數量幾乎無關（只要 key 共享路徑）。這對需要一次驗證大量 key 的場景（如區塊驗證）特別重要。

## State Transition Witness

有了 Verkle proof，區塊的 witness 包含：

1. 所有被讀取/修改的 key-value pair
2. 一個 Verkle multi-proof 證明這些值在 state trie 中

區塊驗證者不需要完整的 state，只需要 witness 就能驗證 state transition。這就是 **stateless client** 的概念：節點可以在不存儲完整狀態的情況下驗證區塊的正確性。

## 程式碼範例

```python
from dataclasses import dataclass
from typing import Optional

@dataclass(frozen=True)
class VerkleInnerNode:
    """內部節點：b 個子節點的 polynomial commitment。"""
    commitment: bytes
    children: tuple  # b 個子節點（可為 None）

@dataclass(frozen=True)
class VerkleLeafNode:
    """葉節點：包含 key-value 資料。"""
    stem: bytes       # key prefix
    commitment: bytes
    values: tuple     # 對應各 suffix 的值

def verkle_proof_size_estimate(depth: int, num_keys: int) -> dict:
    """估算 Verkle proof 大小"""
    # 每個 key-value pair: 32 + 32 = 64 bytes
    kv_size = num_keys * 64

    # Multi-proof: ~depth * 32 bytes + constant overhead
    proof_size = depth * 32 + 128

    # 路徑上的 commitments（共享路徑會減少）
    commitment_size = depth * num_keys * 32  # upper bound

    return {
        "kv_bytes": kv_size,
        "proof_bytes": proof_size,
        "commitment_bytes": commitment_size,
        "total_upper_bound": kv_size + proof_size + commitment_size,
    }

# 比較 Merkle vs Verkle proof size
print("Single key proof comparison:")
print(f"  Binary Merkle (d=32):  {32 * 32} bytes")
print(f"  16-ary Merkle (d=8):   {8 * 15 * 32} bytes")
print(f"  Verkle (b=256, d=4):   {4 * 48} bytes")
```

## 相關概念

- [Merkle Tree](/fundamentals/data-structures/merkle-tree/) - Verkle Trees 改進的傳統結構
- [KZG Commitments](/fundamentals/cryptography/kzg-commitments/) - 一種可用的 polynomial commitment scheme
- [橢圓曲線密碼學](/fundamentals/cryptography/elliptic-curve-cryptography/) - IPA 和 KZG 的數學基礎
- [雜湊函數概述](/fundamentals/cryptography/hash-function-overview/) - Merkle Tree 使用的 hash-based commitment
- [Bloom Filter](/fundamentals/data-structures/bloom-filter/) - 另一種空間效率優化的資料結構
