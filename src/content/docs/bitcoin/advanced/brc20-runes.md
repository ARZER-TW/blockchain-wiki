---
title: "BRC-20 & Runes"
description: "Bitcoin 上的 fungible token 標準：BRC-20 的 JSON inscription 機制、Runes 的 UTXO 原生設計與 OP_RETURN 協議"
tags: [bitcoin, advanced, brc20, runes, fungible-tokens, ordinals, op-return]
---

# BRC-20 & Runes

## 概述

Bitcoin 區塊鏈原生並不支援 fungible token，但社群透過巧妙利用現有機制開發了多種 token 標準。BRC-20（2023 年 3 月）借用 [Ordinals/Inscriptions](/bitcoin/advanced/ordinals-inscriptions/) 將 JSON 格式的 token 操作刻印在鏈上；Runes（2024 年 4 月）由 Casey Rodarmor 設計，以 OP_RETURN 為載體，原生融入 [UTXO 模型](/bitcoin/data-structures/utxo-model/)。

這兩個協議代表了 Bitcoin token 設計的兩種根本不同的哲學：BRC-20 將 token 邏輯放在鏈外的 indexer 中，而 Runes 盡可能讓 token 狀態與 UTXO 綁定。

## BRC-20

### 運作機制

BRC-20 token 透過三種 JSON inscription 操作：

**部署（Deploy）：**
```json
{
  "p": "brc-20",
  "op": "deploy",
  "tick": "ordi",
  "max": "21000000",
  "lim": "1000"
}
```

**鑄造（Mint）：**
```json
{
  "p": "brc-20",
  "op": "mint",
  "tick": "ordi",
  "amt": "1000"
}
```

**轉移（Transfer）：**
```json
{
  "p": "brc-20",
  "op": "transfer",
  "tick": "ordi",
  "amt": "500"
}
```

### 轉移流程的三步問題

BRC-20 的轉移需要三筆鏈上交易：

1. **Inscribe transfer**：持有者刻印一個 transfer inscription
2. **Send inscription**：將包含 transfer inscription 的 UTXO 發送給收款方
3. **Indexer 確認**：鏈外 indexer 解析 inscription 並更新餘額

$$\text{cost}_{\text{transfer}} = 3 \times \text{tx\_fee} \gg \text{cost}_{\text{ERC-20 transfer}}$$

這三步流程不僅成本高昂，還造成了嚴重的 UTXO 膨脹問題。

### Indexer 依賴

BRC-20 的餘額和所有權完全由鏈外 indexer 追蹤。Bitcoin 節點本身不理解 BRC-20 語義。如果不同的 indexer 實作存在差異，可能導致餘額不一致。

## Runes Protocol

### 設計哲學

Runes 由 Casey Rodarmor（Ordinals 的創造者）設計，目標是解決 BRC-20 的核心問題：

1. **UTXO 原生**：token 餘額直接綁定到 UTXO，而非依賴 indexer 解析 inscription
2. **OP_RETURN 載體**：使用 OP_RETURN 輸出而非 witness 空間，不產生額外的 UTXO 垃圾
3. **單筆交易轉移**：不需要多步流程

### OP_RETURN 結構

Runes 的所有操作都編碼在 OP_RETURN 輸出中，前綴為 magic bytes `OP_RETURN OP_13`：

```
OP_RETURN
OP_13
<encoded_runestone>
```

Runestone 的編碼使用 varint 序列，包含 edicts（分配指令）和可選的 etching（部署資訊）。

### Etching（部署）

Etching 定義新的 Rune token：

| 欄位 | 說明 |
|------|------|
| rune | Token 名稱（A-Z，最少 13 字元隨時間遞減） |
| symbol | 顯示符號（Unicode 字元） |
| divisibility | 小數位數 |
| premine | 部署者預鑄數量 |
| terms | 公開鑄造的條件（cap, amount, heights） |
| turbo | 是否啟用未來的協議擴展 |

### Edicts（分配）

Edicts 指定 Rune token 在交易輸出中的分配方式：

$$\text{edict} = (\text{rune\_id}, \text{amount}, \text{output\_index})$$

多個 edicts 可以在單筆交易中分配不同的 Rune 到不同的輸出。未被 edict 分配的 Rune 餘額歸入 default output（或第一個非 OP_RETURN 輸出）。

### Cenotaph（銷毀）

如果 Runestone 的編碼無效或包含無法識別的 flag，該交易被視為 cenotaph，所有涉及的 Rune 餘額被銷毀。這個機制確保了向前相容性：舊版本軟體不會錯誤處理新版本的操作。

## BRC-20 vs Runes vs ERC-20

| 特徵 | BRC-20 | Runes | ERC-20 |
|------|--------|-------|--------|
| 區塊鏈 | Bitcoin | Bitcoin | Ethereum |
| 載體 | Inscription (witness) | OP_RETURN | Smart contract |
| 轉移交易數 | 3 | 1 | 1 |
| UTXO 影響 | 嚴重膨脹 | 最小影響 | N/A（account model）|
| 狀態追蹤 | 鏈外 indexer | UTXO-bound | EVM state |
| 可組合性 | 低 | 中 | 高（DeFi） |
| 智能合約互動 | 不可能 | 不可能 | 原生支援 |
| 部署成本 | 1 inscription tx | 1 etching tx | 1 contract deploy tx |
| Gas/Fee 效率 | 低（witness 空間） | 高（OP_RETURN） | 中（EVM 執行） |

### 區塊空間消耗比較

$$\text{BRC-20 transfer} \approx 3 \times 250 \text{ vbytes} = 750 \text{ vbytes}$$
$$\text{Runes transfer} \approx 200\text{-}300 \text{ vbytes}$$
$$\text{ERC-20 transfer} \approx 65{,}000 \text{ gas} \approx 21{,}000 + 44{,}000 \text{ gas}$$

## 程式碼範例

### JavaScript（BRC-20 Inscription 構建）

```javascript
function createBRC20Deploy(tick, max, limit) {
  const inscription = JSON.stringify({
    p: 'brc-20',
    op: 'deploy',
    tick,
    max: String(max),
    lim: String(limit),
  });
  return {
    contentType: 'text/plain;charset=utf-8',
    body: Buffer.from(inscription),
    size: Buffer.byteLength(inscription),
  };
}

function createBRC20Transfer(tick, amount) {
  const inscription = JSON.stringify({
    p: 'brc-20',
    op: 'transfer',
    tick,
    amt: String(amount),
  });
  return {
    contentType: 'text/plain;charset=utf-8',
    body: Buffer.from(inscription),
    size: Buffer.byteLength(inscription),
  };
}

// Runes edict 編碼（簡化版）
function encodeVarint(value) {
  const bytes = [];
  let n = BigInt(value);
  while (n > 0x7fn) {
    bytes.push(Number(n & 0x7fn) | 0x80);
    n >>= 7n;
  }
  bytes.push(Number(n));
  return Buffer.from(bytes);
}

function encodeEdict(runeId, amount, outputIndex) {
  return Buffer.concat([
    encodeVarint(runeId),
    encodeVarint(amount),
    encodeVarint(outputIndex),
  ]);
}

const deploy = createBRC20Deploy('ordi', 21_000_000, 1000);
console.log('BRC-20 deploy inscription:', deploy.body.toString());
console.log('Size:', deploy.size, 'bytes');

const edict = encodeEdict(1n, 1000n, 0n);
console.log('Runes edict encoded:', edict.toString('hex'));
```

### Python（Runes Runestone 解碼）

```python
from dataclasses import dataclass
from typing import Optional

@dataclass
class Edict:
    rune_id: int
    amount: int
    output: int

@dataclass
class Etching:
    rune: Optional[str]
    symbol: Optional[str]
    divisibility: int
    premine: int

def decode_varint(data: bytes, offset: int = 0) -> tuple:
    """解碼 LEB128 varint"""
    result = 0
    shift = 0
    while offset < len(data):
        byte = data[offset]
        result |= (byte & 0x7F) << shift
        offset += 1
        if byte & 0x80 == 0:
            break
        shift += 7
    return result, offset

def decode_rune_name(value: int) -> str:
    """Rune 名稱從數字解碼為 A-Z 字串"""
    if value == 0:
        return 'A'
    name = []
    v = value
    while v > 0:
        v -= 1
        name.append(chr(ord('A') + (v % 26)))
        v //= 26
    return ''.join(reversed(name))

# 模擬 Runestone 解碼
def parse_runestone(op_return_data: bytes) -> dict:
    """解析 OP_RETURN 中的 Runestone（簡化版）"""
    result = {'edicts': [], 'etching': None}

    offset = 0
    while offset < len(op_return_data):
        tag, offset = decode_varint(op_return_data, offset)
        value, offset = decode_varint(op_return_data, offset)

        if tag == 0:  # Edict
            amount, offset = decode_varint(op_return_data, offset)
            output, offset = decode_varint(op_return_data, offset)
            result['edicts'].append(Edict(value, amount, output))
        elif tag == 2:  # Rune name
            result['rune_name'] = decode_rune_name(value)

    return result

# 測試 Rune 名稱編碼
for name_val in [0, 1, 25, 26, 702]:
    print(f"Value {name_val:>5} -> Rune name: {decode_rune_name(name_val)}")
```

## 相關概念

- [Ordinals & Inscriptions](/bitcoin/advanced/ordinals-inscriptions/) - BRC-20 的底層 inscription 機制
- [UTXO Model](/bitcoin/data-structures/utxo-model/) - Runes 的 UTXO-native 設計基礎
- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - OP_RETURN 操作碼
- [P2TR](/bitcoin/transactions/p2tr/) - BRC-20 inscription 使用的 Taproot 交易
- [Witness Data](/bitcoin/data-structures/witness-data/) - BRC-20 inscription 儲存的 witness 空間
- [Tapscript](/bitcoin/advanced/tapscript/) - inscription envelope 的腳本環境
- [Transaction Lifecycle BTC](/bitcoin/transactions/transaction-lifecycle-btc/) - token 交易的鏈上流程
- [SHA-256d](/bitcoin/cryptography/sha-256d/) - 交易 ID 計算
- [Merkle Tree](/fundamentals/data-structures/merkle-tree/) - 區塊中 token 交易的組織結構
- [ECDSA](/fundamentals/cryptography/ecdsa/) - token 交易的簽名驗證
