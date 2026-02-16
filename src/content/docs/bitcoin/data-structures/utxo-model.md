---
title: "UTXO 模型"
description: "Bitcoin UTXO model: unspent transaction outputs as state, input/output references, coin selection algorithms, comparison with Ethereum account model"
tags: [bitcoin, data-structure, utxo, state-model, coin-selection, parallelism]
---

# UTXO 模型

## 概述

UTXO（Unspent Transaction Output）是 Bitcoin 的狀態模型。與 Ethereum 的帳戶模型不同，Bitcoin 不追蹤「帳戶餘額」，而是追蹤「尚未被花費的交易輸出」的集合。一個 UTXO 就是一筆過去交易中產生的輸出，它帶有一定金額和一個鎖定腳本（scriptPubKey），定義了花費條件。

Bitcoin 的「餘額」是一個推導值：錢包掃描整個 UTXO set，篩選出屬於自己的 UTXO，加總金額。

## 核心原理

### UTXO 的定義

一個 UTXO 由以下欄位定義：

- **txid**：產生該 output 的交易 hash（32 bytes）
- **vout**：該交易中的 output 索引（4 bytes）
- **value**：金額（以 satoshi 為單位，8 bytes）
- **scriptPubKey**：鎖定腳本，定義花費條件

一個 UTXO 的唯一識別碼是 `(txid, vout)` 這個二元組，稱為 **outpoint**。

### 交易結構

每筆 Bitcoin 交易消耗一組 UTXO（inputs）並產生新的 UTXO（outputs）：

$$\sum \text{input\_values} = \sum \text{output\_values} + \text{fee}$$

- **Input**：引用一個 outpoint `(txid, vout)` 並提供解鎖腳本（scriptSig 或 witness）
- **Output**：指定金額和新的鎖定腳本

交易完成後，被引用的 UTXO 從 UTXO set 中移除，新產生的 output 加入 UTXO set。

### UTXO Set 作為全域狀態

UTXO set 是 Bitcoin 在任何時刻的完整狀態。它的大小直接影響節點的記憶體需求：

- 截至 2024 年初，UTXO set 約有 ~80M 個 UTXO
- 佔用約 4-7 GB 記憶體（使用 LevelDB 儲存）
- Bitcoin Core 使用 `chainstate` 資料庫快取 UTXO set

### 不可分割性

一個 UTXO 必須被完整花費。如果你有一個 1 BTC 的 UTXO 但只想花 0.3 BTC，你必須：

1. 花費整個 1 BTC UTXO（input）
2. 產生 0.3 BTC 給收款方（output 1）
3. 產生 ~0.6999 BTC 的找零回到自己的地址（output 2）
4. 剩餘的成為手續費

## 與 Ethereum 帳戶模型的比較

| 特性 | Bitcoin UTXO | [Ethereum Account](/ethereum/data-structures/state-trie/) |
|------|-------------|-------------|
| 狀態表示 | UTXO 集合 | 帳戶餘額 + nonce + storage |
| 「餘額」 | 推導值（加總所有 UTXO） | 直接儲存 |
| 交易模型 | 消耗 inputs、產生 outputs | 從帳戶扣款、加到另一帳戶 |
| 隱私性 | 較高（每次可用新地址） | 較低（帳戶地址固定） |
| 平行化 | 天然支援（UTXO 獨立） | 需要 nonce 排序 |
| 智能合約 | 有限（[Bitcoin Script](/bitcoin/data-structures/bitcoin-script/)） | 圖靈完備（EVM） |
| 狀態大小 | UTXO set ~4-7 GB | State trie ~100+ GB |
| 找零 | 需要明確的找零 output | 自動更新餘額 |

### 平行化優勢

UTXO 模型的一個重要優勢是天然的平行化能力：

- 每個 UTXO 是獨立的，花費一個 UTXO 不影響其他 UTXO
- 多筆交易可以同時驗證，只要它們不引用相同的 UTXO
- 在 Ethereum 中，同一帳戶的交易必須按 nonce 順序執行

這使得 UTXO 模型在高吞吐量場景下有潛在的擴展優勢。

## Coin Selection 演算法

當錢包需要構建交易時，必須從可用的 UTXO 中選擇一組 inputs，使其總額大於等於目標金額。這就是 coin selection 問題。

### Branch and Bound（BnB）

Bitcoin Core 的主要 coin selection 演算法，嘗試找到一組 UTXO 使得：

$$\sum \text{selected\_values} = \text{target} + \text{fee}$$

- 目標是「剛好匹配」（changeless transaction），避免產生找零 output
- 使用深度優先搜索，帶有剪枝
- 若找不到精確匹配，回退到 Knapsack

### Knapsack（背包算法）

傳統的 coin selection 方案：

1. 嘗試 1000 次隨機選擇
2. 每次隨機決定是否包含每個 UTXO
3. 選擇超額最小的組合
4. 若沒有足夠的組合，嘗試包含最大的 UTXO

### Single Random Draw

最簡單的方案：隨機打亂 UTXO，依序累加直到超過目標金額。

### 選擇策略的考量

| 因素 | 說明 |
|------|------|
| 手續費最小化 | 更少的 inputs = 更小的交易 = 更低的手續費 |
| 隱私保護 | 避免將多個地址的 UTXO 合併（暴露關聯性） |
| Dust 避免 | 避免產生過小的找零（低於 dust threshold） |
| 未來手續費 | UTXO 整合在低手續費時進行更划算 |

## 程式碼範例

### Python

```python
from dataclasses import dataclass
from typing import Optional

@dataclass(frozen=True)
class UTXO:
    txid: str
    vout: int
    value: int      # satoshi
    script_pubkey: str

@dataclass(frozen=True)
class TxInput:
    txid: str
    vout: int

@dataclass(frozen=True)
class TxOutput:
    value: int
    script_pubkey: str

def coin_select_bnb(
    utxos: list[UTXO],
    target: int,
    fee_per_input: int = 148 * 10,  # ~148 vbytes * 10 sat/vbyte
    fee_per_output: int = 34 * 10,
) -> Optional[list[UTXO]]:
    """Branch and Bound coin selection（簡化版）"""
    sorted_utxos = sorted(utxos, key=lambda u: u.value, reverse=True)
    cost_of_change = fee_per_output  # 找零 output 的成本
    best = None

    def search(idx: int, selected: list, current_sum: int):
        nonlocal best
        effective_target = target + len(selected) * fee_per_input
        if current_sum == effective_target:
            best = selected[:]
            return True
        if current_sum > effective_target + cost_of_change:
            return False  # 超額太多
        if idx >= len(sorted_utxos):
            return False
        # 剪枝：即使選了剩下所有也不夠
        remaining = sum(u.value for u in sorted_utxos[idx:])
        if current_sum + remaining < effective_target:
            return False
        # 包含當前 UTXO
        selected.append(sorted_utxos[idx])
        if search(idx + 1, selected, current_sum + sorted_utxos[idx].value):
            return True
        selected.pop()
        # 不包含
        return search(idx + 1, selected, current_sum)

    search(0, [], 0)
    return best

# 範例
utxos = [
    UTXO("aabb" * 8, 0, 50_000, "76a914...88ac"),
    UTXO("ccdd" * 8, 1, 30_000, "76a914...88ac"),
    UTXO("eeff" * 8, 0, 20_000, "76a914...88ac"),
    UTXO("1122" * 8, 2, 80_000, "76a914...88ac"),
]

target = 45_000  # 想花 45,000 satoshi
selected = coin_select_bnb(utxos, target)
if selected:
    total = sum(u.value for u in selected)
    print(f"Selected {len(selected)} UTXOs, total: {total} sat")
    for u in selected:
        print(f"  ({u.txid[:8]}..., {u.vout}) = {u.value} sat")
else:
    print("No exact match found, would fall back to Knapsack")
```

### JavaScript

```javascript
// UTXO set 管理
class UTXOSet {
  constructor() {
    this.utxos = new Map(); // key: "txid:vout"
  }

  add(txid, vout, value, scriptPubKey) {
    const key = `${txid}:${vout}`;
    this.utxos.set(key, Object.freeze({ txid, vout, value, scriptPubKey }));
  }

  spend(txid, vout) {
    const key = `${txid}:${vout}`;
    if (!this.utxos.has(key)) throw new Error(`UTXO not found: ${key}`);
    this.utxos.delete(key);
  }

  getBalance(scriptPubKey) {
    let total = 0;
    for (const utxo of this.utxos.values()) {
      if (utxo.scriptPubKey === scriptPubKey) {
        total += utxo.value;
      }
    }
    return total;
  }

  getUTXOs(scriptPubKey) {
    return [...this.utxos.values()]
      .filter(u => u.scriptPubKey === scriptPubKey);
  }

  get size() { return this.utxos.size; }
}

// 使用範例
const utxoSet = new UTXOSet();
utxoSet.add('aabb'.repeat(8), 0, 100_000, 'script_alice');
utxoSet.add('ccdd'.repeat(8), 1, 50_000, 'script_alice');
utxoSet.add('eeff'.repeat(8), 0, 75_000, 'script_bob');

console.log(`UTXO set size: ${utxoSet.size}`);
console.log(`Alice balance: ${utxoSet.getBalance('script_alice')} sat`);

// 模擬花費
utxoSet.spend('aabb'.repeat(8), 0);
utxoSet.add('ff00'.repeat(8), 0, 60_000, 'script_bob');   // Bob 收到
utxoSet.add('ff00'.repeat(8), 1, 39_500, 'script_alice'); // Alice 找零

console.log(`Alice balance after spend: ${utxoSet.getBalance('script_alice')} sat`);
```

## 相關概念

- [State Trie (ETH)](/ethereum/data-structures/state-trie/) - Ethereum 帳戶模型的狀態儲存
- [UTXO Selection](/bitcoin/transactions/utxo-selection/) - 進階 coin selection 策略
- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - UTXO 的鎖定與解鎖機制
- [Bitcoin Block Structure](/bitcoin/data-structures/bitcoin-block-structure/) - 交易在區塊中的組織方式
- [Serialization Formats](/bitcoin/data-structures/serialization-formats/) - 交易序列化格式
- [Witness Data](/bitcoin/data-structures/witness-data/) - SegWit 對 UTXO 花費的影響
- [Sighash Types](/bitcoin/cryptography/sighash-types/) - 簽名涵蓋哪些 inputs/outputs
- [P2PKH](/bitcoin/transactions/p2pkh/) - 最基本的 UTXO 花費方式
- [Transaction Malleability](/bitcoin/transactions/transaction-malleability/) - UTXO 引用的 txid 可塑性問題
