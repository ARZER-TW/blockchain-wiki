---
title: "Verkle Trees"
description: "Verkle Trees, Verkle Trie, VKT"
tags: [ethereum, data-structure, verkle, statelessness, trie]
---

# Verkle Trees 在 Ethereum 中的應用

> 本文聚焦 Ethereum 特定的實現細節。通用理論請參見 [Verkle Trees 向量承諾樹](/fundamentals/data-structures/verkle-trees/)。

## 概述

Verkle Trees 是 Ethereum 計劃用來取代 [Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/) 的新資料結構。核心改進是用 polynomial commitment（IPA on Bandersnatch）取代 hash-based commitment，使得 proof 大小大幅縮減，為 stateless client 鋪路。關於 Verkle Tree 的通用結構和 proof 大小分析，請參見[通用理論](/fundamentals/data-structures/verkle-trees/)。

## EIP-6800：Ethereum Verkle State Tree

### Key 結構（32 bytes）

```
[stem: 31 bytes][suffix: 1 byte]
```

- **Stem**：前 31 bytes，決定在樹中的路徑
- **Suffix**：最後 1 byte（0-255），對應葉節點中的 slot

### 節點類型

1. **Inner node**：256 個子節點的 commitment
2. **Extension node**：包含 stem 和兩個 commitment（C1 和 C2）
   - C1：suffix 0-127 的值的 commitment
   - C2：suffix 128-255 的值的 commitment

### 地址空間映射

帳戶的各種資料被映射到不同的 suffix：

| Suffix | 資料 |
|--------|------|
| 0 | Version |
| 1 | Balance |
| 2 | Nonce |
| 3 | Code hash |
| 4 | Code size |
| 64-127 | Code chunks (前 128 chunks) |
| 128-255 | 保留 |

Storage slots 透過特定的 hash function 映射到獨立的 stem。

### Pedersen IPA on Bandersnatch

Ethereum 的 Verkle Tree 實作選用 IPA（Inner Product Argument）而非 [KZG Commitments](/ethereum/advanced/kzg-commitments/)：

**Bandersnatch 曲線**是嵌在 [BLS12-381](/ethereum/cryptography/bls12-381/) 標量域中的 twisted Edwards 曲線：

$$-5x^2 + y^2 = 1 + dx^2y^2$$

特點：
- 標量域與 BLS12-381 的基域相同，方便 SNARK 內部驗證
- 支援高效的 multi-scalar multiplication
- GLV endomorphism 加速
- **不需要 trusted setup**（避免 KZG ceremony 的信任假設）

## Stateless Ethereum

Verkle Trees 是 Stateless Ethereum roadmap 的核心：

- 全節點不需要存儲完整的 state（目前 > 100GB）
- Block producer 在區塊中附帶 witness
- Verifier 用 witness 驗證 [狀態轉換](/ethereum/transaction-lifecycle/state-transition/)
- 大幅降低節點硬體需求

## MPT 到 Verkle 的遷移策略

從 [Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/) 遷移到 Verkle Tree 的過渡方案：

1. **Overlay approach**：新的寫入進 Verkle Tree，舊的保留在 MPT
2. 讀取時先查 Verkle，miss 時 fallback 到 MPT
3. 逐步將 MPT 資料遷移到 Verkle
4. 遷移完成後停用 MPT

## 時程與開發狀態

Verkle Trees 目標在 **Hegota 升級（2026 H2）** 上線。Pectra（2025/5）和 Fusaka（2025/12）都未納入 Verkle，優先處理了 blob 擴容和其他改進。

目前狀態（截至 2026 初）：
- 多個客戶端（Geth、Nethermind、Besu）正在積極實作 Verkle 支援
- Devnet 測試持續進行中
- EIP-6800（Verkle state tree）和相關 EIP 仍在迭代
- Gas 計費重新設計（witness size 影響 gas cost）尚未定案

主要挑戰：

- Gas 計費重新設計（witness size 影響 gas cost）
- 客戶端實作的效能優化，特別是 IPA proof 的計算效率
- MPT 到 Verkle 的遷移期相容性
- 遷移期間節點需要同時維護兩套資料結構的儲存成本

## 程式碼範例

```python
# Ethereum Verkle Tree 節點結構（EIP-6800）
from dataclasses import dataclass

@dataclass(frozen=True)
class InnerNode:
    """內部節點：256 個子節點的 commitment。"""
    commitment: bytes  # IPA commitment
    children: tuple    # 256 個子節點（可為 None）

@dataclass(frozen=True)
class ExtensionNode:
    """延伸節點：一個 stem 對應 256 個值。"""
    stem: bytes        # 31 bytes
    commitment: bytes  # 整體 commitment
    c1: bytes          # suffix 0-127 的 commitment
    c2: bytes          # suffix 128-255 的 commitment
    values: tuple      # 256 個值（可為 None）

def get_tree_key(address: bytes, tree_index: int, sub_index: int) -> bytes:
    """計算帳戶資料在 Verkle Tree 中的 key（EIP-6800）。"""
    # stem = pedersen_hash(address || tree_index)[0:31]
    stem = pedersen_hash(address + tree_index.to_bytes(32, 'big'))[:31]
    # key = stem || sub_index
    return stem + bytes([sub_index])

# 帳戶欄位映射
BASIC_DATA_LEAF_KEY = 0
CODE_HASH_LEAF_KEY = 1

def get_balance_key(address: bytes) -> bytes:
    return get_tree_key(address, 0, BASIC_DATA_LEAF_KEY)

def get_nonce_key(address: bytes) -> bytes:
    return get_tree_key(address, 0, BASIC_DATA_LEAF_KEY)  # packed in same slot

def get_code_hash_key(address: bytes) -> bytes:
    return get_tree_key(address, 0, CODE_HASH_LEAF_KEY)
```

```javascript
// Verkle proof 驗證（概念）
function verifyVerkleProof(root, proof, keys, values) {
  // proof 包含：
  // - commitments: 路徑上所有涉及的節點 commitment
  // - multiproof: 合併的 IPA multi-opening proof

  const { commitments, multiproof } = proof;

  // 1. 重建路徑上的期望 commitment
  const expectedCommitments = rebuildCommitments(keys, values, commitments);

  // 2. 驗證 root 一致
  if (expectedCommitments[0] !== root) {
    return false;
  }

  // 3. 驗證 IPA multi-proof
  return verifyIPAMultiProof(commitments, multiproof, keys, values);
}

// Witness 大小估算
function estimateWitnessSize(numKeys, treeDepth) {
  const kvSize = numKeys * 64;                    // key-value pairs
  const proofSize = treeDepth * 32 + 128;          // multi-proof
  const commitmentSize = treeDepth * numKeys * 32;  // upper bound

  return {
    kvSize,
    proofSize,
    commitmentSize,
    total: kvSize + proofSize + commitmentSize,
    merkleEquivalent: numKeys * 24 * 32,  // MPT 的估計大小
  };
}
```

## 相關概念

- [Verkle Trees 通用理論](/fundamentals/data-structures/verkle-trees/) - vector commitment 概念、proof 大小分析、IPA vs KZG 比較
- [Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/) - Verkle Trees 要取代的現有資料結構
- [KZG Commitments](/ethereum/advanced/kzg-commitments/) - 一種 polynomial commitment scheme（Verkle 選用 IPA）
- [State Trie](/ethereum/data-structures/state-trie/) - 現有的全局狀態樹
- [Storage Trie](/ethereum/data-structures/storage-trie/) - 現有的合約存儲樹
- [區塊 Header](/ethereum/consensus/block-header/) - stateRoot 將指向 Verkle Tree root
- [橢圓曲線密碼學](/fundamentals/cryptography/elliptic-curve-cryptography/) - IPA 和 KZG 的數學基礎
- [BLS12-381](/ethereum/cryptography/bls12-381/) - Bandersnatch 曲線嵌入的目標曲線
- [EIP-4844 Proto-Danksharding](/ethereum/advanced/eip-4844/) - 另一個朝向擴展性的 EIP
- [狀態轉換](/ethereum/transaction-lifecycle/state-transition/) - Verkle witness 讓 stateless client 能驗證狀態轉換
