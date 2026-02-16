---
title: "P2PKH"
description: "Pay-to-Public-Key-Hash, P2PKH 交易腳本, Bitcoin 經典支付類型"
tags: [bitcoin, transactions, p2pkh, script, base58check, legacy]
---

# P2PKH

## 概述

P2PKH（Pay-to-Public-Key-Hash）是 Bitcoin 最經典的交易輸出類型，由 Satoshi Nakamoto 在早期版本中引入，取代了更原始的 P2PK（Pay-to-Public-Key）。P2PKH 將公鑰先雜湊再放入腳本中，提供了額外的安全層（即使 [ECDSA](/fundamentals/cryptography/ecdsa/) 被破解，攻擊者還需要逆向 [Hash160](/fundamentals/cryptography/hash-function-overview/)）。P2PKH 地址以 `1` 開頭，使用 [Base58Check](/bitcoin/data-structures/serialization-formats/) 編碼。

## 核心原理

### 腳本結構

P2PKH 使用 [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) 的兩部分驗證機制：

**scriptPubKey（鎖定腳本，放在輸出中）：**

```
OP_DUP OP_HASH160 <pubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
```

**scriptSig（解鎖腳本，放在花費此輸出的輸入中）：**

```
<sig> <pubKey>
```

### Stack 執行過程

驗證時，Bitcoin 節點將 scriptSig 和 scriptPubKey 組合執行。以下逐步展示堆疊變化：

| 步驟 | 操作 | 堆疊（頂端在右） |
|------|------|------------------|
| 1 | 推入 `<sig>` | `<sig>` |
| 2 | 推入 `<pubKey>` | `<sig> <pubKey>` |
| 3 | `OP_DUP` | `<sig> <pubKey> <pubKey>` |
| 4 | `OP_HASH160` | `<sig> <pubKey> <hash160(pubKey)>` |
| 5 | 推入 `<pubKeyHash>` | `<sig> <pubKey> <hash160(pubKey)> <pubKeyHash>` |
| 6 | `OP_EQUALVERIFY` | `<sig> <pubKey>` (兩個 hash 相等則繼續) |
| 7 | `OP_CHECKSIG` | `true` (簽名有效) |

最終堆疊頂部為 `true` 則驗證通過。

### Hash160

P2PKH 使用的公鑰雜湊是雙重雜湊：

$$\text{Hash160}(\text{pubKey}) = \text{RIPEMD-160}(\text{SHA-256}(\text{pubKey}))$$

結果為 20 bytes（160 bits）。這比直接使用 33-byte 壓縮公鑰（或 65-byte 非壓縮公鑰）更短，且提供了抗量子計算的額外保護層。

### 地址格式：Base58Check

P2PKH 地址的編碼流程：

1. 取公鑰的 Hash160（20 bytes）
2. 加上版本前綴 `0x00`（mainnet）或 `0x6f`（testnet）
3. 計算雙 SHA-256 checksum：取前 4 bytes
4. 將 `[version][hash160][checksum]` 做 Base58 編碼

$$\text{address} = \text{Base58}(\texttt{0x00} \| \text{Hash160}(\text{pubKey}) \| \text{checksum})$$

Mainnet P2PKH 地址以 `1` 開頭，Testnet 以 `m` 或 `n` 開頭。

### 歷史背景：P2PK vs P2PKH

| 特徵 | P2PK | P2PKH |
|------|------|-------|
| scriptPubKey | `<pubKey> OP_CHECKSIG` | `OP_DUP OP_HASH160 <hash> OP_EQUALVERIFY OP_CHECKSIG` |
| 輸出大小 | 35/67 bytes | 25 bytes |
| 解鎖大小 | ~72 bytes (sig only) | ~107 bytes (sig + pubKey) |
| 公鑰暴露 | 始終暴露 | 花費前隱藏 |
| 使用時期 | 早期 coinbase 交易 | 自 Bitcoin 0.1.0 起 |

P2PK 直接在 scriptPubKey 中放入完整公鑰，輸出較大且公鑰始終暴露在鏈上。P2PKH 只放 hash，公鑰直到花費時才揭露。

### 交易大小

典型 P2PKH 交易的大小估算：

- 每個 input：約 148 bytes（scriptSig 含簽名 + 壓縮公鑰）
- 每個 output：約 34 bytes（scriptPubKey）
- 交易 overhead：約 10 bytes（version + locktime + input/output count）

$$\text{txSize} \approx 10 + 148n_{\text{in}} + 34n_{\text{out}}$$

1-in-2-out 的標準 P2PKH 交易約 226 bytes。

## 程式碼範例

```javascript
const bitcoin = require('bitcoinjs-lib');
const { ECPairFactory } = require('ecpair');
const ecc = require('tiny-secp256k1');
const ECPair = ECPairFactory(ecc);

// 產生金鑰對與 P2PKH 地址
const keyPair = ECPair.makeRandom();
const { address } = bitcoin.payments.p2pkh({
  pubkey: Buffer.from(keyPair.publicKey),
  network: bitcoin.networks.bitcoin,
});
// address 以 '1' 開頭

// 手動構建 P2PKH scriptPubKey
const pubKeyHash = bitcoin.crypto.hash160(Buffer.from(keyPair.publicKey));
const scriptPubKey = bitcoin.script.compile([
  bitcoin.opcodes.OP_DUP,
  bitcoin.opcodes.OP_HASH160,
  pubKeyHash,
  bitcoin.opcodes.OP_EQUALVERIFY,
  bitcoin.opcodes.OP_CHECKSIG,
]);

// 構建花費 P2PKH 的交易
const psbt = new bitcoin.Psbt();
psbt.addInput({
  hash: 'previous_txid...',
  index: 0,
  nonWitnessUtxo: Buffer.from('raw_previous_tx_hex...', 'hex'),
});
psbt.addOutput({
  address: '1DestinationAddress...',
  value: 90000,
});
psbt.signInput(0, keyPair);
psbt.finalizeAllInputs();

const rawTx = psbt.extractTransaction().toHex();
```

```python
import hashlib
import base58

def hash160(data: bytes) -> bytes:
    """RIPEMD-160(SHA-256(data))"""
    sha = hashlib.sha256(data).digest()
    ripemd = hashlib.new('ripemd160', sha).digest()
    return ripemd

def pubkey_to_p2pkh_address(pubkey: bytes, testnet: bool = False) -> str:
    """從公鑰推導 P2PKH 地址"""
    # 1. Hash160
    h160 = hash160(pubkey)

    # 2. 加上版本前綴
    version = b'\x6f' if testnet else b'\x00'
    payload = version + h160

    # 3. 計算 checksum (雙 SHA-256 前 4 bytes)
    checksum = hashlib.sha256(
        hashlib.sha256(payload).digest()
    ).digest()[:4]

    # 4. Base58 編碼
    return base58.b58encode(payload + checksum).decode()

def build_p2pkh_script_pubkey(pubkey_hash: bytes) -> bytes:
    """構建 P2PKH scriptPubKey"""
    OP_DUP = 0x76
    OP_HASH160 = 0xa9
    OP_EQUALVERIFY = 0x88
    OP_CHECKSIG = 0xac

    return bytes([
        OP_DUP,
        OP_HASH160,
        0x14,  # push 20 bytes
    ]) + pubkey_hash + bytes([
        OP_EQUALVERIFY,
        OP_CHECKSIG,
    ])

# 範例
compressed_pubkey = bytes.fromhex(
    '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
)
address = pubkey_to_p2pkh_address(compressed_pubkey)
print(f"P2PKH Address: {address}")

script = build_p2pkh_script_pubkey(hash160(compressed_pubkey))
print(f"scriptPubKey: {script.hex()}")
```

## 安全性考量

### 公鑰暴露時機

P2PKH 的公鑰在花費之前是隱藏的。一旦花費，公鑰被揭露在 scriptSig 中。這意味著：

- **未花費的 P2PKH 輸出**：即使 ECDLP 被破解，攻擊者也需要先逆向 Hash160
- **已花費的 P2PKH 輸出**：安全性完全依賴 ECDSA
- **地址重用**：首次花費後公鑰暴露，剩餘資金的安全性下降

因此建議避免地址重用，每次接收使用新地址。

## 相關概念

- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - P2PKH 使用的腳本語言
- [secp256k1 in BTC](/bitcoin/cryptography/secp256k1-in-bitcoin/) - 用於產生公鑰的橢圓曲線
- [P2SH](/bitcoin/transactions/p2sh/) - 腳本雜湊支付，支援多簽等複雜腳本
- [P2WPKH/P2WSH](/bitcoin/transactions/p2wpkh-p2wsh/) - SegWit 版本的 P2PKH
- [P2TR](/bitcoin/transactions/p2tr/) - Taproot 支付，最新標準
- [ECDSA](/fundamentals/cryptography/ecdsa/) - P2PKH 使用的簽名演算法
- [Hash Function Overview](/fundamentals/cryptography/hash-function-overview/) - Hash160 雙重雜湊
- [Digital Signature Overview](/fundamentals/cryptography/digital-signature-overview/) - 數位簽章通用概念
- [Transaction Lifecycle](/bitcoin/transactions/transaction-lifecycle-btc/) - P2PKH 在交易流程中的角色
- [Serialization Formats](/bitcoin/data-structures/serialization-formats/) - Base58Check 編碼
