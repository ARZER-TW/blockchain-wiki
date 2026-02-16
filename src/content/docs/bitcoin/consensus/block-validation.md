---
title: "Block Validation"
description: "Block Validation, 區塊驗證, consensus rules, IBD, assumevalid"
tags: [bitcoin, consensus, validation, utxo, ibd, script]
---

# Block Validation

## 概述

Block validation（區塊驗證）是 Bitcoin 全節點確保每個區塊符合共識規則的核心流程。全節點獨立驗證每個區塊和其中的每筆交易，不信任任何其他節點。驗證流程涵蓋 [PoW](/bitcoin/consensus/pow-hashcash/) 檢查、時間戳驗證、交易腳本執行、[UTXO](/bitcoin/data-structures/bitcoin-script/) 集合更新等。Bitcoin Core 還提供 `assumevalid` 和 `assumeUTXO` 最佳化，大幅加速 Initial Block Download（IBD）。

## 核心原理

### Header 驗證

區塊頭驗證是最先執行的步驟，不合格的 header 不需要下載完整區塊：

| 檢查項目 | 規則 | 說明 |
|----------|------|------|
| **PoW** | $\text{SHA-256d}(\text{header}) < \text{target}$ | 工作量證明有效 |
| **Version** | 符合 BIP-9 version bits 規則 | 版本號合法 |
| **Previous block** | `prev_block_hash` 指向已知區塊 | 連接到已知鏈 |
| **Timestamp** | $> \text{MTP}_{11}$, $< \text{now} + 2\text{h}$ | 時間戳在合理範圍 |
| **Bits (target)** | 符合 [難度調整](/bitcoin/consensus/difficulty-adjustment/) 公式 | 難度值正確 |
| **Merkle root** | 與交易列表計算出的值一致 | 交易完整性 |

**Median Time Past (MTP)**：取前 11 個區塊時間戳的中位數。新區塊的時間戳必須大於 MTP，防止礦工回撥時間戳。

$$\text{MTP}_{11} = \text{median}(t_{n-1}, t_{n-2}, \ldots, t_{n-11})$$

### Transaction 驗證

每筆交易必須通過以下檢查：

**基本結構檢查**：
1. 交易不為空（至少一個 input 和一個 output）
2. 交易大小不超過 `MAX_BLOCK_WEIGHT` 限制
3. 序列化格式正確

**Input 驗證**：
4. 每個 input 引用的 UTXO 存在且未花費
5. Input 金額總和 $\geq$ output 金額總和
6. Script 執行成功（`scriptSig + scriptPubKey` 評估為 true）
7. 沒有 double-spend（同一 UTXO 不被兩筆交易花費）
8. `nLockTime` 和 `nSequence` 滿足時間鎖條件

**Output 驗證**：
9. Output 金額 $\geq 0$ 且不超過 21M BTC
10. 所有 output 金額之和不溢出

$$\sum_i \text{input}_i.\text{value} \geq \sum_j \text{output}_j.\text{value}$$

差額即為礦工可收取的手續費：

$$\text{fee} = \sum_i \text{input}_i.\text{value} - \sum_j \text{output}_j.\text{value}$$

### Coinbase 交易驗證

每個區塊的第一筆交易（且僅有第一筆）是 coinbase 交易，有特殊規則：

1. **Input**：恰好一個 input，`prevout` 為 null（`txid=0x00...00, vout=0xFFFFFFFF`）
2. **Output 金額上限**：

$$\text{coinbase\_value} \leq \text{block\_subsidy} + \sum \text{tx\_fees}$$

3. **Coinbase maturity**：coinbase 的 output 必須經過 100 個確認後才能被花費

$$\text{spendable\_height} = \text{coinbase\_height} + 100$$

4. **BIP-34**：coinbase 的 scriptSig 必須以區塊高度開頭
5. **Witness commitment**：SegWit 區塊的 coinbase 必須包含 witness commitment

### Script 執行

Bitcoin 使用基於堆疊（stack-based）的 [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) 執行交易驗證。完整的驗證流程：

```
1. 執行 scriptSig，將結果留在堆疊上
2. 將堆疊複製
3. 執行 scriptPubKey
4. 如果最終堆疊頂部為 true，驗證通過
```

對 P2SH 還有額外步驟：
```
5. 反序列化 redeemScript
6. 用原始堆疊執行 redeemScript
```

對 SegWit（P2WPKH/P2WSH）：
```
7. 從 witness 資料提取 script 和簽名
8. 使用 BIP-143 的新簽名雜湊演算法
```

### UTXO Set 更新

通過驗證後，節點更新 UTXO set：

1. **移除**：所有被花費的 UTXO（每筆交易的 inputs）
2. **新增**：所有新產生的 UTXO（每筆交易的 outputs）

UTXO set 是 Bitcoin 系統中最關鍵的資料結構之一，截至 2024 年約有 ~80M 個 UTXO，佔用約 7-8 GB 儲存空間。

### assumevalid 最佳化

`assumevalid` 跳過指定區塊之前所有交易的**簽名驗證**（script execution），但仍然執行：

- Header PoW 驗證
- 交易結構驗證
- UTXO set 更新
- Coinbase 金額驗證

```
assumevalid=<block_hash>
```

這是安全的，因為：
- 簽名是確定性的（同一交易的簽名在所有節點上結果相同）
- 社群已驗證過這些區塊
- 節點仍然建構完整的 UTXO set

IBD 加速效果：~80% 的驗證時間花在腳本執行上，assumevalid 可將 IBD 從數天縮短至數小時。

### assumeUTXO 最佳化

`assumeUTXO` 更進一步，直接從一個已知的 UTXO set snapshot 開始：

1. 下載並載入 UTXO set snapshot（指定高度的完整 UTXO set）
2. 立即從 snapshot 高度開始同步新區塊
3. **背景驗證**：同時從 genesis block 開始完整驗證，最終確認 snapshot 正確

$$\text{IBD 時間} \approx \text{download snapshot} + \text{sync recent blocks}$$

風險：如果 snapshot 被篡改，背景驗證完成前節點可能接受無效的交易。

## 程式碼範例

```python
# Bitcoin 區塊驗證邏輯（簡化版）
COINBASE_MATURITY = 100
MAX_MONEY = 21_000_000 * 100_000_000  # satoshis

def validate_block_header(header, prev_header, expected_target):
    """驗證區塊頭：PoW、連接、target、timestamp"""
    h = double_sha256(header.serialize())
    if int.from_bytes(h, "little") >= header.target:
        return (False, "PoW invalid")
    if header.prev_block_hash != prev_header.block_hash:
        return (False, "prev_block mismatch")
    if header.target != expected_target:
        return (False, "incorrect target")
    if header.timestamp <= get_median_time_past(prev_header):
        return (False, "timestamp too old")
    return (True, "")

def validate_transaction(tx, utxo_set, block_height):
    """驗證單筆交易：UTXO 存在、金額、coinbase maturity"""
    total_in = 0
    for inp in tx.inputs:
        utxo = utxo_set.get(inp.prev_txid, inp.prev_vout)
        if utxo is None:
            return (False, "missing UTXO")
        if utxo.is_coinbase and block_height - utxo.height < COINBASE_MATURITY:
            return (False, "coinbase not mature")
        total_in += utxo.value

    total_out = sum(o.value for o in tx.outputs)
    if total_out > MAX_MONEY or total_in < total_out:
        return (False, "value check failed")
    return (True, "")

def validate_block(block, utxo_set, prev_header, expected_target):
    """完整的區塊驗證"""
    valid, err = validate_block_header(block.header, prev_header, expected_target)
    if not valid:
        return (False, err)

    total_fees = 0
    for i, tx in enumerate(block.transactions):
        valid, err = validate_transaction(tx, utxo_set, block.header.height)
        if not valid:
            return (False, err)
        if i > 0:
            inp_val = sum(utxo_set.get(j.prev_txid, j.prev_vout).value for j in tx.inputs)
            total_fees += inp_val - sum(o.value for o in tx.outputs)

    # Coinbase 金額上限
    subsidy = get_block_subsidy(block.header.height)
    coinbase_val = sum(o.value for o in block.transactions[0].outputs)
    if coinbase_val > subsidy + total_fees:
        return (False, "coinbase too large")
    return (True, "")
```

```javascript
// 使用 Bitcoin Core RPC 查詢區塊驗證資訊
async function inspectBlockValidation(rpcUrl, blockHash) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method: "getblock", params: [blockHash, 2],
    }),
  });
  const block = (await res.json()).result;

  const coinbaseValue = block.tx[0].vout.reduce((s, o) => s + o.value, 0);
  const subsidy = 50 / Math.pow(2, Math.floor(block.height / 210000));

  return {
    height: block.height,
    weight: block.weight,
    nTx: block.nTx,
    coinbaseValue: coinbaseValue.toFixed(8),
    expectedSubsidy: subsidy.toFixed(8),
    weightUtilization: ((block.weight / 4000000) * 100).toFixed(1) + "%",
  };
}
```

## 相關概念

- [Proof-of-Work](/bitcoin/consensus/pow-hashcash/) - Header 驗證的 PoW 檢查
- [難度調整](/bitcoin/consensus/difficulty-adjustment/) - 驗證 bits 欄位的正確性
- [區塊結構](/bitcoin/data-structures/bitcoin-block-structure/) - 被驗證的資料結構
- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - 交易腳本的執行環境
- [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) - 驗證是共識的基礎
- [減半](/bitcoin/consensus/halving/) - 影響 coinbase 金額上限
- [最長鏈規則](/bitcoin/consensus/longest-chain-rule/) - 只有通過驗證的區塊才參與鏈選擇
- [SPV 輕節點](/bitcoin/network/spv-light-clients/) - 不執行完整驗證的替代方案
- [Mempool (BTC)](/bitcoin/network/mempool-btc/) - 預驗證交易的暫存池
- [Merkle Tree](/fundamentals/data-structures/merkle-tree/) - 用於驗證交易包含的資料結構
