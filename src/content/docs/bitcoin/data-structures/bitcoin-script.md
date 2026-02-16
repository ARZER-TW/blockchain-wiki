---
title: "Bitcoin Script"
description: "Bitcoin Script: stack-based Forth-like language, scriptPubKey/scriptSig execution model, standard transaction templates, evolution from bare to Tapscript"
tags: [bitcoin, data-structure, script, scriptpubkey, scriptsig, stack-machine, non-turing-complete]
---

# Bitcoin Script

## 概述

Bitcoin Script 是 Bitcoin 交易中定義花費條件的腳本語言。它是一個基於堆疊（stack-based）的、類似 Forth 的非圖靈完備語言。每個 UTXO 由一個 scriptPubKey（鎖定腳本）保護，花費者必須提供一個 scriptSig（解鎖腳本）或 witness data 來滿足條件。

Bitcoin Script 的非圖靈完備性是刻意的設計選擇：沒有迴圈指令，每個腳本的執行時間可以被預測，避免了無限循環（halting problem），不需要像 Ethereum 的 gas 機制來限制執行。

## 核心原理

### 堆疊機器模型

Script 使用兩個堆疊：
- **Main stack**：主要的運算堆疊
- **Alt stack**：輔助堆疊（用 OP_TOALTSTACK / OP_FROMALTSTACK 操作）

資料從左到右推入堆疊，opcode 從堆疊取出運算元並推回結果。

### 執行模型

Legacy 交易的驗證分為兩階段：

1. **執行 scriptSig**：將解鎖資料推入堆疊
2. **執行 scriptPubKey**：使用堆疊上的資料進行驗證
3. 如果最終堆疊頂端為非零值（truthy），驗證通過

$$\text{Validate}: \quad \text{Execute}(\text{scriptSig}) \to \text{stack} \to \text{Execute}(\text{scriptPubKey}) \to \text{true/false}$$

注意：歷史上 scriptSig 和 scriptPubKey 是拼接後一起執行的。後來因安全原因改為分開執行，但共用堆疊。

### 腳本大小限制

| 限制 | 值 |
|------|-----|
| 最大腳本大小 | 10,000 bytes |
| 最大堆疊元素大小 | 520 bytes |
| 最大堆疊深度 | 1,000 |
| 最大 opcode 數量 | 201（非 push opcode） |
| 最大 multisig keys | 20 |

Tapscript 放寬了部分限制（見下方演進章節）。

## 標準交易模板

### P2PKH (Pay-to-Public-Key-Hash)

最經典的交易類型，鎖定到公鑰的 HASH-160：

```
scriptPubKey: OP_DUP OP_HASH160 <pubkey_hash> OP_EQUALVERIFY OP_CHECKSIG
scriptSig:    <signature> <pubkey>
```

執行流程：
1. `<sig> <pubkey>` 推入堆疊
2. `OP_DUP`：複製 `<pubkey>`
3. `OP_HASH160`：計算 HASH-160
4. `<pubkey_hash>`：推入期望的 hash
5. `OP_EQUALVERIFY`：比較兩個 hash
6. `OP_CHECKSIG`：驗證簽名

### P2SH (Pay-to-Script-Hash)

BIP-16 引入的腳本雜湊模式，允許複雜的花費條件：

```
scriptPubKey: OP_HASH160 <script_hash> OP_EQUAL
scriptSig:    <data...> <redeem_script>
```

驗證流程：
1. 驗證 `HASH-160(redeem_script) == script_hash`
2. 反序列化 redeem_script
3. 以 scriptSig 中的其他資料作為 input，執行 redeem_script

### P2WPKH (Pay-to-Witness-Public-Key-Hash)

Native SegWit 版本的 P2PKH：

```
scriptPubKey: OP_0 <20-byte pubkey_hash>
witness:      <signature> <pubkey>
```

### P2WSH (Pay-to-Witness-Script-Hash)

Native SegWit 版本的 P2SH：

```
scriptPubKey: OP_0 <32-byte script_hash>  (SHA-256, not HASH-160)
witness:      <data...> <witness_script>
```

### P2TR (Pay-to-Taproot)

BIP-341 Taproot 輸出：

```
scriptPubKey: OP_1 <32-byte x-only tweaked pubkey>
witness (key path):    <schnorr_signature>
witness (script path): <data...> <script> <control_block>
```

## 演進歷史

```
Bare Scripts (2009)
  -> P2PKH: 隱藏公鑰直到花費
  -> P2SH (2012, BIP-16): 隱藏複雜腳本
    -> P2SH-P2WPKH: SegWit 的向後相容包裝
    -> P2SH-P2WSH: SegWit 的向後相容包裝
  -> P2WPKH/P2WSH (2017, BIP-141): Native SegWit
    -> P2TR (2021, BIP-341/342): Taproot + Tapscript
```

每一代都提升了：
- **效率**：更小的 witness / weight
- **隱私**：隱藏未使用的花費路徑
- **功能**：更強大的腳本能力

### Tapscript 的改進

[Tapscript](/bitcoin/advanced/tapscript/) (BIP-342) 修改了 Script 在 Taproot 上下文中的行為：

- `OP_CHECKSIG` / `OP_CHECKSIGVERIFY` 使用 [Schnorr](/bitcoin/cryptography/schnorr-signatures/) 而非 ECDSA
- 新增 `OP_CHECKSIGADD` 替代 `OP_CHECKMULTISIG`
- 移除了 201 opcode 限制
- 移除了 520-byte 堆疊元素限制（witness 中）
- 未定義的 opcode 視為 `OP_SUCCESS`（forward compatibility）

## 程式碼範例

### Python

```python
def execute_p2pkh_conceptual(sig: bytes, pubkey: bytes, pubkey_hash: bytes) -> bool:
    """P2PKH 腳本的概念性執行"""
    import hashlib
    stack = []

    # scriptSig: <sig> <pubkey>
    stack.append(sig)
    stack.append(pubkey)

    # OP_DUP
    stack.append(stack[-1])

    # OP_HASH160
    top = stack.pop()
    h = hashlib.new('ripemd160', hashlib.sha256(top).digest()).digest()
    stack.append(h)

    # <pubkey_hash>
    stack.append(pubkey_hash)

    # OP_EQUALVERIFY
    a = stack.pop()
    b = stack.pop()
    if a != b:
        return False  # 驗證失敗

    # OP_CHECKSIG (簡化：假設簽名有效)
    _sig = stack.pop()
    _pk = stack.pop()
    signature_valid = True  # 實際需要 ECDSA/Schnorr 驗證
    stack.append(b'\x01' if signature_valid else b'\x00')

    return stack[-1] != b'\x00'

# 腳本解碼器
OPCODES = {
    0x00: 'OP_0', 0x51: 'OP_1', 0x52: 'OP_2', 0x53: 'OP_3',
    0x76: 'OP_DUP', 0xa9: 'OP_HASH160', 0x88: 'OP_EQUALVERIFY',
    0xac: 'OP_CHECKSIG', 0x87: 'OP_EQUAL', 0x6a: 'OP_RETURN',
    0xae: 'OP_CHECKMULTISIG', 0xba: 'OP_CHECKSIGADD',
    0xb1: 'OP_CHECKLOCKTIMEVERIFY', 0xb2: 'OP_CHECKSEQUENCEVERIFY',
}

def decode_script(raw: bytes) -> list[str]:
    """解碼 Bitcoin Script 為可讀格式"""
    result = []
    i = 0
    while i < len(raw):
        op = raw[i]
        if 0x01 <= op <= 0x4b:  # direct push
            data = raw[i + 1:i + 1 + op]
            result.append(f"<{data.hex()}>")
            i += 1 + op
        elif op in OPCODES:
            result.append(OPCODES[op])
            i += 1
        else:
            result.append(f"0x{op:02x}")
            i += 1
    return result

# P2PKH scriptPubKey 範例
p2pkh_script = bytes.fromhex("76a91489abcdefabbaabbaabbaabbaabbaabbaabbaabba88ac")
decoded = decode_script(p2pkh_script)
print("P2PKH scriptPubKey:", " ".join(decoded))

# P2SH scriptPubKey 範例
p2sh_script = bytes.fromhex("a914" + "bb" * 20 + "87")
print("P2SH scriptPubKey:", " ".join(decode_script(p2sh_script)))
```

### JavaScript

```javascript
// Bitcoin Script 類型識別
function identifyScriptType(scriptPubKey) {
  const hex = Buffer.from(scriptPubKey).toString('hex');

  // P2PKH: OP_DUP OP_HASH160 <20> <hash> OP_EQUALVERIFY OP_CHECKSIG
  if (hex.startsWith('76a914') && hex.endsWith('88ac') && hex.length === 50) {
    return { type: 'P2PKH', hash: hex.slice(6, 46) };
  }
  // P2SH: OP_HASH160 <20> <hash> OP_EQUAL
  if (hex.startsWith('a914') && hex.endsWith('87') && hex.length === 46) {
    return { type: 'P2SH', hash: hex.slice(4, 44) };
  }
  // P2WPKH: OP_0 <20> <hash>
  if (hex.startsWith('0014') && hex.length === 44) {
    return { type: 'P2WPKH', hash: hex.slice(4) };
  }
  // P2WSH: OP_0 <32> <hash>
  if (hex.startsWith('0020') && hex.length === 68) {
    return { type: 'P2WSH', hash: hex.slice(4) };
  }
  // P2TR: OP_1 <32> <key>
  if (hex.startsWith('5120') && hex.length === 68) {
    return { type: 'P2TR', key: hex.slice(4) };
  }
  return { type: 'UNKNOWN' };
}

// 測試
const scripts = [
  Buffer.from('76a914' + 'aa'.repeat(20) + '88ac', 'hex'),
  Buffer.from('a914' + 'bb'.repeat(20) + '87', 'hex'),
  Buffer.from('0014' + 'cc'.repeat(20), 'hex'),
  Buffer.from('0020' + 'dd'.repeat(32), 'hex'),
  Buffer.from('5120' + 'ee'.repeat(32), 'hex'),
];

scripts.forEach(s => {
  const info = identifyScriptType(s);
  console.log(`${info.type}: ${s.toString('hex').slice(0, 20)}...`);
});
```

## 相關概念

- [Script Opcodes](/bitcoin/data-structures/script-opcodes/) - 完整的 opcode 參考
- [P2PKH](/bitcoin/transactions/p2pkh/) - Pay-to-Public-Key-Hash 交易詳解
- [P2SH](/bitcoin/transactions/p2sh/) - Pay-to-Script-Hash 交易詳解
- [P2TR](/bitcoin/transactions/p2tr/) - Taproot 交易的 key path 和 script path
- [Tapscript](/bitcoin/advanced/tapscript/) - Taproot 上下文中的腳本語言改進
- [UTXO Model](/bitcoin/data-structures/utxo-model/) - scriptPubKey 鎖定的 UTXO 狀態模型
- [Witness Data](/bitcoin/data-structures/witness-data/) - SegWit witness 取代 scriptSig
- [Sighash Types](/bitcoin/cryptography/sighash-types/) - OP_CHECKSIG 使用的簽名雜湊
- [Covenants/OP_CAT](/bitcoin/advanced/covenants-opcat/) - 未來可能的 opcode 擴展
- [ECDSA](/fundamentals/cryptography/ecdsa/) - OP_CHECKSIG 驗證的簽名演算法
