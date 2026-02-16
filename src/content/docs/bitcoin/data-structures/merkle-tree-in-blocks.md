---
title: "區塊中的 Merkle Tree"
description: "Bitcoin block Merkle trees: txid-based transaction tree, wtxid-based witness tree (BIP-141), coinbase wtxid handling, comparison with Ethereum MPT"
tags: [bitcoin, data-structure, merkle-tree, txid, wtxid, segwit, bip-141]
---

# 區塊中的 Merkle Tree

## 概述

Bitcoin 區塊中存在兩棵 Merkle Tree：一棵基於 txid（不含 witness data 的交易 hash），另一棵基於 wtxid（含 witness data 的完整交易 hash）。txid Merkle tree 的根存在 block header 中，而 wtxid Merkle tree 的根透過 witness commitment 存在 coinbase 交易的 output 裡。這種雙樹結構是 SegWit (BIP-141) 的核心設計。

## Transaction Merkle Tree（txid 基）

### 結構

這是 Bitcoin 自始至今使用的 Merkle 樹，其根（[Merkle Root](/bitcoin/cryptography/merkle-root/)）存在 80-byte block header 的 `merkle_root` 欄位。

- **葉子**：每筆交易的 txid = [SHA-256d](/bitcoin/cryptography/sha-256d/)(serialized\_tx\_without\_witness)
- **合併**：$\text{parent} = \text{SHA-256d}(H_{\text{left}} \| H_{\text{right}})$
- **奇數葉子**：複製最後一個（見 CVE-2012-2459 的討論）

### txid 的計算

txid 基於交易的 legacy 序列化（不含 SegWit marker、flag、witness fields）：

$$\text{txid} = \text{SHA-256d}(\text{version} \| \text{inputs} \| \text{outputs} \| \text{locktime})$$

這確保了 txid 不受 witness data 修改的影響，解決了 [transaction malleability](/bitcoin/transactions/transaction-malleability/) 問題。

## Witness Merkle Tree（wtxid 基，BIP-141）

### 結構

SegWit 引入了基於 wtxid 的第二棵 Merkle 樹：

- **葉子**：每筆交易的 wtxid = SHA-256d(完整 SegWit 序列化)
- **例外**：coinbase 交易的 wtxid 固定為全零 `0x0000...0000`（32 bytes）
- **合併規則**：與 txid Merkle 樹相同

### wtxid 的計算

wtxid 基於完整的 SegWit 序列化：

$$\text{wtxid} = \text{SHA-256d}(\text{version} \| \text{marker} \| \text{flag} \| \text{inputs} \| \text{outputs} \| \text{witness} \| \text{locktime})$$

對於 legacy（非 SegWit）交易，$\text{wtxid} = \text{txid}$（因為沒有 witness data）。

### Coinbase wtxid 全零的原因

Coinbase 交易的 witness 欄位用於存放 witness nonce（BIP-141 規定為 32 bytes）。由於 coinbase 的 witness 是礦工自行設定的，不受其他交易的 witness 約束，因此在 witness Merkle 樹中使用全零作為 placeholder。

### Witness Commitment

Witness Merkle root 透過以下方式承諾在區塊中：

$$\text{witness\_commitment} = \text{SHA-256d}(\text{witness\_merkle\_root} \| \text{witness\_nonce})$$

存放位置：coinbase 交易的某個 output，其 scriptPubKey 為：

```
OP_RETURN 0xaa21a9ed <32-byte witness_commitment>
```

前綴 `0xaa21a9ed` 是 witness commitment 的 magic bytes。

## 雙樹架構的設計動機

### 向後相容性

- 舊節點只看 txid Merkle 樹（在 block header 中），不需要理解 witness data
- 新節點驗證兩棵樹，確保 witness data 的完整性
- 這使得 SegWit 可以作為軟分叉部署

### Transaction Malleability 修復

在 SegWit 之前，witness data（簽名）是 txid 的一部分。第三方可以修改簽名的編碼（不影響有效性但改變了 bytes），從而改變 txid。這破壞了依賴 txid 的交易鏈（如 Lightning Network 的 funding transaction）。

SegWit 將簽名移出 txid 的計算範圍，徹底解決了此問題。

### Witness Discount 與經濟激勵

Witness data 在 [weight 計算](/bitcoin/data-structures/bitcoin-block-structure/) 中享有折扣（1 WU vs 4 WU），鼓勵使用 witness 空間（簽名、Tapscript）而非非 witness 空間（UTXO 創建）。

## 與 Ethereum Merkle Patricia Trie 的比較

| 特性 | Bitcoin Merkle Tree | [Ethereum MPT](/ethereum/data-structures/merkle-patricia-trie/) |
|------|-------------------|------|
| 結構 | 二元 Merkle 樹 | 16-ary Patricia Trie |
| 雜湊函數 | SHA-256d | Keccak-256 |
| 葉子排序 | 按交易在區塊中的順序 | 按 key（RLP 編碼的索引） |
| 用途 | 僅 transaction inclusion proof | State、Transaction、Receipt 各一棵 |
| Proof 大小 | $O(\log_2 n)$ hashes | $O(\text{key\_length})$ nodes |
| 狀態追蹤 | 無（UTXO 另外管理） | State root 在 header 中 |
| 更新效率 | 每區塊完全重建 | 增量更新（共享前綴） |

Bitcoin 的 Merkle 樹設計更簡單，效能更好，但功能也更受限。Ethereum 的 MPT 支援狀態查詢和 proof，代價是更高的複雜度和儲存需求。

## 程式碼範例

### Python

```python
import hashlib

def sha256d(data: bytes) -> bytes:
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()

def build_merkle_tree(hashes: list[bytes]) -> list[list[bytes]]:
    """建構完整的 Merkle 樹（返回所有層）"""
    if not hashes:
        return [[b'\x00' * 32]]

    layers = [list(hashes)]
    layer = list(hashes)

    while len(layer) > 1:
        if len(layer) % 2 == 1:
            layer.append(layer[-1])
        next_layer = []
        for i in range(0, len(layer), 2):
            next_layer.append(sha256d(layer[i] + layer[i + 1]))
        layers.append(next_layer)
        layer = next_layer

    return layers

def simulate_block_merkle_trees(tx_count: int):
    """模擬區塊中的雙 Merkle 樹"""
    # 模擬 txids 和 wtxids
    txids = [sha256d(f"tx_{i}_legacy".encode()) for i in range(tx_count)]
    wtxids = [sha256d(f"tx_{i}_witness".encode()) for i in range(tx_count)]

    # Coinbase: wtxid = 0x00...00
    wtxids[0] = b'\x00' * 32

    # 建構 txid Merkle 樹
    txid_tree = build_merkle_tree(txids)
    txid_root = txid_tree[-1][0]

    # 建構 wtxid Merkle 樹
    wtxid_tree = build_merkle_tree(wtxids)
    wtxid_root = wtxid_tree[-1][0]

    # Witness commitment
    witness_nonce = b'\x00' * 32
    witness_commitment = sha256d(wtxid_root + witness_nonce)

    print(f"Block with {tx_count} transactions:")
    print(f"  txid Merkle root:     {txid_root.hex()}")
    print(f"  wtxid Merkle root:    {wtxid_root.hex()}")
    print(f"  Witness commitment:   {witness_commitment.hex()}")
    print(f"  Tree height:          {len(txid_tree) - 1}")
    print(f"  Proof size per tx:    {(len(txid_tree) - 1) * 32} bytes")

simulate_block_merkle_trees(100)
simulate_block_merkle_trees(2500)
```

### JavaScript

```javascript
import { createHash } from 'crypto';

function sha256d(data) {
  const first = createHash('sha256').update(data).digest();
  return createHash('sha256').update(first).digest();
}

function buildMerkleRoot(hashes) {
  if (hashes.length === 0) return Buffer.alloc(32);
  let layer = [...hashes];
  while (layer.length > 1) {
    if (layer.length % 2 === 1) layer.push(layer[layer.length - 1]);
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      next.push(sha256d(Buffer.concat([layer[i], layer[i + 1]])));
    }
    layer = next;
  }
  return layer[0];
}

// txid vs wtxid 示範
const txCount = 50;
const txids = Array.from({ length: txCount }, (_, i) =>
  sha256d(Buffer.from(`tx_${i}_no_witness`))
);
const wtxids = Array.from({ length: txCount }, (_, i) =>
  i === 0 ? Buffer.alloc(32) : sha256d(Buffer.from(`tx_${i}_with_witness`))
);

const txidRoot = buildMerkleRoot(txids);
const wtxidRoot = buildMerkleRoot(wtxids);

console.log(`txid Merkle root:  ${txidRoot.toString('hex')}`);
console.log(`wtxid Merkle root: ${wtxidRoot.toString('hex')}`);

// Witness commitment
const witnessNonce = Buffer.alloc(32);
const commitment = sha256d(Buffer.concat([wtxidRoot, witnessNonce]));
// OP_RETURN script: 6a (OP_RETURN) + 24 (36 bytes) + aa21a9ed + commitment
const commitmentScript = Buffer.concat([
  Buffer.from('6a24aa21a9ed', 'hex'),
  commitment,
]);
console.log(`Witness commitment script: ${commitmentScript.toString('hex')}`);
```

## 相關概念

- [Merkle Root](/bitcoin/cryptography/merkle-root/) - Merkle 根的計算與 SPV proof
- [Merkle Tree](/fundamentals/data-structures/merkle-tree/) - 通用 Merkle 樹理論
- [Witness Data](/bitcoin/data-structures/witness-data/) - Witness 結構與 wtxid 定義
- [Bitcoin Block Structure](/bitcoin/data-structures/bitcoin-block-structure/) - Block header 中的 merkle_root 欄位
- [SHA-256d](/bitcoin/cryptography/sha-256d/) - Merkle 樹使用的雜湊函數
- [SPV](/bitcoin/network/spv-light-clients/) - 使用 Merkle proof 的輕節點驗證
- [SegWit Serialization](/bitcoin/transactions/segwit-serialization/) - txid vs wtxid 的序列化差異
- [Transaction Malleability](/bitcoin/transactions/transaction-malleability/) - 雙樹設計的動機
- [Merkle Patricia Trie (ETH)](/ethereum/data-structures/merkle-patricia-trie/) - Ethereum 的替代方案
- [Serialization Formats](/bitcoin/data-structures/serialization-formats/) - 交易的 legacy vs SegWit 序列化
