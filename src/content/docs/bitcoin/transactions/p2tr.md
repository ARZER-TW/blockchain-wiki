---
title: "P2TR"
description: "Pay-to-Taproot, BIP-341, Taproot, Schnorr, witness v1, Bech32m, key path, script path"
tags: [bitcoin, transactions, p2tr, taproot, bip-341, schnorr, bech32m, mast]
---

# P2TR

## 概述

P2TR（Pay-to-Taproot）是 BIP-341 定義的 SegWit v1 輸出類型，於 2021 年 11 月（區塊高度 709,632）啟用。它結合了 [Schnorr 簽名](/bitcoin/cryptography/schnorr-signatures/) 和 Merkelized Alternative Script Trees（MAST），提供兩種花費路徑：key path（單一 Schnorr 簽名，最高效）和 script path（揭露 MAST 中的特定腳本分支）。關鍵隱私優勢在於所有花費在鏈上看起來相同，外部觀察者無法區分簡單支付和複雜合約。P2TR 使用 Bech32m 地址（`bc1p` 開頭），由 BIP-350 定義。

## 核心原理

### scriptPubKey

```
OP_1 <32-byte-x-only-pubkey>
```

- `OP_1`：witness version 1
- x-only pubkey：32 bytes，只有 x 座標（BIP-340 規範）

### 輸出金鑰（Output Key）

Taproot 的輸出金鑰 $Q$ 是內部金鑰 $P$ 經過 script tree 承諾的 tweaked 版本：

$$Q = P + \text{hash}_{\text{TapTweak}}(P \| m) \cdot G$$

其中：
- $P$：內部金鑰（internal key）
- $m$：Merkle root of the script tree（若無 script tree 則省略）
- $G$：[secp256k1](/fundamentals/cryptography/secp256k1/) 生成點
- $\text{hash}_{\text{TapTweak}}$：tagged hash，$\text{SHA-256}(\text{SHA-256}(\text{"TapTweak"}) \| \text{SHA-256}(\text{"TapTweak"}) \| \text{data})$

詳見 [Taproot Key Tweaking](/bitcoin/cryptography/taproot-key-tweaking/)。

### Key Path Spend

最常見、最高效的花費方式。只需提供一個 Schnorr 簽名：

**Witness**：
```
<schnorr_signature>
```

簽名為 64 bytes（無 DER 編碼開銷）。若使用非預設 sighash type，則為 65 bytes。

驗證過程：
1. 從 scriptPubKey 取出 $Q$
2. 使用 BIP-340 [Schnorr](/bitcoin/cryptography/schnorr-signatures/) 驗證 $\text{verify}(Q, \text{msg}, \text{sig})$

因為 $Q = P + tG$，簽名者需要知道 $p + t$（其中 $p$ 是 $P$ 的私鑰，$t$ 是 tweak），才能對 $Q$ 簽名。

### Script Path Spend

當需要使用 MAST 中的特定腳本條件時：

**Witness**：
```
<script_input_data...> <script> <control_block>
```

**Control Block 結構**：
```
[leaf_version | parity_bit] [internal_key (32 bytes)] [merkle_path...]
```

- `leaf_version | parity_bit`：1 byte（leaf version 0xc0，最低 bit 為 $Q$ 的 y 座標奇偶性）
- `internal_key`：32 bytes（內部金鑰 $P$）
- `merkle_path`：每個 sibling hash 32 bytes

驗證過程：
1. 計算 tapleaf hash：$\text{hash}_{\text{TapLeaf}}(\text{leafVersion} \| \text{compactSize}(\text{script}) \| \text{script})$
2. 沿 Merkle path 計算 root $m$
3. 計算 tweaked key：$Q' = P + \text{hash}_{\text{TapTweak}}(P \| m) \cdot G$
4. 驗證 $Q' == Q$
5. 執行 script（在 [Tapscript](/bitcoin/advanced/tapscript/) 環境中）

### MAST（Merkelized Alternative Script Tree）

MAST 讓多個花費條件組織成 Merkle tree。花費時只揭露使用的那個分支及其 Merkle proof，未使用的條件保持隱藏：

```
        root
       /    \
     h01     h23
    /  \    /  \
  leaf0 leaf1 leaf2 leaf3
```

每個 leaf 是一個 [Tapscript](/bitcoin/advanced/tapscript/)。揭露 leaf2 時只需提供 leaf2、leaf3 的 hash、h01 的 hash，共 2 個 sibling hash（64 bytes）。

花費複雜度只與樹的深度 $d$ 相關：

$$\text{proof size} = 32d \text{ bytes}$$

樹的最大深度為 128 層。

### Bech32m（BIP-350）

SegWit v1+ 使用 Bech32m（修正版 Bech32），修復了原始 Bech32 在 witness version 非零時的一個 checksum 弱點。

- SegWit v0（P2WPKH/P2WSH）：Bech32（`bc1q`）
- SegWit v1+（P2TR）：Bech32m（`bc1p`）

`bc1p` 中的 `p` 代表 witness version 1。

### 隱私優勢

P2TR 的核心隱私創新：

| 花費方式 | 鏈上可見 | 外部觀察 |
|----------|---------|---------|
| Key path（單簽） | 64B Schnorr sig | 看起來一樣 |
| Key path（MuSig2 多簽） | 64B Schnorr sig | 看起來一樣 |
| Script path（時間鎖） | script + proof | 與其他 script path 類似 |

單簽、多簽、甚至複雜合約的 key path 花費在鏈上完全相同，無法區分。這顯著提升了整體網路的 anonymity set。

## 程式碼範例

```javascript
const bitcoin = require('bitcoinjs-lib');
const { ECPairFactory } = require('ecpair');
const ecc = require('tiny-secp256k1');
const ECPair = ECPairFactory(ecc);

bitcoin.initEccLib(ecc);

// === Key Path P2TR ===
const internalKey = ECPair.makeRandom();
const xOnlyPubkey = internalKey.publicKey.subarray(1, 33); // x-only (32 bytes)

const p2tr = bitcoin.payments.p2tr({
  internalPubkey: xOnlyPubkey,
  network: bitcoin.networks.bitcoin,
});
// p2tr.address: bc1p...

// 花費 key path
const psbt = new bitcoin.Psbt();
psbt.addInput({
  hash: 'prev_txid...',
  index: 0,
  witnessUtxo: {
    script: p2tr.output, // OP_1 <32-byte-x-only-pubkey>
    value: 100000,
  },
  tapInternalKey: xOnlyPubkey,
});
psbt.addOutput({
  address: 'bc1p_recipient...',
  value: 90000,
});
psbt.signInput(0, internalKey);
psbt.finalizeAllInputs();

// === Script Path P2TR (with MAST) ===
// 定義兩個腳本分支
const leafScript1 = bitcoin.script.compile([
  xOnlyPubkey,
  bitcoin.opcodes.OP_CHECKSIG,
]);
const leafScript2 = bitcoin.script.compile([
  bitcoin.opcodes.OP_10, // 10 blocks
  bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
  bitcoin.opcodes.OP_DROP,
  xOnlyPubkey,
  bitcoin.opcodes.OP_CHECKSIG,
]);

// 構建 script tree
const scriptTree = [
  { output: leafScript1 },
  { output: leafScript2 },
];

const p2trScript = bitcoin.payments.p2tr({
  internalPubkey: xOnlyPubkey,
  scriptTree,
  network: bitcoin.networks.bitcoin,
});
// 同一個 bc1p 地址，但可以透過 key path 或任一 script 花費
```

```python
import hashlib

def tagged_hash(tag: str, data: bytes) -> bytes:
    """BIP-340 tagged hash"""
    tag_hash = hashlib.sha256(tag.encode()).digest()
    return hashlib.sha256(tag_hash + tag_hash + data).digest()

def compute_taptweak(internal_key: bytes, merkle_root: bytes = b'') -> bytes:
    """計算 taproot tweak"""
    if merkle_root:
        return tagged_hash("TapTweak", internal_key + merkle_root)
    return tagged_hash("TapTweak", internal_key)

def compute_tapleaf_hash(script: bytes, leaf_version: int = 0xc0) -> bytes:
    """計算 tapleaf hash"""
    # compact_size encoding of script length
    if len(script) < 0xfd:
        size_bytes = bytes([len(script)])
    elif len(script) <= 0xffff:
        size_bytes = b'\xfd' + len(script).to_bytes(2, 'little')
    else:
        size_bytes = b'\xfe' + len(script).to_bytes(4, 'little')

    return tagged_hash("TapLeaf", bytes([leaf_version]) + size_bytes + script)

def compute_tapbranch_hash(left: bytes, right: bytes) -> bytes:
    """計算 tapbranch hash（排序後合併）"""
    if left > right:
        left, right = right, left
    return tagged_hash("TapBranch", left + right)

# 範例：構建包含兩個 leaf 的 MAST
leaf1_script = bytes.fromhex('20' + 'aa' * 32 + 'ac')  # <key> OP_CHECKSIG
leaf2_script = bytes.fromhex('5a75' + '20' + 'bb' * 32 + 'ac')  # timelock

leaf1_hash = compute_tapleaf_hash(leaf1_script)
leaf2_hash = compute_tapleaf_hash(leaf2_script)

merkle_root = compute_tapbranch_hash(leaf1_hash, leaf2_hash)
print(f"Merkle root: {merkle_root.hex()}")

internal_key = bytes.fromhex('aa' * 32)  # x-only pubkey
tweak = compute_taptweak(internal_key, merkle_root)
print(f"Tweak: {tweak.hex()}")
```

## 相關概念

- [Taproot Key Tweaking](/bitcoin/cryptography/taproot-key-tweaking/) - tweak 機制的密碼學細節
- [Schnorr Signatures](/bitcoin/cryptography/schnorr-signatures/) - P2TR 使用的簽名方案
- [Tapscript](/bitcoin/advanced/tapscript/) - script path 中執行的腳本語言
- [P2WPKH/P2WSH](/bitcoin/transactions/p2wpkh-p2wsh/) - SegWit v0 前身
- [Merkle Tree](/fundamentals/data-structures/merkle-tree/) - MAST 使用的資料結構
- [secp256k1](/fundamentals/cryptography/secp256k1/) - 底層橢圓曲線
- [Transaction Signing](/bitcoin/transactions/transaction-signing-btc/) - BIP-341 簽名流程
- [P2PKH](/bitcoin/transactions/p2pkh/) - 最早的支付類型，對比參考
- [Multisig/MuSig](/bitcoin/advanced/multisig-musig/) - MuSig2 在 key path 中實現多簽
- [Elliptic Curve Cryptography](/fundamentals/cryptography/elliptic-curve-cryptography/) - 橢圓曲線點運算基礎
