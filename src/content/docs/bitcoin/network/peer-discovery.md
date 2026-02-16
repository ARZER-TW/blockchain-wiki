---
title: "Peer Discovery"
description: "Peer Discovery, 節點發現, DNS seeds, addr, eclipse attack"
tags: [bitcoin, network, peer-discovery, dns-seeds, eclipse-attack, tor]
---

# Peer Discovery

## 概述

Peer discovery 是 Bitcoin 節點加入 P2P 網路的第一步。新節點需要找到其他活躍的節點才能同步區塊鏈資料和廣播交易。Bitcoin 使用多層發現機制：硬編碼的 DNS seeds 提供初始連線，`addr`/`addrv2` 訊息在已連線的節點間交換地址資訊。網路維持 outbound（8 條）和 inbound（最多 125 條）連線的不對稱結構。Eclipse attack 是最主要的網路層威脅，透過壟斷目標節點的所有連線來控制其資訊來源。

## 核心原理

### 啟動流程

Bitcoin Core 的節點發現遵循以下優先順序：

```
1. 用戶指定的 -connect 或 -addnode 節點
2. 本地資料庫中的已知節點（peers.dat）
3. DNS seeds（硬編碼的域名）
4. 硬編碼的 IP 種子（最後手段）
```

### DNS Seeds

DNS seeds 是維護者運營的特殊 DNS 伺服器，回傳活躍的 Bitcoin 節點 IP 地址。Bitcoin Core 中硬編碼了多個 DNS seeds：

| DNS Seed | 維護者 |
|----------|--------|
| `seed.bitcoin.sipa.be` | Pieter Wuille |
| `dnsseed.bluematt.me` | Matt Corallo |
| `dnsseed.bitcoin.dashjr-list-of-p2p-nodes.us` | Luke Dashjr |
| `seed.bitcoinstats.com` | Christian Decker |
| `seed.bitcoin.jonasschnelli.ch` | Jonas Schnelli |
| `seed.btc.petertodd.net` | Peter Todd |

DNS 查詢回傳 A/AAAA 記錄，每個記錄對應一個活躍節點的 IP 地址。節點從回傳的地址中隨機選擇進行連線。

### addr / addrv2 訊息

一旦連線建立，節點透過 P2P 訊息交換已知地址：

**addr（傳統）**：
- 每則訊息最多 1,000 個地址
- 格式：`timestamp + services + IPv6-mapped address + port`
- 僅支援 IPv4（IPv6-mapped）和 IPv6

**addrv2（BIP-155）**：
- 支援任意網路類型：IPv4, IPv6, Tor v3, I2P, CJDNS
- 可變長度地址（Tor v3 = 32 bytes, I2P = 32 bytes）
- 更靈活的 network ID 欄位

地址傳播使用「trickle」機制：節點隨機延遲轉發地址，防止地址訊息暴露網路拓撲。

### 連線結構

| 連線類型 | 數量 | 方向 | 功能 |
|----------|------|------|------|
| **Full-relay outbound** | 8 | 主動發起 | 完整的 block + tx 中繼 |
| **Block-relay-only** | 2 | 主動發起 | 僅中繼區塊，不中繼交易 |
| **Inbound** | 最多 125 | 被動接受 | 其他節點主動連入 |
| **Manual** | 不限 | `-addnode` 指定 | 用戶手動指定的節點 |

Outbound 連線對安全性至關重要，因為節點主動選擇連線對象。Bitcoin Core 將 outbound 分為兩類：

- **Full-relay（8 條）**：完整的交易和區塊中繼
- **Block-relay-only（2 條）**：僅中繼區塊，降低被 [eclipse attack](#eclipse-attack) 的風險

### Bucketing 系統

Bitcoin Core 使用 tried/new table 管理已知地址：

**New table**（1024 buckets, 64 entries each）：
- 儲存從其他節點聽到但未連線過的地址
- Bucket 由 source（轉發此地址的節點）和 address group 決定

**Tried table**（256 buckets, 64 entries each）：
- 儲存成功連線過的地址
- Bucket 由自己的 IP 和 address group 決定

這種設計確保：
- 來自不同來源的地址分散到不同 bucket
- 攻擊者難以填滿所有 bucket

### Eclipse Attack

Eclipse attack 的目標是壟斷一個節點的所有 outbound 連線，讓攻擊者完全控制該節點的資訊來源。

**攻擊步驟**：
1. 攻擊者運行大量 Bitcoin 節點
2. 用 `addr` 訊息向目標節點傳送大量攻擊者控制的地址
3. 填滿目標節點的 new/tried table
4. 等待目標節點重啟
5. 重啟後目標節點的 outbound 連線全部連到攻擊者

**後果**：
- 攻擊者可以隱藏區塊，讓目標節點停留在舊鏈
- 攻擊者可以進行 double-spend（對目標節點）
- 攻擊者可以審查特定交易

**防禦措施**（Bitcoin Core 已實施）：
- Anchor connections：記住上次成功使用的 outbound 連線
- Block-relay-only connections：不暴露在 addr 交換中
- 多樣化的 address group 選擇
- Feeler connections：定期嘗試新地址驗證其存活

### Tor / I2P 支援

Bitcoin Core 原生支援匿名網路：

**Tor**：
- 自動偵測本機 Tor proxy（SOCKS5 on 9050）
- 支援 Tor v3 hidden service（`.onion` 地址）
- 可同時在 clearnet 和 Tor 上運行

**I2P**：
- 透過 SAM（Simple Anonymous Messaging）協議連線
- 使用 256-bit destination 作為地址
- BIP-155 `addrv2` 支援 I2P 地址傳播

**CJDNS**：
- 加密的 IPv6 mesh network
- 地址以 `fc00::/8` 開頭

## 程式碼範例

```python
# Bitcoin 節點發現與連線管理模擬
import socket
import random
import hashlib
from dataclasses import dataclass

@dataclass(frozen=True)
class PeerAddress:
    ip: str
    port: int
    services: int
    timestamp: int
    network: str = "ipv4"  # ipv4, ipv6, torv3, i2p

# DNS seed 查詢
def query_dns_seeds(seeds):
    """從 DNS seeds 查詢初始節點地址"""
    addresses = []
    for seed in seeds:
        try:
            results = socket.getaddrinfo(seed, 8333, socket.AF_INET)
            for _, _, _, _, sockaddr in results:
                addresses.append(PeerAddress(ip=sockaddr[0], port=8333, services=0, timestamp=0))
        except socket.gaierror:
            continue
    return addresses


def get_addr_group(ip):
    """取得 IP 的 /16 address group"""
    parts = ip.split(".")
    return f"{parts[0]}.{parts[1]}" if len(parts) == 4 else ip[:4]


def get_bucket_index(local_key, addr_ip, source_ip, num_buckets):
    """計算 new/tried table 的 bucket index"""
    group = get_addr_group(addr_ip)
    source_group = get_addr_group(source_ip)
    data = local_key + group.encode() + source_group.encode()
    h = int.from_bytes(hashlib.sha256(data).digest()[:4], "little")
    return h % num_buckets
```

```javascript
// 查詢 Bitcoin Core 節點連線資訊與 eclipse 風險評估
async function getPeerInfo(rpcUrl) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getpeerinfo", params: [] }),
  });
  const peers = (await res.json()).result;

  const byType = (type) => peers.filter((p) => p.connection_type === type);
  const networks = {};
  peers.forEach((p) => { networks[p.network || "unknown"] = (networks[p.network || "unknown"] || 0) + 1; });

  // Eclipse risk: 多少個不同的 /16 subnet
  const subnets = new Set(
    byType("outbound-full-relay").map((p) => p.addr.split(".").slice(0, 2).join("."))
  );

  return {
    total: peers.length,
    outboundFull: byType("outbound-full-relay").length,
    blockRelayOnly: byType("block-relay-only").length,
    inbound: byType("inbound").length,
    networks,
    uniqueSubnets: subnets.size,
    eclipseRiskLow: subnets.size >= 6,
  };
}
```

## 相關概念

- [區塊中繼](/bitcoin/network/block-relay/) - 節點間區塊傳播協議
- [Erlay](/bitcoin/network/erlay/) - 改善節點間交易傳播效率
- [Compact Blocks](/bitcoin/network/compact-blocks/) - 減少區塊傳播頻寬
- [Mempool (BTC)](/bitcoin/network/mempool-btc/) - 交易在連線節點間傳播
- [SPV 輕節點](/bitcoin/network/spv-light-clients/) - 不同的連線模式
- [自私挖礦](/bitcoin/consensus/selfish-mining/) - 利用網路拓撲的攻擊
- [區塊驗證](/bitcoin/consensus/block-validation/) - 連線後的第一項任務
- [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) - P2P 網路是共識的基礎設施
- [Bloom Filter](/fundamentals/data-structures/bloom-filter/) - SPV 節點的隱私問題
