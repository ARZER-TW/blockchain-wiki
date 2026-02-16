---
title: "Sighash Types（簽名雜湊類型）"
description: "Bitcoin sighash types: SIGHASH_ALL, NONE, SINGLE, ANYONECANPAY modifier, BIP-341 Taproot sighash changes, security implications"
tags: [bitcoin, cryptography, sighash, transaction-signing, taproot, bip-341]
---

# Sighash Types

## 概述

Sighash type 是 Bitcoin 交易簽名中的一個旗標（flag），控制簽名涵蓋交易的哪些部分。不同的 sighash type 讓簽名者可以精確選擇「我承諾的範圍」，從而實現部分簽名、開放式交易等進階功能。

每個簽名都附帶一個 1-byte 的 sighash flag，決定交易在被雜湊（用於簽名）之前如何序列化。

## 基礎 Sighash Types

### SIGHASH_ALL (0x01)

**預設且最常用的類型**。簽名涵蓋所有 inputs 和所有 outputs：

$$\text{signed\_data} = \text{all inputs} + \text{all outputs}$$

- 承諾了完整的交易結構
- 簽名後，任何對 inputs 或 outputs 的修改都會使簽名無效
- 適用於：標準支付交易

### SIGHASH_NONE (0x02)

簽名僅涵蓋所有 inputs，但**不涵蓋任何 output**：

$$\text{signed\_data} = \text{all inputs} + \emptyset$$

- 簽名者承諾了花費來源，但不關心資金去向
- 其他人可以自由添加或修改 outputs
- 適用於：「我授權花費這些 UTXO，但目的地隨便」
- 風險：任何能看到這個簽名的人都可以把資金導向自己

### SIGHASH_SINGLE (0x03)

簽名涵蓋所有 inputs 和**與當前 input 同索引的那個 output**：

$$\text{signed\_data} = \text{all inputs} + \text{output}[i]$$

其中 $i$ 是當前 input 的索引。

- 承諾了「我的這份 input 對應這份特定 output」
- 其他 outputs 可以被修改或添加
- 適用於：部分交易構建、交換協議

**邊界條件：** 若 input 索引 $i$ 超出 outputs 的數量，Bitcoin 會簽署一個固定的 hash（歷史 bug，已被保留為共識規則）：

$$\text{hash} = \texttt{0000...0001}$$

## ANYONECANPAY 修飾符 (0x80)

ANYONECANPAY 是一個 flag bit，可以與上述三種基礎類型組合：

$$\text{sighash\_flag} = \text{base\_type} \;|\; \texttt{0x80}$$

當設置 ANYONECANPAY 時，簽名**僅涵蓋當前這個 input**（而非所有 inputs）。

### 所有組合

| Flag | 值 | 涵蓋 Inputs | 涵蓋 Outputs | 用途 |
|------|-----|-----------|------------|------|
| ALL | 0x01 | 全部 | 全部 | 標準交易 |
| NONE | 0x02 | 全部 | 無 | 授權花費，目的地開放 |
| SINGLE | 0x03 | 全部 | 同索引的一個 | 部分承諾 |
| ALL\|ACP | 0x81 | 僅自己 | 全部 | 眾籌：固定目的地，input 可追加 |
| NONE\|ACP | 0x82 | 僅自己 | 無 | 完全開放的授權 |
| SINGLE\|ACP | 0x83 | 僅自己 | 同索引的一個 | 原子交換、部分簽名 |

### 典型使用案例

**ALL|ANYONECANPAY (0x81) — 眾籌模式**

創建一個有固定 output（如「目標地址收到 10 BTC」）的交易，任何人都可以追加 input 來貢獻資金：

```
Outputs: [10 BTC -> fundraiser_address]  (已鎖定)
Inputs:  [Alice: 2 BTC] + [Bob: 3 BTC] + [anyone can add more...]
```

**SINGLE|ANYONECANPAY (0x83) — 原子交換**

每方只簽自己的 input 和對應的 output：

```
Input 0 (Alice): 1 BTC   -> Output 0: 100 TOKEN to Alice
Input 1 (Bob):   100 TOKEN -> Output 1: 1 BTC to Bob
```

## BIP-341 Taproot Sighash 改進

Taproot（BIP-341）對 sighash 計算進行了重大改進：

### 新的 Sighash 計算

Taproot 使用 [tagged hash](/bitcoin/cryptography/hash-functions-in-bitcoin/)：

$$\text{sighash} = \text{TaggedHash}(\text{"TapSighash"}, \text{epoch} \| \text{sighash\_type} \| \text{tx\_data})$$

### 新增 SIGHASH_DEFAULT (0x00)

Taproot 引入了 `SIGHASH_DEFAULT`（值為 0x00），行為等同於 `SIGHASH_ALL`，但在簽名中不附加 sighash byte，因此 [Schnorr 簽名](/bitcoin/cryptography/schnorr-signatures/) 保持固定 64 bytes（而非 65 bytes）。

### 承諾更多資料

Taproot sighash 比 legacy sighash 承諾更多資訊：

| 新增承諾項目 | 說明 |
|------------|------|
| 所有 input 金額 | 防止 fee 操縱攻擊 |
| 所有 input 的 scriptPubKey | 明確簽名範圍 |
| Spend type | 區分 key path 和 script path |
| annex（若存在） | 未來擴展預留 |
| Script path 專屬資料 | leaf hash、key version、codeseparator position |

### 安全性改進

Legacy sighash 的已知問題：
- 簽名不涵蓋 input 金額 -> 硬體錢包無法驗證手續費
- 二次雜湊問題（quadratic hashing）：某些 sighash 類型導致 $O(n^2)$ 的雜湊計算

Taproot 透過預計算共用部分解決了二次雜湊問題，並在 sighash 中包含所有 input 金額。

## 程式碼範例

### Python

```python
import hashlib

SIGHASH_ALL          = 0x01
SIGHASH_NONE         = 0x02
SIGHASH_SINGLE       = 0x03
SIGHASH_ANYONECANPAY = 0x80
SIGHASH_DEFAULT      = 0x00  # Taproot only

def describe_sighash(flag: int) -> dict:
    """解析 sighash flag"""
    anyonecanpay = bool(flag & SIGHASH_ANYONECANPAY)
    base_type = flag & 0x1f

    type_names = {
        0x00: "DEFAULT (Taproot)",
        0x01: "ALL",
        0x02: "NONE",
        0x03: "SINGLE",
    }

    base_name = type_names.get(base_type, f"UNKNOWN(0x{base_type:02x})")
    if anyonecanpay:
        base_name += "|ANYONECANPAY"

    inputs_covered = "current only" if anyonecanpay else "all"
    if base_type in (0x00, 0x01):
        outputs_covered = "all"
    elif base_type == 0x02:
        outputs_covered = "none"
    elif base_type == 0x03:
        outputs_covered = "same index only"
    else:
        outputs_covered = "unknown"

    return {
        "flag": f"0x{flag:02x}",
        "name": base_name,
        "inputs": inputs_covered,
        "outputs": outputs_covered,
    }

# 所有組合
for flag in [0x01, 0x02, 0x03, 0x81, 0x82, 0x83, 0x00]:
    info = describe_sighash(flag)
    print(f"{info['flag']} {info['name']:30s} inputs={info['inputs']:15s} outputs={info['outputs']}")

# Taproot tagged sighash（概念性）
def tagged_hash(tag: str, data: bytes) -> bytes:
    tag_h = hashlib.sha256(tag.encode()).digest()
    return hashlib.sha256(tag_h + tag_h + data).digest()

# 模擬 Taproot sighash 計算
epoch = b'\x00'
sighash_type = bytes([SIGHASH_DEFAULT])
tx_data = b'simulated_transaction_data'
tap_sighash = tagged_hash("TapSighash", epoch + sighash_type + tx_data)
print(f"\nTaproot sighash: {tap_sighash.hex()}")
```

### JavaScript

```javascript
const SIGHASH = {
  DEFAULT: 0x00,       // Taproot only
  ALL: 0x01,
  NONE: 0x02,
  SINGLE: 0x03,
  ANYONECANPAY: 0x80,
};

function describeSighash(flag) {
  const acp = (flag & SIGHASH.ANYONECANPAY) !== 0;
  const base = flag & 0x1f;

  const names = { 0: 'DEFAULT', 1: 'ALL', 2: 'NONE', 3: 'SINGLE' };
  let name = names[base] || 'UNKNOWN';
  if (acp) name += '|ANYONECANPAY';

  return {
    flag: `0x${flag.toString(16).padStart(2, '0')}`,
    name,
    inputs: acp ? 'current only' : 'all',
    outputs: base <= 1 ? 'all' : base === 2 ? 'none' : 'same index',
  };
}

// 列出所有有效組合
[0x00, 0x01, 0x02, 0x03, 0x81, 0x82, 0x83].forEach(flag => {
  const info = describeSighash(flag);
  console.log(`${info.flag} ${info.name.padEnd(30)} inputs=${info.inputs.padEnd(15)} outputs=${info.outputs}`);
});
```

## 相關概念

- [Transaction Signing (BTC)](/bitcoin/transactions/transaction-signing-btc/) - 簽名流程中 sighash 的計算位置
- [Schnorr Signatures](/bitcoin/cryptography/schnorr-signatures/) - Taproot 使用的簽名演算法
- [Taproot Key Tweaking](/bitcoin/cryptography/taproot-key-tweaking/) - Key path 和 script path 的 sighash 差異
- [Bitcoin 雜湊函數](/bitcoin/cryptography/hash-functions-in-bitcoin/) - Tagged hash 在 sighash 中的應用
- [ECDSA](/fundamentals/cryptography/ecdsa/) - Legacy 交易使用的簽名演算法
- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - OP_CHECKSIG 驗證 sighash
- [Script Opcodes](/bitcoin/data-structures/script-opcodes/) - OP_CHECKSIGADD 的 sighash 行為
- [Transaction Malleability](/bitcoin/transactions/transaction-malleability/) - sighash 設計與交易可塑性的關係
- [UTXO Model](/bitcoin/data-structures/utxo-model/) - Input/output 模型與 sighash 的對應
