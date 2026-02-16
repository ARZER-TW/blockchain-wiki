---
title: "P2WPKH / P2WSH"
description: "Pay-to-Witness-Public-Key-Hash, Pay-to-Witness-Script-Hash, SegWit v0, BIP-141, BIP-143, Bech32"
tags: [bitcoin, transactions, p2wpkh, p2wsh, segwit, bip-141, bip-143, bech32, witness]
---

# P2WPKH / P2WSH

## 概述

P2WPKH（Pay-to-Witness-Public-Key-Hash）和 P2WSH（Pay-to-Witness-Script-Hash）是 Segregated Witness（SegWit）v0 定義的原生見證輸出類型，由 BIP-141 規範。它們將簽名資料移至 [witness 欄位](/bitcoin/data-structures/witness-data/)，解決了 [交易延展性](/bitcoin/transactions/transaction-malleability/) 問題，並大幅降低手續費。P2WPKH 是 [P2PKH](/bitcoin/transactions/p2pkh/) 的 SegWit 版本，P2WSH 是 [P2SH](/bitcoin/transactions/p2sh/) 的 SegWit 版本。兩者使用 Bech32 地址（`bc1q` 開頭），由 BIP-173 定義。

## 核心原理

### P2WPKH

**scriptPubKey（witness program v0, 20 bytes）：**

```
OP_0 <20-byte-key-hash>
```

其中 `<20-byte-key-hash>` 是公鑰的 Hash160：

$$\text{keyHash} = \text{RIPEMD-160}(\text{SHA-256}(\text{pubKey}))$$

**scriptSig**：空（必須為空）

**Witness**：

```
<sig> <pubKey>
```

驗證時，節點識別出 `OP_0 <20-byte-hash>` 模式後，自動構建等效的 P2PKH 驗證邏輯，使用 witness 中的簽名和公鑰進行驗證。

### P2WSH

**scriptPubKey（witness program v0, 32 bytes）：**

```
OP_0 <32-byte-script-hash>
```

注意 P2WSH 使用 SHA-256 而非 Hash160，產生 32-byte hash：

$$\text{scriptHash} = \text{SHA-256}(\text{witnessScript})$$

**scriptSig**：空

**Witness**：

```
<signatures...> <witnessScript>
```

與 P2SH 的差異：使用 SHA-256（32 bytes）而非 Hash160（20 bytes），提供 128-bit 而非 80-bit 的碰撞抵抗力。

### BIP-143 新 Sighash 演算法

BIP-143 定義了 SegWit v0 的新交易摘要演算法，解決了兩個關鍵問題：

**1. 二次雜湊問題（Quadratic Hashing）**

Legacy 簽名需要對每個 input 序列化整筆交易再計算 hash。交易有 $n$ 個 input 時，簽名驗證的計算量為 $O(n^2)$：

$$\text{Legacy cost} = O(n \times \text{txSize}) = O(n^2)$$

BIP-143 預先計算共用部分（hashPrevouts、hashSequence、hashOutputs），每個 input 的簽名驗證為 $O(1)$，總計 $O(n)$：

$$\text{BIP-143 cost} = O(n)$$

**2. 承諾輸入金額**

BIP-143 的 sighash 包含每個 input 的金額（value），讓硬體錢包在不取得完整前序交易的情況下也能安全驗證手續費。

### BIP-143 Sighash Preimage 結構

```
 1. nVersion        (4 bytes, little-endian)
 2. hashPrevouts    (32 bytes)
 3. hashSequence    (32 bytes)
 4. outpoint        (32+4 bytes, txid + vout)
 5. scriptCode      (variable)
 6. amount          (8 bytes, little-endian)
 7. nSequence       (4 bytes, little-endian)
 8. hashOutputs     (32 bytes)
 9. nLocktime       (4 bytes, little-endian)
10. sighashType     (4 bytes, little-endian)
```

### Bech32 地址（BIP-173）

Bech32 是為 SegWit 設計的新地址編碼，相比 Base58Check 有多項改進：

| 特徵 | Base58Check | Bech32 |
|------|-------------|--------|
| 字元集 | 大小寫混合 + 數字 | 小寫 + 數字（排除 1, b, i, o） |
| 錯誤偵測 | 4-byte checksum | BCH code，保證偵測 4 個錯誤 |
| 大小寫 | 敏感 | 不敏感 |
| QR code | 混合模式，較大 | 全大寫時使用 alphanumeric 模式，較小 |

Bech32 地址結構：`bc1q` + data + checksum

- `bc`：人類可讀部分（mainnet）；`tb` 為 testnet
- `1`：分隔符
- `q`：witness version 0（`q` = 0 in Bech32 encoding）
- 其餘為 witness program + checksum

### 費用節省

SegWit 引入了 weight unit 的概念，witness 資料的計費較低：

$$\text{weight} = \text{non-witness bytes} \times 4 + \text{witness bytes} \times 1$$

$$\text{vBytes} = \lceil \text{weight} / 4 \rceil$$

典型交易大小比較（1-in-2-out）：

| 類型 | non-witness | witness | weight | vBytes | 費用比 |
|------|------------|---------|--------|--------|--------|
| P2PKH | 226 B | 0 | 904 | 226 | 100% |
| P2SH-P2WPKH | 150 B | 108 B | 708 | 177 | 78% |
| P2WPKH | 114 B | 108 B | 564 | 141 | 62% |

P2WPKH 比 P2PKH 節省約 38% 的費用。

## 程式碼範例

```javascript
const bitcoin = require('bitcoinjs-lib');
const { ECPairFactory } = require('ecpair');
const ecc = require('tiny-secp256k1');
const ECPair = ECPairFactory(ecc);

// === P2WPKH ===
const keyPair = ECPair.makeRandom();
const p2wpkh = bitcoin.payments.p2wpkh({
  pubkey: Buffer.from(keyPair.publicKey),
  network: bitcoin.networks.bitcoin,
});
// p2wpkh.address: bc1q...

// 花費 P2WPKH
const psbt = new bitcoin.Psbt();
psbt.addInput({
  hash: 'prev_txid...',
  index: 0,
  witnessUtxo: {
    script: p2wpkh.output, // OP_0 <20-byte-hash>
    value: 100000,
  },
});
psbt.addOutput({
  address: 'bc1q_recipient...',
  value: 90000,
});
psbt.signInput(0, keyPair);
psbt.finalizeAllInputs();

// === P2WSH (2-of-3 multisig) ===
const keys = Array.from({ length: 3 }, () => ECPair.makeRandom());
const pubkeys = keys.map(k => Buffer.from(k.publicKey));

const witnessScript = bitcoin.payments.p2ms({
  m: 2,
  pubkeys,
}).output;

const p2wsh = bitcoin.payments.p2wsh({
  redeem: { output: witnessScript },
  network: bitcoin.networks.bitcoin,
});
// p2wsh.address: bc1q... (longer, 32-byte hash)

// 花費 P2WSH
const psbt2 = new bitcoin.Psbt();
psbt2.addInput({
  hash: 'prev_txid...',
  index: 0,
  witnessUtxo: {
    script: p2wsh.output,
    value: 200000,
  },
  witnessScript,
});
psbt2.addOutput({
  address: 'bc1q_destination...',
  value: 190000,
});
psbt2.signInput(0, keys[0]);
psbt2.signInput(0, keys[1]);
psbt2.finalizeAllInputs();
```

```python
import hashlib
from bech32 import bech32_encode, convertbits

def hash160(data: bytes) -> bytes:
    sha = hashlib.sha256(data).digest()
    return hashlib.new('ripemd160', sha).digest()

def pubkey_to_p2wpkh_program(pubkey: bytes) -> bytes:
    """P2WPKH witness program = Hash160(pubkey)"""
    return hash160(pubkey)

def script_to_p2wsh_program(witness_script: bytes) -> bytes:
    """P2WSH witness program = SHA-256(witnessScript)"""
    return hashlib.sha256(witness_script).digest()

def encode_bech32_address(
    witness_version: int, witness_program: bytes, hrp: str = "bc"
) -> str:
    """編碼 Bech32 SegWit 地址"""
    prog_5bit = convertbits(witness_program, 8, 5)
    return bech32_encode(hrp, [witness_version] + prog_5bit)

# P2WPKH 範例
pubkey = bytes.fromhex(
    '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
)
wpkh_program = pubkey_to_p2wpkh_program(pubkey)
p2wpkh_addr = encode_bech32_address(0, wpkh_program)
print(f"P2WPKH: {p2wpkh_addr}")  # bc1q...

# P2WSH 範例 (2-of-2 multisig witness script)
witness_script = bytes.fromhex('5221' + pubkey.hex() + '21' + pubkey.hex() + '52ae')
wsh_program = script_to_p2wsh_program(witness_script)
p2wsh_addr = encode_bech32_address(0, wsh_program)
print(f"P2WSH: {p2wsh_addr}")  # bc1q... (longer)
```

## 相關概念

- [P2PKH](/bitcoin/transactions/p2pkh/) - P2WPKH 的 Legacy 前身
- [P2SH](/bitcoin/transactions/p2sh/) - P2WSH 的 Legacy 前身；也用於巢狀 SegWit
- [Witness Data](/bitcoin/data-structures/witness-data/) - witness 欄位的結構與儲存
- [SegWit Serialization](/bitcoin/transactions/segwit-serialization/) - SegWit 交易的序列化格式
- [Transaction Malleability](/bitcoin/transactions/transaction-malleability/) - SegWit 解決的核心問題
- [P2TR](/bitcoin/transactions/p2tr/) - SegWit v1，Taproot 的進一步演進
- [ECDSA](/fundamentals/cryptography/ecdsa/) - P2WPKH 使用的簽名演算法
- [secp256k1](/fundamentals/cryptography/secp256k1/) - 底層橢圓曲線
- [Fee Estimation](/bitcoin/transactions/fee-estimation/) - weight/vByte 費率計算
- [Transaction Signing](/bitcoin/transactions/transaction-signing-btc/) - BIP-143 簽名流程
