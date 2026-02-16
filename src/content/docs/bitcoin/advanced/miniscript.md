---
title: "Miniscript"
description: "Bitcoin Script 的結構化子集：策略語言、類型系統、最佳化編譯、與 Descriptors 和 PSBT 的整合"
tags: [bitcoin, advanced, miniscript, policy, descriptors, script, compilation]
---

# Miniscript

## 概述

Miniscript 是由 Pieter Wuille、Andrew Poelstra 和 Sanket Kanjalkar 開發的一套結構化表示法，對應 [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) 的一個實用子集。Miniscript 的目標是讓複雜的花費條件變得可分析、可組合、可自動化。

傳統的 Bitcoin Script 是低階的、堆疊導向的指令集，缺乏結構化的語義分析能力。開發者很難回答「這個腳本在什麼條件下可以被花費？」這樣的問題。Miniscript 透過嚴格的類型系統和組合規則，將腳本提升到可自動推理的層次。

## 三層架構

### 1. Policy Language（策略語言）

人類可讀的高階花費條件描述：

```
and(pk(Alice), or(pk(Bob), after(1000)))
```

意義：Alice 必須簽名，且 Bob 簽名或等待 1000 個區塊後才可花費。

### 2. Miniscript（結構化腳本表示）

Policy 編譯後的中間表示，具有明確的類型和語義：

```
and_v(v:pk(Alice), or_d(pk(Bob), older(1000)))
```

### 3. Bitcoin Script（實際腳本）

Miniscript 的最終編譯目標：

```
<Alice> OP_CHECKSIGVERIFY
<Bob> OP_CHECKSIG
OP_IFDUP OP_NOTIF
  <1000> OP_CHECKSEQUENCEVERIFY
OP_ENDIF
```

## Policy Language

### 基本原語

| 原語 | 語法 | 意義 |
|------|------|------|
| 公鑰簽名 | `pk(KEY)` | 需要 KEY 的簽名 |
| 多簽 | `multi(k, KEY1, KEY2, ...)` | 需要 k-of-n 簽名 |
| 雜湊鎖 | `sha256(H)` | 需要揭露 SHA-256 preimage |
| 絕對時間鎖 | `after(N)` | 需要等待到區塊高度或時間 N |
| 相對時間鎖 | `older(N)` | 需要等待 N 個區塊 |
| 且 | `and(X, Y)` | 需要同時滿足 X 和 Y |
| 或 | `or(X, Y)` | 需要滿足 X 或 Y |
| 閾值 | `thresh(k, X1, X2, ...)` | 需要滿足 k-of-n 條件 |

### Policy 範例

**2-of-3 多簽帶時間鎖回退：**
```
or(
  multi(2, Alice, Bob, Carol),
  and(pk(Alice), older(52560))
)
```

意義：正常情況下需要三人中任二人簽名；52,560 個區塊（約一年）後 Alice 單獨即可花費。

**保險箱（Vault）：**
```
or(
  and(pk(hot_key), older(144)),
  pk(cold_key)
)
```

意義：cold key 可立即花費；hot key 需要等待 144 個區塊（約一天）。

## 類型系統

Miniscript 的每個表達式都有一個基本類型（B、V、K、W），決定了它在堆疊上的行為：

### 基本類型

| 類型 | 名稱 | 成功時堆疊結果 | 失敗時堆疊結果 |
|------|------|----------------|----------------|
| B | Base | 推入非零值 | 推入 0 |
| V | Verify | 不推入任何值 | 腳本失敗（abort） |
| K | Key | 推入公鑰 | N/A |
| W | Wrapped | 推入非零值（堆疊頂之下） | 推入 0（堆疊頂之下） |

### 修飾符

| 修飾符 | 意義 |
|--------|------|
| `z` | zero arg：不消耗堆疊元素 |
| `o` | one arg：消耗恰好一個堆疊元素 |
| `n` | non-zero：成功路徑保證結果非零 |
| `d` | dissatisfiable：存在不增加堆疊深度的失敗路徑 |
| `u` | unit：成功時結果恰為 1 |

### 類型規則範例

`and_v(V, B)` 的類型推導：

$$\text{type}(\text{and\_v}(X: V, Y: B)) = B$$

先執行 $X$（類型 V：成功時不推值/失敗時 abort），再執行 $Y$（類型 B：推入布林結果）。

## 最佳化編譯

### 從 Policy 到 Miniscript

一個 Policy 可能有多種 Miniscript 表示，編譯器尋找最小化 witness 大小的版本：

$$\text{cost}(S) = \text{script\_size}(S) + \text{max\_witness\_size}(S)$$

對於 `or(X, Y)`，編譯器可以選擇：
- `or_b(X, Y)`：兩條路徑都執行，用 `OP_BOOLOR` 合併
- `or_d(X, Y)`：先嘗試 X，失敗則嘗試 Y
- `or_c(X, Y)`：X 成功則跳過 Y
- `or_i(X, Y)`：用 `OP_IF` 選擇路徑

每種選擇的 script size 和 witness size 不同，最佳化編譯器會評估所有合法組合。

### Satisfaction 與 Dissatisfaction

Miniscript 可以自動計算每個表達式的 satisfaction（滿足條件的 witness）和 dissatisfaction（不滿足條件的 witness）：

$$\text{satisfy}(\text{pk}(K)) = \langle \text{sig}(K) \rangle$$
$$\text{dissatisfy}(\text{pk}(K)) = \langle \rangle \quad \text{(empty signature)}$$

$$\text{satisfy}(\text{and\_v}(X, Y)) = \text{satisfy}(Y) \| \text{satisfy}(X)$$

## 與 Descriptors 整合

Output Descriptors 描述一組 scriptPubKey 的生成方式。Miniscript 與 Descriptors 結合，形成完整的錢包描述語言：

```
wsh(and_v(v:pk([fingerprint/48'/0'/0'/2']xpub.../0/*), older(52560)))
```

這個 descriptor 描述了一組 P2WSH 輸出，每個輸出的花費條件由 Miniscript 定義，公鑰從 xpub 按照 BIP-32 路徑推導。

## 與 PSBT 整合

[PSBT](/bitcoin/advanced/psbt/) 的 Finalizer 角色可以利用 Miniscript 的 satisfaction 分析自動組裝 witness：

1. 從 PSBT 的 partial signatures 中收集可用的簽名
2. 用 Miniscript 的 satisfaction 演算法計算最小 witness
3. 組裝最終的 scriptSig/witness

## 程式碼範例

### JavaScript（Policy 到 Script 的概念性編譯）

```javascript
// Miniscript policy 表示（概念性 AST）
class Policy {
  static pk(key) { return { type: 'pk', key }; }
  static multi(k, ...keys) { return { type: 'multi', k, keys }; }
  static and(a, b) { return { type: 'and', children: [a, b] }; }
  static or(a, b) { return { type: 'or', children: [a, b] }; }
  static after(n) { return { type: 'after', value: n }; }
  static older(n) { return { type: 'older', value: n }; }
  static sha256(h) { return { type: 'sha256', hash: h }; }
}

// 估算 witness 大小
function estimateWitnessSize(policy) {
  switch (policy.type) {
    case 'pk': return 64 + 1;         // Schnorr sig + push
    case 'multi': return policy.k * 65 + 34 * policy.keys.length;
    case 'and': {
      const sizes = policy.children.map(estimateWitnessSize);
      return sizes.reduce((a, b) => a + b, 0);
    }
    case 'or': {
      const sizes = policy.children.map(estimateWitnessSize);
      return Math.max(...sizes) + 1;  // +1 for IF/ELSE selector
    }
    case 'after':
    case 'older': return 0;           // no witness data needed
    case 'sha256': return 32 + 1;     // preimage + push
    default: return 0;
  }
}

// 範例：vault policy
const vault = Policy.or(
  Policy.and(Policy.pk('hot_key'), Policy.older(144)),
  Policy.pk('cold_key')
);

console.log('Vault policy witness estimate:', estimateWitnessSize(vault), 'bytes');

// 2-of-3 with timelock fallback
const multisigFallback = Policy.or(
  Policy.multi(2, 'Alice', 'Bob', 'Carol'),
  Policy.and(Policy.pk('Alice'), Policy.older(52560))
);

console.log('Multisig+fallback estimate:', estimateWitnessSize(multisigFallback), 'bytes');
```

### Python（Miniscript 類型檢查）

```python
from dataclasses import dataclass
from enum import Enum
from typing import Optional

class BaseType(Enum):
    B = 'B'  # Base: pushes 0 or non-zero
    V = 'V'  # Verify: nothing or abort
    K = 'K'  # Key: pushes a key
    W = 'W'  # Wrapped: like B but under top

@dataclass
class MiniscriptNode:
    name: str
    base_type: BaseType
    properties: set  # z, o, n, d, u modifiers
    children: list

def typecheck_and_v(x: MiniscriptNode, y: MiniscriptNode) -> MiniscriptNode:
    """and_v(V, B) -> B 的類型檢查"""
    if x.base_type != BaseType.V:
        raise TypeError(f"and_v first arg must be V, got {x.base_type}")
    if y.base_type != BaseType.B:
        raise TypeError(f"and_v second arg must be B, got {y.base_type}")
    return MiniscriptNode(
        name=f"and_v({x.name},{y.name})",
        base_type=BaseType.B,
        properties=y.properties,
        children=[x, y],
    )

def typecheck_or_d(x: MiniscriptNode, y: MiniscriptNode) -> MiniscriptNode:
    """or_d(Bdu, B) -> B 的類型檢查"""
    if x.base_type != BaseType.B or 'd' not in x.properties or 'u' not in x.properties:
        raise TypeError(f"or_d first arg must be Bdu, got {x.base_type}{x.properties}")
    if y.base_type != BaseType.B:
        raise TypeError(f"or_d second arg must be B, got {y.base_type}")
    return MiniscriptNode(
        name=f"or_d({x.name},{y.name})",
        base_type=BaseType.B,
        properties={'z'} if 'z' in x.properties and 'z' in y.properties else set(),
        children=[x, y],
    )

# 構建 and_v(v:pk(A), or_d(pk(B), older(1000)))
pk_a = MiniscriptNode('pk(A)', BaseType.B, {'d', 'u', 'n'}, [])
v_pk_a = MiniscriptNode('v:pk(A)', BaseType.V, {'n'}, [pk_a])
pk_b = MiniscriptNode('pk(B)', BaseType.B, {'d', 'u', 'n'}, [])
older_1000 = MiniscriptNode('older(1000)', BaseType.B, {'z'}, [])

or_node = typecheck_or_d(pk_b, older_1000)
and_node = typecheck_and_v(v_pk_a, or_node)

print(f"Result: {and_node.name}")
print(f"Type: {and_node.base_type.value}")
```

## 相關概念

- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - Miniscript 的編譯目標
- [PSBT](/bitcoin/advanced/psbt/) - Miniscript 自動化 Finalizer 角色
- [Tapscript](/bitcoin/advanced/tapscript/) - Taproot 環境下的 Miniscript 編譯
- [Multisig/MuSig](/bitcoin/advanced/multisig-musig/) - Miniscript multi() 原語
- [Timelocks](/bitcoin/advanced/timelocks/) - Miniscript after()/older() 原語
- [Payment Channels](/bitcoin/advanced/payment-channels/) - 通道腳本可用 Miniscript 描述
- [HTLC](/bitcoin/advanced/htlc/) - HTLC 可用 Miniscript 形式化
- [P2WSH](/bitcoin/transactions/p2wpkh-p2wsh/) - Miniscript 常見的 wsh() descriptor
- [Covenants/OP_CAT](/bitcoin/advanced/covenants-opcat/) - 未來可能擴展 Miniscript 的新操作碼
- [Transaction Signing BTC](/bitcoin/transactions/transaction-signing-btc/) - Miniscript satisfaction 的簽名需求
