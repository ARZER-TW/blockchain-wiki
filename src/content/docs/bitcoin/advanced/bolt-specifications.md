---
title: "BOLT Specifications"
description: "Lightning Network 的基礎規範：BOLT 1-12 協議詳解，通道建立、交易格式、Onion Routing、Invoice 與 Offers"
tags: [bitcoin, advanced, bolt, lightning, protocol, specifications, invoice]
---

# BOLT Specifications

## 概述

BOLT（Basis of Lightning Technology）是定義 [Lightning Network](/bitcoin/advanced/lightning-network/) 互操作性的一系列技術規範，由 Lightning 開發者社群共同維護。BOLT 規範確保不同的 Lightning 實作（LND、CLN、Eclair、LDK 等）能夠相互通訊、開關通道、路由支付。

目前共有 BOLT #1 至 BOLT #12 共 12 份規範文件（部分仍為草案），涵蓋了從底層傳輸加密到高層支付請求格式的完整協議棧。

## BOLT 規範總覽

| BOLT | 名稱 | 核心內容 |
|------|------|----------|
| #1 | Base Protocol | 訊息格式、feature bits |
| #2 | Peer Protocol | 通道建立、關閉、HTLC 操作 |
| #3 | Transactions | commitment/HTLC 交易格式 |
| #4 | Onion Routing | Sphinx onion packet 結構 |
| #5 | On-chain | 鏈上交易監控與處理 |
| #7 | P2P Node Discovery | gossip protocol、通道公告 |
| #8 | Transport | Noise protocol 加密通訊 |
| #9 | Feature Bits | 功能協商旗標 |
| #10 | DNS Bootstrap | 初始節點發現 |
| #11 | Invoice Protocol | 支付請求格式（lnbc...） |
| #12 | Offers | 可重複使用的支付請求（草案） |

## BOLT #2：通道建立與關閉

### 通道建立流程

BOLT 2 定義了三步握手建立 [支付通道](/bitcoin/advanced/payment-channels/)：

```
Alice                          Bob
  |--- open_channel ----------->|
  |<-- accept_channel ----------|
  |--- funding_created -------->|
  |<-- funding_signed ----------|
  |    (watch for funding tx)   |
  |--- channel_ready ---------->|
  |<-- channel_ready -----------|
```

`open_channel` 訊息包含：
- `funding_satoshis`：通道容量
- `push_msat`：初始推送給對方的金額
- `dust_limit_satoshis`：最小可行輸出金額
- `max_htlc_value_in_flight_msat`：同時進行中的 HTLC 金額上限
- `to_self_delay`：懲罰等待期（區塊數）

### HTLC 操作訊息

通道內的支付透過 HTLC 訊息進行：

- `update_add_htlc`：新增一個 [HTLC](/bitcoin/advanced/htlc/)
- `update_fulfill_htlc`：揭露 preimage 結算 HTLC
- `update_fail_htlc`：回報 HTLC 失敗
- `commitment_signed`：簽署新的 commitment transaction
- `revoke_and_ack`：撤銷舊狀態並確認新狀態

### 通道關閉

- `shutdown`：發起合作關閉
- `closing_signed`：交換關閉交易的手續費提案

## BOLT #3：交易格式

### Commitment Transaction 結構

BOLT 3 精確定義了 commitment transaction 的輸出排序和腳本格式。

**to_local 輸出**（有延遲的自身餘額）：

```
OP_IF
    <revocationpubkey>
OP_ELSE
    <to_self_delay>
    OP_CHECKSEQUENCEVERIFY
    OP_DROP
    <local_delayedpubkey>
OP_ENDIF
OP_CHECKSIG
```

**to_remote 輸出**（對方可立即花費的餘額）：

```
<remote_pubkey> OP_CHECKSIGVERIFY
1 OP_CHECKSEQUENCEVERIFY
```

### HTLC 交易

每個 pending HTLC 在 commitment transaction 中有專屬的輸出，後續由 HTLC-success 或 HTLC-timeout 二階交易花費：

**HTLC-success transaction**：收款方揭露 preimage 結算

$$\text{witness} = \langle \text{sig}_{\text{remote}} \rangle \langle \text{sig}_{\text{local}} \rangle \langle \text{preimage} \rangle$$

**HTLC-timeout transaction**：超時後付款方取回

$$\text{witness} = \langle \text{sig}_{\text{remote}} \rangle \langle \text{sig}_{\text{local}} \rangle \langle 0 \rangle$$

### Anchor Outputs

BOLT 3 v1.1 引入的 anchor output 允許雙方透過 CPFP 追加手續費：

- 每方一個 330 sats 的 anchor output
- commitment transaction 使用最低 fee rate
- 需要時透過子交易追加手續費

## BOLT #4：Onion Routing

### Sphinx Packet 結構

每個 onion packet 固定為 1366 bytes，包含：

| 欄位 | 大小 | 說明 |
|------|------|------|
| version | 1 byte | 目前為 0 |
| public key | 33 bytes | 臨時公鑰 |
| routing info | 1300 bytes | 加密的路由資訊（最多 20 跳） |
| HMAC | 32 bytes | 完整性驗證 |

### 共享密鑰推導

每一跳的共享密鑰使用 ECDH：

$$ss_i = \text{SHA-256}(k_i \cdot P_{\text{sender}}) = \text{SHA-256}(k_{\text{sender}} \cdot P_i)$$

其中 $k_i$ 是節點 $i$ 的私鑰，$P_{\text{sender}}$ 是 onion packet 中的臨時公鑰。

## BOLT #8：Noise Protocol

### 加密傳輸

BOLT 8 基於 Noise Protocol Framework 的 `Noise_XK_secp256k1_ChaChaPoly_SHA256` 建立加密通訊：

1. **Act 1**：Initiator 發送臨時公鑰 + 加密的握手資料
2. **Act 2**：Responder 發送臨時公鑰 + 加密的握手資料
3. **Act 3**：Initiator 發送加密的靜態公鑰 + 認證

三步握手後，雙方獲得用於後續通訊的對稱加密密鑰。所有 Lightning 訊息（BOLT 1-7）都在這個加密通道中傳輸。

## BOLT #11：Invoice Format

### Invoice 編碼

Lightning invoice 使用 bech32 編碼，前綴為 `lnbc`（mainnet）、`lntb`（testnet）、`lnbcrt`（regtest）：

```
lnbc[amount][multiplier]1[data][checksum]
```

金額乘數：`m`（milli）、`u`（micro）、`n`（nano）、`p`（pico）。

### Tagged Fields

| Tag | 說明 |
|-----|------|
| `p` | payment hash（SHA-256） |
| `s` | payment secret（防止 probing） |
| `d` | description（UTF-8 文字） |
| `h` | description hash（長描述的雜湊） |
| `x` | expiry（秒，預設 3600） |
| `r` | routing hints（私密通道資訊） |
| `f` | fallback on-chain address |

## BOLT #12：Offers（草案）

### 從 Invoice 到 Offer

BOLT 11 invoice 是一次性的：每次支付需要新的 invoice。BOLT 12 Offers 引入可重複使用的支付請求：

1. 賣方發布 **Offer**（包含商品描述、價格、節點資訊）
2. 買方發送 **Invoice Request** 到賣方節點
3. 賣方回傳動態生成的 **Invoice**
4. 買方按 invoice 支付

Offers 使用 TLV（Type-Length-Value）編碼，支援：
- 週期性訂閱付款
- 匯率換算（以法幣標價）
- 退款流程
- Blinded paths（增強隱私）

## 程式碼範例

### JavaScript（BOLT 11 Invoice 解析）

```javascript
const bolt11 = require('bolt11');

// 解碼 Lightning invoice
function decodeInvoice(paymentRequest) {
  const decoded = bolt11.decode(paymentRequest);
  const tags = {};
  for (const tag of decoded.tags) {
    tags[tag.tagName] = tag.data;
  }
  return {
    network: decoded.coinType === 'bitcoin' ? 'mainnet' : decoded.coinType,
    amountSats: decoded.satoshis || null,
    timestamp: new Date(decoded.timestamp * 1000).toISOString(),
    paymentHash: tags.payment_hash,
    description: tags.description || null,
    expiry: tags.expire_time || 3600,
    routingHints: tags.routing_info || [],
  };
}

// BOLT 8 Noise handshake 的簡化模擬
function simulateNoiseHandshake(initiatorKey, responderKey) {
  const crypto = require('crypto');
  // Act 1: initiator -> responder
  const ephemeralKey = crypto.randomBytes(32);
  const act1 = { type: 'act1', ephemeralPubkey: ephemeralKey };

  // Act 2: responder -> initiator
  const responderEphemeral = crypto.randomBytes(32);
  const act2 = { type: 'act2', ephemeralPubkey: responderEphemeral };

  // Act 3: derive shared secret (simplified)
  const sharedSecret = crypto.createHash('sha256')
    .update(Buffer.concat([ephemeralKey, responderEphemeral]))
    .digest();

  return {
    sendKey: sharedSecret.slice(0, 16),
    recvKey: sharedSecret.slice(16, 32),
    established: true,
  };
}
```

### Python（BOLT 訊息格式）

```python
import struct
import hashlib

def encode_bolt_message(msg_type: int, payload: bytes) -> bytes:
    """BOLT 1 訊息格式：2 bytes type + payload"""
    return struct.pack('>H', msg_type) + payload

def decode_bolt_message(data: bytes) -> dict:
    """解碼 BOLT 訊息"""
    msg_type = struct.unpack('>H', data[:2])[0]
    payload = data[2:]
    return {'type': msg_type, 'payload': payload}

# BOLT 2 訊息類型
MSG_TYPES = {
    32: 'open_channel',
    33: 'accept_channel',
    34: 'funding_created',
    35: 'funding_signed',
    36: 'channel_ready',
    128: 'update_add_htlc',
    130: 'update_fulfill_htlc',
    131: 'update_fail_htlc',
    132: 'commitment_signed',
    133: 'revoke_and_ack',
    38: 'shutdown',
    39: 'closing_signed',
}

# 模擬 open_channel 訊息
def create_open_channel(funding_sats, push_msat, dust_limit):
    payload = struct.pack('>Q', funding_sats)
    payload += struct.pack('>Q', push_msat)
    payload += struct.pack('>Q', dust_limit)
    return encode_bolt_message(32, payload)

msg = create_open_channel(1_000_000, 0, 546)
decoded = decode_bolt_message(msg)
print(f"Message type: {MSG_TYPES.get(decoded['type'], 'unknown')}")
print(f"Payload length: {len(decoded['payload'])} bytes")
```

## 相關概念

- [Lightning Network](/bitcoin/advanced/lightning-network/) - BOLT 規範所定義的網路
- [Payment Channels](/bitcoin/advanced/payment-channels/) - BOLT 2/3 定義的通道生命週期
- [HTLC](/bitcoin/advanced/htlc/) - BOLT 2/3 定義的條件支付機制
- [Timelocks](/bitcoin/advanced/timelocks/) - BOLT 3 中的 CSV/CLTV 應用
- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - BOLT 3 中的腳本格式
- [Multisig/MuSig](/bitcoin/advanced/multisig-musig/) - funding transaction 的多簽機制
- [Schnorr Signatures](/bitcoin/cryptography/schnorr-signatures/) - 未來 BOLT 升級的簽名方案
- [Transaction Signing BTC](/bitcoin/transactions/transaction-signing-btc/) - commitment transaction 的簽名流程
- [P2WSH](/bitcoin/transactions/p2wpkh-p2wsh/) - BOLT 3 定義的通道腳本格式
- [Hash Function Overview](/fundamentals/cryptography/hash-function-overview/) - payment hash 的密碼學基礎
