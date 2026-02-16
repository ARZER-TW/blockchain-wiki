---
title: "Lightning Network"
description: "Bitcoin Layer 2 支付通道網路：即時、低手續費的鏈下交易，HTLC 路由機制與網路拓撲分析"
tags: [bitcoin, advanced, lightning-network, layer2, payment-channels, htlc, scalability]
---

# Lightning Network

## 概述

Lightning Network（閃電網路）是建構在 Bitcoin 區塊鏈之上的 Layer 2 支付通道網路，由 Joseph Poon 和 Thaddeus Dryja 於 2015 年在白皮書中首次提出。其核心理念是將大量小額交易移至鏈下執行，僅在開啟和關閉通道時與主鏈互動，從而實現接近即時的支付確認和極低的手續費。

Bitcoin 主鏈的吞吐量受限於約每 10 分鐘一個區塊、每個區塊 4M weight units 的上限，理論上每秒僅能處理約 7 筆交易。Lightning Network 透過 [Payment Channels](/bitcoin/advanced/payment-channels/) 的雙向狀態更新和 [HTLC](/bitcoin/advanced/htlc/) 的多跳路由機制，將理論吞吐量提升至每秒數百萬筆交易。

截至目前，Lightning Network 擁有超過 15,000 個公開節點、約 60,000 條通道，總鎖定容量約 5,000 BTC。

## 核心架構

### 三層結構

Lightning Network 的運作可拆解為三個層次：

1. **支付通道層**：兩方之間透過 2-of-2 [multisig](/bitcoin/advanced/multisig-musig/) 建立鏈上資金鎖定，後續的餘額更新完全在鏈下進行
2. **路由層**：透過 [HTLC](/bitcoin/advanced/htlc/) 串聯多條通道，使未直接連線的節點也能互相支付
3. **應用層**：[BOLT 11](/bitcoin/advanced/bolt-specifications/) invoice、keysend、LNURL 等支付請求協議

### 通道生命週期

$$\text{on-chain cost} = \text{funding\_tx\_fee} + \text{closing\_tx\_fee}$$

一條通道的總鏈上成本僅為開啟與關閉各一筆交易的手續費。通道存續期間，雙方可進行無上限次數的餘額更新，每次更新的邊際成本趨近於零。

### 容量與流動性

通道容量由 funding transaction 鎖定的金額決定。對於單方出資的通道：

$$C_{\text{channel}} = \text{funding\_amount}$$

通道內的餘額分配為：

$$\text{balance}_A + \text{balance}_B = C_{\text{channel}}$$

其中 $\text{balance}_A$ 為 Alice 側的可用餘額（outbound liquidity），$\text{balance}_B$ 為 Bob 側的可用餘額（inbound liquidity）。

## 路由機制

### 源路由（Source Routing）

Lightning Network 採用源路由模式：付款方負責計算從自身到收款方的完整路徑。路徑選擇的最佳化目標為：

$$\min \sum_{i=1}^{n} \left( \text{base\_fee}_i + \text{fee\_rate}_i \times \text{amount} \right)$$

其中 $n$ 是路徑上的跳數，每個中繼節點收取 base fee 加上按比例計算的 fee rate。

### Onion Routing

為保護支付隱私，Lightning Network 使用基於 Sphinx 的 onion routing。每一跳的路由資訊以巢狀加密封裝，中繼節點僅知道前一跳和下一跳，無法得知完整路徑或最終目的地。

### Multi-Path Payments (MPP)

大額支付可拆分為多條路徑同時進行：

$$\text{total\_payment} = \sum_{k=1}^{m} \text{partial\_amount}_k$$

MPP 顯著提升了大額支付的成功率，因為不再要求單一路徑上所有通道都有足夠的流動性。

## 與 Ethereum L2 的比較

| 特徵 | Lightning Network | Optimistic Rollup | ZK-Rollup | State Channels |
|------|------------------|--------------------|-----------|----------------|
| 類型 | Payment channel network | Data availability on L1 | Validity proof | Off-chain state |
| 最終性 | 即時（通道內） | 7 天挑戰期 | 即時（proof 驗證後） | 即時（通道內） |
| 吞吐量 | 理論無上限 | ~2,000 TPS | ~2,000+ TPS | 受限於通道數 |
| 支援功能 | 主要為支付 | 通用智能合約 | 通用智能合約 | 應用特定邏輯 |
| 流動性需求 | 需預鎖資金 | 無需預鎖 | 無需預鎖 | 需預鎖資金 |
| 資料可用性 | 鏈下（僅通道參與方） | 鏈上 calldata/blob | 鏈上 calldata/blob | 鏈下 |

## 網路拓撲

Lightning Network 呈現 scale-free 網路特徵，少數高連接度的 hub 節點承載了大部分路由。節點度分佈近似冪律：

$$P(k) \propto k^{-\gamma} \quad (\gamma \approx 2.1)$$

這意味著網路對隨機節點故障具有高度韌性，但對高度節點的定向攻擊較為脆弱。

## 程式碼範例

### JavaScript（使用 bolt11 解析 invoice）

```javascript
const bolt11 = require('bolt11');

// 解碼 Lightning invoice
const invoice = 'lnbc1pvjluezsp5zyg3zyg3zyg3...';
const decoded = bolt11.decode(invoice);

console.log('Network:', decoded.coinType);
console.log('Amount (sats):', decoded.satoshis);
console.log('Payment hash:', decoded.tags.find(t => t.tagName === 'payment_hash').data);
console.log('Description:', decoded.tags.find(t => t.tagName === 'description')?.data);
console.log('Expiry (sec):', decoded.timeExpireDate - decoded.timestamp);

// 建立簡易 Lightning invoice（概念示意）
function createInvoiceData(amountSats, description, paymentHash) {
  return {
    coinType: 'bitcoin',
    satoshis: amountSats,
    timestamp: Math.floor(Date.now() / 1000),
    tags: [
      { tagName: 'payment_hash', data: paymentHash },
      { tagName: 'description', data: description },
      { tagName: 'expire_time', data: 3600 },
    ],
  };
}

// 路由費用計算
function calculateRouteFee(amount, hops) {
  return hops.reduce((totalFee, hop) => {
    const hopFee = hop.baseFee + Math.ceil(amount * hop.feeRate / 1000000);
    return totalFee + hopFee;
  }, 0);
}

const route = [
  { baseFee: 1, feeRate: 100 },  // 0.01% fee rate
  { baseFee: 1, feeRate: 50 },   // 0.005% fee rate
];

const paymentAmount = 100000; // 100,000 sats
const totalFee = calculateRouteFee(paymentAmount, route);
console.log(`Route fee for ${paymentAmount} sats: ${totalFee} sats`);
```

### Python（通道容量分析）

```python
import hashlib
import os

def generate_payment_hash():
    """產生 payment preimage 和對應的 payment hash"""
    preimage = os.urandom(32)
    payment_hash = hashlib.sha256(preimage).digest()
    return preimage, payment_hash

def simulate_channel_state(capacity, initial_balance_a):
    """模擬通道狀態更新"""
    balance_a = initial_balance_a
    balance_b = capacity - initial_balance_a
    states = [(balance_a, balance_b)]

    return {
        'capacity': capacity,
        'balance_a': balance_a,
        'balance_b': balance_b,
        'states': states,
        'update': lambda amt, direction: update_state(
            states, capacity, amt, direction
        ),
    }

def update_state(states, capacity, amount, direction):
    """更新通道狀態（A->B 或 B->A）"""
    balance_a, balance_b = states[-1]
    if direction == 'a_to_b':
        if amount > balance_a:
            raise ValueError("Insufficient outbound liquidity")
        new_a = balance_a - amount
        new_b = balance_b + amount
    else:
        if amount > balance_b:
            raise ValueError("Insufficient inbound liquidity")
        new_a = balance_a + amount
        new_b = balance_b - amount

    assert new_a + new_b == capacity
    states.append((new_a, new_b))
    return new_a, new_b

# 模擬一條 1,000,000 sat 的通道
preimage, payment_hash = generate_payment_hash()
print(f"Payment hash: {payment_hash.hex()}")
print(f"Preimage: {preimage.hex()}")

channel = simulate_channel_state(1_000_000, 600_000)
print(f"Initial: A={channel['balance_a']}, B={channel['balance_b']}")

# 模擬多次支付
channel['update'](50_000, 'a_to_b')
channel['update'](20_000, 'b_to_a')
for state in channel['states']:
    print(f"  A={state[0]:>10,} | B={state[1]:>10,}")
```

## 當前發展與挑戰

### 已解決的問題
- **路由可靠性**：MPP 和 Trampoline routing 大幅提升成功率
- **流動性管理**：Submarine swaps、Loop In/Out 協助平衡通道
- **使用者體驗**：Phoenix、Breez 等錢包實現了近乎無感的通道管理

### 尚待解決的挑戰
- **Inbound liquidity**：新節點缺乏收款能力
- **Watchtower 可用性**：離線節點需要第三方監控舊狀態
- **Channel jamming**：惡意佔用通道容量的攻擊向量
- **路由隱私**：balance probing 可推斷通道餘額分佈

## 相關概念

- [Payment Channels](/bitcoin/advanced/payment-channels/) - 支付通道的建立與狀態更新機制
- [HTLC](/bitcoin/advanced/htlc/) - 跨通道的原子條件支付
- [BOLT Specifications](/bitcoin/advanced/bolt-specifications/) - Lightning Network 的技術規範
- [Timelocks](/bitcoin/advanced/timelocks/) - 時間鎖在通道安全中的角色
- [Multisig/MuSig](/bitcoin/advanced/multisig-musig/) - 通道 funding 交易的多簽機制
- [P2TR](/bitcoin/transactions/p2tr/) - Taproot 對通道隱私的提升
- [P2WSH](/bitcoin/transactions/p2wpkh-p2wsh/) - SegWit 通道的腳本格式
- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - 通道交易使用的腳本語言
- [Transaction Signing BTC](/bitcoin/transactions/transaction-signing-btc/) - 承諾交易的簽名流程
- [Hash Function Overview](/fundamentals/cryptography/hash-function-overview/) - 支付雜湊與 preimage 機制的密碼學基礎
- [ECDSA](/fundamentals/cryptography/ecdsa/) - 傳統 Lightning 通道使用的簽名演算法
- [Schnorr Signatures](/bitcoin/cryptography/schnorr-signatures/) - PTLCs 升級所需的簽名方案
