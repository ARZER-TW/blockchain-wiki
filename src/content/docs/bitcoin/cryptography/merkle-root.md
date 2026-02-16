---
title: "Merkle Root（Bitcoin 交易 Merkle 樹根）"
description: "Bitcoin Merkle root construction: binary tree from transaction hashes, odd-leaf duplication, witness commitment, CVE-2012-2459, SPV proof"
tags: [bitcoin, cryptography, merkle-root, merkle-tree, spv, segwit, witness-commitment]
---

# Merkle Root

## 概述

Merkle Root 是 Bitcoin 區塊中所有交易雜湊值的密碼學摘要，儲存在 80-byte [block header](/bitcoin/data-structures/bitcoin-block-structure/) 中。它使得輕節點（SPV client）可以在不下載完整區塊的情況下，用 $O(\log n)$ 的 Merkle proof 驗證某筆交易確實包含在區塊中。

Bitcoin 使用 [SHA-256d](/bitcoin/cryptography/sha-256d/) 作為 Merkle 樹的雜湊函數，並在遇到奇數葉子時複製最後一個元素。

## 核心原理

### 二元 Merkle 樹建構

給定區塊中的 $n$ 筆交易 $tx_0, tx_1, \ldots, tx_{n-1}$：

1. 對每筆交易計算 txid：$h_i = \text{SHA-256d}(\text{serialize}(tx_i))$
2. 相鄰的兩個 hash 拼接後再次 SHA-256d：$H_{i} = \text{SHA-256d}(h_{2i} \| h_{2i+1})$
3. 若當前層有奇數個節點，**複製最後一個**：$h_{n} = h_{n-1}$
4. 遞迴直到只剩一個根節點

$$\text{Merkle Root} = \text{SHA-256d}(H_{\text{left}} \| H_{\text{right}})$$

### 視覺化範例

4 筆交易的 Merkle 樹：

```
          Merkle Root
          /          \
     H(01)           H(23)
    /      \        /      \
  txid_0  txid_1  txid_2  txid_3
```

3 筆交易（奇數個）：最後一個葉子自我複製

```
          Merkle Root
          /          \
     H(01)           H(22)     <- txid_2 被複製
    /      \        /      \
  txid_0  txid_1  txid_2  txid_2
```

### 數學表示

對 $n$ 個葉子，樹高為 $\lceil \log_2 n \rceil$，Merkle proof 包含 $\lceil \log_2 n \rceil$ 個 sibling hash。

驗證一個 leaf $h_i$ 的 inclusion proof：

$$\text{Verify}(h_i, \text{proof}, \text{root}) : \quad h_i \xrightarrow{\text{proof}} \text{root}' \stackrel{?}{=} \text{root}$$

## 奇數葉子複製與 CVE-2012-2459

### 漏洞描述

Bitcoin 在奇數葉子時複製最後一個元素的設計，導致了一個嚴重的共識漏洞（CVE-2012-2459）：

攻擊者可以構造一個包含重複交易的無效區塊，其 Merkle root 與一個有效區塊相同。當節點因「無效區塊」而拒絕某個 block hash 時，它也會錯誤地拒絕具有相同 Merkle root 的有效區塊。

**攻擊原理：**

```
有效區塊: [tx_A, tx_B, tx_C]
Merkle: H(H(A,B), H(C,C))

偽造區塊: [tx_A, tx_B, tx_C, tx_C]  (重複 tx_C)
Merkle: H(H(A,B), H(C,C))  <- 相同的 root!
```

**修復：** Bitcoin Core 在驗證時檢查 Merkle 樹中是否有重複的 hash，若發現則標記區塊為 mutated。

### 與 Ethereum 的差異

[Ethereum 的 Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/) 使用鍵值對結構，不會出現此問題。Bitcoin 的簡單二元 Merkle 樹在效率上有優勢，但在邊界條件的處理上需要額外注意。

## Witness Commitment（SegWit）

BIP-141（[SegWit](/bitcoin/data-structures/witness-data/)）引入了第二棵 Merkle 樹，基於 wtxid（包含 witness data 的交易 hash）：

### 結構

- **txid Merkle Tree**：傳統的交易 Merkle 樹，txid 不包含 witness data
- **wtxid Merkle Tree**：包含 witness data 的完整交易 hash

Witness commitment 存放在 coinbase 交易的 output 中：

$$\text{witness\_commitment} = \text{SHA-256d}(\text{witness\_root} \| \text{witness\_nonce})$$

其中 `witness_nonce` 是 coinbase 交易 witness field 中的 32 bytes（通常為全零）。

### Coinbase 的特殊處理

在 wtxid Merkle 樹中，coinbase 交易的 wtxid 固定為 `0x0000...0000`（32 bytes 全零），因為 coinbase 的 witness 是由礦工自行設定的 nonce。

## SPV Merkle Proof

Merkle Root 最重要的應用是 SPV（Simplified Payment Verification）：

1. 輕節點從全節點請求特定交易的 Merkle proof
2. Proof 包含從葉子到根的路徑上所有 sibling hash
3. 輕節點用 proof 重建根，與 block header 中的 Merkle root 比對

Proof 大小：$\lceil \log_2 n \rceil \times 32$ bytes。對一個包含 2000 筆交易的區塊，proof 僅需 $11 \times 32 = 352$ bytes。

## 程式碼範例

### Python

```python
import hashlib

def sha256d(data: bytes) -> bytes:
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()

def compute_merkle_root(txids: list[bytes]) -> bytes:
    """計算 Bitcoin Merkle Root"""
    if len(txids) == 0:
        return b'\x00' * 32
    if len(txids) == 1:
        return txids[0]

    layer = list(txids)
    while len(layer) > 1:
        if len(layer) % 2 == 1:
            layer.append(layer[-1])  # 奇數時複製最後一個
        next_layer = []
        for i in range(0, len(layer), 2):
            parent = sha256d(layer[i] + layer[i + 1])
            next_layer.append(parent)
        layer = next_layer
    return layer[0]

def get_merkle_proof(txids: list[bytes], index: int) -> list[tuple]:
    """取得 Merkle proof（sibling + direction）"""
    proof = []
    layer = list(txids)
    idx = index

    while len(layer) > 1:
        if len(layer) % 2 == 1:
            layer.append(layer[-1])
        sibling_idx = idx ^ 1  # XOR 翻轉最低位
        direction = 'left' if idx % 2 == 1 else 'right'
        proof.append((layer[sibling_idx], direction))
        next_layer = []
        for i in range(0, len(layer), 2):
            next_layer.append(sha256d(layer[i] + layer[i + 1]))
        layer = next_layer
        idx //= 2
    return proof

def verify_merkle_proof(txid: bytes, proof: list[tuple], root: bytes) -> bool:
    current = txid
    for sibling, direction in proof:
        if direction == 'right':
            current = sha256d(current + sibling)
        else:
            current = sha256d(sibling + current)
    return current == root

# 範例
txids = [sha256d(f"tx_{i}".encode()) for i in range(5)]
root = compute_merkle_root(txids)
print(f"Merkle root (5 txs): {root.hex()}")

proof = get_merkle_proof(txids, 2)
valid = verify_merkle_proof(txids[2], proof, root)
print(f"Proof for tx_2: {len(proof)} elements, valid: {valid}")
```

### JavaScript

```javascript
import { createHash } from 'crypto';

function sha256d(data) {
  const first = createHash('sha256').update(data).digest();
  return createHash('sha256').update(first).digest();
}

function computeMerkleRoot(txids) {
  if (txids.length === 0) return Buffer.alloc(32);
  if (txids.length === 1) return txids[0];

  let layer = [...txids];
  while (layer.length > 1) {
    if (layer.length % 2 === 1) layer.push(layer[layer.length - 1]);
    const nextLayer = [];
    for (let i = 0; i < layer.length; i += 2) {
      nextLayer.push(sha256d(Buffer.concat([layer[i], layer[i + 1]])));
    }
    layer = nextLayer;
  }
  return layer[0];
}

// 範例
const txids = Array.from({ length: 7 }, (_, i) =>
  sha256d(Buffer.from(`transaction_${i}`))
);

const root = computeMerkleRoot(txids);
console.log(`Merkle root (7 txs): ${root.toString('hex')}`);
console.log(`Tree height: ${Math.ceil(Math.log2(txids.length))}`);
console.log(`Proof size: ${Math.ceil(Math.log2(txids.length)) * 32} bytes`);
```

## 相關概念

- [Merkle Tree](/fundamentals/data-structures/merkle-tree/) - 通用 Merkle 樹理論
- [Block Structure](/bitcoin/data-structures/bitcoin-block-structure/) - Merkle root 在 block header 中的位置
- [SHA-256d](/bitcoin/cryptography/sha-256d/) - Merkle 樹使用的雜湊函數
- [Merkle Tree in Blocks](/bitcoin/data-structures/merkle-tree-in-blocks/) - txid vs wtxid Merkle 樹的比較
- [Witness Data](/bitcoin/data-structures/witness-data/) - Witness commitment 和 wtxid Merkle 樹
- [SPV](/bitcoin/network/spv-light-clients/) - 利用 Merkle proof 的輕節點驗證
- [Merkle Patricia Trie (ETH)](/ethereum/data-structures/merkle-patricia-trie/) - Ethereum 的替代 Merkle 結構
- [Bitcoin 雜湊函數](/bitcoin/cryptography/hash-functions-in-bitcoin/) - 完整的 Bitcoin 雜湊函數地圖
- [Transaction Malleability](/bitcoin/transactions/transaction-malleability/) - SegWit 引入 wtxid 的動機
