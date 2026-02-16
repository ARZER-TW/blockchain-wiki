---
title: "P2SH"
description: "Pay-to-Script-Hash, BIP-16, P2SH 多簽, 巢狀 SegWit, 腳本雜湊支付"
tags: [bitcoin, transactions, p2sh, bip-16, multisig, script-hash]
---

# P2SH

## 概述

P2SH（Pay-to-Script-Hash）由 BIP-16 定義，於 2012 年啟用。它將複雜腳本的負擔從發送者轉移到接收者：發送者只需支付到一個腳本雜湊（20 bytes），而完整的 redeem script 在花費時才揭露。這讓多簽（multisig）、時間鎖（timelock）、巢狀 SegWit 等複雜條件都能用統一的地址格式呈現。P2SH 地址以 `3` 開頭，使用 [Base58Check](/bitcoin/data-structures/serialization-formats/) 編碼。

## 核心原理

### 腳本結構

**scriptPubKey（鎖定腳本）：**

```
OP_HASH160 <scriptHash> OP_EQUAL
```

**scriptSig（解鎖腳本）：**

```
<signatures...> <redeemScript>
```

其中 `<scriptHash>` 是 redeem script 的 Hash160：

$$\text{scriptHash} = \text{RIPEMD-160}(\text{SHA-256}(\text{redeemScript}))$$

### 兩階段驗證

P2SH 的驗證分為兩個階段，這是它與其他腳本類型的關鍵區別：

**第一階段：雜湊匹配**

| 步驟 | 操作 | 堆疊 |
|------|------|------|
| 1 | 推入 scriptSig 中的所有項目（含 redeemScript） | `<sigs...> <redeemScript>` |
| 2 | `OP_HASH160` 對堆疊頂端的 redeemScript 取 Hash160 | `<sigs...> <hash>` |
| 3 | 推入 `<scriptHash>` | `<sigs...> <hash> <scriptHash>` |
| 4 | `OP_EQUAL` | `<sigs...> true` |

若 hash 匹配，進入第二階段。

**第二階段：執行 Redeem Script**

Bitcoin 節點將 redeemScript 反序列化後作為新腳本執行，堆疊上剩餘的資料（signatures 等）作為輸入：

例如 2-of-3 多簽的 redeemScript：
```
OP_2 <pubKey1> <pubKey2> <pubKey3> OP_3 OP_CHECKMULTISIG
```

### 地址格式

P2SH 地址使用版本前綴 `0x05`（mainnet）或 `0xc4`（testnet）：

$$\text{address} = \text{Base58Check}(\texttt{0x05} \| \text{Hash160}(\text{redeemScript}))$$

Mainnet 以 `3` 開頭，Testnet 以 `2` 開頭。

### 常見使用場景

#### 1. 多簽（Multisig）

M-of-N 多簽的 redeemScript：

```
OP_M <pubKey_1> <pubKey_2> ... <pubKey_N> OP_N OP_CHECKMULTISIG
```

花費時的 scriptSig：
```
OP_0 <sig_1> <sig_2> ... <sig_M> <redeemScript>
```

`OP_0` 是因為 `OP_CHECKMULTISIG` 的歷史 bug（off-by-one），會從堆疊多彈出一個值。

#### 2. 時間鎖（Timelock）

```
OP_IF
  <timeout> OP_CHECKLOCKTIMEVERIFY OP_DROP <pubKey_A> OP_CHECKSIG
OP_ELSE
  OP_2 <pubKey_A> <pubKey_B> OP_2 OP_CHECKMULTISIG
OP_ENDIF
```

#### 3. 巢狀 SegWit（P2SH-P2WPKH）

redeemScript 內容為 SegWit witness program：
```
OP_0 <20-byte-key-hash>
```

這讓不支援原生 SegWit 的舊錢包也能發送到 SegWit 地址（以 `3` 開頭的相容地址）。

### 大小限制

- redeemScript 最大 520 bytes（`MAX_SCRIPT_ELEMENT_SIZE`）
- 序列化後的 scriptSig 最大 1,650 bytes
- 標準多簽上限：15-of-15（P2SH 中的標準限制）

### P2SH 的安全模型

P2SH 的安全性包含兩層：

1. **Hash160 preimage resistance**：攻擊者無法從 scriptHash 逆推 redeemScript
2. **redeemScript 本身的安全性**：如多簽的 M-of-N 門檻、ECDSA 簽名驗證

花費前，鏈上只有 20-byte hash。攻擊者不知道具體的花費條件，增加了安全性。

## 程式碼範例

```javascript
const bitcoin = require('bitcoinjs-lib');
const { ECPairFactory } = require('ecpair');
const ecc = require('tiny-secp256k1');
const ECPair = ECPairFactory(ecc);

// 建立 2-of-3 多簽 P2SH 地址
const keyPairs = Array.from({ length: 3 }, () => ECPair.makeRandom());
const pubkeys = keyPairs.map(kp => Buffer.from(kp.publicKey));

// 構建 redeem script: OP_2 <pk1> <pk2> <pk3> OP_3 OP_CHECKMULTISIG
const redeemScript = bitcoin.payments.p2ms({
  m: 2,
  pubkeys,
  network: bitcoin.networks.bitcoin,
}).output;

// 包裝為 P2SH
const p2sh = bitcoin.payments.p2sh({
  redeem: { output: redeemScript },
  network: bitcoin.networks.bitcoin,
});

// p2sh.address 以 '3' 開頭
// p2sh.hash 是 redeemScript 的 Hash160

// === 巢狀 SegWit (P2SH-P2WPKH) ===
const kp = ECPair.makeRandom();
const p2shP2wpkh = bitcoin.payments.p2sh({
  redeem: bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(kp.publicKey),
  }),
});
// p2shP2wpkh.address 也以 '3' 開頭
// 但花費時使用 witness data，節省空間

// 花費 P2SH 多簽
const psbt = new bitcoin.Psbt();
psbt.addInput({
  hash: 'prev_txid...',
  index: 0,
  nonWitnessUtxo: Buffer.from('raw_prev_tx...', 'hex'),
  redeemScript,
});
psbt.addOutput({
  address: '1DestAddress...',
  value: 80000,
});

// 需要 2 把金鑰簽名（2-of-3）
psbt.signInput(0, keyPairs[0]);
psbt.signInput(0, keyPairs[2]);
psbt.finalizeAllInputs();

const rawTx = psbt.extractTransaction().toHex();
```

```python
import hashlib
import base58

def hash160(data: bytes) -> bytes:
    """RIPEMD-160(SHA-256(data))"""
    sha = hashlib.sha256(data).digest()
    return hashlib.new('ripemd160', sha).digest()

def create_multisig_redeem_script(m: int, pubkeys: list[bytes]) -> bytes:
    """構建 M-of-N 多簽 redeemScript"""
    n = len(pubkeys)
    assert 1 <= m <= n <= 15, "Invalid multisig parameters"

    OP_M = 0x50 + m       # OP_1 = 0x51, OP_2 = 0x52, ...
    OP_N = 0x50 + n
    OP_CHECKMULTISIG = 0xae

    script = bytes([OP_M])
    for pk in pubkeys:
        script += bytes([len(pk)]) + pk  # push pubkey
    script += bytes([OP_N, OP_CHECKMULTISIG])

    return script

def redeem_script_to_p2sh_address(
    redeem_script: bytes, testnet: bool = False
) -> str:
    """從 redeemScript 計算 P2SH 地址"""
    script_hash = hash160(redeem_script)
    version = b'\xc4' if testnet else b'\x05'
    payload = version + script_hash
    checksum = hashlib.sha256(
        hashlib.sha256(payload).digest()
    ).digest()[:4]
    return base58.b58encode(payload + checksum).decode()

# 範例：2-of-3 多簽
pubkeys = [
    bytes.fromhex('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'),
    bytes.fromhex('02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5'),
    bytes.fromhex('02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9'),
]

redeem = create_multisig_redeem_script(2, pubkeys)
address = redeem_script_to_p2sh_address(redeem)
print(f"2-of-3 P2SH Address: {address}")
print(f"Redeem script ({len(redeem)} bytes): {redeem.hex()}")
print(f"Script hash: {hash160(redeem).hex()}")
```

## 相關概念

- [P2PKH](/bitcoin/transactions/p2pkh/) - 傳統單簽支付，P2SH 的前身
- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - P2SH 使用的腳本語言
- [P2WPKH/P2WSH](/bitcoin/transactions/p2wpkh-p2wsh/) - 原生 SegWit 版本
- [Multisig/MuSig](/bitcoin/advanced/multisig-musig/) - 多簽方案詳解
- [P2TR](/bitcoin/transactions/p2tr/) - Taproot 取代 P2SH 多簽的新方案
- [ECDSA](/fundamentals/cryptography/ecdsa/) - OP_CHECKSIG 使用的簽名演算法
- [Hash Function Overview](/fundamentals/cryptography/hash-function-overview/) - Hash160 雙重雜湊
- [SegWit Serialization](/bitcoin/transactions/segwit-serialization/) - 巢狀 SegWit 的序列化
- [Transaction Lifecycle](/bitcoin/transactions/transaction-lifecycle-btc/) - P2SH 在交易流程中的角色
- [Serialization Formats](/bitcoin/data-structures/serialization-formats/) - Base58Check 地址編碼
