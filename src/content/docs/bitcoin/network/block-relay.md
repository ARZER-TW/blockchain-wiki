---
title: "Block Relay"
description: "Block Relay, 區塊中繼, block propagation, headers-first, FIBRE"
tags: [bitcoin, network, block-relay, propagation, headers-first, fibre]
---

# Block Relay

## 概述

Block relay（區塊中繼）是 Bitcoin P2P 網路中將新挖出的區塊傳播到所有節點的過程。區塊傳播延遲直接影響 orphan rate（孤塊率），而高孤塊率會降低 [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) 的安全性並有利於 [自私挖礦](/bitcoin/consensus/selfish-mining/) 攻擊。Bitcoin 透過 headers-first 同步（BIP-130）、[Compact Blocks](/bitcoin/network/compact-blocks/)（BIP-152）和 block-relay-only 連線等機制持續改善傳播效率。

## 核心原理

### 傳統區塊傳播

早期 Bitcoin 的區塊傳播流程（已過時，但有助於理解演進）：

```
Node A (miner)                    Node B
    |                                |
    |--- inv(block_hash) ---------->|
    |                                |
    |<-- getdata(block_hash) -------|
    |                                |
    |--- block(full_block) -------->|
    |                                |
    |                   [validate]   |
    |                                |
    |              [relay to peers]  |
```

問題：
- 完整區塊可能 >1 MB，傳輸耗時
- 每一跳都有 RTT（round-trip time）延遲
- 驗證時間增加延遲
- 地理距離遠的節點延遲更大

### Headers-First Sync (BIP-130)

headers-first 同步分離了 header 和 body 的傳播：

```
Node A                            Node B
    |                                |
    |--- headers(new_header) ------>|
    |                                |
    |        [validate header]       |
    |        [request body if needed]|
    |                                |
    |<-- getdata(block_hash) -------|
    |                                |
    |--- block(full_block) -------->|
```

優勢：
- Header 只有 80 bytes，幾乎無延遲
- 節點可以先驗證 PoW 再決定是否下載完整區塊
- 可以並行從多個節點下載區塊 body

對 IBD（Initial Block Download）的改善：
```
舊方式：sequential block-by-block download
新方式：1. download all headers (fast)
        2. validate header chain
        3. parallel block body download from multiple peers
```

### 傳播延遲分析

區塊傳播延遲的組成：

$$T_{\text{total}} = T_{\text{serialization}} + T_{\text{propagation}} + T_{\text{validation}} + T_{\text{relay}}$$

各項估計（1 MB 區塊）：

| 組件 | 延遲 | 說明 |
|------|------|------|
| Serialization | ~1-5 ms | 區塊序列化/反序列化 |
| Network propagation | ~50-200 ms | 取決於地理距離 |
| Validation | ~100-500 ms | 腳本驗證最耗時 |
| Relay overhead | ~10-50 ms | inv/getdata 握手 |

### Orphan Rate 與安全性

orphan rate（孤塊率）是指因傳播延遲而被拋棄的區塊比例：

$$\text{orphan\_rate} \approx 1 - e^{-\lambda \cdot T_{\text{propagation}}}$$

其中 $\lambda = 1/600$（平均出塊率），$T_{\text{propagation}}$ 是區塊傳播到全網的時間。

高 orphan rate 的負面影響：
- **中心化壓力**：大礦池比小礦工更快收到新區塊（自己挖出的不需傳播）
- **安全性下降**：有效算力被浪費在已過時的區塊上
- **自私挖礦**：低傳播延遲的攻擊者有更大優勢

### FIBRE Network

FIBRE（Fast Internet Bitcoin Relay Engine）是 Matt Corallo 開發的專用區塊中繼網路：

**技術特點**：
- 使用 UDP + FEC（Forward Error Correction）
- 區塊資料在產生前就開始預傳輸（compact block template）
- 全球部署的中繼節點
- 延遲 <100 ms 傳播到全球

**FEC 原理**：將區塊資料編碼為冗餘封包，接收方只需收到足夠數量的封包即可重建原始資料，無需重傳丟失的封包。

$$\text{FEC overhead} \approx 5\text{-}10\% \quad \text{(額外資料量)}$$

$$\text{recovery}: \text{need } k \text{ of } n \text{ packets}, \quad k < n$$

### Block-Relay-Only Connections

Bitcoin Core v0.19+ 引入了 block-relay-only 連線（每個節點 2 條）：

- 只中繼 block 相關訊息（`headers`, `block`, `cmpctblock` 等）
- 不中繼交易（`tx`, `inv` for tx）
- 不交換地址（`addr`, `addrv2`）

安全價值：
- 攻擊者無法透過交易傳播模式推斷這些連線的存在
- 增加 [eclipse attack](/bitcoin/network/peer-discovery/) 的難度
- 即使所有 full-relay 連線被攻擊，block-relay-only 連線仍可保持同步

### 區塊傳播的演進

| 時期 | 機制 | 典型延遲 |
|------|------|---------|
| 2009-2014 | 完整區塊傳輸 | 10-60 秒 |
| 2014-2016 | Headers-first (BIP-130) | 5-15 秒 |
| 2016+ | [Compact Blocks](/bitcoin/network/compact-blocks/) (BIP-152) | 1-5 秒 |
| FIBRE | UDP + FEC relay | <100 ms |

## 程式碼範例

```python
# 區塊傳播延遲模擬
import random
import math
from dataclasses import dataclass

@dataclass(frozen=True)
class NetworkNode:
    node_id: str
    latency_ms: float  # 到其他節點的平均延遲
    bandwidth_mbps: float
    validation_ms: float

def simulate_block_propagation(nodes, block_size_bytes, source_idx):
    """模擬區塊從 source 傳播到所有節點（Dijkstra-like）"""
    reached = {source_idx: 0.0}
    pending = set(range(len(nodes))) - {source_idx}

    while pending:
        best_time, best_node = float("inf"), None
        for src in reached:
            for tgt in pending:
                t = (reached[src]
                     + (nodes[src].latency_ms + nodes[tgt].latency_ms) / 2
                     + (block_size_bytes * 8) / (nodes[tgt].bandwidth_mbps * 1000)
                     + nodes[tgt].validation_ms)
                if t < best_time:
                    best_time, best_node = t, tgt
        if best_node is not None:
            reached[best_node] = best_time
            pending.discard(best_node)

    times = sorted(reached.values())
    return {"median_ms": times[len(times) // 2], "max_ms": times[-1]}


def estimate_orphan_rate(avg_propagation_s: float, block_interval_s: float = 600) -> float:
    """估算孤塊率"""
    lam = 1.0 / block_interval_s
    return 1.0 - math.exp(-lam * avg_propagation_s)


# 模擬
nodes = [
    NetworkNode(f"node_{i}", latency_ms=random.uniform(20, 200),
                bandwidth_mbps=random.uniform(10, 100),
                validation_ms=random.uniform(50, 300))
    for i in range(100)
]

result = simulate_block_propagation(nodes, block_size_bytes=1_000_000, source_idx=0)
orphan_rate = estimate_orphan_rate(result["median_ms"] / 1000)
print(f"Median propagation: {result['median_ms']:.0f} ms")
print(f"Estimated orphan rate: {orphan_rate:.4%}")
```

```javascript
// 監控區塊傳播延遲
async function monitorBlockRelay(rpcUrl) {
  async function rpc(method, params = []) {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    return (await res.json()).result;
  }

  const bestHash = await rpc("getbestblockhash");
  const block = await rpc("getblock", [bestHash]);
  const prev = await rpc("getblock", [block.previousblockhash]);
  const peers = await rpc("getpeerinfo");

  return {
    height: block.height,
    size: block.size,
    blockInterval: `${block.time - prev.time}s`,
    fullRelayPeers: peers.filter((p) => p.connection_type === "outbound-full-relay").length,
    blockOnlyPeers: peers.filter((p) => p.connection_type === "block-relay-only").length,
    avgPingMs: (peers.reduce((s, p) => s + (p.pingtime || 0), 0) / peers.length * 1000).toFixed(1),
  };
}
```

## 相關概念

- [Compact Blocks](/bitcoin/network/compact-blocks/) - 大幅減少區塊傳播頻寬
- [節點發現](/bitcoin/network/peer-discovery/) - 建立中繼連線的前提
- [Mempool (BTC)](/bitcoin/network/mempool-btc/) - Compact blocks 依賴 mempool 重建區塊
- [自私挖礦](/bitcoin/consensus/selfish-mining/) - 利用傳播延遲的攻擊策略
- [最長鏈規則](/bitcoin/consensus/longest-chain-rule/) - 孤塊處理與 fork 解決
- [區塊驗證](/bitcoin/consensus/block-validation/) - 傳播過程中的驗證步驟
- [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) - 傳播延遲影響共識安全性
- [Erlay](/bitcoin/network/erlay/) - 交易傳播的頻寬最佳化
- [區塊結構](/bitcoin/data-structures/bitcoin-block-structure/) - 被中繼的資料格式
