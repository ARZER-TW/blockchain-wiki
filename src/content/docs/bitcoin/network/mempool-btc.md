---
title: "Mempool (BTC)"
description: "Mempool, 記憶池, transaction pool, fee market, eviction"
tags: [bitcoin, network, mempool, fee-market, package-relay, truc]
---

# Mempool (BTC)

## 概述

Mempool（memory pool）是 Bitcoin 節點儲存已驗證但尚未被打包進區塊的交易的暫存區域。它是交易手續費市場的核心：礦工從 mempool 中選擇手續費最高的交易打包，用戶透過觀察 mempool 狀態來估算合理的手續費。Bitcoin Core 的 mempool 預設大小為 300 MB，使用 fee-rate 作為驅逐（eviction）策略。Package relay 和 TRUC（Topologically Restricted Until Confirmation）是近期的重要改善，解決了 CPFP 和 pinning 問題。

## 核心原理

### 基本結構

每個 Bitcoin 全節點維護自己的 mempool，是**本地視角**而非全域一致的：

| 屬性 | 預設值 | 說明 |
|------|--------|------|
| 最大大小 | 300 MB | `-maxmempool` 參數 |
| 最小 fee rate | 1 sat/vB | 低於此不接受 |
| 過期時間 | 336 小時（14 天） | 超時自動移除 |
| 替換 | RBF (opt-in/full) | BIP-125, v28+ full RBF |

### 接受規則（Acceptance Policy）

交易被接受進入 mempool 前必須通過多項檢查：

**共識規則**（所有節點必須遵守）：
1. 交易格式有效
2. Input 引用的 UTXO 存在且未花費
3. Script 驗證通過
4. Input 總額 >= output 總額

**標準性規則**（Standardness，可配置）：
5. 交易大小 <= 400,000 weight units
6. 每個 output 的 `scriptPubKey` 是標準類型
7. Input 的 `scriptSig` 只有 push opcodes
8. 不含 `OP_RETURN` 以外的 non-standard opcodes
9. 交易不超過 25 個祖先或後代（ancestor/descendant limit）

**Dust limit**：output 的金額必須足以支付花費該 output 所需的手續費。

$$\text{dust\_threshold} = 3 \times \text{size\_of\_spending\_input} \times \text{dust\_relay\_fee\_rate}$$

對 P2PKH output，dust threshold 約為 546 satoshis。

### 驅逐策略

當 mempool 超過大小限制時，fee rate 最低的交易被驅逐：

$$\text{eviction\_order} = \text{sort\_ascending}(\text{ancestor\_fee\_rate})$$

**Ancestor fee rate** 是交易及其所有未確認祖先的總手續費除以總大小：

$$\text{ancestor\_fee\_rate} = \frac{\sum_{\text{tx} + \text{ancestors}} \text{fee}}{\sum_{\text{tx} + \text{ancestors}} \text{vsize}}$$

這確保了低 fee rate 的交易鏈（parent + child）整體被驅逐。

### Mining 交易選擇

礦工從 mempool 選擇交易打包的演算法（ancestor feerate mining）：

```
1. 計算每筆交易的 ancestor_fee_rate
2. 按 ancestor_fee_rate 降序排列
3. 依序選擇交易，直到區塊填滿（4 MW weight limit）
4. 選擇交易時，其所有未包含的祖先也必須被包含
```

$$\text{block\_template} = \text{greedy\_select}(\text{mempool}, \text{max\_weight} = 4{,}000{,}000)$$

### Package Relay

Package relay 允許節點以「包裹」形式提交相關交易，解決了低 fee rate 的 parent 因為單獨 fee rate 不足而被拒絕的問題：

```
場景：parent (1 sat/vB) + child (100 sat/vB)

傳統：parent 因 fee rate 太低被拒絕，child 無法提交
Package relay：parent + child 一起提交，package fee rate 合格
```

**Package fee rate**：

$$\text{package\_fee\_rate} = \frac{\text{fee}_{\text{parent}} + \text{fee}_{\text{child}}}{\text{vsize}_{\text{parent}} + \text{vsize}_{\text{child}}}$$

Package relay 是 [RBF/CPFP](/bitcoin/transactions/rbf-cpfp/) 的基礎改善。

### TRUC (Topologically Restricted Until Confirmation)

TRUC（之前稱為 v3 transactions）是一種新的交易拓撲限制，防止 transaction pinning：

**規則**：
1. TRUC 交易的 version 欄位 = 3
2. TRUC 交易最多有 1 個未確認 parent
3. TRUC 交易的 child 大小 <= 10,000 vB
4. 整個 TRUC package（parent + child）只允許 2 層深度

**解決的問題**：交易 pinning 是指惡意方刻意創建大的、低 fee rate 的後代交易，使得 CPFP fee bump 變得極其昂貴。TRUC 的大小限制確保替換任何 child 的成本有上限。

### 與 Ethereum Mempool 的比較

| 特性 | Bitcoin Mempool | Ethereum Mempool |
|------|----------------|-----------------|
| 排序依據 | Fee rate (sat/vB) | Gas price / priority fee |
| MEV | 較少（UTXO 模型） | 嚴重（[MEV/PBS](/ethereum/transaction-lifecycle/mempool/)） |
| 替換 | RBF (BIP-125) | 相同 nonce 更高 gas price |
| 可見性 | 公開 | 公開 + private mempools |
| 區塊空間 | Weight-based (4 MW) | Gas limit |
| Ordering manipulation | Fee sniping | Sandwich attacks, frontrunning |

Bitcoin 的 UTXO 模型使 MEV 的範圍比 Ethereum 小得多，因為交易之間的依賴關係更簡單。

## 程式碼範例

```python
# Bitcoin Mempool 模擬
from dataclasses import dataclass

@dataclass(frozen=True)
class MempoolEntry:
    txid: str
    fee_sats: int
    vsize: int
    ancestor_fee: int
    ancestor_vsize: int
    time_added: int
    depends: tuple = ()  # parent txids

    @property
    def fee_rate(self) -> float:
        return self.fee_sats / self.vsize

    @property
    def ancestor_fee_rate(self) -> float:
        return self.ancestor_fee / self.ancestor_vsize


class MempoolSimulator:
    """簡化的 Bitcoin mempool 模擬器"""

    MAX_SIZE_BYTES = 300 * 1024 * 1024  # 300 MB
    DUST_LIMIT = 546  # satoshis
    MAX_ANCESTOR_COUNT = 25

    def __init__(self):
        self.entries = {}  # txid -> MempoolEntry
        self.current_size = 0

    def accept_transaction(self, entry: MempoolEntry) -> dict:
        """嘗試接受交易到 mempool"""
        # Dust check
        if entry.fee_sats < 0:
            return {"accepted": False, "reason": "negative fee"}

        # Minimum fee rate
        if entry.fee_rate < 1.0:
            return {"accepted": False, "reason": "below min fee rate"}

        # Ancestor limit
        ancestor_count = self._count_ancestors(entry)
        if ancestor_count > self.MAX_ANCESTOR_COUNT:
            return {"accepted": False, "reason": "too many ancestors"}

        # Size limit - evict if needed
        while self.current_size + entry.vsize > self.MAX_SIZE_BYTES:
            evicted = self._evict_lowest()
            if evicted is None:
                break
            if evicted.ancestor_fee_rate >= entry.ancestor_fee_rate:
                return {"accepted": False, "reason": "fee too low for eviction"}

        new_entries = {**self.entries, entry.txid: entry}
        self.entries = new_entries
        self.current_size += entry.vsize
        return {"accepted": True}

    def _count_ancestors(self, entry: MempoolEntry) -> int:
        count = 0
        to_visit = list(entry.depends)
        visited = set()
        while to_visit:
            txid = to_visit.pop()
            if txid in visited:
                continue
            visited.add(txid)
            count += 1
            if txid in self.entries:
                to_visit.extend(self.entries[txid].depends)
        return count

    def _evict_lowest(self) -> MempoolEntry:
        if not self.entries:
            return None
        lowest = min(self.entries.values(), key=lambda e: e.ancestor_fee_rate)
        new_entries = {k: v for k, v in self.entries.items() if k != lowest.txid}
        self.entries = new_entries
        self.current_size -= lowest.vsize
        return lowest

    def get_block_template(self, max_weight: int = 4_000_000) -> list:
        """按 ancestor fee rate 排序建構區塊模板"""
        sorted_entries = sorted(
            self.entries.values(),
            key=lambda e: e.ancestor_fee_rate,
            reverse=True,
        )
        selected = []
        total_weight = 0
        for entry in sorted_entries:
            if total_weight + entry.vsize * 4 > max_weight:
                continue
            selected.append(entry)
            total_weight += entry.vsize * 4
        return selected
```

```javascript
// 查詢 Bitcoin mempool 狀態
async function getMempoolAnalysis(rpcUrl) {
  async function rpc(method, params = []) {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    return (await res.json()).result;
  }

  const info = await rpc("getmempoolinfo");

  return {
    txCount: info.size,
    sizeBytes: info.bytes,
    fullnessPercent: ((info.usage / info.maxmempool) * 100).toFixed(1) + "%",
    mempoolMinFee: info.mempoolminfee,
    minRelayFee: info.minrelaytxfee,
  };
}
```

## 相關概念

- [Fee Estimation](/bitcoin/transactions/fee-estimation/) - 根據 mempool 狀態估算手續費
- [RBF/CPFP](/bitcoin/transactions/rbf-cpfp/) - 手續費替換與子交易加速機制
- [區塊驗證](/bitcoin/consensus/block-validation/) - 驗證交易後加入 mempool
- [Compact Blocks](/bitcoin/network/compact-blocks/) - 依賴 mempool 匹配重建區塊
- [Erlay](/bitcoin/network/erlay/) - 交易傳播的頻寬最佳化
- [節點發現](/bitcoin/network/peer-discovery/) - 交易透過已連線的 peer 傳播
- [Mempool (ETH)](/ethereum/transaction-lifecycle/mempool/) - Ethereum 的交易池與 MEV/PBS 問題
- [減半](/bitcoin/consensus/halving/) - Block subsidy 下降增加手續費重要性
- [區塊中繼](/bitcoin/network/block-relay/) - 區塊傳播（vs 交易傳播）
- [Hash Function 概述](/fundamentals/cryptography/hash-function-overview/) - Txid 的雜湊計算
