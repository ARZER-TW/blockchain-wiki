---
title: "Longest Chain Rule"
description: "Longest Chain Rule, 最長鏈規則, most cumulative work, fork choice"
tags: [bitcoin, consensus, fork-choice, longest-chain, chainwork]
---

# Longest Chain Rule

## 概述

「最長鏈規則」是 Bitcoin 的 fork choice rule，決定節點在面對多個競爭鏈時應選擇哪一條作為 canonical chain。儘管名為「最長鏈」，實際上 Bitcoin 選擇的是**累計工作量最大**（most cumulative work）的鏈，而非單純區塊數量最多的鏈。這是 [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) 的關鍵組件，搭配 [PoW](/bitcoin/consensus/pow-hashcash/) 和 [難度調整](/bitcoin/consensus/difficulty-adjustment/) 共同確保網路收斂到單一一致的歷史。

## 核心原理

### 累計工作量 (Chainwork)

每個區塊的工作量（work）由其 target 決定。target 越低，找到有效區塊所需的期望雜湊次數越多：

$$\text{work}(\text{block}) = \frac{2^{256}}{\text{target} + 1}$$

一條鏈的 chainwork 是所有區塊工作量的總和：

$$\text{chainwork} = \sum_{i=0}^{n} \frac{2^{256}}{\text{target}_i + 1}$$

節點始終選擇 chainwork 最大的有效鏈。

### 為什麼不是「最長」

在所有區塊難度相同的情況下，chainwork 最大等價於區塊數量最多（即最長鏈）。但如果攻擊者生產了大量低難度的區塊，這些區塊的累計工作量可能遠低於較少但高難度的區塊。

$$\text{100 blocks at difficulty 1} \ll \text{50 blocks at difficulty 10}$$

使用 chainwork 而非區塊數量，防止了攻擊者透過製造低難度分叉來欺騙網路。

### Fork 的產生與解決

自然的 fork 發生在兩個礦工幾乎同時找到有效區塊時：

```
               +-- Block A (miner 1)
              /
... -- Parent
              \
               +-- Block B (miner 2)
```

不同節點可能先收到 A 或 B，暫時形成分歧。當下一個區塊被挖出並構建在 A 或 B 之上時，較長（更多工作量）的鏈獲勝：

```
... -- Parent -- Block A -- Block C    <-- 勝出（chainwork 更大）
              \
               +-- Block B             <-- 成為孤塊（stale block）
```

Block B 中的交易如果不在 Block A 和 C 中，將回到 mempool 等待被重新打包。

### 6 Confirmations 慣例

社群普遍接受 6 個確認（約 1 小時）作為「足夠安全」的標準。這個數字源自 Satoshi 白皮書中對攻擊者成功機率的分析：

| 確認數 | 攻擊者 10% 算力 | 攻擊者 30% 算力 |
|--------|-----------------|-----------------|
| 1 | 20.5% | 45.5% |
| 3 | 1.3% | 17.4% |
| 6 | 0.024% | 4.0% |
| 10 | 0.0001% | 0.8% |

不同場景的確認需求：

| 場景 | 建議確認數 | 理由 |
|------|-----------|------|
| 小額支付 | 0-1 | 風險低，速度優先 |
| 一般交易 | 3 | 合理平衡 |
| 大額交易 | 6 | 標準安全 |
| 交易所存款 | 6+ | 高安全需求 |

### 與 LMD GHOST 的比較

Ethereum 的 [LMD GHOST](/ethereum/consensus/lmd-ghost/) 是另一種 fork choice rule：

| 特性 | Bitcoin (Longest Chain) | Ethereum (LMD GHOST) |
|------|------------------------|---------------------|
| 選擇依據 | 累計 PoW 工作量 | 最新 attestation 投票 |
| 投票方式 | 隱式（挖礦） | 顯式（validator attestation） |
| 分叉解決速度 | ~10 分鐘（下一個區塊） | ~12 秒（下一個 slot） |
| 安全假設 | >50% 算力誠實 | >50% 質押誠實 |
| Finality | 機率性（6 confirmations） | 確定性（[Casper FFG](/ethereum/consensus/casper-ffg/)） |

LMD GHOST 在每個 fork point 選擇獲得最多 attestation 的子樹，而非簡單比較累計工作量。

### Reorg 與安全性

Reorganization（reorg）發生在節點切換到另一條更重的鏈時。深度 reorg 是嚴重的安全事件：

- **1-block reorg**：正常現象，幾乎每天發生
- **2-block reorg**：罕見但自然可能
- **3+ block reorg**：極度異常，可能是攻擊

歷史上最著名的 reorg 事件包括 2013 年 3 月因 BerkeleyDB/LevelDB 不相容導致的意外分叉，被解決時涉及數十個區塊的 reorganization。

## 程式碼範例

```python
# Chainwork 計算與 fork choice
from dataclasses import dataclass

@dataclass(frozen=True)
class BlockHeader:
    height: int
    prev_hash: str
    block_hash: str
    target: int
    timestamp: int

def block_work(target: int) -> int:
    """計算單個區塊的工作量"""
    return (2 ** 256) // (target + 1)

def calculate_chainwork(chain: list[BlockHeader]) -> int:
    """計算一條鏈的累計工作量"""
    return sum(block_work(block.target) for block in chain)

def select_best_chain(chains: list[list[BlockHeader]]) -> list[BlockHeader]:
    """Fork choice: 選擇累計工作量最大的鏈"""
    best_chain = None
    best_work = 0

    for chain in chains:
        work = calculate_chainwork(chain)
        if work > best_work:
            best_work = work
            best_chain = chain

    return best_chain

def detect_reorg(old_tip: BlockHeader, new_tip: BlockHeader,
                 get_block) -> dict:
    """偵測 reorg 並計算深度"""
    old_chain = []
    new_chain = []

    old_cursor = old_tip
    new_cursor = new_tip

    # 回溯到共同祖先
    old_visited = {old_cursor.block_hash: old_cursor}
    new_visited = {new_cursor.block_hash: new_cursor}

    while True:
        if old_cursor.block_hash in new_visited:
            fork_point = old_cursor.block_hash
            break
        if new_cursor.block_hash in old_visited:
            fork_point = new_cursor.block_hash
            break

        if old_cursor.height > 0:
            old_cursor = get_block(old_cursor.prev_hash)
            old_visited[old_cursor.block_hash] = old_cursor
        if new_cursor.height > 0:
            new_cursor = get_block(new_cursor.prev_hash)
            new_visited[new_cursor.block_hash] = new_cursor

    return {
        "fork_point": fork_point,
        "reorg_depth": old_tip.height - get_block(fork_point).height,
        "new_blocks": new_tip.height - get_block(fork_point).height,
    }
```

```javascript
// 監控 Bitcoin 區塊鏈 reorg
async function monitorChaintip(rpcUrl, callback) {
  async function rpcCall(method, params = []) {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const data = await res.json();
    return data.result;
  }

  const tips = await rpcCall("getchaintips");

  // getchaintips 回傳所有已知的 chain tips
  const activeTip = tips.find((t) => t.status === "active");
  const staleTips = tips.filter((t) => t.status === "valid-fork");

  const chainwork = await rpcCall("getblock", [
    await rpcCall("getblockhash", [activeTip.height]),
  ]);

  return {
    activeHeight: activeTip.height,
    activeChainwork: chainwork.chainwork,
    forkCount: staleTips.length,
    recentForks: staleTips.slice(0, 5).map((tip) => ({
      height: tip.height,
      branchLength: tip.branchlen,
      status: tip.status,
    })),
  };
}
```

## 相關概念

- [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) - 最長鏈規則是其核心組件
- [Proof-of-Work](/bitcoin/consensus/pow-hashcash/) - 工作量的來源
- [難度調整](/bitcoin/consensus/difficulty-adjustment/) - 影響每個區塊的 work 值
- [自私挖礦](/bitcoin/consensus/selfish-mining/) - 利用 fork choice rule 的策略性攻擊
- [區塊驗證](/bitcoin/consensus/block-validation/) - 驗證區塊是否符合選擇條件
- [區塊中繼](/bitcoin/network/block-relay/) - 區塊傳播延遲影響自然 fork 頻率
- [Bitcoin 分叉](/bitcoin/consensus/bitcoin-forks/) - 協議層級的軟硬分叉
- [LMD GHOST (ETH)](/ethereum/consensus/lmd-ghost/) - Ethereum 的 fork choice rule
- [Casper FFG (ETH)](/ethereum/consensus/casper-ffg/) - Ethereum 的確定性最終性（對比 Bitcoin 的機率性）
- [Merkle Tree](/fundamentals/data-structures/merkle-tree/) - 區塊內交易組織結構
