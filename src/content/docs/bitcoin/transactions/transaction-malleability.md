---
title: "交易延展性"
description: "Transaction Malleability, 交易可變性, BIP-62, BIP-66, BIP-141, SegWit 修復"
tags: [bitcoin, transactions, malleability, bip-62, bip-66, bip-141, segwit, txid]
---

# 交易延展性

## 概述

交易延展性（Transaction Malleability）是 Bitcoin 早期一個嚴重的結構性問題：第三方（甚至交易發送者自己）可以在不使簽名失效的情況下修改交易的 txid。這破壞了依賴 txid 的交易鏈（如 [Lightning Network](/bitcoin/advanced/lightning-network/) 的承諾交易、原子交換的退款交易），因為父交易的 txid 變更會導致子交易的 input 引用失效。最終由 [SegWit](/bitcoin/transactions/segwit-serialization/)（BIP-141）透過將簽名移至 [witness 欄位](/bitcoin/data-structures/witness-data/) 徹底解決。

## 核心原理

### 問題定義

Bitcoin 的 txid 是整筆交易序列化後的雙重 SHA-256：

$$\text{txid} = \text{SHA-256d}(\text{version} \| \text{inputs} \| \text{outputs} \| \text{locktime})$$

其中 inputs 包含 scriptSig（簽名資料）。如果 scriptSig 可以被修改而簽名仍然有效，txid 就會改變。

### 延展性來源

#### 1. scriptSig 修改

scriptSig 中可以插入不影響執行結果的操作碼：

```
原始：  <sig> <pubkey>
修改後：OP_0 OP_DROP <sig> <pubkey>
```

`OP_0 OP_DROP` 推入 0 再彈出，不影響最終堆疊結果，但改變了 scriptSig 的序列化，從而改變 txid。

#### 2. DER 編碼的彈性

ECDSA 簽名使用 DER（Distinguished Encoding Rules）編碼。在 BIP-66 之前，不嚴格的 DER 解析允許非標準編碼（如額外的前導零、不必要的填充），同一個簽名可以有多種有效的 DER 表示。

#### 3. ECDSA 的 (r, s) 對稱性

如果 $(r, s)$ 是有效的 ECDSA 簽名，$(r, n-s)$ 也是有效的（其中 $n$ 是 [secp256k1](/fundamentals/cryptography/secp256k1/) 的群階）。第三方可以將 $s$ 替換為 $n-s$：

$$\text{if } (r, s) \text{ is valid} \Rightarrow (r, n-s) \text{ is also valid}$$

這不需要知道私鑰，任何觀察到交易的網路節點都可以做到。

#### 4. OP_CHECKMULTISIG Bug

`OP_CHECKMULTISIG` 有一個歷史 bug，會從堆疊多彈出一個元素。這個虛擬元素的值可以被任意修改（通常是 `OP_0`，但可以是其他值），改變 scriptSig 而不影響驗證。

### 實際影響

#### 破壞交易鏈

假設 Alice 發送交易 A（txid: `abc123`），Bob 構建子交易 B 引用 A 的輸出：

```
交易 B 的 input: prevTxHash=abc123, vout=0
```

如果第三方將交易 A 的 txid 修改為 `def456`（透過延展性），且修改後的版本先被礦工打包：

```
鏈上實際：txid=def456（A 的修改版）
交易 B 引用的 abc123 不存在 => B 失效
```

#### Lightning Network 的前提

Lightning Network 需要在通道開啟前預簽承諾交易和懲罰交易，這些交易引用 funding 交易的 txid。如果 funding 交易的 txid 可以被修改，所有預簽交易都會失效，通道資金可能被鎖死。

#### Mt. Gox 事件

2014 年 Mt. Gox 交易所聲稱其提款系統被交易延展性攻擊影響：攻擊者修改提款交易的 txid，使得交易所的追蹤系統無法確認交易是否成功，導致重複提款。

### 解決方案的演進

#### BIP-62：嚴格 scriptSig 規則

BIP-62 提出了一系列標準化規則來限制 scriptSig 的格式：
- 禁止在 scriptSig 中使用不必要的操作碼
- 要求最小化的資料推入（使用最短的 push opcode）
- 要求 Low-S 簽名（$s \leq n/2$）

但 BIP-62 只解決了已知的延展性來源，無法保證未來不會出現新的變體，且需要所有交易都遵守規則才有效。最終被撤回，由 SegWit 取代。

#### BIP-66：嚴格 DER 簽名

BIP-66 於 2015 年啟用，要求所有簽名必須使用嚴格的 DER 編碼。這消除了 DER 編碼彈性造成的延展性，但未解決其他來源。

#### BIP-141（SegWit）：根本解決

SegWit 將簽名資料移至 witness 欄位，witness 不計入 txid 的計算：

$$\text{txid} = \text{SHA-256d}(\text{version} \| \text{inputs}_{\text{(no scriptSig)}} \| \text{outputs} \| \text{locktime})$$

SegWit 交易的 scriptSig 必須為空（對於原生 SegWit），所有簽名資料在 witness 中。修改 witness 只會改變 wtxid，不影響 txid。

```
Legacy:  txid 包含 scriptSig => 延展性
SegWit:  txid 不含 witness   => 不可延展
```

### 修復時間線

| 年份 | BIP | 修復內容 |
|------|-----|---------|
| 2014 | BIP-62 | 提案嚴格 scriptSig 規則（後撤回） |
| 2015 | BIP-66 | 嚴格 DER 編碼 |
| 2017 | BIP-141 | SegWit：根本解決，witness 分離 |

### 第三方延展性 vs 第一方延展性

| 類型 | 說明 | SegWit 是否修復 |
|------|------|----------------|
| 第三方延展性 | 任何人可修改 txid | 是 |
| 第一方延展性（簽名者） | 簽名者可以用不同 $k$ 重新簽名 | 部分（txid 不受影響，但可產生不同的 wtxid） |

## 程式碼範例

```javascript
// 展示 ECDSA (r, s) -> (r, n-s) 的延展性
const { ECPairFactory } = require('ecpair');
const ecc = require('tiny-secp256k1');
const ECPair = ECPairFactory(ecc);

// secp256k1 群階 n
const n = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');

function demonstrateSMalleability(derSignature) {
  // DER 解碼（簡化）
  // DER: 30 <len> 02 <r_len> <r> 02 <s_len> <s>
  let offset = 2; // skip 30 <len>
  offset += 1;    // skip 02
  const rLen = derSignature[offset++];
  const r = derSignature.subarray(offset, offset + rLen);
  offset += rLen;
  offset += 1;    // skip 02
  const sLen = derSignature[offset++];
  const s = derSignature.subarray(offset, offset + sLen);

  const sBigInt = BigInt('0x' + Buffer.from(s).toString('hex'));
  const sFlipped = n - sBigInt;

  const isLowS = sBigInt <= n / 2n;

  return {
    original_s: sBigInt.toString(16),
    flipped_s: sFlipped.toString(16),
    isLowS,
    // 兩個 s 值都能通過簽名驗證
    // 但 BIP-62/BIP-146 要求 low-S
  };
}

// SegWit 如何修復：txid 不含 witness
function compareIds(tx) {
  const bitcoin = require('bitcoinjs-lib');
  const parsed = bitcoin.Transaction.fromHex(tx);

  // txid: 從 legacy serialization（不含 witness）計算
  const txid = parsed.getId();

  // wtxid: 從完整 serialization（含 witness）計算
  const wtxid = parsed.getHash(true).reverse().toString('hex');

  // 修改 witness 不影響 txid，只影響 wtxid
  return { txid, wtxid, hasWitness: parsed.hasWitnesses() };
}
```

```python
# 展示交易延展性的數學原理

# secp256k1 群階
n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141

def demonstrate_s_malleability(r: int, s: int) -> dict:
    """展示 ECDSA 簽名的 s 值延展性"""
    s_flipped = n - s

    is_original_low = s <= n // 2
    is_flipped_low = s_flipped <= n // 2

    return {
        "original": {"r": hex(r), "s": hex(s), "is_low_s": is_original_low},
        "flipped":  {"r": hex(r), "s": hex(s_flipped), "is_low_s": is_flipped_low},
        "both_valid": True,  # 兩個都是有效簽名
        "note": "BIP-62 要求使用 low-S 版本以減少延展性",
    }

# 範例
import secrets
r_example = secrets.randbelow(n)
s_example = secrets.randbelow(n // 2) + n // 2 + 1  # 故意用 high-S

result = demonstrate_s_malleability(r_example, s_example)
print(f"Original s (high): {result['original']['s'][:20]}...")
print(f"Flipped s (low):   {result['flipped']['s'][:20]}...")
print(f"Original is low-S: {result['original']['is_low_s']}")
print(f"Flipped is low-S:  {result['flipped']['is_low_s']}")

def demonstrate_scriptsig_malleability():
    """展示 scriptSig 的延展性"""
    # 原始 scriptSig: <sig> <pubkey>
    sig = bytes.fromhex('30' + '44' + '02' + '20' + 'aa' * 32 + '02' + '20' + 'bb' * 32)
    pubkey = bytes.fromhex('02' + 'cc' * 32)

    original_scriptsig = bytes([len(sig)]) + sig + bytes([len(pubkey)]) + pubkey

    # 修改版：OP_0 OP_DROP <sig> <pubkey>
    OP_0 = b'\x00'
    OP_DROP = b'\x75'
    modified_scriptsig = OP_0 + OP_DROP + original_scriptsig

    print(f"Original scriptSig: {len(original_scriptsig)} bytes")
    print(f"Modified scriptSig: {len(modified_scriptsig)} bytes")
    print(f"Same execution result, different txid")

demonstrate_scriptsig_malleability()
```

## 相關概念

- [SegWit Serialization](/bitcoin/transactions/segwit-serialization/) - SegWit 的序列化格式如何分離 witness
- [Witness Data](/bitcoin/data-structures/witness-data/) - 從 txid 中分離出的見證資料
- [Lightning Network](/bitcoin/advanced/lightning-network/) - 交易延展性修復使 Lightning 成為可能
- [ECDSA](/fundamentals/cryptography/ecdsa/) - (r, s) 對稱性是延展性來源之一
- [secp256k1](/fundamentals/cryptography/secp256k1/) - 群階 $n$ 與 low-S 正規化
- [Digital Signature Overview](/fundamentals/cryptography/digital-signature-overview/) - 簽名的基本概念
- [P2WPKH/P2WSH](/bitcoin/transactions/p2wpkh-p2wsh/) - SegWit 原生輸出不受延展性影響
- [Transaction Signing](/bitcoin/transactions/transaction-signing-btc/) - 簽名流程與 sighash
- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - scriptSig 修改是延展性來源
- [Transaction Lifecycle](/bitcoin/transactions/transaction-lifecycle-btc/) - 延展性影響的交易流程
