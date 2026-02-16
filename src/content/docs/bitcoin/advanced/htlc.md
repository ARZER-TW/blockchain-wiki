---
title: "HTLC (Hash Time-Locked Contract)"
description: "雜湊時間鎖合約：Lightning Network 多跳路由的核心原語，preimage 揭露與 timeout 退款機制"
tags: [bitcoin, advanced, htlc, lightning, atomic-swap, hash-lock, timelock]
---

# HTLC (Hash Time-Locked Contract)

## 概述

Hash Time-Locked Contract（HTLC，雜湊時間鎖合約）是一種條件支付原語：收款方必須在指定時限內揭露特定雜湊值的 preimage 來領取資金，否則資金在超時後退還給付款方。HTLC 結合了 hash-lock（密碼學條件）和 [timelock](/bitcoin/advanced/timelocks/)（時間條件），形成了一個二選一的執行路徑。

HTLC 是 [Lightning Network](/bitcoin/advanced/lightning-network/) 多跳路由的基礎。透過在路徑上的每一跳建立使用相同 payment hash 的 HTLC，並設定遞減的 timeout，實現端到端的原子性支付：要麼所有中繼節點同時結算，要麼全部退款。

## HTLC Script 結構

### Bitcoin Script 實現

HTLC 的核心邏輯以 [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) 表達：

```
OP_IF
    # Hash-lock 路徑（收款方領取）
    OP_SHA256
    <payment_hash>
    OP_EQUALVERIFY
    <recipient_pubkey>
    OP_CHECKSIG
OP_ELSE
    # Timelock 路徑（付款方退款）
    <timeout>
    OP_CHECKLOCKTIMEVERIFY
    OP_DROP
    <sender_pubkey>
    OP_CHECKSIG
OP_ENDIF
```

### 兩條執行路徑

**成功路徑（hash-lock）：** 收款方提供 preimage $r$ 使得 $H(r) = h$：

$$\text{SHA-256}(r) = h \implies \text{unlock funds to recipient}$$

**退款路徑（timelock）：** 超過 timeout 後付款方可取回資金：

$$\text{current\_time} \geq \text{timeout} \implies \text{refund to sender}$$

### 安全性保證

HTLC 的安全性建立在 SHA-256 的 preimage resistance 上。給定 payment hash $h$，找到 $r$ 使得 $\text{SHA-256}(r) = h$ 的計算複雜度為：

$$O(2^{256}) \text{ hash operations}$$

在密碼學假設下，除非知道原始 preimage，否則無法偽造。

## 多跳路由

### HTLC 鏈

假設 Alice 要通過 Bob 和 Carol 支付給 Dave：

```
Alice --HTLC--> Bob --HTLC--> Carol --HTLC--> Dave
timeout: T+30    timeout: T+20   timeout: T+10
```

所有 HTLC 使用相同的 payment hash $h = \text{SHA-256}(r)$，但 timeout 依序遞減。

### 結算流程

1. Dave 知道 preimage $r$，向 Carol 揭露以領取資金
2. Carol 從 Dave 處得知 $r$，向 Bob 揭露以領取資金
3. Bob 從 Carol 處得知 $r$，向 Alice 揭露以領取資金

### Timeout 遞減的必要性

$$T_{\text{Alice} \to \text{Bob}} > T_{\text{Bob} \to \text{Carol}} > T_{\text{Carol} \to \text{Dave}}$$

每一跳的 timeout 必須嚴格遞減，留出足夠的時間差（`cltv_expiry_delta`）讓中繼節點在得知 preimage 後有時間在上游結算。若 timeout 相同或間隔過短，中繼節點可能因為下游 HTLC 已結算而上游 HTLC 已超時，導致資金損失。

典型的 `cltv_expiry_delta` 為 40-144 個區塊（約 7 小時到 1 天）。

## Onion Routing（Sphinx）

### 隱私保護

Lightning Network 的路由資訊使用 Sphinx onion routing 加密封裝，定義於 [BOLT 4](/bitcoin/advanced/bolt-specifications/)。每個中繼節點收到的 onion packet 結構為：

$$\text{onion} = \text{Enc}_{k_1}(\text{hop}_1 \| \text{Enc}_{k_2}(\text{hop}_2 \| \text{Enc}_{k_3}(\text{hop}_3 \| \ldots)))$$

每個中繼節點使用自己的私鑰解密最外層，得到：
- 下一跳的節點 ID
- 轉發金額和 HTLC timeout
- 內層的加密 onion（轉發給下一跳）

中繼節點無法得知自己是第幾跳、路徑總共有幾跳、或最終目的地是誰。

### 錯誤回報

支付失敗時，失敗節點加密錯誤訊息沿原路返回。每個中繼節點依次解密，最終付款方得到完整的錯誤資訊，包括哪個通道/節點造成了失敗。

## PTLCs: Schnorr-Based Upgrade

### HTLC 的隱私問題

HTLC 的所有跳使用相同的 payment hash $h$，這意味著知道 $h$ 的任何中繼節點可以關聯同一筆支付的不同跳。如果兩個串通的中繼節點在同一路徑上，它們可以確認自己正在轉發同一筆支付。

### Point Time-Locked Contracts

PTLC 使用 [Schnorr 簽名](/bitcoin/cryptography/schnorr-signatures/) 的 adaptor signature 技術替代 hash-lock。每一跳使用不同的 point（橢圓曲線上的點），但這些 point 之間的關係只有相鄰兩跳知道：

$$P_i = P_{i-1} + t_i \cdot G$$

其中 $t_i$ 是每一跳的 blinding factor。外部觀察者無法關聯不同跳的 PTLC。

## 程式碼範例

### JavaScript（HTLC 模擬）

```javascript
const crypto = require('crypto');

class HTLC {
  constructor(amount, paymentHash, timeout, senderPubkey, recipientPubkey) {
    this.amount = amount;
    this.paymentHash = paymentHash;
    this.timeout = timeout;
    this.senderPubkey = senderPubkey;
    this.recipientPubkey = recipientPubkey;
    this.state = 'active';
  }

  claimWithPreimage(preimage) {
    const hash = crypto.createHash('sha256').update(preimage).digest('hex');
    if (hash !== this.paymentHash) {
      throw new Error('Invalid preimage');
    }
    if (this.state !== 'active') {
      throw new Error(`HTLC is ${this.state}`);
    }
    this.state = 'claimed';
    return { success: true, preimage: preimage.toString('hex') };
  }

  refundAfterTimeout(currentBlock) {
    if (currentBlock < this.timeout) {
      throw new Error(`Timeout not reached: ${currentBlock} < ${this.timeout}`);
    }
    if (this.state !== 'active') {
      throw new Error(`HTLC is ${this.state}`);
    }
    this.state = 'refunded';
    return { success: true, refundBlock: currentBlock };
  }
}

// 模擬多跳路由
const preimage = crypto.randomBytes(32);
const paymentHash = crypto.createHash('sha256').update(preimage).digest('hex');

const htlcChain = [
  new HTLC(100_000, paymentHash, 700_030, 'alice', 'bob'),
  new HTLC(99_900, paymentHash, 700_020, 'bob', 'carol'),
  new HTLC(99_800, paymentHash, 700_010, 'carol', 'dave'),
];

// Dave 揭露 preimage，從尾端向頭端結算
for (let i = htlcChain.length - 1; i >= 0; i--) {
  const result = htlcChain[i].claimWithPreimage(preimage);
  console.log(`Hop ${i}: claimed, amount=${htlcChain[i].amount}`);
}
```

### Python（HTLC Script 生成）

```python
import hashlib
import os
from dataclasses import dataclass

@dataclass
class HTLCParams:
    payment_hash: bytes
    sender_pubkey: bytes
    recipient_pubkey: bytes
    timeout: int

def create_htlc_script(params: HTLCParams) -> list:
    """產生 HTLC 的 Script 操作碼序列（概念性表示）"""
    return [
        'OP_IF',
            'OP_SHA256',
            params.payment_hash.hex(),
            'OP_EQUALVERIFY',
            params.recipient_pubkey.hex(),
            'OP_CHECKSIG',
        'OP_ELSE',
            str(params.timeout),
            'OP_CHECKLOCKTIMEVERIFY',
            'OP_DROP',
            params.sender_pubkey.hex(),
            'OP_CHECKSIG',
        'OP_ENDIF',
    ]

def verify_preimage(preimage: bytes, payment_hash: bytes) -> bool:
    """驗證 preimage 是否匹配 payment hash"""
    return hashlib.sha256(preimage).digest() == payment_hash

# 產生 payment preimage/hash pair
preimage = os.urandom(32)
payment_hash = hashlib.sha256(preimage).digest()

htlc = HTLCParams(
    payment_hash=payment_hash,
    sender_pubkey=os.urandom(33),
    recipient_pubkey=os.urandom(33),
    timeout=700_000,
)

script = create_htlc_script(htlc)
print("HTLC Script:")
for op in script:
    print(f"  {op}")

print(f"\nPreimage valid: {verify_preimage(preimage, payment_hash)}")
print(f"Wrong preimage: {verify_preimage(os.urandom(32), payment_hash)}")
```

## 相關概念

- [Payment Channels](/bitcoin/advanced/payment-channels/) - HTLC 附加於承諾交易的機制
- [Lightning Network](/bitcoin/advanced/lightning-network/) - HTLC 多跳路由組成的支付網路
- [Timelocks](/bitcoin/advanced/timelocks/) - CLTV 在 HTLC timeout 路徑中的應用
- [BOLT Specifications](/bitcoin/advanced/bolt-specifications/) - HTLC 的正式協議規範
- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - HTLC 腳本的底層指令集
- [Schnorr Signatures](/bitcoin/cryptography/schnorr-signatures/) - PTLCs 升級所需的 adaptor signature
- [SHA-256](/fundamentals/cryptography/sha-256/) - payment hash 的雜湊函數
- [Hash Function Overview](/fundamentals/cryptography/hash-function-overview/) - preimage resistance 的密碼學基礎
- [P2WSH](/bitcoin/transactions/p2wpkh-p2wsh/) - HTLC 輸出的 SegWit 腳本封裝
- [Tapscript](/bitcoin/advanced/tapscript/) - Taproot 環境下 HTLC 的腳本格式
- [ECDSA](/fundamentals/cryptography/ecdsa/) - HTLC 簽名驗證的當前方案
