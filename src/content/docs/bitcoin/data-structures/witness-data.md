---
title: "Witness Data"
description: "SegWit witness structure: witness discount, witness commitment in coinbase, wtxid vs txid, witness program versions"
tags: [bitcoin, data-structure, segwit, witness, bip-141, weight-discount, wtxid]
---

# Witness Data

## 概述

Witness data 是 SegWit (BIP-141) 引入的交易結構，將簽名和其他驗證資料從傳統的 scriptSig 移到獨立的 witness 欄位。這個設計解決了 [transaction malleability](/bitcoin/transactions/transaction-malleability/) 問題，同時引入了 weight discount（witness 資料只計算四分之一的 weight），為更複雜的腳本（如 Taproot/Tapscript）提供了經濟激勵。

## 核心結構

### SegWit 交易格式

SegWit 交易在 version 和 inputs 之間插入了 marker (`0x00`) 和 flag (`0x01`)，並在 outputs 和 locktime 之間插入 witness fields：

```
[version][marker][flag][inputs][outputs][witness][locktime]
  4B       1B     1B    var     var      var      4B
```

### Witness Field 結構

每個 input 有一個對應的 witness stack，結構為：

```
witness_count: compact_size
  item_1_length: compact_size
  item_1_data: bytes
  item_2_length: compact_size
  item_2_data: bytes
  ...
```

不同交易類型的 witness 內容：

| 類型 | Witness 內容 |
|------|-------------|
| P2WPKH | `[signature, pubkey]` |
| P2WSH | `[arg1, arg2, ..., witness_script]` |
| P2TR key path | `[schnorr_signature]`（可能附加 sighash byte） |
| P2TR script path | `[arg1, ..., script, control_block]` |
| Legacy (non-SegWit) | 空 witness `[]` |

## Witness Discount

### Weight 計算

SegWit 的核心經濟機制：witness 資料在 [weight 計算](/bitcoin/data-structures/bitcoin-block-structure/) 中享有 75% 的折扣：

$$\text{weight} = \text{non\_witness\_size} \times 4 + \text{witness\_size} \times 1$$

**為什麼要給折扣？**

1. **UTXO set 壓力**：非 witness 資料（特別是 outputs）會增加 UTXO set 大小，UTXO set 必須常駐記憶體
2. **Witness 可修剪**：已驗證的 witness 資料可以安全刪除（pruning），不影響節點的狀態驗證能力
3. **激勵 SegWit 採用**：讓 SegWit 交易比 legacy 交易更便宜

### 折扣效果範例

一個典型的 P2WPKH 交易：
- Non-witness 部分：約 113 bytes $\times$ 4 = 452 WU
- Witness 部分：約 107 bytes $\times$ 1 = 107 WU
- 總 weight：559 WU
- Virtual bytes：$\lceil 559 / 4 \rceil = 140$ vB

對比等效的 P2PKH（legacy）交易：
- 全部 226 bytes $\times$ 4 = 904 WU
- Virtual bytes：226 vB

SegWit 版本節省了約 **38%** 的手續費。

## wtxid vs txid

### txid

不含 witness data 的交易序列化的 [SHA-256d](/bitcoin/cryptography/sha-256d/)：

$$\text{txid} = \text{SHA-256d}(\text{version} \| \text{inputs} \| \text{outputs} \| \text{locktime})$$

- 不受 witness 修改影響
- 用於 UTXO 引用（outpoint）
- 用於 block header 的 [Merkle root](/bitcoin/cryptography/merkle-root/)

### wtxid

含 witness data 的完整序列化的 SHA-256d：

$$\text{wtxid} = \text{SHA-256d}(\text{version} \| \text{marker} \| \text{flag} \| \text{inputs} \| \text{outputs} \| \text{witness} \| \text{locktime})$$

- 用於 [witness Merkle tree](/bitcoin/data-structures/merkle-tree-in-blocks/)
- 對 legacy 交易，$\text{wtxid} = \text{txid}$
- Coinbase 的 wtxid 在 witness tree 中固定為全零

## Witness Commitment

### 在 Coinbase 中的位置

Witness commitment 存放在 coinbase 交易的一個 output 中，驗證公式：

$$\text{commitment} = \text{SHA-256d}(\text{witness\_merkle\_root} \| \text{witness\_nonce})$$

其中 witness\_nonce 是 coinbase 交易自身 witness 中的 32 bytes。

### scriptPubKey 格式

```
OP_RETURN <0xaa21a9ed> <32-byte commitment>
```

`0xaa21a9ed` 是 `SHA-256d(b"witness")[:4]` 的前 4 bytes，作為 magic bytes 識別 witness commitment。

### 驗證流程

1. 找到 coinbase 交易中最後一個包含 `0x6a24aa21a9ed` 前綴的 output
2. 建構所有交易的 wtxid Merkle tree（coinbase wtxid = 0x00...00）
3. 從 coinbase witness 取得 witness\_nonce
4. 計算 `SHA-256d(witness_root || nonce)`
5. 驗證計算結果等於 commitment 中的 32 bytes

## Witness Program Versions

SegWit 的 scriptPubKey 格式：`<version_byte> <witness_program>`

| Version | Byte | 長度 | 用途 |
|---------|------|------|------|
| v0 | 0x00 | 20 bytes | P2WPKH (HASH-160) |
| v0 | 0x00 | 32 bytes | P2WSH (SHA-256) |
| v1 | 0x51 (OP_1) | 32 bytes | P2TR (Taproot) |
| v2-v16 | 0x52-0x60 | 2-40 bytes | 未定義（未來升級） |

Version 2-16 目前是 anyone-can-spend（任何人都能花費），為未來的軟分叉預留。

## 程式碼範例

### Python

```python
import hashlib
import struct

def sha256d(data: bytes) -> bytes:
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()

def parse_witness(raw: bytes, offset: int) -> tuple[list[bytes], int]:
    """解析一個 input 的 witness stack"""
    count = raw[offset]
    offset += 1
    items = []
    for _ in range(count):
        length = raw[offset]
        offset += 1
        items.append(raw[offset:offset + length])
        offset += length
    return items, offset

def calculate_weight(tx_bytes: bytes) -> dict:
    """計算 SegWit 交易的 weight"""
    # 簡化：假設已知 witness 位置
    has_witness = len(tx_bytes) > 4 and tx_bytes[4] == 0x00

    if has_witness:
        # 計算不含 marker+flag+witness 的大小
        # （實際實作需要完整解析交易）
        total_size = len(tx_bytes)
        # base_size 需要移除 marker, flag, witness
        # 這裡用估算
        base_size = total_size * 60 // 100  # 粗略估計
        witness_size = total_size - base_size
    else:
        total_size = len(tx_bytes)
        base_size = total_size
        witness_size = 0

    weight = base_size * 4 + witness_size
    vbytes = (weight + 3) // 4

    return {
        'total_size': total_size,
        'base_size': base_size,
        'witness_size': witness_size,
        'weight': weight,
        'vbytes': vbytes,
    }

# Witness commitment 計算
def compute_witness_commitment(wtxids: list[bytes], nonce: bytes) -> bytes:
    """計算 witness commitment"""
    # coinbase wtxid = 0x00...00
    wtxids_with_coinbase = [b'\x00' * 32] + wtxids[1:]

    # 建構 Merkle root
    layer = list(wtxids_with_coinbase)
    while len(layer) > 1:
        if len(layer) % 2 == 1:
            layer.append(layer[-1])
        next_layer = []
        for i in range(0, len(layer), 2):
            next_layer.append(sha256d(layer[i] + layer[i + 1]))
        layer = next_layer
    witness_root = layer[0]

    commitment = sha256d(witness_root + nonce)
    return commitment

# 範例
wtxids = [sha256d(f"wtx_{i}".encode()) for i in range(10)]
nonce = b'\x00' * 32
commitment = compute_witness_commitment(wtxids, nonce)
print(f"Witness commitment: {commitment.hex()}")

# OP_RETURN scriptPubKey
magic = bytes.fromhex("aa21a9ed")
script = b'\x6a\x24' + magic + commitment
print(f"Commitment script: {script.hex()}")
```

### JavaScript

```javascript
import { createHash } from 'crypto';

function sha256d(data) {
  const first = createHash('sha256').update(data).digest();
  return createHash('sha256').update(first).digest();
}

// 比較不同交易類型的 weight
const txTypes = [
  { name: 'P2PKH (legacy)',   nonWitness: 226, witness: 0 },
  { name: 'P2SH-P2WPKH',     nonWitness: 150, witness: 108 },
  { name: 'P2WPKH (native)',  nonWitness: 113, witness: 107 },
  { name: 'P2WSH 2-of-3',    nonWitness: 100, witness: 252 },
  { name: 'P2TR key path',   nonWitness: 105, witness: 65 },
  { name: 'P2TR script path', nonWitness: 105, witness: 200 },
];

console.log('Weight comparison (single-input, single-output):');
console.log('-'.repeat(70));
txTypes.forEach(({ name, nonWitness, witness }) => {
  const weight = nonWitness * 4 + witness;
  const vbytes = Math.ceil(weight / 4);
  const total = nonWitness + witness;
  const saving = ((226 - vbytes) / 226 * 100).toFixed(0);
  console.log(
    `${name.padEnd(20)} total=${total}B weight=${weight}WU ` +
    `vbytes=${vbytes} saving=${saving}% vs P2PKH`
  );
});

// Witness version 識別
function identifyWitnessVersion(scriptPubKey) {
  if (scriptPubKey[0] === 0x00 && scriptPubKey[1] === 0x14) return 'v0 P2WPKH';
  if (scriptPubKey[0] === 0x00 && scriptPubKey[1] === 0x20) return 'v0 P2WSH';
  if (scriptPubKey[0] === 0x51 && scriptPubKey[1] === 0x20) return 'v1 P2TR';
  return 'unknown';
}
```

## 相關概念

- [SegWit Serialization](/bitcoin/transactions/segwit-serialization/) - 完整的 SegWit 交易序列化格式
- [Transaction Malleability](/bitcoin/transactions/transaction-malleability/) - Witness 分離解決的核心問題
- [Bitcoin Block Structure](/bitcoin/data-structures/bitcoin-block-structure/) - Weight 系統與區塊限制
- [Merkle Tree in Blocks](/bitcoin/data-structures/merkle-tree-in-blocks/) - txid vs wtxid Merkle 樹
- [Merkle Root](/bitcoin/cryptography/merkle-root/) - Witness commitment 的 Merkle 計算
- [SHA-256d](/bitcoin/cryptography/sha-256d/) - txid 和 wtxid 使用的雜湊函數
- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - Witness 中的腳本執行
- [Schnorr Signatures](/bitcoin/cryptography/schnorr-signatures/) - Taproot witness 中的簽名方案
- [Taproot Key Tweaking](/bitcoin/cryptography/taproot-key-tweaking/) - P2TR 的 key path 和 script path witness
- [Compact Size Encoding](/bitcoin/data-structures/compact-size-encoding/) - Witness 中的長度前綴編碼
