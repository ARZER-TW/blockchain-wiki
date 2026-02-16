---
title: "Difficulty Adjustment"
description: "Difficulty Adjustment, 難度調整, retarget, target"
tags: [bitcoin, consensus, difficulty, retarget, mining]
---

# Difficulty Adjustment

## 概述

Difficulty adjustment（難度調整）是 Bitcoin 協議中維持穩定出塊間隔的自動調節機制。每 2016 個區塊（約兩週），網路根據實際出塊時間重新計算 target 值，使平均出塊間隔保持在 10 分鐘左右。這是 [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) 的三大支柱之一，確保 [PoW](/bitcoin/consensus/pow-hashcash/) 的難度與全網算力動態平衡。無論礦工加入或離開，區塊生產速率都會趨向穩定。

## 核心原理

### Retarget 公式

每 2016 個區塊進行一次 retarget。新的 target 根據前一個週期的實際耗時計算：

$$\text{new\_target} = \text{old\_target} \times \frac{\text{actual\_time}}{2016 \times 600}$$

其中：
- $\text{old\_target}$：當前週期的 target 值
- $\text{actual\_time}$：前 2016 個區塊實際花費的秒數
- $2016 \times 600 = 1{,}209{,}600$ 秒 = 2 週（理想耗時）

如果實際耗時比 2 週短，代表算力增加，target 會降低（難度增加）；反之亦然。

### Clamping 限制

為防止難度劇烈波動，協議限制每次調整的幅度：

$$\text{clamp}: \quad \frac{1}{4} \leq \frac{\text{actual\_time}}{1{,}209{,}600} \leq 4$$

- **最大增加**：難度最多增加 4 倍（actual_time 被下限截斷為 302,400 秒）
- **最大減少**：難度最多減少為 1/4（actual_time 被上限截斷為 4,838,400 秒）

這意味著即使全網算力突然消失 75%，出塊時間最多變為 40 分鐘，然後在下一次 retarget 恢復。

### Off-by-One Bug

Bitcoin 原始碼中存在一個已知的 off-by-one bug：retarget 計算使用的時間間隔是 2015 個區塊而非 2016 個。

```
actual_time = block[2016].timestamp - block[1].timestamp   // 應為 block[0]
```

這等於計算 2015 個間隔的時間，而非 2016 個。結果是 target 系統性地偏高約 0.05%，使出塊略快於 10 分鐘。由於修復這個 bug 需要硬分叉，且影響極微，社群選擇維持現狀。

### Difficulty 與 Target 的關係

**Difficulty** 是 target 的倒數表示，反映找到有效區塊的相對困難度：

$$\text{difficulty} = \frac{\text{target}_{\max}}{\text{target}_{\text{current}}}$$

其中 $\text{target}_{\max}$ 是 difficulty 1 對應的最大 target 值：

$$\text{target}_{\max} = \texttt{0x00000000FFFF} \times 2^{208}$$

（這是 `bits = 0x1d00ffff` 的展開值，即 genesis block 的難度。）

### Hashrate 估算

全網 hashrate 可以從 difficulty 反推：

$$H = \frac{\text{difficulty} \times 2^{32}}{600} \quad (\text{hashes/sec})$$

這是因為在 difficulty $D$ 下，平均需要 $D \times 2^{32}$ 次雜湊才能找到有效區塊，期望在 600 秒內完成。

### 長期穩定性

難度調整是一個負反饋系統：

```
算力增加 -> 出塊加速 -> retarget 提高難度 -> 出塊恢復正常
算力減少 -> 出塊減慢 -> retarget 降低難度 -> 出塊恢復正常
```

這種自我調節機制確保 Bitcoin 的貨幣發行速率（結合 [減半](/bitcoin/consensus/halving/)）是高度可預測的。

## 程式碼範例

```python
# Bitcoin 難度調整邏輯
TARGET_TIMESPAN = 2016 * 600  # 1,209,600 秒 (2 週)
TARGET_MAX = 0x00000000FFFF0000000000000000000000000000000000000000000000000000
CLAMP_FACTOR = 4

def calculate_next_target(old_target: int, actual_timespan: int) -> int:
    """
    計算下一個 retarget 週期的 target。
    """
    # 套用 clamping 限制
    if actual_timespan < TARGET_TIMESPAN // CLAMP_FACTOR:
        actual_timespan = TARGET_TIMESPAN // CLAMP_FACTOR
    elif actual_timespan > TARGET_TIMESPAN * CLAMP_FACTOR:
        actual_timespan = TARGET_TIMESPAN * CLAMP_FACTOR

    # 計算新 target
    new_target = old_target * actual_timespan // TARGET_TIMESPAN

    # 不得超過最大值
    if new_target > TARGET_MAX:
        new_target = TARGET_MAX

    return new_target


def difficulty_from_target(target: int) -> float:
    """從 target 計算 difficulty。"""
    return TARGET_MAX / target


def estimate_hashrate(difficulty: float) -> float:
    """從 difficulty 估算全網 hashrate (H/s)。"""
    return difficulty * (2 ** 32) / 600


# 模擬連續的 retarget 週期
target = TARGET_MAX  # 從 difficulty 1 開始
for epoch in range(5):
    diff = difficulty_from_target(target)
    hashrate = estimate_hashrate(diff)

    # 模擬算力每週期增長 20%
    actual_time = int(TARGET_TIMESPAN / 1.2)
    target = calculate_next_target(target, actual_time)

    print(f"Epoch {epoch}: difficulty={diff:.2f}, hashrate={hashrate:.2e} H/s")
```

```javascript
// 查詢 Bitcoin 難度調整資訊
async function getDifficultyInfo(rpcUrl) {
  async function rpcCall(method, params = []) {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const data = await res.json();
    return data.result;
  }

  const info = await rpcCall("getblockchaininfo");
  const bestHash = await rpcCall("getbestblockhash");
  const bestBlock = await rpcCall("getblock", [bestHash]);

  // 計算到下一次 retarget 的剩餘區塊數
  const currentHeight = bestBlock.height;
  const blocksUntilRetarget = 2016 - (currentHeight % 2016);
  const retargetHeight = currentHeight + blocksUntilRetarget;

  // 從當前週期的第一個區塊計算已用時間
  const epochStartHeight = currentHeight - (currentHeight % 2016);
  const epochStartHash = await rpcCall("getblockhash", [epochStartHeight]);
  const epochStartBlock = await rpcCall("getblock", [epochStartHash]);

  const elapsedTime = bestBlock.time - epochStartBlock.time;
  const blocksInEpoch = currentHeight - epochStartHeight;
  const avgBlockTime = blocksInEpoch > 0 ? elapsedTime / blocksInEpoch : 600;

  // 估計難度變化
  const projectedTime = avgBlockTime * 2016;
  const estimatedChange = ((1209600 / projectedTime) - 1) * 100;

  return {
    currentDifficulty: info.difficulty,
    currentHeight,
    blocksUntilRetarget,
    retargetHeight,
    avgBlockTimeSeconds: avgBlockTime.toFixed(1),
    estimatedDifficultyChange: `${estimatedChange > 0 ? "+" : ""}${estimatedChange.toFixed(2)}%`,
  };
}
```

## 相關概念

- [Proof-of-Work](/bitcoin/consensus/pow-hashcash/) - 難度調整所調節的挖礦機制
- [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) - 難度調整是三大支柱之一
- [區塊驗證](/bitcoin/consensus/block-validation/) - 驗證區塊頭的 bits 欄位是否正確
- [減半](/bitcoin/consensus/halving/) - 與難度調整共同決定 Bitcoin 的貨幣政策
- [區塊結構](/bitcoin/data-structures/bitcoin-block-structure/) - 儲存 bits 欄位的區塊頭格式
- [自私挖礦](/bitcoin/consensus/selfish-mining/) - 利用難度調整週期的攻擊策略
- [最長鏈規則](/bitcoin/consensus/longest-chain-rule/) - 累計工作量的計算依賴 difficulty
- [Hash Function 概述](/fundamentals/cryptography/hash-function-overview/) - PoW 雜湊的密碼學基礎
- [SHA-256](/fundamentals/cryptography/sha-256/) - Bitcoin 挖礦使用的雜湊演算法
