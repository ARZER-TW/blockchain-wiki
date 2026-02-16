---
title: "RBF / CPFP"
description: "Replace-By-Fee, Child-Pays-For-Parent, BIP-125, 交易加速, Full RBF, Package Relay"
tags: [bitcoin, transactions, rbf, cpfp, bip-125, fee-bumping, mempool, package-relay]
---

# RBF / CPFP

## 概述

當 Bitcoin 交易因手續費率過低而卡在 [Mempool](/bitcoin/network/mempool-btc/) 中時，有兩種主要的加速（fee bumping）機制：RBF（Replace-By-Fee）允許發送者用更高費率的新交易替換原交易；CPFP（Child-Pays-For-Parent）允許接收者（或任何能花費未確認輸出的人）構建高費率子交易，將父交易「拉入」區塊。RBF 適合發送者自己加速，CPFP 適合接收者催促確認。

## 核心原理

### RBF（Replace-By-Fee）

#### BIP-125 Opt-in RBF

BIP-125 定義了「選擇加入」的替換規則。交易若將任一 input 的 `nSequence` 設為小於 `0xFFFFFFFE`，即表示允許被替換：

$$\text{nSequence} < \texttt{0xFFFFFFFE} \Rightarrow \text{replaceable}$$

替換規則（Bitcoin Core 的 mempool policy）：

1. **費率更高**：替換交易的絕對手續費必須大於被替換交易及其所有後代的手續費總和
2. **費率遞增**：替換交易的費率（sat/vB）必須高於被替換交易
3. **後代限制**：被替換的交易（含後代）不能超過 100 筆
4. **不引入新的未確認輸入**：替換交易不能引用被替換交易未引用的未確認輸入（防止 mempool pinning 攻擊）
5. **最小增幅**：替換交易的額外手續費至少要覆蓋替換交易本身的 relay fee（預設 1 sat/vB）

#### Full RBF

Bitcoin Core 24.0（2022 年 11 月）引入了 `mempoolfullrbf` 選項（預設關閉），允許節點接受替換任何未確認交易，不論 `nSequence` 值。Bitcoin Core 28.0 起預設啟用 Full RBF。

Full RBF 的意義：

| 特性 | Opt-in RBF (BIP-125) | Full RBF |
|------|---------------------|----------|
| 信號方式 | nSequence < 0xFFFFFFFE | 不需要信號 |
| 替換範圍 | 只替換有信號的交易 | 可替換任何未確認交易 |
| 0-conf 交易 | 無信號的 0-conf 相對安全 | 所有 0-conf 都不安全 |
| 預設啟用 | 一直支援 | Core 28.0+ |

#### RBF 實務

```
原始交易 (tx_v1):
  Input:  utxo_A (50000 sat)
  Output: Bob (40000 sat), change (8000 sat)
  Fee:    2000 sat (~10 sat/vB)

替換交易 (tx_v2):
  Input:  utxo_A (50000 sat)
  Output: Bob (40000 sat), change (5000 sat)
  Fee:    5000 sat (~25 sat/vB)

差異：減少找零金額以提高手續費
```

替換時可以：
- 增減 outputs
- 增加 inputs（注入更多 UTXO 以支付更高手續費）
- 修改找零金額

但通常保持支付輸出不變，只調整找零。

### CPFP（Child-Pays-For-Parent）

CPFP 的原理是礦工考慮「交易包」（package）的整體費率。若低費率的父交易有一個高費率的子交易，礦工打包子交易時必須也打包父交易，因此父交易被「拉入」區塊。

#### CPFP 費率計算

礦工評估的是包含父子交易的 package fee rate：

$$\text{packageRate} = \frac{\text{fee}_{\text{parent}} + \text{fee}_{\text{child}}}{\text{vBytes}_{\text{parent}} + \text{vBytes}_{\text{child}}}$$

子交易需要支付的額外費率：

$$\text{childFee} \geq \text{targetRate} \times (\text{vBytes}_p + \text{vBytes}_c) - \text{fee}_p$$

#### CPFP 實務

```
父交易 (stuck):
  Input:  utxo_X (100000 sat)
  Output: Bob (90000 sat), Alice_change (8000 sat)
  Fee:    2000 sat (~10 sat/vB, 太低)

子交易 (CPFP accelerator):
  Input:  Alice_change 或 Bob_output (未確認)
  Output: self (3000 sat)
  Fee:    5000 sat (~50 sat/vB)

Package rate:
  (2000 + 5000) / (200 + 100) = 23.3 sat/vB
```

接收者 Bob 可以花費未確認的 90000 sat 輸出來構建子交易。

#### RBF vs CPFP 比較

| 特性 | RBF | CPFP |
|------|-----|------|
| 誰可以執行 | 發送者（擁有 input 的私鑰） | 任何能花費未確認輸出的人 |
| 適用場景 | 發送者加速自己的交易 | 接收者催促確認 |
| 交易數量 | 替換為 1 筆新交易 | 新增 1 筆子交易 |
| 總成本 | 只付新交易的手續費 | 付兩筆交易的手續費 |
| 效率 | 較高（只佔一筆交易的空間） | 較低（佔兩筆交易的空間） |
| 要求 | 原交易需 RBF 信號（或 Full RBF） | 無特殊要求 |

### Package Relay

傳統的交易中繼要求每筆交易獨立滿足最低費率（mempool min fee）。低費率的父交易可能被節點拒絕，導致 CPFP 無法運作。

Package Relay（開發中）允許節點以「交易包」為單位評估費率：

1. **Package validation**：一組相關交易作為整體驗證
2. **Package RBF**：用整個 package 的費率來替換現有交易
3. **1-parent-1-child**：初始支援最簡單的包結構

這對 [Lightning Network](/bitcoin/advanced/lightning-network/) 尤為重要：承諾交易的費率可能在廣播時已經過低，需要搭配 anchor output 和 CPFP 來加速。

### Anchor Outputs

Lightning Network 使用 anchor outputs 讓雙方都能用 CPFP 加速承諾交易：

```
承諾交易 outputs:
  1. Alice 的餘額
  2. Bob 的餘額
  3. Alice 的 anchor (330 sat)  -- Alice 可以 CPFP
  4. Bob 的 anchor (330 sat)    -- Bob 可以 CPFP
```

330 sat 是 P2WSH dust limit，是最小可花費的輸出金額。

### 常見問題

#### Mempool Pinning

攻擊者利用 RBF 規則的限制阻止合法替換：
- 構建大量低費率的後代交易（佔滿 100 筆限制）
- 使替換成本極高（需覆蓋所有後代的手續費）

緩解措施包括 Full RBF、Package Relay、Ephemeral Anchors 等。

## 程式碼範例

```javascript
const bitcoin = require('bitcoinjs-lib');
const { ECPairFactory } = require('ecpair');
const ecc = require('tiny-secp256k1');
const ECPair = ECPairFactory(ecc);

// === RBF: 構建可替換的交易 ===
function createRbfTransaction(keyPair, utxo, recipient, amount, feeRate) {
  const p2wpkh = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(keyPair.publicKey),
  });

  const psbt = new bitcoin.Psbt();
  psbt.addInput({
    hash: utxo.txid,
    index: utxo.vout,
    witnessUtxo: { script: p2wpkh.output, value: utxo.value },
    sequence: 0xFFFFFFFD, // BIP-125: 允許 RBF (< 0xFFFFFFFE)
  });

  const estimatedVBytes = 141; // 1-in-2-out P2WPKH
  const fee = Math.ceil(feeRate * estimatedVBytes);
  const change = utxo.value - amount - fee;

  psbt.addOutput({ address: recipient, value: amount });
  if (change > 546) { // dust threshold
    psbt.addOutput({ address: p2wpkh.address, value: change });
  }

  psbt.signInput(0, keyPair);
  psbt.finalizeAllInputs();
  return psbt.extractTransaction();
}

// 原始交易 (10 sat/vB)
const kp = ECPair.makeRandom();
const utxo = { txid: 'a'.repeat(64), vout: 0, value: 100000 };

const tx1 = createRbfTransaction(kp, utxo, 'bc1q_recipient...', 80000, 10);
// 若 tx1 卡住，構建替換交易 (30 sat/vB)
const tx2 = createRbfTransaction(kp, utxo, 'bc1q_recipient...', 80000, 30);
// tx2 引用相同的 input，更高費率 => 替換 tx1

// === CPFP: 花費未確認輸出加速父交易 ===
function createCpfpChild(keyPair, parentTxid, parentVout, parentValue, targetPackageRate, parentVBytes, parentFee) {
  const p2wpkh = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(keyPair.publicKey),
  });

  const childVBytes = 110; // 1-in-1-out P2WPKH 估計
  const requiredTotalFee = Math.ceil(
    targetPackageRate * (parentVBytes + childVBytes)
  );
  const childFee = requiredTotalFee - parentFee;

  const psbt = new bitcoin.Psbt();
  psbt.addInput({
    hash: parentTxid,
    index: parentVout,
    witnessUtxo: { script: p2wpkh.output, value: parentValue },
  });

  const childOutput = parentValue - childFee;
  if (childOutput < 546) {
    throw new Error('CPFP fee too high: output would be dust');
  }

  psbt.addOutput({ address: p2wpkh.address, value: childOutput });
  psbt.signInput(0, keyPair);
  psbt.finalizeAllInputs();

  return {
    tx: psbt.extractTransaction(),
    childFee,
    packageRate: requiredTotalFee / (parentVBytes + childVBytes),
  };
}
```

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class RbfAnalysis:
    original_fee: int
    replacement_fee: int
    min_required_fee: int
    is_valid_replacement: bool

def check_rbf_rules(
    original_fee: int,
    original_vbytes: int,
    replacement_fee: int,
    replacement_vbytes: int,
    descendant_fees: int = 0,
    min_relay_fee_rate: float = 1.0
) -> RbfAnalysis:
    """檢查 RBF 替換是否符合規則"""
    # 規則 1: 替換費必須高於原始 + 所有後代的費用總和
    total_original = original_fee + descendant_fees

    # 規則 2: 替換費率必須高於原始費率
    original_rate = original_fee / original_vbytes
    replacement_rate = replacement_fee / replacement_vbytes

    # 規則 5: 額外費用至少覆蓋 relay fee
    min_extra = int(min_relay_fee_rate * replacement_vbytes)
    min_required = total_original + min_extra

    is_valid = (
        replacement_fee > total_original
        and replacement_rate > original_rate
        and replacement_fee >= min_required
    )

    return RbfAnalysis(
        original_fee=original_fee,
        replacement_fee=replacement_fee,
        min_required_fee=min_required,
        is_valid_replacement=is_valid,
    )

def calculate_cpfp_fee(
    parent_fee: int,
    parent_vbytes: int,
    child_vbytes: int,
    target_rate: float
) -> dict:
    """計算 CPFP 子交易需要的手續費"""
    total_vbytes = parent_vbytes + child_vbytes
    total_fee_needed = int(target_rate * total_vbytes)
    child_fee = max(0, total_fee_needed - parent_fee)

    package_rate = (parent_fee + child_fee) / total_vbytes

    return {
        "parent_fee": parent_fee,
        "child_fee": child_fee,
        "total_fee": parent_fee + child_fee,
        "parent_rate": parent_fee / parent_vbytes,
        "child_rate": child_fee / child_vbytes,
        "package_rate": round(package_rate, 1),
    }

# 範例：RBF 分析
rbf = check_rbf_rules(
    original_fee=2000, original_vbytes=200,
    replacement_fee=6000, replacement_vbytes=200,
)
print(f"RBF valid: {rbf.is_valid_replacement}")
print(f"Min required fee: {rbf.min_required_fee} sat")

# 範例：CPFP 計算
cpfp = calculate_cpfp_fee(
    parent_fee=1000, parent_vbytes=200,
    child_vbytes=110, target_rate=25.0
)
print(f"\nCPFP child fee needed: {cpfp['child_fee']} sat")
print(f"Child rate: {cpfp['child_rate']:.1f} sat/vB")
print(f"Package rate: {cpfp['package_rate']} sat/vB")
```

## 相關概念

- [Fee Estimation](/bitcoin/transactions/fee-estimation/) - 手續費估算機制
- [Mempool BTC](/bitcoin/network/mempool-btc/) - 交易池排序與替換規則
- [UTXO Model](/bitcoin/data-structures/utxo-model/) - 未確認 UTXO 的花費與 CPFP
- [Transaction Lifecycle](/bitcoin/transactions/transaction-lifecycle-btc/) - 交易加速在流程中的角色
- [Lightning Network](/bitcoin/advanced/lightning-network/) - anchor outputs 和 CPFP 的重要應用
- [Transaction Malleability](/bitcoin/transactions/transaction-malleability/) - 交易替換的前提
- [SegWit Serialization](/bitcoin/transactions/segwit-serialization/) - vByte 費率計算基礎
- [P2WPKH/P2WSH](/bitcoin/transactions/p2wpkh-p2wsh/) - SegWit 交易的費率優勢
- [UTXO Selection](/bitcoin/transactions/utxo-selection/) - RBF 可能需要重新選幣
