---
title: "Merkle Patricia Trie"
description: "MPT, Merkle Patricia Trie, Modified Merkle Patricia Trie, Patricia Trie"
tags: [ethereum, data-structure, trie, merkle-patricia-trie, mpt]
---

# Merkle Patricia Trie

## 概述

Merkle Patricia Trie（MPT）是 Ethereum 執行層的核心資料結構，結合了 [Merkle Tree](/fundamentals/data-structures/merkle-tree/) 的密碼學驗證能力和 Patricia Trie（radix tree）的路徑壓縮效率。Ethereum 的 [State Trie](/ethereum/data-structures/state-trie/)、[Storage Trie](/ethereum/data-structures/storage-trie/)、[Transaction Trie](/ethereum/data-structures/transaction-trie/)、[Receipt Trie](/ethereum/data-structures/receipt-trie/) 全部基於 MPT。

## 核心原理

### 四種節點類型

MPT 有四種節點，每個節點以 [RLP 編碼](/ethereum/data-structures/rlp-encoding/) 序列化後儲存：

#### 1. Empty Node
空節點，表示為空字串 `""` 或 null。

#### 2. Leaf Node
`[encodedPath, value]` — 二元素 RLP list

- `encodedPath`：hex-prefix 編碼的剩餘 key path
- `value`：該 key 對應的 value（如帳戶的 RLP 編碼）

#### 3. Extension Node
`[encodedPath, key]` — 二元素 RLP list

- `encodedPath`：hex-prefix 編碼的共享 path prefix
- `key`：指向下一個 branch node 的 hash（若序列化後 >= 32 bytes）或內聯節點

#### 4. Branch Node
`[v0, v1, ..., v15, value]` — 17 元素 RLP list

- `v0` 到 `v15`：對應 hex 字元 0-f 的 16 個 slot，每個可以是 hash、內聯節點或空
- `value`：若有 key 恰好在此處終止，存放該 value

### Hex-Prefix 編碼

MPT 的 key 以 nibble（4-bit，半 byte）序列表示。為了區分 leaf 和 extension，且處理奇偶長度，使用 hex-prefix encoding：

| Node type | Path 長度 | Prefix nibble |
|-----------|-----------|---------------|
| Extension | 偶數 | `0x00` |
| Extension | 奇數 | `0x1` + 第一個 nibble |
| Leaf | 偶數 | `0x20` |
| Leaf | 奇數 | `0x3` + 第一個 nibble |

範例：

```
Leaf, path [1,2,3,4,5] (奇數) → 0x35 0x12 0x34 0x50  不對
                                → prefix = 0x3, 合併: [3,1,2,3,4,5]
                                → bytes: 0x31 0x23 0x45

Leaf, path [0,1,2,3,4,5] (偶數) → prefix = [2,0], 合併: [2,0,0,1,2,3,4,5]
                                  → bytes: 0x20 0x01 0x23 0x45

Extension, path [1,2,3] (奇數) → prefix = 0x1, 合併: [1,1,2,3]
                                → bytes: 0x11 0x23
```

### 節點儲存

- 節點 RLP 編碼後若 >= 32 bytes，存入 database，以 [Keccak-256](/ethereum/cryptography/keccak-256/) hash 作為 key
- 節點 RLP 編碼後若 < 32 bytes，直接內聯於父節點中
- Trie root 永遠是根節點的 keccak256 hash

### 查詢路徑範例

查詢 key `0xABCD` 的過程：

```
1. 從 root hash 取得根節點
2. key nibbles: [A, B, C, D]
3. 假設根節點是 Extension [0x1A, branch_hash]
   → 共享 prefix [A]，消耗 1 nibble，剩餘 [B, C, D]
4. 取得 branch node，走 slot B
5. 假設 slot B 指向 Leaf [0x20CD, value]
   → Leaf prefix 0x20 表示偶數 path，解碼得 [C, D]
   → 匹配剩餘 [C, D]，找到 value
```

### 更新操作

插入、刪除都可能觸發節點結構變化：

- **插入到 Leaf**：若新 key 共享前綴，需拆分為 Extension + Branch + 兩個 Leaf
- **刪除使 Branch 只剩一子**：Branch 可合併回 Extension 或 Leaf
- 每次操作影響路徑上所有節點的 hash（Merkle 性質）

## 在 Ethereum 中的應用

Ethereum 的四棵 Trie 全部基於 MPT：

| Trie | Key | Value | Root 存於 |
|------|-----|-------|-----------|
| [State Trie](/ethereum/data-structures/state-trie/) | `keccak256(address)` | RLP([nonce, balance, storageRoot, codeHash]) | Block header `stateRoot` |
| [Storage Trie](/ethereum/data-structures/storage-trie/) | `keccak256(slot)` | RLP(value) | Account `storageRoot` |
| [Transaction Trie](/ethereum/data-structures/transaction-trie/) | RLP(tx_index) | RLP(transaction) | Block header `transactionsRoot` |
| [Receipt Trie](/ethereum/data-structures/receipt-trie/) | RLP(tx_index) | RLP(receipt) | Block header `receiptsRoot` |

MPT 的 Merkle 性質讓 light client 可以只用 block header 的 root hash，搭配 Merkle proof 驗證任何狀態或交易。

### 未來演進

[Verkle Trees](/ethereum/advanced/verkle-trees/) 計畫取代 MPT，原因是 MPT 的 proof size 過大（每個分支 16-ary 導致 proof 含大量 sibling hash），Verkle Tree 用 vector commitment 可將 proof 壓縮至數百 bytes。

## 程式碼範例

### JavaScript（@ethereumjs/trie）

```javascript
import { Trie } from '@ethereumjs/trie';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@ethereumjs/util';

async function main() {
  const trie = new Trie();

  // 插入資料
  await trie.put(utf8ToBytes('doe'), utf8ToBytes('reindeer'));
  await trie.put(utf8ToBytes('dog'), utf8ToBytes('puppy'));
  await trie.put(utf8ToBytes('dogglesworth'), utf8ToBytes('cat'));

  // 取得 root
  console.log('root:', bytesToHex(trie.root()));

  // 查詢
  const val = await trie.get(utf8ToBytes('dog'));
  console.log('dog:', new TextDecoder().decode(val));

  // 生成 Merkle proof
  const proof = await trie.createProof(utf8ToBytes('dog'));
  console.log('proof nodes:', proof.length);

  // 驗證 proof
  const verified = await trie.verifyProof(
    trie.root(),
    utf8ToBytes('dog'),
    proof
  );
  console.log('verified:', new TextDecoder().decode(verified));

  // 刪除
  await trie.del(utf8ToBytes('doe'));
  console.log('root after delete:', bytesToHex(trie.root()));
}

main();
```

### Python（py-trie）

```python
from trie import HexaryTrie
from eth_utils import keccak

# 建立 trie
db = {}
trie = HexaryTrie(db)

# 插入
trie[b'doe'] = b'reindeer'
trie[b'dog'] = b'puppy'
trie[b'dogglesworth'] = b'cat'

print(f"root: 0x{trie.root_hash.hex()}")

# 查詢
print(f"dog: {trie[b'dog']}")

# 已知 root 做驗證（snapshot）
root_hash = trie.root_hash
snapshot = HexaryTrie(db, root_hash)
print(f"verified dog: {snapshot[b'dog']}")

# Hex-prefix encoding 手動實作
def hex_prefix_encode(nibbles: list[int], is_leaf: bool) -> bytes:
    flag = 2 if is_leaf else 0
    if len(nibbles) % 2 == 1:
        # 奇數: flag + 1, 前綴一個 nibble
        encoded = [flag + 1] + nibbles
    else:
        # 偶數: flag, 補一個 0
        encoded = [flag, 0] + nibbles
    # nibbles to bytes
    result = []
    for i in range(0, len(encoded), 2):
        result.append(encoded[i] * 16 + encoded[i + 1])
    return bytes(result)

# 測試
print(hex_prefix_encode([1, 2, 3, 4, 5], True).hex())   # 352345 (...不對)
# [3,1,2,3,4,5] → 0x31 0x23 0x45
print(hex_prefix_encode([0, 1, 2, 3, 4, 5], True).hex()) # 200123 45
```

## 相關概念

- [Merkle Tree](/fundamentals/data-structures/merkle-tree/) - MPT 的基礎密碼學結構
- [RLP 編碼](/ethereum/data-structures/rlp-encoding/) - MPT 節點的序列化格式
- [Keccak-256](/ethereum/cryptography/keccak-256/) - 節點 hash 和 key 的 hash 函數
- [State Trie](/ethereum/data-structures/state-trie/) - 全域帳戶狀態 Trie
- [Storage Trie](/ethereum/data-structures/storage-trie/) - 合約內部儲存 Trie
- [Transaction Trie](/ethereum/data-structures/transaction-trie/) - 交易 Trie
- [Receipt Trie](/ethereum/data-structures/receipt-trie/) - 收據 Trie
- [Verkle Trees](/ethereum/advanced/verkle-trees/) - 未來取代 MPT 的結構
- [區塊 Header](/ethereum/consensus/block-header/) - 包含四棵 Trie 的 root hash
