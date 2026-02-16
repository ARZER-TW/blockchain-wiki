---
title: "PSBT (Partially Signed Bitcoin Transaction)"
description: "部分簽名的 Bitcoin 交易格式：BIP-174/BIP-370 規範、六角色工作流、硬體錢包與多簽整合"
tags: [bitcoin, advanced, psbt, bip174, bip370, multisig, hardware-wallet, signing]
---

# PSBT (Partially Signed Bitcoin Transaction)

## 概述

PSBT（Partially Signed Bitcoin Transaction）是由 BIP-174 定義的標準化格式，用於在多個參與方之間傳遞尚未完全簽名的 Bitcoin 交易。PSBT 將交易建構和簽名流程拆解為明確的角色和步驟，使得硬體錢包、[多簽方案](/bitcoin/advanced/multisig-musig/)、CoinJoin 等需要多方協作的場景得以安全且互操作地執行。

BIP-370 定義了 PSBT v2，在 v0 基礎上增加了對交易修改（如追加輸入/輸出）的支援，適用於更複雜的協作建構場景。

## 六角色工作流

PSBT 定義了六個角色，每個角色負責流程中的一個階段：

### 1. Creator（建立者）

建立一個空的 PSBT，包含交易的基本結構（inputs 和 outputs），但不含任何簽名或元資料。

### 2. Updater（更新者）

為 PSBT 補充簽名所需的元資料：
- 每個 input 的 UTXO 資訊（`witnessUtxo` 或 `nonWitnessUtxo`）
- BIP-32 derivation paths
- Redeem scripts / witness scripts
- Sighash types

### 3. Signer（簽名者）

使用私鑰對一個或多個 input 簽名。Signer 根據 PSBT 中的元資料驗證交易內容，然後產生簽名並寫入對應的 partial signatures 欄位。

### 4. Combiner（合併者）

將多個 Signer 產生的部分簽名合併到一個 PSBT 中。在 m-of-n 多簽場景中，Combiner 收集至少 $m$ 個簽名。

### 5. Finalizer（完成者）

將所有部分簽名組合成最終的 scriptSig 和/或 witness，並移除中間元資料。

### 6. Extractor（提取者）

從 finalized PSBT 中提取完整的 Bitcoin 交易（raw transaction），準備廣播到網路。

### 工作流圖

```
Creator -> Updater -> Signer(s) -> Combiner -> Finalizer -> Extractor
                         |                         |
                     (parallel)                (assemble)
                    Signer 1, 2, ..., n      final scriptSig/witness
```

## Key-Value Map 結構

### 全域欄位（Global）

| Key Type | 說明 |
|----------|------|
| `PSBT_GLOBAL_UNSIGNED_TX` (0x00) | 未簽名的交易（v0） |
| `PSBT_GLOBAL_XPUB` (0x01) | Extended public key |
| `PSBT_GLOBAL_TX_VERSION` (0x02) | 交易版本（v2） |
| `PSBT_GLOBAL_FALLBACK_LOCKTIME` (0x03) | 預設 locktime（v2） |
| `PSBT_GLOBAL_INPUT_COUNT` (0x04) | 輸入數量（v2） |
| `PSBT_GLOBAL_OUTPUT_COUNT` (0x05) | 輸出數量（v2） |

### Per-Input 欄位

| Key Type | 說明 |
|----------|------|
| `PSBT_IN_NON_WITNESS_UTXO` (0x00) | 完整的前序交易 |
| `PSBT_IN_WITNESS_UTXO` (0x01) | witness UTXO（scriptPubKey + value） |
| `PSBT_IN_PARTIAL_SIG` (0x02) | 部分簽名 |
| `PSBT_IN_SIGHASH_TYPE` (0x03) | Sighash 類型 |
| `PSBT_IN_REDEEM_SCRIPT` (0x04) | P2SH redeem script |
| `PSBT_IN_WITNESS_SCRIPT` (0x05) | P2WSH witness script |
| `PSBT_IN_BIP32_DERIVATION` (0x06) | BIP-32 推導路徑 |
| `PSBT_IN_TAP_KEY_SIG` (0x13) | Taproot key-path 簽名 |
| `PSBT_IN_TAP_SCRIPT_SIG` (0x14) | Taproot script-path 簽名 |
| `PSBT_IN_TAP_LEAF_SCRIPT` (0x15) | Tapscript 葉腳本 |
| `PSBT_IN_TAP_BIP32_DERIVATION` (0x16) | Taproot BIP-32 推導路徑 |
| `PSBT_IN_TAP_INTERNAL_KEY` (0x17) | Taproot 內部公鑰 |

### Per-Output 欄位

| Key Type | 說明 |
|----------|------|
| `PSBT_OUT_REDEEM_SCRIPT` (0x00) | 輸出的 redeem script |
| `PSBT_OUT_WITNESS_SCRIPT` (0x01) | 輸出的 witness script |
| `PSBT_OUT_BIP32_DERIVATION` (0x02) | 找零輸出的推導路徑 |
| `PSBT_OUT_TAP_INTERNAL_KEY` (0x05) | Taproot 內部公鑰 |

## PSBT v2 改進

BIP-370 的 PSBT v2 引入了幾個重要改進：

### 模組化交易建構

v0 的全域欄位包含完整的未簽名交易，任何修改（如追加輸入）都需要重建整個 PSBT。v2 將交易結構拆解為獨立欄位，支援增量修改：

$$\text{v0}: \text{PSBT\_GLOBAL\_UNSIGNED\_TX} \to \text{complete tx}$$
$$\text{v2}: \text{TX\_VERSION} + \text{INPUT\_COUNT} + \text{OUTPUT\_COUNT} + \text{per-input/output fields}$$

### 新增 Per-Input 欄位

v2 增加了每個輸入的 `PSBT_IN_PREVIOUS_TXID`、`PSBT_IN_OUTPUT_INDEX`、`PSBT_IN_SEQUENCE` 等欄位，使 Creator 角色可以更細粒度地構建交易。

### 適用場景

PSBT v2 特別適用於：
- **CoinJoin**：多方各自添加自己的輸入和輸出
- **協作建構**：漸進式追加交易元素
- **Interactive signing protocols**：如 [MuSig2](/bitcoin/advanced/multisig-musig/) 的多輪簽名

## 使用場景

### 硬體錢包簽名

```
Software wallet (Creator+Updater) -> PSBT file/QR -> Hardware wallet (Signer)
Hardware wallet -> signed PSBT -> Software wallet (Finalizer+Extractor)
```

硬體錢包只需實現 Signer 角色，從 PSBT 中讀取 UTXO 資訊和推導路徑，在安全環境中簽名，然後將簽名寫回 PSBT。

### 多簽協作

在 2-of-3 多簽場景中：

$$\text{Signer}_1 \to \text{PSBT}_{sig_1} \to \text{Combiner} \leftarrow \text{PSBT}_{sig_2} \leftarrow \text{Signer}_2$$

Combiner 合併兩個部分簽名後，Finalizer 組合成完整的 witness。

## 程式碼範例

### JavaScript（PSBT 建構與簽名）

```javascript
const bitcoin = require('bitcoinjs-lib');
const { ECPairFactory } = require('ecpair');
const ecc = require('tiny-secp256k1');
const ECPair = ECPairFactory(ecc);

// Creator + Updater: 建構 PSBT
function createPSBT(utxo, recipient, amount, changeAddress, changeAmount) {
  const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });

  // 添加輸入（Updater 提供 witnessUtxo）
  psbt.addInput({
    hash: utxo.txid,
    index: utxo.vout,
    witnessUtxo: {
      script: Buffer.from(utxo.scriptPubKey, 'hex'),
      value: utxo.value,
    },
  });

  // 添加輸出
  psbt.addOutput({ address: recipient, value: amount });
  if (changeAmount > 0) {
    psbt.addOutput({ address: changeAddress, value: changeAmount });
  }

  return psbt;
}

// Signer: 簽名一個 input
function signPSBT(psbt, inputIndex, keyPair) {
  psbt.signInput(inputIndex, keyPair);
  return psbt;
}

// Finalizer + Extractor: 完成並提取
function finalizeAndExtract(psbt) {
  psbt.finalizeAllInputs();
  return psbt.extractTransaction().toHex();
}

// 完整流程示範
const key = ECPair.makeRandom({ network: bitcoin.networks.testnet });
const { address } = bitcoin.payments.p2wpkh({
  pubkey: Buffer.from(key.publicKey),
  network: bitcoin.networks.testnet,
});
console.log('Address:', address);

// 序列化 PSBT 為 base64（可傳輸）
// const psbtBase64 = psbt.toBase64();
// const restoredPsbt = bitcoin.Psbt.fromBase64(psbtBase64);
```

### Python（PSBT 二進位格式解析）

```python
import struct
from typing import Optional

PSBT_MAGIC = b'psbt\xff'

PSBT_GLOBAL_UNSIGNED_TX = 0x00
PSBT_GLOBAL_XPUB = 0x01
PSBT_IN_NON_WITNESS_UTXO = 0x00
PSBT_IN_WITNESS_UTXO = 0x01
PSBT_IN_PARTIAL_SIG = 0x02

def read_compact_size(data: bytes, offset: int) -> tuple:
    """讀取 Bitcoin compact size integer"""
    first = data[offset]
    if first < 0xfd:
        return first, offset + 1
    elif first == 0xfd:
        val = struct.unpack_from('<H', data, offset + 1)[0]
        return val, offset + 3
    elif first == 0xfe:
        val = struct.unpack_from('<I', data, offset + 1)[0]
        return val, offset + 5
    else:
        val = struct.unpack_from('<Q', data, offset + 1)[0]
        return val, offset + 9

def parse_psbt_header(data: bytes) -> dict:
    """解析 PSBT 檔頭"""
    if not data.startswith(PSBT_MAGIC):
        raise ValueError("Invalid PSBT magic bytes")

    result = {'version': 0, 'global_entries': [], 'inputs': [], 'outputs': []}
    offset = len(PSBT_MAGIC)

    # 解析全域 key-value pairs
    while offset < len(data):
        key_len, offset = read_compact_size(data, offset)
        if key_len == 0:
            break  # separator

        key_type = data[offset]
        key_data = data[offset:offset + key_len]
        offset += key_len

        value_len, offset = read_compact_size(data, offset)
        value_data = data[offset:offset + value_len]
        offset += value_len

        result['global_entries'].append({
            'type': key_type,
            'key': key_data.hex(),
            'value_size': value_len,
        })

    return result

def display_psbt_roles():
    """顯示 PSBT 六角色工作流"""
    roles = [
        ('Creator', 'Build empty PSBT with tx skeleton'),
        ('Updater', 'Add UTXO info, derivation paths, scripts'),
        ('Signer', 'Sign inputs with private keys'),
        ('Combiner', 'Merge partial signatures from multiple signers'),
        ('Finalizer', 'Assemble final scriptSig/witness'),
        ('Extractor', 'Extract raw transaction for broadcast'),
    ]
    for i, (role, desc) in enumerate(roles, 1):
        print(f"  {i}. {role:12s} -> {desc}")

display_psbt_roles()
```

## 相關概念

- [Transaction Signing BTC](/bitcoin/transactions/transaction-signing-btc/) - PSBT 中的簽名機制
- [Multisig/MuSig](/bitcoin/advanced/multisig-musig/) - PSBT 在多簽中的應用
- [Miniscript](/bitcoin/advanced/miniscript/) - 與 PSBT 整合的結構化腳本描述
- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - PSBT 中的 redeem/witness script
- [P2TR](/bitcoin/transactions/p2tr/) - PSBT 的 Taproot 簽名欄位
- [P2WSH](/bitcoin/transactions/p2wpkh-p2wsh/) - PSBT 中的 SegWit 多簽格式
- [UTXO Model](/bitcoin/data-structures/utxo-model/) - PSBT 中的 UTXO 資訊欄位
- [Schnorr Signatures](/bitcoin/cryptography/schnorr-signatures/) - Taproot PSBT 使用的簽名方案
- [ECDSA](/fundamentals/cryptography/ecdsa/) - Legacy PSBT 使用的簽名方案
- [Tapscript](/bitcoin/advanced/tapscript/) - PSBT 中 Taproot script-path 的腳本格式
- [Lightning Network](/bitcoin/advanced/lightning-network/) - 通道 funding 交易可使用 PSBT 構建
