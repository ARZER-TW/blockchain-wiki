---
title: "Compact Blocks"
description: "Compact Blocks, BIP-152, short txid, bandwidth reduction"
tags: [bitcoin, network, compact-blocks, bip-152, bandwidth, siphash]
---

# Compact Blocks

## 概述

Compact Blocks（BIP-152）是 Bitcoin 的區塊壓縮傳播協議，利用接收節點的 [mempool](/bitcoin/network/mempool-btc/) 已有的交易資料，將區塊傳播所需的頻寬減少約 99.5%。發送方只傳輸區塊頭和交易的 short ID（6 bytes），接收方根據 short ID 在本地 mempool 中匹配交易來重建完整區塊。BIP-152 提供高頻寬模式（直接推送）和低頻寬模式（先通知再請求）兩種運作方式。

## 核心原理

### 運作流程

**Low Bandwidth Mode（預設）**：

```
Sender                              Receiver
   |                                    |
   |--- headers(new_block_header) ----->|
   |                                    |
   |<-- getdata(CMPCT_BLOCK) ----------|
   |                                    |
   |--- cmpctblock(header + short_ids)->|
   |                                    |
   |         [match against mempool]    |
   |         [identify missing txs]     |
   |                                    |
   |<-- getblocktxn(missing_indices) ---|
   |                                    |
   |--- blocktxn(missing_txs) -------->|
   |                                    |
   |         [assemble full block]      |
   |         [validate]                 |
```

**High Bandwidth Mode**：

```
Sender                              Receiver
   |                                    |
   |--- cmpctblock(header + short_ids)->|  (直接推送，不等請求)
   |                                    |
   |         [match against mempool]    |
   |                                    |
   |<-- getblocktxn(missing_indices) ---|
   |                                    |
   |--- blocktxn(missing_txs) -------->|
```

高頻寬模式省去了 header announcement 和 getdata 的往返時間，適合需要最快速區塊傳播的場景（如礦工之間）。每個節點可以對最多 3 個 outbound peer 啟用高頻寬模式。

### Short Transaction ID

Short ID 使用 SipHash-2-4 從完整的 txid 生成 6 bytes 的短識別碼：

$$\text{short\_id} = \text{SipHash}_{k_0, k_1}(\text{wtxid}) \mod 2^{48}$$

其中 SipHash 的 key 由區塊頭的雜湊和一個 nonce 決定：

$$k_0 \| k_1 = \text{SHA-256}(\text{block\_header} \| \text{nonce})[:16]$$

為什麼使用 SipHash：
- 快速：比 SHA-256 快 ~10x
- 抗碰撞（對 keyed hash）：攻擊者無法提前構造碰撞的交易
- 6 bytes = 48 bits，在一個區塊的交易數量下碰撞機率極低

### 碰撞機率

給定一個區塊中有 $n$ 筆交易，至少一對 short ID 碰撞的機率（Birthday Problem）：

$$P(\text{collision}) \approx 1 - e^{-\frac{n(n-1)}{2 \times 2^{48}}}$$

對於 $n = 3{,}000$（典型區塊）：

$$P \approx 1 - e^{-\frac{3000 \times 2999}{2 \times 2^{48}}} \approx 1.6 \times 10^{-8}$$

碰撞極為罕見。若發生碰撞，節點會回退到下載完整區塊。

### 頻寬節省

**傳統完整區塊**：~1-4 MB

**Compact Block 訊息**：
- Block header: 80 bytes
- Nonce: 8 bytes
- Short ID count: varint
- Short IDs: $n \times 6$ bytes
- Prefilled txs: 通常只有 coinbase

對於 3,000 筆交易的區塊：

$$\text{compact\_size} = 80 + 8 + 3 + 3000 \times 6 + \sim 250 \approx 18{,}341 \text{ bytes}$$

$$\text{reduction} = 1 - \frac{18{,}341}{1{,}000{,}000} \approx 98.2\%$$

加上 coinbase 和可能的缺失交易，實際節省約 95-99.5%。

### Mempool 匹配率

Compact blocks 的效率完全取決於接收方的 mempool 中已有多少區塊中的交易：

| Mempool 匹配率 | 需要額外下載 | 總節省 |
|---------------|------------|--------|
| 100% | 僅 compact block 訊息 | ~99.5% |
| 95% | 5% 的交易全文 | ~95% |
| 80% | 20% 的交易全文 | ~80% |
| 0% | 整個區塊 | 略微負面（overhead） |

影響匹配率的因素：
- 礦工的 mempool 策略（是否包含非標準交易）
- 網路連線品質（是否及時收到所有交易）
- [Erlay](/bitcoin/network/erlay/) 的交易傳播效率

### 與 Xthin 的比較

Compact Blocks（BIP-152）不是唯一的區塊壓縮方案。Bitcoin Unlimited 開發了 Xthin：

| 特性 | Compact Blocks (BIP-152) | Xthin |
|------|-------------------------|-------|
| Short ID | 6 bytes (SipHash) | 8 bytes (SHA-256 前綴) |
| Key 來源 | header hash + nonce | 無（使用 txid 前綴） |
| 碰撞防禦 | Keyed hash 防止攻擊 | 無 key，可能被攻擊 |
| 高頻寬模式 | 支援 | 不支援 |
| 採用 | Bitcoin Core | Bitcoin Unlimited |

## 程式碼範例

```python
# Compact Block 編碼與解碼
import struct
import hashlib
import os

def siphash(key: bytes, data: bytes) -> int:
    """簡化的 SipHash-2-4 實現（僅供教學，生產環境請用 C 實現）"""
    # 實際實現應使用 pysiphash 或 C binding
    # 這裡用 HMAC 近似 (不是真正的 SipHash)
    import hmac
    h = hmac.new(key[:16], data, hashlib.sha256).digest()
    return int.from_bytes(h[:6], "little")


def compute_short_ids(block_header: bytes, nonce: int, wtxids: list[bytes]) -> list[int]:
    """計算 compact block 的 short IDs"""
    # 產生 SipHash key
    header_nonce = block_header + struct.pack("<Q", nonce)
    key_material = hashlib.sha256(header_nonce).digest()
    k0 = key_material[:8]
    k1 = key_material[8:16]
    key = k0 + k1

    short_ids = []
    for wtxid in wtxids:
        sid = siphash(key, wtxid) % (2 ** 48)
        short_ids.append(sid)

    return short_ids


def reconstruct_block(
    compact_msg: dict,
    mempool_txs: dict,  # short_id -> full_tx
) -> dict:
    """從 compact block 訊息重建完整區塊"""
    header = compact_msg["header"]
    short_ids = compact_msg["short_ids"]
    prefilled = compact_msg["prefilled_txs"]

    transactions = [None] * (len(short_ids) + len(prefilled))
    missing_indices = []

    # 填入 prefilled 交易（通常是 coinbase）
    prefilled_offset = 0
    for idx, tx in prefilled:
        transactions[idx] = tx
        prefilled_offset += 1

    # 根據 short ID 從 mempool 匹配
    sid_idx = 0
    for i in range(len(transactions)):
        if transactions[i] is not None:
            continue
        sid = short_ids[sid_idx]
        sid_idx += 1

        if sid in mempool_txs:
            transactions[i] = mempool_txs[sid]
        else:
            missing_indices.append(i)

    return {
        "header": header,
        "transactions": transactions,
        "missing_indices": missing_indices,
        "complete": len(missing_indices) == 0,
        "match_rate": 1 - len(missing_indices) / len(short_ids) if short_ids else 1,
    }


# 頻寬節省計算
def bandwidth_savings(num_txs, avg_tx_size, match_rate):
    """計算 compact blocks 的頻寬節省"""
    full_block_size = num_txs * avg_tx_size
    compact_size = 80 + 8 + num_txs * 6 + 250  # header + nonce + short_ids + coinbase
    missing_txs_size = int(num_txs * (1 - match_rate)) * avg_tx_size
    total_compact = compact_size + missing_txs_size

    return {
        "full_block_bytes": full_block_size,
        "compact_total_bytes": total_compact,
        "savings_percent": (1 - total_compact / full_block_size) * 100,
    }

result = bandwidth_savings(num_txs=3000, avg_tx_size=350, match_rate=0.99)
print(f"Full block: {result['full_block_bytes']:,} bytes")
print(f"Compact total: {result['compact_total_bytes']:,} bytes")
print(f"Savings: {result['savings_percent']:.1f}%")
```

```javascript
// 查詢 Compact Block 支援狀態
async function getCompactBlockStats(rpcUrl) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getpeerinfo", params: [] }),
  });
  const peers = (await res.json()).result;

  return {
    totalPeers: peers.length,
    highBandwidthFrom: peers.filter((p) => p.bip152_hb_from).length,
    highBandwidthTo: peers.filter((p) => p.bip152_hb_to).length,
    avgPingMs: (peers.reduce((s, p) => s + (p.pingtime || 0), 0) / peers.length * 1000).toFixed(1),
  };
}
```

## 相關概念

- [區塊中繼](/bitcoin/network/block-relay/) - Compact blocks 是區塊中繼的最佳化
- [Mempool (BTC)](/bitcoin/network/mempool-btc/) - 交易匹配的來源
- [節點發現](/bitcoin/network/peer-discovery/) - 建立支援 compact blocks 的連線
- [Erlay](/bitcoin/network/erlay/) - 交易傳播頻寬最佳化（互補技術）
- [區塊結構](/bitcoin/data-structures/bitcoin-block-structure/) - 被壓縮傳輸的資料格式
- [區塊驗證](/bitcoin/consensus/block-validation/) - 重建後的區塊驗證
- [自私挖礦](/bitcoin/consensus/selfish-mining/) - 降低傳播延遲有助於緩解
- [Hash Function 概述](/fundamentals/cryptography/hash-function-overview/) - SipHash 的密碼學基礎
- [Bloom Filter](/fundamentals/data-structures/bloom-filter/) - 另一種機率性資料結構
