---
title: "Timelocks"
description: "Bitcoin 時間鎖機制：nLockTime、nSequence、OP_CLTV、OP_CSV，以及在支付通道與原子交換中的應用"
tags: [bitcoin, advanced, timelocks, cltv, csv, nlocktime, nsequence, bip65, bip68, bip112]
---

# Timelocks

## 概述

Timelocks（時間鎖）是 Bitcoin 交易中的時間約束機制，限制一筆交易或一個 UTXO 在特定時間或區塊高度之前不能被確認或花費。時間鎖是 [Payment Channels](/bitcoin/advanced/payment-channels/)、[HTLC](/bitcoin/advanced/htlc/)、原子交換（Atomic Swaps）和保險箱（Vaults）等進階應用的基礎構建元素。

Bitcoin 有四種時間鎖機制，分為兩個維度：

|  | 交易層級 | 腳本層級 |
|--|---------|---------|
| **絕對** | nLockTime | OP_CHECKLOCKTIMEVERIFY (CLTV) |
| **相對** | nSequence (BIP-68) | OP_CHECKSEQUENCEVERIFY (CSV) |

## 絕對時間鎖

### nLockTime

每筆 Bitcoin 交易都有一個 4-byte 的 `nLockTime` 欄位。當 nLockTime > 0 時：

- $\text{nLockTime} < 500{,}000{,}000$：解讀為區塊高度，交易在此高度之前不能被打包進區塊
- $\text{nLockTime} \geq 500{,}000{,}000$：解讀為 Unix timestamp，交易在此時間之前不能被打包

$$\text{valid} \iff \begin{cases} \text{block\_height} \geq \text{nLockTime} & \text{if nLockTime} < 500{,}000{,}000 \\ \text{median\_time} \geq \text{nLockTime} & \text{if nLockTime} \geq 500{,}000{,}000 \end{cases}$$

**關鍵限制：** nLockTime 只有在至少一個輸入的 `nSequence` 不是 `0xffffffff` 時才生效。如果所有輸入的 sequence 都是最大值，nLockTime 被忽略。

### OP_CHECKLOCKTIMEVERIFY (BIP-65)

OP_CLTV 是 2015 年 12 月啟用的腳本操作碼，它在腳本層級強制執行絕對時間鎖。與 nLockTime 不同，OP_CLTV 嵌入在 scriptPubKey（花費條件）中，不是由花費者選擇的。

```
<expiry_time> OP_CHECKLOCKTIMEVERIFY OP_DROP
<pubkey> OP_CHECKSIG
```

OP_CLTV 的驗證邏輯：

1. 堆疊頂端的值 $t$ 必須與交易的 nLockTime 類型一致（都是高度或都是時間）
2. 交易的 nLockTime $\geq t$
3. 花費此輸入的 nSequence $\neq$ `0xffffffff`

$$\text{OP\_CLTV}(t) \implies \text{nLockTime} \geq t$$

### 時間類型一致性

OP_CLTV 和 nLockTime 的時間類型必須匹配：

$$\text{valid type match} \iff (t < 500M \wedge \text{nLockTime} < 500M) \vee (t \geq 500M \wedge \text{nLockTime} \geq 500M)$$

不能混合使用區塊高度和 Unix timestamp。

## 相對時間鎖

### nSequence (BIP-68)

BIP-68（2016 年 7 月啟用）重新定義了交易輸入的 `nSequence` 欄位。當 nSequence 的 bit 31（disable flag）為 0 時，低 16 位編碼相對時間鎖：

```
Bit 31: disable flag (0 = enabled)
Bit 22: type flag (0 = blocks, 1 = time)
Bits 0-15: value

Block-based: value = number of blocks
Time-based:  value * 512 = seconds
```

$$\text{relative\_lock} = \begin{cases} \text{value blocks} & \text{if type\_flag} = 0 \\ \text{value} \times 512 \text{ seconds} & \text{if type\_flag} = 1 \end{cases}$$

相對時間鎖從被引用的 UTXO 所在區塊開始計算。例如 nSequence 編碼為 144 個區塊，表示被引用的 UTXO 必須已被確認至少 144 個區塊（約 1 天）後才能花費。

### OP_CHECKSEQUENCEVERIFY (BIP-112)

OP_CSV 是腳本層級的相對時間鎖操作碼，驗證邏輯為：

```
<relative_locktime> OP_CHECKSEQUENCEVERIFY OP_DROP
<pubkey> OP_CHECKSIG
```

$$\text{OP\_CSV}(r) \implies \text{nSequence} \geq r \wedge \text{UTXO age} \geq r$$

OP_CSV 在 [Payment Channels](/bitcoin/advanced/payment-channels/) 中的作用至關重要：commitment transaction 的 `to_local` 輸出使用 CSV 設定延遲，給予對方時間偵測和懲罰舊狀態的廣播。

## Median Time Past (BIP-113)

### 時間來源

BIP-113 規定所有基於時間的時間鎖使用 Median Time Past（MTP）而非區塊的 timestamp。MTP 是前 11 個區塊 timestamp 的中位數：

$$\text{MTP} = \text{median}(t_{h-10}, t_{h-9}, \ldots, t_{h})$$

MTP 保證了時間的單調遞增，防止礦工操控單個區塊 timestamp 來繞過時間鎖。

### 時間偏移

由於 MTP 總是落後於真實時間（最多約 2 小時），基於時間的時間鎖會比預期略晚解鎖。對精確性要求高的應用建議使用基於區塊高度的時間鎖。

## 應用場景

### 支付通道

[Payment Channels](/bitcoin/advanced/payment-channels/) 的 commitment transaction 使用 CSV 延遲：

```
# to_local 輸出
OP_IF
    <revocationpubkey> OP_CHECKSIG       # 對方懲罰路徑（立即）
OP_ELSE
    <to_self_delay> OP_CSV OP_DROP
    <local_delayedpubkey> OP_CHECKSIG     # 自己取回（延遲後）
OP_ENDIF
```

### HTLC（Hash Time-Locked Contract）

[HTLC](/bitcoin/advanced/htlc/) 使用 CLTV 設定超時退款路徑：

$$\text{HTLC timeout}: \text{OP\_CLTV}(T) \to \text{refund to sender}$$

### Atomic Swaps

跨鏈原子交換使用 HTLC 在兩條鏈上建立對應的時間鎖條件：

```
Chain A (Bitcoin):  HTLC(hash, Alice, Bob, T_A)
Chain B (Litecoin): HTLC(hash, Bob, Alice, T_B)

T_A > T_B  # Bitcoin 側的 timeout 必須更長
```

### 繼承方案

使用 timelocks 實現加密貨幣繼承：

```
or(
  pk(owner),                              # 擁有者隨時可花費
  and(pk(heir), after(block_1_year_later)) # 繼承人一年後可花費
)
```

如果擁有者每年將資金轉移到新地址（重置時間鎖），繼承人永遠無法啟動 timelock 路徑。擁有者不活動超過一年後，繼承人自動獲得花費能力。

## 時間鎖互動與限制

### 同時使用多種時間鎖

一筆交易可以同時受到多種時間鎖的約束：

$$\text{tx\_valid} \iff \text{nLockTime OK} \wedge \forall i: \text{nSequence}_i \text{ OK} \wedge \forall \text{script}: \text{CLTV/CSV OK}$$

### 類型不可混合

在同一個腳本中，不能混合使用基於區塊高度和基於時間的時間鎖（CLTV 與 CSV 各自內部也不能混合）：

$$\text{INVALID}: \text{OP\_CLTV}(700000) \text{ AND } \text{OP\_CLTV}(1700000000)$$

因為 nLockTime 只能設為一種類型。

## 程式碼範例

### JavaScript（時間鎖交易構建）

```javascript
const bitcoin = require('bitcoinjs-lib');

// 使用 nLockTime 建立延遲交易
function createTimeLockTx(utxo, recipient, amount, lockBlockHeight) {
  const psbt = new bitcoin.Psbt();

  psbt.setLocktime(lockBlockHeight);

  psbt.addInput({
    hash: utxo.txid,
    index: utxo.vout,
    sequence: 0xfffffffe, // 啟用 nLockTime（非 0xffffffff）
    witnessUtxo: {
      script: utxo.scriptPubKey,
      value: utxo.value,
    },
  });

  psbt.addOutput({ address: recipient, value: amount });
  return psbt;
}

// CSV 相對時間鎖腳本
function createCSVScript(pubkey, blocks) {
  return bitcoin.script.compile([
    bitcoin.script.number.encode(blocks),
    bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
    bitcoin.opcodes.OP_DROP,
    pubkey,
    bitcoin.opcodes.OP_CHECKSIG,
  ]);
}

// CLTV 絕對時間鎖腳本
function createCLTVScript(pubkey, locktime) {
  return bitcoin.script.compile([
    bitcoin.script.number.encode(locktime),
    bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
    bitcoin.opcodes.OP_DROP,
    pubkey,
    bitcoin.opcodes.OP_CHECKSIG,
  ]);
}

// 解析 nSequence
function parseSequence(nSequence) {
  const disabled = (nSequence & 0x80000000) !== 0;
  const typeFlag = (nSequence & 0x00400000) !== 0;
  const value = nSequence & 0x0000ffff;

  if (disabled) return { type: 'disabled', value: null };
  if (typeFlag) return { type: 'time', seconds: value * 512 };
  return { type: 'blocks', blocks: value };
}

// 測試
console.log(parseSequence(0xfffffffe)); // nLockTime enabled, no relative lock
console.log(parseSequence(144));         // 144 blocks relative lock
console.log(parseSequence(0x00400001)); // 512 seconds relative lock
console.log(parseSequence(0xffffffff)); // disabled (nLockTime ignored)
```

### Python（時間鎖驗證模擬）

```python
from dataclasses import dataclass
from typing import Optional

@dataclass
class TimelockParams:
    nlocktime: int
    nsequences: list
    cltv_values: list
    csv_values: list

def validate_absolute_timelock(nlocktime: int, current_height: int,
                                current_mtp: int) -> bool:
    """驗證 nLockTime 是否已滿足"""
    if nlocktime == 0:
        return True
    if nlocktime < 500_000_000:
        return current_height >= nlocktime
    return current_mtp >= nlocktime

def validate_relative_timelock(nsequence: int, utxo_height: int,
                                current_height: int) -> bool:
    """驗證 BIP-68 nSequence 相對時間鎖"""
    # Check disable flag
    if nsequence & 0x80000000:
        return True  # disabled

    type_flag = bool(nsequence & 0x00400000)
    value = nsequence & 0x0000ffff

    if not type_flag:
        # Block-based
        age = current_height - utxo_height
        return age >= value
    else:
        # Time-based (simplified - should use MTP)
        return True  # would compare MTP difference

def validate_cltv(script_value: int, nlocktime: int) -> bool:
    """驗證 OP_CHECKLOCKTIMEVERIFY"""
    # Type consistency check
    if (script_value < 500_000_000) != (nlocktime < 500_000_000):
        return False  # type mismatch
    return nlocktime >= script_value

def validate_csv(script_value: int, nsequence: int) -> bool:
    """驗證 OP_CHECKSEQUENCEVERIFY"""
    if nsequence & 0x80000000:
        return False  # sequence disable flag must be off

    # Type consistency
    script_type = bool(script_value & 0x00400000)
    seq_type = bool(nsequence & 0x00400000)
    if script_type != seq_type:
        return False

    script_val = script_value & 0x0000ffff
    seq_val = nsequence & 0x0000ffff
    return seq_val >= script_val

# 測試場景
scenarios = [
    ("nLockTime block height", validate_absolute_timelock(700_000, 700_001, 0)),
    ("nLockTime too early", validate_absolute_timelock(700_000, 699_999, 0)),
    ("CLTV valid", validate_cltv(700_000, 700_100)),
    ("CLTV type mismatch", validate_cltv(700_000, 1_700_000_000)),
    ("CSV 144 blocks", validate_csv(144, 200)),
    ("CSV insufficient", validate_csv(144, 100)),
    ("nSequence 144 blocks", validate_relative_timelock(144, 700_000, 700_200)),
]

for name, result in scenarios:
    status = "PASS" if result else "FAIL"
    print(f"[{status}] {name}")
```

## 相關概念

- [HTLC](/bitcoin/advanced/htlc/) - CLTV 在 Hash Time-Locked Contracts 中的應用
- [Payment Channels](/bitcoin/advanced/payment-channels/) - CSV 在承諾交易延遲中的角色
- [Lightning Network](/bitcoin/advanced/lightning-network/) - 時間鎖保障路由安全
- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - OP_CLTV/OP_CSV 的腳本環境
- [BOLT Specifications](/bitcoin/advanced/bolt-specifications/) - BOLT 3 中的 timelock 規範
- [Miniscript](/bitcoin/advanced/miniscript/) - after()/older() 策略原語
- [Covenants/OP_CAT](/bitcoin/advanced/covenants-opcat/) - vault 方案中的時間鎖應用
- [Transaction Lifecycle BTC](/bitcoin/transactions/transaction-lifecycle-btc/) - nLockTime 在交易流程中的角色
- [Multisig/MuSig](/bitcoin/advanced/multisig-musig/) - 時間鎖配合多簽的進階方案
- [UTXO Model](/bitcoin/data-structures/utxo-model/) - 相對時間鎖以 UTXO 確認為基準
