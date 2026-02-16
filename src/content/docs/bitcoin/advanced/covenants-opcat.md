---
title: "Covenants & OP_CAT"
description: "Bitcoin Covenants：限制 UTXO 花費方式的機制，OP_CAT 重新啟用提案、OP_CTV、OP_VAULT 與 Great Script Restoration"
tags: [bitcoin, advanced, covenants, opcat, bip347, bip119, op-ctv, script, upgrade]
---

# Covenants & OP_CAT

## 概述

Covenants（契約/限制條款）是指在 Bitcoin Script 中對 UTXO 的花費方式施加限制的機制。傳統的 Bitcoin Script 只能驗證「誰可以花費」（透過簽名驗證），但無法限制「資金可以去哪裡」或「如何花費」。Covenants 賦予了 Script 內省（introspection）能力，使腳本可以檢查花費它的交易的結構和目的地。

多個 covenant 提案正在 Bitcoin 社群中被討論，其中 OP_CAT（BIP-347）因為其簡潔性和強大的組合能力，成為最受關注的提案之一。

## Covenants 的核心概念

### 為何需要 Covenants

在目前的 Bitcoin Script 中，一旦簽名驗證通過，資金可以被發送到任何地址。腳本無法表達以下類型的條件：

- 「這筆資金只能發送到地址 X 或 Y」
- 「每次最多只能花費 10% 的餘額」
- 「資金必須先經過 24 小時的等待期」（超越簡單 timelock 的複雜邏輯）

Covenants 透過讓腳本能夠讀取花費交易的部分內容（transaction introspection），實現這些進階條件。

### 遞迴與非遞迴 Covenants

$$\text{Non-recursive covenant}: \text{output}_n \to \text{any output}$$
$$\text{Recursive covenant}: \text{output}_n \to \text{output}_{n+1} \to \text{output}_{n+2} \to \ldots$$

非遞迴 covenant 只限制直接的花費交易；遞迴 covenant 可以將限制傳播到未來的所有花費，形成無限延伸的限制鏈。

遞迴 covenant 引發了爭議：部分人擔心資金可能被永久鎖定在某個花費模式中，違反了 Bitcoin 的可替代性（fungibility）原則。

## OP_CAT（BIP-347）

### 歷史背景

`OP_CAT`（concatenate）是 Satoshi Nakamoto 在 2010 年因安全顧慮而禁用的操作碼之一。原始的 `OP_CAT` 沒有堆疊元素大小限制，允許透過反覆串接指數級膨脹堆疊，造成 DoS 攻擊。

BIP-347 提議在 [Tapscript](/bitcoin/advanced/tapscript/) 環境中重新啟用 `OP_CAT`，並加入 520 bytes 的結果大小限制（與現有 Script 元素大小限制一致）。

### 操作語義

```
Stack before: [x] [y]
OP_CAT
Stack after:  [x || y]
```

其中 `||` 代表位元組串接。限制條件：

$$|\text{result}| = |x| + |y| \leq 520 \text{ bytes}$$

### OP_CAT 如何實現 Covenants

OP_CAT 本身不是 covenant 操作碼，但它與 Schnorr 簽名結合可以實現 transaction introspection。關鍵技巧是利用 Schnorr 簽名的結構：

$$\text{sig} = (R, s) \quad \text{where} \quad s = k + e \cdot x$$
$$e = H_{\text{tag}}(R \| P \| m)$$

如果腳本能夠重建 $m$（交易摘要的部分內容），並用 `OP_CAT` 將各欄位串接起來，就可以驗證交易結構是否符合預期。

### 具體實現步驟

1. 將交易的各個欄位（version, outputs hash, etc.）推入堆疊
2. 用 `OP_CAT` 串接這些欄位重建 sighash preimage
3. 用 `OP_SHA256` 計算 sighash
4. 用 `OP_CHECKSIG` 驗證簽名是否匹配

如果 sighash 驗證通過，就證明了堆疊上的交易欄位值確實對應當前的花費交易，實現了 introspection。

## OP_CTV（BIP-119）

### CheckTemplateVerify

`OP_CTV`（OP_CHECKTEMPLATEVERIFY）由 Jeremy Rubin 提出，是最簡潔的 covenant 操作碼提案。它將一個預承諾的交易模板（template hash）與花費交易進行比對：

$$\text{template\_hash} = \text{SHA-256}(\text{version} \| \text{locktime} \| \text{scriptSigs\_hash} \| \text{sequences\_hash} \| \text{outputs\_hash} \| ...)$$

```
<template_hash> OP_CHECKTEMPLATEVERIFY
```

花費交易必須精確匹配 template hash 承諾的結構。OP_CTV 是非遞迴的（除非搭配其他操作碼），被認為是最保守且最安全的 covenant 提案。

### 應用場景

- **Congestion control**：高手續費時期將多筆支付打包成一棵承諾樹
- **Payment pools**：多方共享 UTXO，預定義所有可能的退出路徑
- **Vaults**：簡化的保險箱方案

## OP_VAULT

OP_VAULT（BIP-345）由 James O'Beirne 提出，專為 vault（保險箱）場景設計：

### 工作流程

1. 資金鎖入 vault UTXO
2. 要花費時，先發起 **unvault** 交易（觸發等待期）
3. 等待期內可用 **recovery key** 取消（clawback）
4. 等待期結束後，按預定目的地完成花費

$$\text{vault} \xrightarrow{\text{unvault (trigger)}} \text{waiting period} \xrightarrow{\text{complete}} \text{destination}$$
$$\text{vault} \xrightarrow{\text{unvault (trigger)}} \text{waiting period} \xrightarrow{\text{clawback}} \text{recovery address}$$

## TXHASH

`OP_TXHASH` 提案允許腳本選擇性地雜湊花費交易的特定欄位，提供比 OP_CTV 更細粒度的 introspection：

$$\text{OP\_TXHASH}(\text{flags}) = H(\text{selected fields based on flags})$$

flags 決定了哪些交易欄位被包含在雜湊中，允許更靈活的 covenant 構建。

## Great Script Restoration

Rusty Russell（CLN 的核心開發者）提出的 Great Script Restoration 主張大幅放寬 [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) 的限制，恢復 Satoshi 時代禁用的多個操作碼，並新增更多功能。核心提案包括：

- 恢復 `OP_CAT`、`OP_LEFT`、`OP_RIGHT` 等字串操作碼
- 新增 64-bit 算術操作碼
- 提高堆疊元素大小限制
- 新增 `OP_CHECKSIGFROMSTACK` 等 introspection 操作碼

這個方案相較於逐個引入單一操作碼，採取更激進的一次性升級策略。

## 程式碼範例

### JavaScript（OP_CTV Template Hash 計算）

```javascript
const crypto = require('crypto');

function computeCTVHash(txData) {
  const parts = [];

  // nVersion (4 bytes LE)
  const version = Buffer.alloc(4);
  version.writeInt32LE(txData.version);
  parts.push(version);

  // nLockTime (4 bytes LE)
  const locktime = Buffer.alloc(4);
  locktime.writeUInt32LE(txData.locktime);
  parts.push(locktime);

  // hash of scriptSigs (if any non-empty)
  if (txData.scriptSigs && txData.scriptSigs.length > 0) {
    const sigsConcat = Buffer.concat(txData.scriptSigs);
    parts.push(crypto.createHash('sha256').update(sigsConcat).digest());
  }

  // number of inputs (4 bytes LE)
  const inputCount = Buffer.alloc(4);
  inputCount.writeUInt32LE(txData.inputCount);
  parts.push(inputCount);

  // hash of sequences
  const seqBuf = Buffer.alloc(txData.sequences.length * 4);
  txData.sequences.forEach((seq, i) => seqBuf.writeUInt32LE(seq, i * 4));
  parts.push(crypto.createHash('sha256').update(seqBuf).digest());

  // hash of outputs
  const outputsBuf = Buffer.concat(txData.serializedOutputs);
  parts.push(crypto.createHash('sha256').update(outputsBuf).digest());

  // number of outputs (4 bytes LE)
  const outputCount = Buffer.alloc(4);
  outputCount.writeUInt32LE(txData.outputCount);
  parts.push(outputCount);

  // input index (4 bytes LE)
  const inputIdx = Buffer.alloc(4);
  inputIdx.writeUInt32LE(txData.inputIndex);
  parts.push(inputIdx);

  return crypto.createHash('sha256').update(Buffer.concat(parts)).digest();
}

// 模擬 CTV template
const templateHash = computeCTVHash({
  version: 2,
  locktime: 0,
  scriptSigs: [],
  inputCount: 1,
  sequences: [0xffffffff],
  serializedOutputs: [Buffer.alloc(34)], // simplified
  outputCount: 1,
  inputIndex: 0,
});

console.log('CTV template hash:', templateHash.toString('hex'));
```

### Python（Vault 狀態機模擬）

```python
from dataclasses import dataclass
from enum import Enum
from typing import Optional
import time

class VaultState(Enum):
    LOCKED = 'locked'
    UNVAULTING = 'unvaulting'
    COMPLETED = 'completed'
    RECOVERED = 'recovered'

@dataclass
class Vault:
    amount: int
    state: VaultState
    destination: Optional[str]
    unvault_time: Optional[float]
    delay_seconds: int
    recovery_address: str

    @classmethod
    def create(cls, amount, recovery_address, delay_seconds=86400):
        return cls(
            amount=amount,
            state=VaultState.LOCKED,
            destination=None,
            unvault_time=None,
            delay_seconds=delay_seconds,
            recovery_address=recovery_address,
        )

    def trigger_unvault(self, destination: str) -> dict:
        if self.state != VaultState.LOCKED:
            raise ValueError(f"Cannot unvault from state {self.state}")
        return Vault(
            amount=self.amount,
            state=VaultState.UNVAULTING,
            destination=destination,
            unvault_time=time.time(),
            delay_seconds=self.delay_seconds,
            recovery_address=self.recovery_address,
        ).__dict__

    def complete(self, current_time: float) -> dict:
        if self.state != VaultState.UNVAULTING:
            raise ValueError("Not in unvaulting state")
        if current_time < self.unvault_time + self.delay_seconds:
            remaining = self.unvault_time + self.delay_seconds - current_time
            raise ValueError(f"Delay not met: {remaining:.0f}s remaining")
        return {'state': VaultState.COMPLETED, 'destination': self.destination}

    def clawback(self) -> dict:
        if self.state != VaultState.UNVAULTING:
            raise ValueError("Not in unvaulting state")
        return {'state': VaultState.RECOVERED, 'to': self.recovery_address}

# 模擬 vault 生命週期
vault = Vault.create(
    amount=1_000_000,
    recovery_address='bc1q_recovery...',
    delay_seconds=144 * 600,  # 144 blocks * 10 min
)

print(f"Vault created: {vault.amount} sats, state={vault.state.value}")
print(f"Delay: {vault.delay_seconds}s ({vault.delay_seconds // 600} blocks)")
```

## 相關概念

- [Script Opcodes](/bitcoin/data-structures/script-opcodes/) - OP_CAT 和其他操作碼的定義
- [Tapscript](/bitcoin/advanced/tapscript/) - OP_CAT 重新啟用的目標環境
- [BitVM](/bitcoin/advanced/bitvm/) - 利用 OP_CAT 增強的計算驗證框架
- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - covenant 腳本的底層語言
- [P2TR](/bitcoin/transactions/p2tr/) - covenant 腳本的 Taproot 封裝
- [Timelocks](/bitcoin/advanced/timelocks/) - vault 等待期的時間鎖機制
- [Payment Channels](/bitcoin/advanced/payment-channels/) - covenant 改善通道協議的可能性
- [Multisig/MuSig](/bitcoin/advanced/multisig-musig/) - vault 的 recovery key 多簽方案
- [UTXO Model](/bitcoin/data-structures/utxo-model/) - covenant 限制的是 UTXO 的花費條件
- [Schnorr Signatures](/bitcoin/cryptography/schnorr-signatures/) - OP_CAT covenant 依賴的簽名結構
- [Hash Function Overview](/fundamentals/cryptography/hash-function-overview/) - CTV template hash 的密碼學基礎
