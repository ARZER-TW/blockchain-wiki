---
title: "Bitcoin 交易簽名"
description: "Bitcoin Transaction Signing, Legacy signing, BIP-143, BIP-341, sighash, RFC 6979, signature grinding"
tags: [bitcoin, transactions, signing, bip-143, bip-341, sighash, ecdsa, schnorr]
---

# Bitcoin 交易簽名

## 概述

Bitcoin 交易簽名是證明 UTXO 所有權的核心機制。簽名過程隨著協議演進而改變：Legacy 交易使用原始序列化搭配 [ECDSA](/fundamentals/cryptography/ecdsa/)；SegWit v0（BIP-143）引入新的摘要演算法修復二次雜湊問題並承諾輸入金額；Taproot（BIP-341）採用 [Schnorr 簽名](/bitcoin/cryptography/schnorr-signatures/) 搭配 tagged hash 和 epoch 機制。三代簽名方式在 Bitcoin 網路中共存。

## 核心原理

### Legacy 簽名流程

Legacy 交易（P2PKH、P2SH 非 SegWit）的簽名步驟：

1. **序列化交易**：將交易序列化，但將當前要簽名的 input 的 scriptSig 替換為對應的 `scriptPubKey`（或 `redeemScript`），其他 input 的 scriptSig 設為空
2. **附加 sighash type**：在序列化資料末尾追加 4-byte sighash type（如 `SIGHASH_ALL = 0x01000000`）
3. **雙重 SHA-256**：$z = \text{SHA-256}(\text{SHA-256}(\text{serialized}))$
4. **ECDSA 簽名**：使用私鑰對 $z$ 簽名，產生 $(r, s)$
5. **DER 編碼**：將 $(r, s)$ 編碼為 DER 格式，附加 1-byte sighash type

**Legacy 的二次雜湊問題：**

每個 input 的簽名都需要序列化整筆交易。若交易有 $n$ 個 input，每個 input 的序列化大小約為整筆交易大小 $T$，驗證總計算量：

$$\text{cost} \approx n \times T \approx n^2 \times \text{avgInputSize}$$

這使得惡意構造的大交易可以消耗大量驗證資源。

### BIP-143 簽名（SegWit v0）

BIP-143 為 [P2WPKH/P2WSH](/bitcoin/transactions/p2wpkh-p2wsh/) 定義的新摘要演算法：

```
Preimage:
  nVersion           (4 bytes)
  hashPrevouts       (32 bytes) -- SHA256d of all input outpoints
  hashSequence       (32 bytes) -- SHA256d of all input sequences
  outpoint           (36 bytes) -- this input's txid + vout
  scriptCode         (var)      -- the script being executed
  amount             (8 bytes)  -- this input's value in satoshis
  nSequence          (4 bytes)  -- this input's sequence
  hashOutputs        (32 bytes) -- SHA256d of all outputs
  nLockTime          (4 bytes)
  nHashType          (4 bytes)
```

關鍵改進：
- **hashPrevouts / hashSequence / hashOutputs**：預先計算一次，所有 input 共用 $\Rightarrow O(n)$
- **amount 欄位**：承諾 input 金額，硬體錢包不需要完整前序交易即可驗證手續費
- **scriptCode**：明確指定執行的腳本

### BIP-341 簽名（Taproot）

Taproot 使用 Schnorr 簽名搭配全新的 sighash 結構：

```
Signature message:
  epoch              (1 byte, = 0x00)
  hash_type          (1 byte)
  nVersion           (4 bytes)
  nLockTime          (4 bytes)
  sha_prevouts       (32 bytes)
  sha_amounts        (32 bytes)  -- NEW: all input amounts
  sha_scriptpubkeys  (32 bytes)  -- NEW: all input scriptPubKeys
  sha_sequences      (32 bytes)
  sha_outputs        (32 bytes)
  spend_type         (1 byte)    -- key path vs script path
  [input-specific data]
  [annex if present]
```

**Epoch 機制**：`0x00` 前綴確保 BIP-341 的 sighash 與未來版本不會碰撞。

**Tagged Hash**：所有雜湊使用 BIP-340 的 tagged hash：

$$\text{hash}_{\text{tag}}(x) = \text{SHA-256}(\text{SHA-256}(\text{tag}) \| \text{SHA-256}(\text{tag}) \| x)$$

Taproot 簽名使用 `"TapSighash"` tag。

**Key path vs Script path**：

- Key path：`spend_type` 的低位元為 0
- Script path：`spend_type` 的低位元為 1，額外包含 tapleaf hash 和 key version

### Sighash Types

[Sighash types](/bitcoin/cryptography/sighash-types/) 控制簽名覆蓋交易的哪些部分：

| Type | 值 | 簽名覆蓋 |
|------|------|---------|
| SIGHASH_ALL | 0x01 | 所有 inputs + 所有 outputs |
| SIGHASH_NONE | 0x02 | 所有 inputs，不覆蓋 outputs |
| SIGHASH_SINGLE | 0x03 | 所有 inputs + 同 index 的 output |
| ANYONECANPAY flag | 0x80 | 只覆蓋當前 input（可與上述組合） |

BIP-341 新增 `SIGHASH_DEFAULT`（0x00），等同於 `SIGHASH_ALL` 但簽名省略 1 byte。

### Signature Grinding（Low-R）

DER 編碼的 ECDSA 簽名中，若 $r$ 的最高位元為 1，需要額外的 `0x00` 前綴 byte。為節省空間，Bitcoin Core 會重複嘗試不同的隨機數 $k$ 直到 $r < 2^{255}$（約 50% 機率），稱為 signature grinding：

$$\text{probability}(r < 2^{255}) \approx 0.5$$

平均只需 2 次嘗試即可得到 low-R 簽名，節省 1 byte/input。

Schnorr 簽名不需要 DER 編碼，固定 64 bytes，不存在此問題。

### RFC 6979 確定性 Nonce

為避免 $k$ 重用攻擊（同一 $k$ 簽不同訊息會洩漏私鑰），Bitcoin Core 使用 RFC 6979 生成確定性 nonce：

$$k = \text{HMAC-DRBG}(\text{private\_key}, \text{message\_hash})$$

相同的私鑰和訊息永遠產生相同的 $k$，消除對 [CSPRNG](/fundamentals/cryptography/csprng/) 品質的依賴。

### 與 Ethereum 簽名的比較

| 特徵 | Bitcoin | Ethereum |
|------|---------|----------|
| 簽名演算法 | ECDSA / Schnorr | ECDSA |
| 曲線 | [secp256k1](/fundamentals/cryptography/secp256k1/) | secp256k1 |
| 摘要函數 | SHA-256d / tagged SHA-256 | Keccak-256 |
| Recovery ID | 不需要（公鑰在 witness 中） | 需要（v 值，用於 ecrecover） |
| 重放保護 | UTXO 模型天然防重放 | EIP-155 chain ID |
| Sighash 彈性 | 多種 sighash type | 固定覆蓋整筆交易 |
| 簽名格式 | DER（Legacy/SegWit）/ 固定 64B（Taproot） | 固定 65B (r, s, v) |

## 程式碼範例

```javascript
const bitcoin = require('bitcoinjs-lib');
const { ECPairFactory } = require('ecpair');
const ecc = require('tiny-secp256k1');
const ECPair = ECPairFactory(ecc);

// === Legacy P2PKH 簽名 ===
function signLegacyInput(psbt, inputIndex, keyPair) {
  // Legacy 需要完整的前序交易 (nonWitnessUtxo)
  psbt.signInput(inputIndex, keyPair);
  // 底層：序列化 tx + scriptPubKey -> SHA256d -> ECDSA sign
  // 產生 DER 編碼的簽名 + sighash byte
}

// === BIP-143 SegWit 簽名 ===
function signSegwitInput(psbt, inputIndex, keyPair) {
  // SegWit 只需要 witnessUtxo (scriptPubKey + value)
  psbt.signInput(inputIndex, keyPair);
  // 底層：BIP-143 preimage -> SHA256d -> ECDSA sign
  // 簽名進入 witness 欄位
}

// === BIP-341 Taproot key path 簽名 ===
function signTaprootKeyPath(psbt, inputIndex, keyPair) {
  psbt.signInput(inputIndex, keyPair);
  // 底層：BIP-341 sighash -> tagged hash -> Schnorr sign
  // 64-byte 簽名（或 65-byte 含 sighash type）
}

// 完整範例：構建並簽名 SegWit 交易
const keyPair = ECPair.makeRandom();
const p2wpkh = bitcoin.payments.p2wpkh({
  pubkey: Buffer.from(keyPair.publicKey),
});

const psbt = new bitcoin.Psbt();
psbt.addInput({
  hash: 'a'.repeat(64),
  index: 0,
  witnessUtxo: {
    script: p2wpkh.output,
    value: 100000, // BIP-143: amount is committed in sighash
  },
});
psbt.addOutput({ address: 'bc1q_dest...', value: 90000 });
psbt.signInput(0, keyPair);
psbt.finalizeAllInputs();

const tx = psbt.extractTransaction();
const witness = tx.ins[0].witness;
// witness[0] = DER-encoded ECDSA signature + sighash byte
// witness[1] = compressed public key (33 bytes)
```

```python
import hashlib
import struct

def legacy_sighash(tx_bytes: bytes, input_index: int,
                   script_pubkey: bytes, hash_type: int = 1) -> bytes:
    """計算 Legacy 交易的 sighash（簡化版）"""
    # 實際實作需要修改 tx 的序列化：
    # 1. 清空所有 input 的 scriptSig
    # 2. 將 input_index 對應的 scriptSig 設為 script_pubkey
    # 3. 根據 hash_type 處理 inputs/outputs
    # 4. 附加 4-byte hash_type
    # 5. 雙重 SHA-256
    data = tx_bytes + struct.pack('<I', hash_type)
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()

def bip143_sighash(
    version: int, hash_prevouts: bytes, hash_sequence: bytes,
    outpoint: bytes, script_code: bytes, amount: int,
    sequence: int, hash_outputs: bytes, locktime: int,
    hash_type: int = 1
) -> bytes:
    """計算 BIP-143 sighash preimage 的雙重 SHA-256"""
    preimage = b''
    preimage += struct.pack('<I', version)        # nVersion
    preimage += hash_prevouts                      # hashPrevouts
    preimage += hash_sequence                      # hashSequence
    preimage += outpoint                           # outpoint (txid + vout)
    preimage += script_code                        # scriptCode
    preimage += struct.pack('<Q', amount)          # amount (satoshis)
    preimage += struct.pack('<I', sequence)        # nSequence
    preimage += hash_outputs                       # hashOutputs
    preimage += struct.pack('<I', locktime)        # nLockTime
    preimage += struct.pack('<I', hash_type)       # sighash type

    return hashlib.sha256(hashlib.sha256(preimage).digest()).digest()

def tagged_hash(tag: str, data: bytes) -> bytes:
    """BIP-340 tagged hash"""
    tag_hash = hashlib.sha256(tag.encode()).digest()
    return hashlib.sha256(tag_hash + tag_hash + data).digest()

def bip341_sighash_keypath(
    version: int, locktime: int,
    sha_prevouts: bytes, sha_amounts: bytes,
    sha_scriptpubkeys: bytes, sha_sequences: bytes,
    sha_outputs: bytes, spend_type: int = 0,
    input_index: int = 0, hash_type: int = 0
) -> bytes:
    """計算 BIP-341 key path sighash（簡化版）"""
    sig_msg = b''
    sig_msg += bytes([0x00])                       # epoch
    sig_msg += bytes([hash_type])                   # hash_type
    sig_msg += struct.pack('<I', version)           # nVersion
    sig_msg += struct.pack('<I', locktime)          # nLockTime
    sig_msg += sha_prevouts
    sig_msg += sha_amounts
    sig_msg += sha_scriptpubkeys
    sig_msg += sha_sequences
    sig_msg += sha_outputs
    sig_msg += bytes([spend_type])                  # spend_type
    sig_msg += struct.pack('<I', input_index)       # input index

    return tagged_hash("TapSighash", sig_msg)

# 範例：tagged hash
msg = b"test message"
tap_hash = tagged_hash("TapSighash", msg)
print(f"TapSighash: {tap_hash.hex()}")
```

## 相關概念

- [Sighash Types](/bitcoin/cryptography/sighash-types/) - 控制簽名覆蓋範圍的機制
- [ECDSA](/fundamentals/cryptography/ecdsa/) - Legacy 和 SegWit 使用的簽名演算法
- [Schnorr Signatures](/bitcoin/cryptography/schnorr-signatures/) - Taproot 使用的簽名方案
- [PSBT](/bitcoin/advanced/psbt/) - 部分簽名交易格式，多方簽名工作流
- [secp256k1](/fundamentals/cryptography/secp256k1/) - 底層橢圓曲線
- [Digital Signature Overview](/fundamentals/cryptography/digital-signature-overview/) - 數位簽章通用概念
- [P2WPKH/P2WSH](/bitcoin/transactions/p2wpkh-p2wsh/) - BIP-143 簽名的使用場景
- [P2TR](/bitcoin/transactions/p2tr/) - BIP-341 簽名的使用場景
- [Transaction Malleability](/bitcoin/transactions/transaction-malleability/) - 簽名可延展性問題
- [Transaction Lifecycle](/bitcoin/transactions/transaction-lifecycle-btc/) - 簽名在交易流程中的位置
