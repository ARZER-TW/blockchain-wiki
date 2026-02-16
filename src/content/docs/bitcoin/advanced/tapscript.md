---
title: "Tapscript"
description: "BIP-342 Tapscript：Taproot script-path 的修改版 Bitcoin Script，Schnorr 簽名整合、OP_CHECKSIGADD 與 OP_SUCCESS"
tags: [bitcoin, advanced, tapscript, bip342, taproot, schnorr, script, opcodes]
---

# Tapscript

## 概述

Tapscript 是由 BIP-342 定義的修改版 [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/)，專用於 Taproot（[P2TR](/bitcoin/transactions/p2tr/)）的 script-path spending。Tapscript 並非全新的腳本語言，而是在既有 Script 基礎上進行了一系列關鍵修改，以整合 [Schnorr 簽名](/bitcoin/cryptography/schnorr-signatures/)、改善多簽效率、並為未來的腳本擴展預留升級路徑。

Tapscript 的設計目標是：用 Schnorr 簽名替代所有 ECDSA 驗證、以 `OP_CHECKSIGADD` 替代低效的 `OP_CHECKMULTISIG`、透過 `OP_SUCCESS` 系列操作碼實現無縫的軟分叉升級。

## 與傳統 Script 的關鍵差異

### Schnorr 取代 ECDSA

在 Tapscript 中，所有的簽名驗證操作（`OP_CHECKSIG`、`OP_CHECKSIGVERIFY`）都使用 Schnorr 簽名（BIP-340）而非 ECDSA。Schnorr 簽名是固定 64 bytes（不含 sighash type 時），比 DER 編碼的 ECDSA 簽名（71-73 bytes）更短且更高效。

Schnorr 簽名的驗證方程：

$$s \cdot G = R + e \cdot P$$

其中 $s$ 是簽名標量，$R$ 是 nonce point，$e = H(\text{tag} \| R \| P \| m)$ 是 challenge，$P$ 是公鑰。

### OP_CHECKSIGADD

傳統的 `OP_CHECKMULTISIG` 有兩個嚴重問題：

1. **Off-by-one bug**：會從堆疊多消耗一個元素（需要加一個 dummy `OP_0`）
2. **線性掃描**：需要對每個簽名嘗試匹配所有公鑰，最壞情況 $O(n \times m)$

Tapscript 用 `OP_CHECKSIGADD` 替代，實現了更高效的多簽驗證：

```
# 傳統 OP_CHECKMULTISIG (2-of-3)
OP_0  # dummy element (off-by-one bug)
<sig_1> <sig_2>
2
<pubkey_1> <pubkey_2> <pubkey_3>
3
OP_CHECKMULTISIG

# Tapscript OP_CHECKSIGADD (2-of-3)
<sig_3_or_empty> <pubkey_3> OP_CHECKSIGADD
<sig_2_or_empty> <pubkey_2> OP_CHECKSIGADD
<sig_1_or_empty> <pubkey_1> OP_CHECKSIGADD
2 OP_NUMEQUAL
```

`OP_CHECKSIGADD` 的語義：

$$\text{stack: } n, \text{pubkey}, \text{sig} \implies \begin{cases} n+1 & \text{if sig is valid} \\ n & \text{if sig is empty} \end{cases}$$

### OP_SUCCESS 操作碼

Tapscript 將一系列未使用的操作碼重新定義為 `OP_SUCCESS`（OP_SUCCESS80 至 OP_SUCCESS254）。任何包含 `OP_SUCCESS` 操作碼的腳本會無條件成功（任何人都可以花費）。

這個設計是為了軟分叉升級：未來可以將某個 `OP_SUCCESS` 重新定義為具有特定語義的新操作碼。已有的交易不會受影響，因為新語義只會更嚴格（從「任何人可花費」變為「滿足特定條件才可花費」）。

候選升級包括：
- `OP_CAT`（[BIP-347](/bitcoin/advanced/covenants-opcat/)）
- `OP_CTV`（BIP-119）
- `OP_TXHASH`

## Leaf Versioning

### Taproot 樹的葉版本

每個 Taproot 樹的葉節點都有一個 leaf version，用於標識該葉使用的腳本驗證規則。目前只定義了 leaf version `0xc0`（Tapscript）。

$$\text{tapleaf\_hash} = \text{tagged\_hash}(\texttt{"TapLeaf"}, \text{version} \| \text{script\_size} \| \text{script})$$

未來的軟分叉可以定義新的 leaf version（如 `0xc2`、`0xc4` 等），對應全新的腳本驗證規則，而不影響現有的 `0xc0` 葉節點。

### 版本相容性

節點遇到未知的 leaf version 時，會將該花費視為 `OP_SUCCESS`（任何人可花費）。這確保了：

1. 舊節點不會拒絕包含新 leaf version 的交易
2. 新規則可以透過軟分叉逐步引入

## Sigops Budget

### 基於 Witness 大小的 Sigops 預算

傳統 Bitcoin Script 對每個區塊有 80,000 sigops 的硬限制。Tapscript 改用基於 witness 大小的動態 sigops budget：

$$\text{sigops\_budget} = 50 + \text{witness\_size}$$

每次簽名驗證消耗 50 sigops。這意味著：

$$\text{max\_sigs} = \frac{50 + \text{witness\_size}}{50} = 1 + \frac{\text{witness\_size}}{50}$$

這個設計將 sigops 限制與交易的實際大小掛鉤，避免了透過小交易塞入大量簽名驗證的攻擊。

## Schnorr Batch Verification

Tapscript 的另一個重要優勢是支援 Schnorr 簽名的 batch verification。對 $n$ 個簽名的批次驗證：

$$\sum_{i=1}^{n} a_i \cdot s_i \cdot G = \sum_{i=1}^{n} a_i \cdot R_i + \sum_{i=1}^{n} a_i \cdot e_i \cdot P_i$$

其中 $a_i$ 是隨機權重（防止 rogue key 攻擊）。批次驗證的計算複雜度接近 $O(n)$ 次橢圓曲線加法，而非 $n$ 次獨立驗證各需 1 次乘法，在大量簽名時效率顯著提升。

## 程式碼範例

### JavaScript（Tapscript 多簽構建）

```javascript
const bitcoin = require('bitcoinjs-lib');
const ecc = require('tiny-secp256k1');

// 使用 OP_CHECKSIGADD 構建 2-of-3 Tapscript
function createChecksigAddScript(pubkeys, threshold) {
  const ops = [];

  // 第一個公鑰使用 OP_CHECKSIG
  ops.push(pubkeys[0]);
  ops.push(bitcoin.opcodes.OP_CHECKSIG);

  // 後續公鑰使用 OP_CHECKSIGADD
  for (let i = 1; i < pubkeys.length; i++) {
    ops.push(pubkeys[i]);
    ops.push(bitcoin.opcodes.OP_CHECKSIGADD);
  }

  // 檢查簽名數量是否達到閾值
  ops.push(bitcoin.script.number.encode(threshold));
  ops.push(bitcoin.opcodes.OP_NUMEQUAL);

  return bitcoin.script.compile(ops);
}

// 計算 tapleaf hash
function computeTapleafHash(script, leafVersion = 0xc0) {
  const crypto = require('crypto');
  const tagHash = crypto.createHash('sha256')
    .update('TapLeaf').digest();
  const tag = Buffer.concat([tagHash, tagHash]);

  const scriptLen = Buffer.alloc(1);
  scriptLen.writeUInt8(script.length);

  const leafVersionBuf = Buffer.from([leafVersion]);
  const preimage = Buffer.concat([tag, leafVersionBuf, scriptLen, script]);
  return crypto.createHash('sha256').update(preimage).digest();
}

// 模擬 sigops budget 計算
function calculateSigopsBudget(witnessSize) {
  const budget = 50 + witnessSize;
  const maxSignatures = Math.floor(budget / 50);
  return { budget, maxSignatures };
}

const witnessSize = 500;
const result = calculateSigopsBudget(witnessSize);
console.log(`Witness: ${witnessSize} bytes`);
console.log(`Sigops budget: ${result.budget}`);
console.log(`Max signatures: ${result.maxSignatures}`);
```

### Python（OP_CHECKSIGADD 執行模擬）

```python
from dataclasses import dataclass
from typing import Optional

@dataclass
class ScriptState:
    stack: list
    sigops_count: int = 0
    sigops_budget: int = 50

def simulate_checksigadd(state: ScriptState, sig: Optional[bytes],
                         pubkey: bytes, is_valid: bool) -> ScriptState:
    """模擬 OP_CHECKSIGADD 的執行"""
    # 從堆疊取出計數器
    counter = state.stack.pop()
    new_sigops = state.sigops_count + 1

    if new_sigops * 50 > state.sigops_budget:
        raise ValueError("Sigops budget exceeded")

    if sig is None or len(sig) == 0:
        # 空簽名：計數器不變
        new_counter = counter
    elif is_valid:
        # 有效簽名：計數器 +1
        new_counter = counter + 1
    else:
        raise ValueError("Invalid non-empty signature")

    return ScriptState(
        stack=[*state.stack, new_counter],
        sigops_count=new_sigops,
        sigops_budget=state.sigops_budget,
    )

# 模擬 2-of-3 多簽驗證
witness_size = 300
budget = 50 + witness_size

state = ScriptState(stack=[0], sigops_budget=budget)

# 三個公鑰，只有 pubkey_1 和 pubkey_3 提供有效簽名
state = simulate_checksigadd(state, b'\x01' * 64, b'pk1', True)   # valid
state = simulate_checksigadd(state, b'', b'pk2', False)           # empty
state = simulate_checksigadd(state, b'\x03' * 64, b'pk3', True)   # valid

threshold = 2
final_count = state.stack[-1]
success = final_count >= threshold
print(f"Signature count: {final_count}, threshold: {threshold}")
print(f"Verification: {'PASS' if success else 'FAIL'}")
print(f"Sigops used: {state.sigops_count}/{budget}")
```

## 相關概念

- [P2TR](/bitcoin/transactions/p2tr/) - Tapscript 是 P2TR script-path 的腳本規則
- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - Tapscript 修改的基礎腳本語言
- [Schnorr Signatures](/bitcoin/cryptography/schnorr-signatures/) - Tapscript 使用的簽名方案
- [Covenants/OP_CAT](/bitcoin/advanced/covenants-opcat/) - 利用 OP_SUCCESS 升級路徑的提案
- [Multisig/MuSig](/bitcoin/advanced/multisig-musig/) - OP_CHECKSIGADD 改善的多簽機制
- [BitVM](/bitcoin/advanced/bitvm/) - 利用 Tapscript 構建驗證電路
- [Miniscript](/bitcoin/advanced/miniscript/) - Tapscript 的結構化表示
- [Ordinals & Inscriptions](/bitcoin/advanced/ordinals-inscriptions/) - 利用 Tapscript 的 inscription envelope
- [Witness Data](/bitcoin/data-structures/witness-data/) - Tapscript 的 sigops budget 基於 witness 大小
- [ECDSA](/fundamentals/cryptography/ecdsa/) - Tapscript 所替代的舊簽名方案
- [Elliptic Curve Cryptography](/fundamentals/cryptography/elliptic-curve-cryptography/) - Schnorr 簽名的數學基礎
