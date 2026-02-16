---
title: "Bitcoin Forks"
description: "Bitcoin Forks, 分叉, soft fork, hard fork, BIP-9, BIP-8"
tags: [bitcoin, consensus, fork, soft-fork, hard-fork, activation]
---

# Bitcoin Forks

## 概述

Bitcoin 分叉（fork）是協議規則變更的機制。**Soft fork** 收緊共識規則，舊節點仍然接受新區塊（向後相容）；**Hard fork** 放寬或改變規則，舊節點會拒絕新區塊（不向後相容）。Bitcoin 歷史上經歷了多次重大分叉，從 P2SH 到 SegWit 再到 Taproot，每次都伴隨著治理、啟動機制和社群共識的演進。分叉機制的設計直接影響 [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) 的長期穩定性。

## 核心原理

### Soft Fork vs Hard Fork

**Soft Fork（軟分叉）**：收緊規則。

$$\text{valid\_blocks}_{\text{new}} \subset \text{valid\_blocks}_{\text{old}}$$

新規則下有效的區塊也一定在舊規則下有效。未升級的節點仍然跟隨最長鏈，但可能接受一些在新規則下無效的交易。

特性：
- 向後相容，不強制所有節點升級
- 礦工需要多數算力支持
- 風險：未升級節點的安全保證降低

**Hard Fork（硬分叉）**：放寬規則或引入不相容的變更。

$$\text{valid\_blocks}_{\text{new}} \not\subset \text{valid\_blocks}_{\text{old}}$$

新規則下有效的某些區塊在舊規則下無效。這導致鏈永久分裂，除非所有節點都升級。

特性：
- 不向後相容，需要所有參與者升級
- 若有節點拒絕升級，產生兩條永久分叉的鏈
- 風險：社群分裂、replay attack

### Activation 機制

**BIP-9（Version Bits）**：

礦工在區塊頭 `version` 欄位中使用特定 bit 進行信號（signaling）：

- 每個 bit 對應一個提案
- 在 retarget 週期（2016 blocks）內，如果 $\geq 95\%$ 的區塊信號支持，提案進入 locked-in
- Locked-in 後再經過一個 retarget 週期正式啟動
- 設有 timeout：超時未達 95% 則提案失敗

問題：BIP-9 給予礦工 veto power（否決權），可能無限期阻擋社群支持的升級。

**BIP-8（Mandatory Activation）**：

BIP-9 的改進版，新增 `lockinontimeout` 參數：

- `lockinontimeout = false`：同 BIP-9，超時失敗
- `lockinontimeout = true`：超時時強制啟動（UASF 精神）
- 礦工可以信號支持提前啟動，但最終由社群決定

**Speedy Trial**：

BIP-8 的保守變體，用於 Taproot 啟動：

- 短週期（3 個月）
- 信號閾值 90%
- 超時不強制啟動（`lockinontimeout = false`）
- 快速測試礦工是否準備好

### 歷史重大分叉

#### Soft Fork

| 年份 | 名稱 | BIP | 說明 |
|------|------|-----|------|
| 2012 | P2SH | BIP-16 | 引入 pay-to-script-hash，支援多重簽名 |
| 2015 | CLTV | BIP-65 | 新增 `OP_CHECKLOCKTIMEVERIFY` 時間鎖 |
| 2016 | CSV | BIP-68/112/113 | 相對時間鎖 `OP_CHECKSEQUENCEVERIFY` |
| 2017 | SegWit | BIP-141/143/144 | 隔離見證，修復 tx malleability |
| 2021 | Taproot | BIP-340/341/342 | Schnorr 簽名 + MAST |

#### Hard Fork（鏈分裂）

| 年份 | 事件 | 結果 |
|------|------|------|
| 2017-08 | Bitcoin Cash (BCH) | 區塊大小增至 8 MB，永久分叉 |
| 2017-11 | SegWit2x (B2X) | 計畫的 2 MB 硬分叉，因缺乏共識取消 |
| 2018-11 | BCH vs BSV | BCH 社群再次分裂，Bitcoin SV 誕生 |

### SegWit 分叉的啟動之爭

SegWit 的啟動歷程體現了 Bitcoin 治理的複雜性：

1. **2015-12**：BIP-141 提出 SegWit
2. **2016-11**：BIP-9 啟動開始，需要 95% 算力信號
3. **2017-02**：信號支持徘徊在 ~30%，大礦工阻擋
4. **2017-03**：UASF（BIP-148）運動興起，用戶威脅拒絕不含 SegWit 的區塊
5. **2017-05**：NYA（New York Agreement）達成妥協：先 SegWit 再 2 MB
6. **2017-07**：BIP-91 以 80% 閾值提前鎖定 SegWit 信號
7. **2017-08-01**：反對者分叉出 Bitcoin Cash
8. **2017-08-24**：SegWit 正式啟動
9. **2017-11**：SegWit2x 的 2 MB 硬分叉因缺乏共識取消

### Replay Protection

硬分叉後兩條鏈共享相同的歷史交易，需要 replay protection 防止一條鏈上的交易在另一條鏈上被重放：

- **Strong replay protection**：新鏈修改交易格式或 `SIGHASH` flag
- **Opt-in replay protection**：用戶可選擇性地標記交易只在一條鏈上有效
- Bitcoin Cash 使用 `SIGHASH_FORKID`（BIP-143 變體）實現 strong replay protection

## 程式碼範例

```python
# BIP-9 version bits 信號分析
from dataclasses import dataclass

BIP9_TOP_BITS = 0x20000000
RETARGET_PERIOD = 2016
ACTIVATION_THRESHOLD = 0.95

@dataclass(frozen=True)
class SoftForkProposal:
    name: str
    bit: int
    start_height: int
    timeout_height: int

def analyze_signaling(blocks: list[dict], proposal: SoftForkProposal) -> dict:
    """分析一個 retarget 週期內的 BIP-9 信號"""
    signaling_count = 0
    total_count = 0

    for block in blocks:
        if block["height"] < proposal.start_height:
            continue
        if block["height"] >= proposal.timeout_height:
            break

        version = block["version"]
        # 檢查 version bits 前綴
        if (version & 0xE0000000) != BIP9_TOP_BITS:
            total_count += 1
            continue

        # 檢查特定 bit 是否設置
        if version & (1 << proposal.bit):
            signaling_count += 1
        total_count += 1

    ratio = signaling_count / total_count if total_count > 0 else 0

    return {
        "proposal": proposal.name,
        "signaling": signaling_count,
        "total": total_count,
        "ratio": ratio,
        "locked_in": ratio >= ACTIVATION_THRESHOLD,
        "status": "LOCKED_IN" if ratio >= ACTIVATION_THRESHOLD else "STARTED",
    }


# Taproot activation (Speedy Trial) 模擬
taproot = SoftForkProposal(
    name="Taproot",
    bit=2,
    start_height=681408,
    timeout_height=709632,
)
```

```javascript
// 偵測軟硬分叉與信號狀態
async function getForkStatus(rpcUrl) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getblockchaininfo",
      params: [],
    }),
  });
  const data = await res.json();
  const info = data.result;

  // 解析 softforks 狀態
  const forks = Object.entries(info.softforks || {}).map(([name, fork]) => ({
    name,
    type: fork.type,
    active: fork.active,
    height: fork.height || null,
    bip9: fork.bip9
      ? {
          status: fork.bip9.status,
          startTime: fork.bip9.start_time,
          timeout: fork.bip9.timeout,
          sinceHeight: fork.bip9.since,
        }
      : null,
  }));

  return {
    chain: info.chain,
    blocks: info.blocks,
    softforks: forks,
    warnings: info.warnings,
  };
}
```

## 相關概念

- [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) - 分叉影響的共識機制基礎
- [最長鏈規則](/bitcoin/consensus/longest-chain-rule/) - 分叉後的鏈選擇邏輯
- [區塊驗證](/bitcoin/consensus/block-validation/) - 新舊規則下的驗證差異
- [Proof-of-Work](/bitcoin/consensus/pow-hashcash/) - 礦工信號與算力投票
- [難度調整](/bitcoin/consensus/difficulty-adjustment/) - 硬分叉後算力變化的影響
- [區塊結構](/bitcoin/data-structures/bitcoin-block-structure/) - version 欄位與 BIP-9 信號
- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - Soft fork 常透過 script 升級實現
- [Beacon Chain (ETH)](/ethereum/consensus/beacon-chain/) - Ethereum 的分叉升級機制對比
- [Hash Function 概述](/fundamentals/cryptography/hash-function-overview/) - 分叉可能改變的密碼學元件
