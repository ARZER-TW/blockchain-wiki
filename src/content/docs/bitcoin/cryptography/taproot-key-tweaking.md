---
title: "Taproot Key Tweaking (BIP-341)"
description: "Taproot key tweaking: internal key, script tree Merkle root, tagged hashes, key path vs script path spend, MAST privacy"
tags: [bitcoin, cryptography, taproot, bip-341, key-tweaking, mast, tagged-hash]
---

# Taproot Key Tweaking (BIP-341)

## 概述

Taproot Key Tweaking 是 BIP-341 定義的核心機制，允許一個公鑰同時承諾（commit）一棵腳本樹（script tree），同時保留直接用金鑰花費（key path spend）的能力。當使用 key path 花費時，交易在鏈上看起來與普通的單簽名交易完全相同，極大地提升了隱私性。

tweaking 的核心公式：

$$Q = P + H(\text{TaggedHash}(P \| c)) \cdot G$$

其中 $P$ 是 internal key，$c$ 是腳本樹的 Merkle root，$Q$ 是最終出現在鏈上的 output key。

## 核心原理

### Internal Key 與 Tweaked Key

- **Internal key $P$**：交易參與者的（可能是聚合的）公鑰，不直接出現在鏈上
- **Script tree root $c$**：所有替代花費條件的 MAST Merkle root
- **Tweaked key $Q$**：出現在鏈上的 output key，同時承諾 $P$ 和 $c$

tweaking 過程：

$$t = \text{TaggedHash}(\text{"TapTweak"}, P_x \| c)$$
$$Q = P + tG$$

若不需要腳本路徑（script path），可以使用「無腳本」的 tweak：

$$t = \text{TaggedHash}(\text{"TapTweak"}, P_x)$$

### Tagged Hash

BIP-340/341 引入了 tagged hash 來實現域分離，防止不同上下文的雜湊碰撞：

$$\text{TaggedHash}(\text{tag}, \text{data}) = \text{SHA-256}(\text{SHA-256}(\text{tag}) \| \text{SHA-256}(\text{tag}) \| \text{data})$$

Taproot 使用多個不同的 tag：
- `TapTweak` — key tweaking
- `TapLeaf` — 腳本葉子的雜湊
- `TapBranch` — 樹的內部節點
- `TapSighash` — 簽名的訊息雜湊

### Tweaked 私鑰

若已知 internal key 的私鑰 $d$（$P = dG$），tweaked 私鑰為：

$$d' = d + t \pmod{n}$$

驗證：$d'G = (d + t)G = dG + tG = P + tG = Q$

這意味著知道 $d$ 和 $t$ 就能直接用 $Q$ 進行 [Schnorr 簽名](/bitcoin/cryptography/schnorr-signatures/)。

## Key Path Spend vs Script Path Spend

### Key Path Spend（金鑰路徑）

最常見且最隱私的花費方式：

1. 用 tweaked 私鑰 $d'$ 直接對交易進行 Schnorr 簽名
2. 只需提供簽名（64 bytes）
3. 鏈上完全看不到是否有腳本樹的存在
4. 與普通的單簽名交易在鏈上不可區分

### Script Path Spend（腳本路徑）

當無法使用 key path 時（例如簽名者不合作），可以揭示腳本樹中的某個葉子：

1. 揭示 internal key $P$
2. 揭示要執行的腳本（leaf script）
3. 提供從該葉子到 Merkle root 的 inclusion proof
4. 執行腳本本身

驗證者重建 Merkle root $c$，然後驗證 $Q = P + H(\text{"TapTweak"}, P_x \| c) \cdot G$。

## MAST（Merkelized Alternative Script Trees）

Taproot 的腳本樹是一棵二元 [Merkle Tree](/fundamentals/data-structures/merkle-tree/)，每個葉子包含一個替代花費條件：

```
         root
        /    \
     H(AB)  H(CD)
    /    \   /    \
  leaf_A leaf_B leaf_C leaf_D
```

### 葉子雜湊

$$\text{leaf\_hash} = \text{TaggedHash}(\text{"TapLeaf"}, \text{leaf\_version} \| \text{compact\_size}(\text{script}) \| \text{script})$$

### 分支雜湊

$$\text{branch\_hash} = \text{TaggedHash}(\text{"TapBranch"}, \min(h_l, h_r) \| \max(h_l, h_r))$$

注意：分支雜湊的兩個子節點按字典序排序（較小的在前），這確保了同一棵樹的 Merkle root 是唯一的。

### 隱私優勢

- **Key path**：完全隱藏腳本樹的存在，所有 Taproot 花費在鏈上看起來一樣
- **Script path**：只揭示被執行的那個腳本，其他替代條件保持隱藏
- 對比 P2SH：所有條件（包括未使用的分支）在花費時全部暴露

### 樹的最佳化

由於不同腳本的使用頻率不同，應將高頻使用的腳本放在較淺的位置（需要更短的 Merkle proof），低頻的放在較深的位置。這類似 Huffman 編碼的思想。

## 程式碼範例

### Python

```python
import hashlib

def tagged_hash(tag: str, data: bytes) -> bytes:
    tag_hash = hashlib.sha256(tag.encode()).digest()
    return hashlib.sha256(tag_hash + tag_hash + data).digest()

def tap_leaf_hash(script: bytes, leaf_version: int = 0xc0) -> bytes:
    """計算 Taproot 葉子雜湊"""
    # leaf_version (1 byte) || compact_size(script) || script
    script_len = len(script).to_bytes(1, 'little') if len(script) < 0xfd else b''
    return tagged_hash("TapLeaf", bytes([leaf_version]) + script_len + script)

def tap_branch_hash(left: bytes, right: bytes) -> bytes:
    """計算 Taproot 分支雜湊（排序子節點）"""
    if left > right:
        left, right = right, left
    return tagged_hash("TapBranch", left + right)

def tap_tweak_hash(pubkey_x: bytes, merkle_root: bytes = b'') -> bytes:
    """計算 tweak 值"""
    if merkle_root:
        return tagged_hash("TapTweak", pubkey_x + merkle_root)
    return tagged_hash("TapTweak", pubkey_x)

# 範例：建構一棵有 3 個葉子的腳本樹
# Script A: OP_DUP OP_HASH160 <hash> OP_EQUALVERIFY OP_CHECKSIG
script_a = bytes.fromhex("76a91489abcdefabbaabbaabbaabbaabbaabbaabbaabba88ac")
# Script B: <delay> OP_CHECKLOCKTIMEVERIFY OP_DROP <pubkey> OP_CHECKSIG
script_b = bytes.fromhex("0400e1f505b17521020000000000000000000000000000000000000000000000000000000000000001ac")
# Script C: <2> <pk1> <pk2> <pk3> <3> OP_CHECKMULTISIG
script_c = bytes.fromhex("524104" + "aa" * 32 + "4104" + "bb" * 32 + "4104" + "cc" * 32 + "53ae")

# 建構 Merkle Tree
leaf_a = tap_leaf_hash(script_a)
leaf_b = tap_leaf_hash(script_b)
leaf_c = tap_leaf_hash(script_c)

branch_ab = tap_branch_hash(leaf_a, leaf_b)
merkle_root = tap_branch_hash(branch_ab, leaf_c)

print(f"Leaf A:      {leaf_a.hex()}")
print(f"Leaf B:      {leaf_b.hex()}")
print(f"Leaf C:      {leaf_c.hex()}")
print(f"Branch AB:   {branch_ab.hex()}")
print(f"Merkle root: {merkle_root.hex()}")

# 模擬 key tweaking
internal_key_x = bytes.fromhex("0000" * 16)  # placeholder
tweak = tap_tweak_hash(internal_key_x, merkle_root)
print(f"Tweak value: {tweak.hex()}")

# Script path spend 的 Merkle proof（花費 Script A）
# 需要提供: leaf_b（sibling）和 leaf_c（上層 sibling）
proof_for_a = [leaf_b, leaf_c]
print(f"Merkle proof for Script A: {len(proof_for_a)} elements")
```

### JavaScript

```javascript
import { createHash } from 'crypto';

function taggedHash(tag, data) {
  const tagHash = createHash('sha256').update(tag).digest();
  return createHash('sha256')
    .update(Buffer.concat([tagHash, tagHash, data]))
    .digest();
}

function tapLeafHash(script, leafVersion = 0xc0) {
  const scriptLen = Buffer.from([script.length]);
  return taggedHash('TapLeaf', Buffer.concat([
    Buffer.from([leafVersion]),
    scriptLen,
    script,
  ]));
}

function tapBranchHash(left, right) {
  if (Buffer.compare(left, right) > 0) {
    [left, right] = [right, left];
  }
  return taggedHash('TapBranch', Buffer.concat([left, right]));
}

// 建構範例腳本樹
const scriptA = Buffer.from('51', 'hex'); // OP_TRUE (簡化範例)
const scriptB = Buffer.from('00', 'hex'); // OP_FALSE
const scriptC = Buffer.from('7551', 'hex'); // OP_DROP OP_TRUE

const leafA = tapLeafHash(scriptA);
const leafB = tapLeafHash(scriptB);
const leafC = tapLeafHash(scriptC);

const branchAB = tapBranchHash(leafA, leafB);
const root = tapBranchHash(branchAB, leafC);

console.log(`Merkle root: ${root.toString('hex')}`);

// Key path 與 script path 的空間比較
console.log('Key path witness: ~64 bytes (just signature)');
console.log('Script path witness: signature + script + control block + proof');
```

## 相關概念

- [Schnorr Signatures](/bitcoin/cryptography/schnorr-signatures/) - Taproot key path spend 使用的簽名方案
- [Merkle Tree](/fundamentals/data-structures/merkle-tree/) - MAST 腳本樹的底層資料結構
- [P2TR](/bitcoin/transactions/p2tr/) - Taproot 的交易輸出格式
- [Tapscript](/bitcoin/advanced/tapscript/) - Taproot 腳本路徑中執行的腳本語言
- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - 腳本語言的基礎
- [MuSig](/bitcoin/advanced/multisig-musig/) - 與 key tweaking 結合的多簽聚合方案
- [SHA-256d](/bitcoin/cryptography/sha-256d/) - Taproot tagged hash 的基礎
- [Bitcoin 雜湊函數](/bitcoin/cryptography/hash-functions-in-bitcoin/) - Tagged hash 在整體雜湊架構中的位置
- [Sighash Types](/bitcoin/cryptography/sighash-types/) - BIP-341 sighash 的改動
- [secp256k1 in Bitcoin](/bitcoin/cryptography/secp256k1-in-bitcoin/) - x-only 公鑰的編碼約定
