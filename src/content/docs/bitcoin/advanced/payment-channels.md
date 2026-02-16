---
title: "Payment Channels"
description: "Bitcoin 支付通道：2-of-2 multisig funding、承諾交易、撤銷機制、合作與強制關閉通道"
tags: [bitcoin, advanced, payment-channels, lightning, commitment-transactions, multisig]
---

# Payment Channels

## 概述

Payment Channels（支付通道）是一種鏈下狀態更新機制，允許兩方在僅需兩筆鏈上交易（開啟和關閉）的前提下，進行任意次數的餘額轉移。通道的安全性由 Bitcoin 的 [Script](/bitcoin/data-structures/bitcoin-script/) 和 [Timelocks](/bitcoin/advanced/timelocks/) 保障：任何一方試圖廣播過期狀態，將面臨資金被全數沒收的懲罰。

支付通道是 [Lightning Network](/bitcoin/advanced/lightning-network/) 的基礎構建單元。多條通道串聯並搭配 [HTLC](/bitcoin/advanced/htlc/)，即形成可路由的支付網路。

## Funding Transaction

### 建立流程

通道的建立始於一筆 funding transaction，將資金鎖入一個 2-of-2 [multisig](/bitcoin/advanced/multisig-musig/) 輸出：

$$\text{funding\_output} = \text{2-of-2}(\text{pubkey}_A, \text{pubkey}_B)$$

安全的建立流程為：

1. Alice 和 Bob 交換公鑰
2. 雙方協商第一筆 commitment transaction（退款交易）並交換簽名
3. **確認持有退款簽名後**，Alice 才廣播 funding transaction

這個順序至關重要：若 Alice 先廣播 funding transaction，而 Bob 拒絕簽署任何 commitment transaction，資金將永久鎖死在 2-of-2 multisig 中。

### Anchor Outputs

現代通道（BOLT 3 v1.1+）使用 anchor output 設計。每方各有一個小額（330 sats）anchor output，允許透過 [CPFP](/bitcoin/transactions/rbf-cpfp/) 追加手續費，解決了 commitment transaction 手續費預估困難的問題。

## Commitment Transactions

### 非對稱承諾交易

通道的每次狀態更新會產生一對非對稱的 commitment transactions。Alice 持有的版本和 Bob 持有的版本結構不同：

**Alice 持有的 commitment transaction：**
- 輸出 1（to_local）：Alice 的餘額，但有 `to_self_delay` 的 [CSV timelock](/bitcoin/advanced/timelocks/)
- 輸出 2（to_remote）：Bob 的餘額，可立即花費

**Bob 持有的 commitment transaction：**
- 輸出 1（to_local）：Bob 的餘額，有 CSV timelock
- 輸出 2（to_remote）：Alice 的餘額，可立即花費

非對稱設計的目的是給予對方一個時間窗口來檢測舊狀態的廣播並執行懲罰。

### 狀態編號

每次更新對應一個遞增的 commitment number $n$：

$$\text{state}_n = (\text{balance}_A^{(n)}, \text{balance}_B^{(n)})$$

$$\text{balance}_A^{(n)} + \text{balance}_B^{(n)} = C_{\text{channel}}$$

## 撤銷機制

### Revocation Keys

舊狀態的撤銷透過 revocation key 實現。每次狀態更新時，雙方交換用於構造前一狀態 revocation key 的半密鑰（per-commitment secret）。

revocation public key 的推導使用橢圓曲線運算：

$$R = r_A \cdot G + r_B \cdot G$$

其中 $r_A$ 和 $r_B$ 分別是 Alice 和 Bob 為該狀態貢獻的 revocation 半密鑰。

### 懲罰交易

若 Alice 廣播了已被撤銷的 commitment transaction（第 $n$ 個狀態），Bob 在 `to_self_delay` 期限內可以：

1. 用 Alice 之前揭露的 per-commitment secret 構造完整的 revocation private key
2. 花費 Alice 的 `to_local` 輸出（本應在 timelock 後歸 Alice）
3. 同時花費自己的 `to_remote` 輸出

結果是 Bob 取得通道內的全部資金。這個機制形成了強烈的經濟威懾。

### Watchtower

離線的一方無法即時偵測對手廣播舊狀態。Watchtower 是第三方服務，代為監控區塊鏈並在需要時廣播懲罰交易。Watchtower 僅需存儲 breach remedy transaction 的加密版本，直到偵測到舊的 commitment transaction hash 時才能解密並廣播。

## 通道關閉

### 合作關閉（Cooperative Close）

雙方協商最終餘額並簽署一筆沒有 timelock 的 closing transaction：

```
Input: funding_output (2-of-2 multisig)
Output 1: balance_A -> Alice's address
Output 2: balance_B -> Bob's address
```

合作關閉是最經濟的方式，交易體積最小且雙方立即獲得資金。

### 強制關閉（Force Close）

任何一方可單方面廣播最新的 commitment transaction。由於 `to_local` 輸出有 CSV timelock（通常 144-2016 個區塊），發起 force close 的一方需要等待較長時間才能取回資金。

### Splice-in / Splice-out

通道拼接（Splicing）允許在不關閉通道的情況下增減通道容量。splice-in 追加資金，splice-out 提取部分資金。拼接期間通道持續可用，舊的 funding 和新的 funding 存在一段過渡共存期。

## eltoo / LN-Symmetry

### 現行機制的問題

傳統的懲罰機制要求每一方存儲所有歷史狀態的 revocation secret，儲存需求隨通道壽命線性增長：

$$\text{storage} = O(n) \quad \text{where } n \text{ is state count}$$

### eltoo 提案

eltoo（由 Christian Decker, Rusty Russell, Arik Oschimchik 提出）使用 SIGHASH_ANYPREVOUT（BIP-118）實現對稱的狀態更新：

- 每次更新交易可替換任何先前的狀態（而非僅替換前一個）
- 不再需要懲罰機制，改用「最新狀態勝出」的簡單規則
- 儲存需求降為 $O(1)$

eltoo 需要 BIP-118 SIGHASH_ANYPREVOUT 軟分叉才能啟用，目前尚在提案階段。

## 程式碼範例

### JavaScript（模擬通道狀態更新）

```javascript
const crypto = require('crypto');

class PaymentChannel {
  constructor(capacity, balanceA) {
    this.capacity = capacity;
    this.balanceA = balanceA;
    this.balanceB = capacity - balanceA;
    this.stateNumber = 0;
    this.revokedStates = [];
  }

  updateState(amount, direction) {
    const prevState = {
      number: this.stateNumber,
      balanceA: this.balanceA,
      balanceB: this.balanceB,
      revocationSecret: crypto.randomBytes(32),
    };

    if (direction === 'a_to_b') {
      if (amount > this.balanceA) throw new Error('Insufficient balance A');
      this.balanceA -= amount;
      this.balanceB += amount;
    } else {
      if (amount > this.balanceB) throw new Error('Insufficient balance B');
      this.balanceA += amount;
      this.balanceB -= amount;
    }

    this.stateNumber += 1;
    this.revokedStates.push(prevState);
    return { state: this.stateNumber, a: this.balanceA, b: this.balanceB };
  }

  checkBreach(broadcastedState) {
    const revoked = this.revokedStates.find(
      s => s.number === broadcastedState
    );
    if (revoked) {
      return {
        breach: true,
        penaltyAmount: this.capacity,
        revocationSecret: revoked.revocationSecret.toString('hex'),
      };
    }
    return { breach: false };
  }
}

const channel = new PaymentChannel(1_000_000, 600_000);
console.log(channel.updateState(50_000, 'a_to_b'));
console.log(channel.updateState(20_000, 'b_to_a'));

// 模擬 breach：Alice 廣播 state 0
const breach = channel.checkBreach(0);
console.log('Breach detected:', breach.breach);
```

### Python（revocation secret 推導）

```python
import hashlib
import os

def derive_per_commitment_secret(seed: bytes, index: int) -> bytes:
    """依據 BOLT 3 的 per-commitment secret 推導"""
    # 簡化版本：實際使用 shachain 結構
    data = seed + index.to_bytes(8, 'big')
    return hashlib.sha256(data).digest()

def compute_revocation_pubkey(
    base_point: bytes, per_commitment_point: bytes
) -> bytes:
    """概念性的 revocation key 推導（簡化）"""
    combined = hashlib.sha256(base_point + per_commitment_point).digest()
    return combined  # 實際使用 EC point 運算

# 模擬 per-commitment secret 鏈
seed = os.urandom(32)
secrets = []
for i in range(5):
    secret = derive_per_commitment_secret(seed, i)
    secrets.append(secret)
    print(f"State {i}: secret={secret[:8].hex()}...")

# 撤銷驗證
def verify_revocation(claimed_secret, expected_hash):
    return hashlib.sha256(claimed_secret).digest() == expected_hash

secret_hash = hashlib.sha256(secrets[0]).digest()
print(f"Revocation valid: {verify_revocation(secrets[0], secret_hash)}")
```

## 相關概念

- [Lightning Network](/bitcoin/advanced/lightning-network/) - 由支付通道組成的路由網路
- [HTLC](/bitcoin/advanced/htlc/) - 跨通道的原子條件支付機制
- [Timelocks](/bitcoin/advanced/timelocks/) - CSV/CLTV 在通道安全中的角色
- [Multisig/MuSig](/bitcoin/advanced/multisig-musig/) - funding transaction 的 2-of-2 multisig
- [BOLT Specifications](/bitcoin/advanced/bolt-specifications/) - 通道協議的正式規範
- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - 承諾交易腳本的底層語言
- [P2WSH](/bitcoin/transactions/p2wpkh-p2wsh/) - 通道 funding output 的腳本格式
- [RBF/CPFP](/bitcoin/transactions/rbf-cpfp/) - Anchor output 的 CPFP 手續費追加
- [Transaction Signing BTC](/bitcoin/transactions/transaction-signing-btc/) - commitment transaction 簽名
- [UTXO Model](/bitcoin/data-structures/utxo-model/) - 通道 funding 消耗的鏈上 UTXO
- [Schnorr Signatures](/bitcoin/cryptography/schnorr-signatures/) - MuSig2 通道升級的簽名方案
