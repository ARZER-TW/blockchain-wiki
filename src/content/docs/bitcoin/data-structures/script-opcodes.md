---
title: "Script Opcodes"
description: "Complete Bitcoin Script opcode reference: stack manipulation, arithmetic, crypto, flow control, disabled opcodes, OP_CHECKSIGADD (Tapscript)"
tags: [bitcoin, data-structure, opcode, script, tapscript, op-checksigadd]
---

# Script Opcodes

## 概述

Bitcoin Script 由一系列 opcode（操作碼）組成，每個 opcode 是一個 1-byte 的指令。Opcode 操作一個基於堆疊的虛擬機器：從堆疊取出運算元，執行運算，將結果推回堆疊。Bitcoin 定義了約 100 個有效 opcode，涵蓋資料推送、堆疊操作、算術、密碼學驗證、流程控制等功能。

[Tapscript](/bitcoin/advanced/tapscript/) (BIP-342) 引入了新的 opcode（如 `OP_CHECKSIGADD`）並修改了部分 opcode 的語義。

## 資料推送 Opcodes

| Opcode | 值 | 說明 |
|--------|-----|------|
| OP_0 (OP_FALSE) | 0x00 | 推入空 byte array（等同 false） |
| OP_PUSHDATA1 | 0x4c | 下一 byte 為長度 $L$，推入接下來 $L$ bytes |
| OP_PUSHDATA2 | 0x4d | 下兩 bytes 為長度（little-endian） |
| OP_PUSHDATA4 | 0x4e | 下四 bytes 為長度（little-endian） |
| OP_1NEGATE | 0x4f | 推入 -1 |
| OP_1 (OP_TRUE) | 0x51 | 推入 1 |
| OP_2 ~ OP_16 | 0x52~0x60 | 推入 2~16 |

直接推送（0x01~0x4b）：opcode 值本身就是要推入的 byte 數量。

## 堆疊操作 Opcodes

| Opcode | 值 | 堆疊效果 | 說明 |
|--------|-----|---------|------|
| OP_DUP | 0x76 | $x \to x\; x$ | 複製堆疊頂端 |
| OP_DROP | 0x75 | $x \to$ | 丟棄堆疊頂端 |
| OP_SWAP | 0x7c | $x_1\; x_2 \to x_2\; x_1$ | 交換頂端兩個元素 |
| OP_OVER | 0x78 | $x_1\; x_2 \to x_1\; x_2\; x_1$ | 複製第二個元素 |
| OP_ROT | 0x7b | $x_1\; x_2\; x_3 \to x_2\; x_3\; x_1$ | 旋轉頂端三個元素 |
| OP_2DUP | 0x6e | $x_1\; x_2 \to x_1\; x_2\; x_1\; x_2$ | 複製頂端兩個元素 |
| OP_NIP | 0x77 | $x_1\; x_2 \to x_2$ | 移除第二個元素 |
| OP_TUCK | 0x7d | $x_1\; x_2 \to x_2\; x_1\; x_2$ | 將頂端插入到第二位之前 |
| OP_PICK | 0x79 | $x_n\; \ldots\; x_0\; n \to x_n\; \ldots\; x_0\; x_n$ | 複製第 n 個元素 |
| OP_ROLL | 0x7a | $x_n\; \ldots\; x_0\; n \to \ldots\; x_0\; x_n$ | 移動第 n 個元素到頂端 |
| OP_DEPTH | 0x74 | $\to \text{size}$ | 推入堆疊深度 |
| OP_TOALTSTACK | 0x6b | main $\to$ alt | 移到 alt stack |
| OP_FROMALTSTACK | 0x6c | alt $\to$ main | 從 alt stack 移回 |

## 算術 Opcodes

算術 opcode 限制運算元為 4 bytes（32-bit 有號整數，但實際上以 script number encoding 儲存）。

| Opcode | 值 | 運算 |
|--------|-----|------|
| OP_ADD | 0x93 | $a + b$ |
| OP_SUB | 0x94 | $a - b$ |
| OP_1ADD | 0x8b | $a + 1$ |
| OP_1SUB | 0x8c | $a - 1$ |
| OP_NEGATE | 0x8f | $-a$ |
| OP_ABS | 0x90 | $|a|$ |
| OP_NOT | 0x91 | 若 $a = 0$ 則 $1$，否則 $0$ |
| OP_0NOTEQUAL | 0x92 | 若 $a \ne 0$ 則 $1$，否則 $0$ |
| OP_NUMEQUAL | 0x9c | $a == b$ |
| OP_NUMEQUALVERIFY | 0x9d | OP_NUMEQUAL + OP_VERIFY |
| OP_LESSTHAN | 0x9f | $a < b$ |
| OP_GREATERTHAN | 0xa0 | $a > b$ |
| OP_MIN | 0xa3 | $\min(a, b)$ |
| OP_MAX | 0xa4 | $\max(a, b)$ |
| OP_WITHIN | 0xa5 | $\min \le x < \max$ |

## 密碼學 Opcodes

| Opcode | 值 | 說明 |
|--------|-----|------|
| OP_RIPEMD160 | 0xa6 | RIPEMD-160 雜湊 |
| OP_SHA1 | 0xa7 | SHA-1 雜湊 |
| OP_SHA256 | 0xa8 | SHA-256 雜湊 |
| OP_HASH160 | 0xa9 | RIPEMD-160(SHA-256(x)) |
| OP_HASH256 | 0xaa | SHA-256d（double SHA-256） |
| OP_CHECKSIG | 0xac | 驗證 ECDSA/Schnorr 簽名 |
| OP_CHECKSIGVERIFY | 0xad | OP_CHECKSIG + OP_VERIFY |
| OP_CHECKMULTISIG | 0xae | M-of-N 多簽驗證 |
| OP_CHECKMULTISIGVERIFY | 0xaf | OP_CHECKMULTISIG + OP_VERIFY |
| OP_CHECKSIGADD | 0xba | Tapscript 專用：累加簽名計數 |

### OP_CHECKSIG 詳解

在 legacy/SegWit 中：驗證 [ECDSA](/fundamentals/cryptography/ecdsa/) 簽名。
在 Tapscript 中：驗證 [Schnorr](/bitcoin/cryptography/schnorr-signatures/) 簽名。

簽名的最後一個 byte 是 [sighash type](/bitcoin/cryptography/sighash-types/)。

### OP_CHECKSIGADD（Tapscript 新增）

Tapscript 引入的 opcode，取代了效率低下的 OP_CHECKMULTISIG：

$$\text{OP\_CHECKSIGADD}: \quad \text{sig}\; n\; \text{pubkey} \to n + (\text{sig\_valid} \;?\; 1 : 0)$$

用於 k-of-n 多簽：

```
<sig_n> ... <sig_1>
<pk_1> OP_CHECKSIG
<pk_2> OP_CHECKSIGADD
...
<pk_n> OP_CHECKSIGADD
<k> OP_NUMEQUAL
```

優勢：不需要 OP_CHECKMULTISIG 的 dummy byte，且每個公鑰的驗證獨立，支援批次驗證。

## 流程控制 Opcodes

| Opcode | 值 | 說明 |
|--------|-----|------|
| OP_IF | 0x63 | 若頂端非零，執行後續 |
| OP_NOTIF | 0x64 | 若頂端為零，執行後續 |
| OP_ELSE | 0x67 | IF 的替代分支 |
| OP_ENDIF | 0x68 | 結束 IF 區塊 |
| OP_VERIFY | 0x69 | 若頂端為零，立即失敗 |
| OP_RETURN | 0x6a | 立即標記為不可花費 |

### 時間鎖 Opcodes

| Opcode | 值 | 說明 |
|--------|-----|------|
| OP_CHECKLOCKTIMEVERIFY (CLTV) | 0xb1 | 絕對時間鎖（BIP-65） |
| OP_CHECKSEQUENCEVERIFY (CSV) | 0xb2 | 相對時間鎖（BIP-112） |

## 已禁用的 Opcodes

以下 opcode 在 Bitcoin 的早期版本中被禁用，執行時立即導致腳本失敗：

| Opcode | 原功能 | 禁用原因 |
|--------|--------|---------|
| OP_CAT | 串接兩個字串 | 潛在的 DoS（記憶體爆炸） |
| OP_SUBSTR | 取子字串 | 安全風險 |
| OP_MUL | 乘法 | 潛在的 DoS |
| OP_DIV | 除法 | 潛在的 DoS |
| OP_MOD | 取模 | 潛在的 DoS |
| OP_LSHIFT | 左移 | 潛在的 DoS |
| OP_RSHIFT | 右移 | 潛在的 DoS |
| OP_AND / OP_OR / OP_XOR | 位元運算 | 安全審查不足 |

### OP_CAT 的復活討論

[OP_CAT](/bitcoin/advanced/covenants-opcat/) 是目前社群中討論最熱烈的 opcode 復活提案。在 Tapscript 中重新啟用 OP_CAT 可以實現 covenant（契約）、遞迴式驗證等進階功能。

## Tapscript OP_SUCCESS

在 Tapscript 中，未使用的 opcode（如 0x50, 0x62, 0x89-0x8a, 0x8d-0x8e, 0x95-0x99 等）被重新定義為 `OP_SUCCESS`：

- 遇到 OP_SUCCESS 時，腳本**立即成功**（無條件通過）
- 這是一個 forward compatibility 機制：未來軟分叉可以將 OP_SUCCESS 重新定義為有具體語義的 opcode
- 任何包含 OP_SUCCESS 的腳本目前等同於 `OP_TRUE`

## 程式碼範例

### Python

```python
OPCODES = {
    # Constants
    0x00: ('OP_0', 'push empty'),
    0x4f: ('OP_1NEGATE', 'push -1'),
    0x51: ('OP_1', 'push 1'),
    # Stack
    0x75: ('OP_DROP', 'drop top'),
    0x76: ('OP_DUP', 'duplicate top'),
    0x77: ('OP_NIP', 'remove second'),
    0x78: ('OP_OVER', 'copy second'),
    0x7c: ('OP_SWAP', 'swap top two'),
    # Crypto
    0xa6: ('OP_RIPEMD160', 'RIPEMD-160'),
    0xa8: ('OP_SHA256', 'SHA-256'),
    0xa9: ('OP_HASH160', 'HASH-160'),
    0xaa: ('OP_HASH256', 'SHA-256d'),
    0xac: ('OP_CHECKSIG', 'verify signature'),
    0xad: ('OP_CHECKSIGVERIFY', 'verify sig + abort'),
    0xae: ('OP_CHECKMULTISIG', 'M-of-N multisig'),
    0xba: ('OP_CHECKSIGADD', 'Tapscript sig accumulate'),
    # Flow
    0x63: ('OP_IF', 'conditional'),
    0x64: ('OP_NOTIF', 'negative conditional'),
    0x67: ('OP_ELSE', 'else branch'),
    0x68: ('OP_ENDIF', 'end conditional'),
    0x69: ('OP_VERIFY', 'abort if false'),
    0x6a: ('OP_RETURN', 'unspendable'),
    # Timelock
    0xb1: ('OP_CLTV', 'absolute timelock'),
    0xb2: ('OP_CSV', 'relative timelock'),
    # Arithmetic
    0x87: ('OP_EQUAL', 'equality check'),
    0x88: ('OP_EQUALVERIFY', 'equal + verify'),
    0x93: ('OP_ADD', 'addition'),
    0x94: ('OP_SUB', 'subtraction'),
}

def disassemble(script_hex: str) -> str:
    """反組譯 Bitcoin Script"""
    raw = bytes.fromhex(script_hex)
    parts = []
    i = 0
    while i < len(raw):
        op = raw[i]
        if 0x01 <= op <= 0x4b:
            data = raw[i + 1:i + 1 + op]
            parts.append(f"PUSH({op}) <{data.hex()}>")
            i += 1 + op
        elif op in OPCODES:
            name, _ = OPCODES[op]
            parts.append(name)
            i += 1
        else:
            parts.append(f"UNKNOWN(0x{op:02x})")
            i += 1
    return '\n'.join(parts)

# P2PKH
print("=== P2PKH ===")
print(disassemble("76a914" + "ab" * 20 + "88ac"))

# Tapscript k-of-n
print("\n=== Tapscript 2-of-3 ===")
print(disassemble(
    "20" + "aa" * 32 + "ac"  # <pk1> OP_CHECKSIG
    "20" + "bb" * 32 + "ba"  # <pk2> OP_CHECKSIGADD
    "20" + "cc" * 32 + "ba"  # <pk3> OP_CHECKSIGADD
    "52" + "9c"               # OP_2 OP_NUMEQUAL
))
```

### JavaScript

```javascript
function disassemble(scriptHex) {
  const raw = Buffer.from(scriptHex, 'hex');
  const ops = [];
  const OP_NAMES = {
    0x00: 'OP_0', 0x51: 'OP_1', 0x52: 'OP_2', 0x53: 'OP_3',
    0x75: 'OP_DROP', 0x76: 'OP_DUP', 0x7c: 'OP_SWAP',
    0x87: 'OP_EQUAL', 0x88: 'OP_EQUALVERIFY',
    0xa9: 'OP_HASH160', 0xac: 'OP_CHECKSIG',
    0xae: 'OP_CHECKMULTISIG', 0xba: 'OP_CHECKSIGADD',
    0x6a: 'OP_RETURN', 0x9c: 'OP_NUMEQUAL',
  };

  let i = 0;
  while (i < raw.length) {
    const op = raw[i];
    if (op >= 0x01 && op <= 0x4b) {
      ops.push(`<${raw.subarray(i + 1, i + 1 + op).toString('hex')}>`);
      i += 1 + op;
    } else {
      ops.push(OP_NAMES[op] || `0x${op.toString(16).padStart(2, '0')}`);
      i += 1;
    }
  }
  return ops;
}

// P2TR script path: 2-of-3 Tapscript multisig
const tapscript2of3 =
  '20' + 'aa'.repeat(32) + 'ac' +
  '20' + 'bb'.repeat(32) + 'ba' +
  '20' + 'cc'.repeat(32) + 'ba' +
  '52' + '9c';

console.log('Tapscript 2-of-3:');
console.log(disassemble(tapscript2of3).join(' '));
```

## 相關概念

- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - 腳本語言的整體架構
- [Tapscript](/bitcoin/advanced/tapscript/) - Taproot 上下文中的 opcode 改進
- [Covenants/OP_CAT](/bitcoin/advanced/covenants-opcat/) - OP_CAT 復活提案與 covenant
- [Schnorr Signatures](/bitcoin/cryptography/schnorr-signatures/) - Tapscript 中 OP_CHECKSIG 使用的簽名
- [ECDSA](/fundamentals/cryptography/ecdsa/) - Legacy OP_CHECKSIG 使用的簽名
- [Sighash Types](/bitcoin/cryptography/sighash-types/) - OP_CHECKSIG 的 sighash 機制
- [Bitcoin 雜湊函數](/bitcoin/cryptography/hash-functions-in-bitcoin/) - OP_HASH160/OP_SHA256 使用的雜湊函數
- [P2SH](/bitcoin/transactions/p2sh/) - 使用 OP_HASH160 + OP_EQUAL 的交易模板
- [Witness Data](/bitcoin/data-structures/witness-data/) - Tapscript 的 witness 結構
