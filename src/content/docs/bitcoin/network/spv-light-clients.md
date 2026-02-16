---
title: "SPV Light Clients"
description: "SPV, Simplified Payment Verification, light client, BIP-37, BIP-157, Neutrino"
tags: [bitcoin, network, spv, light-client, bloom-filter, neutrino, compact-block-filter]
---

# SPV Light Clients

## 概述

SPV（Simplified Payment Verification）是 Satoshi 白皮書第 8 節描述的輕量級驗證方法，允許節點不下載完整的區塊鏈即可驗證交易是否被包含在有效區塊中。SPV 節點只下載區塊頭（80 bytes/block），透過 Merkle proof 驗證交易。歷史上 BIP-37 bloom filter 方案因隱私和 DoS 問題被棄用，現已被 BIP-157/158 的 compact block filters（Neutrino 協議）取代。Ethereum 的 light client 採用不同的技術路線，利用 [Beacon Chain](/ethereum/consensus/beacon-chain/) 的 sync committee 簽名進行驗證。

## 核心原理

### Satoshi 的 SPV 設計

白皮書的原始 SPV 概念：

1. 只下載區塊頭鏈（80 bytes × blocks）
2. 驗證每個 header 的 [PoW](/bitcoin/consensus/pow-hashcash/)
3. 選擇累計工作量最大的鏈（[最長鏈規則](/bitcoin/consensus/longest-chain-rule/)）
4. 當用戶需要驗證特定交易時，向全節點請求 Merkle proof

**Header 鏈的大小**：

$$\text{headers\_size} = 80 \times \text{block\_height} \approx 80 \times 880{,}000 \approx 70 \text{ MB (2025年)}$$

相比完整區塊鏈約 600+ GB，這是極大的節省。

### Merkle Proof 驗證

交易包含的證明（Merkle proof / Merkle path）由 [Merkle root](/bitcoin/cryptography/merkle-root/) 提供：

$$\text{proof} = \{h_1, h_2, \ldots, h_{\lceil \log_2 n \rceil}\}$$

其中 $n$ 是區塊中的交易數量，proof 包含 $\lceil \log_2 n \rceil$ 個雜湊值。

驗證步驟：
1. 計算目標交易的雜湊
2. 沿 Merkle path 逐層計算，直到得到 root
3. 比對計算出的 root 與區塊頭中的 `merkle_root`

對於 3,000 筆交易的區塊，proof 大小：

$$|\text{proof}| = 32 \times \lceil \log_2 3000 \rceil = 32 \times 12 = 384 \text{ bytes}$$

### BIP-37: Bloom Filters（已棄用）

BIP-37 讓 SPV 節點透過 bloom filter 告訴全節點「我感興趣的地址/交易」：

```
SPV Node                           Full Node
    |                                  |
    |--- filterload(bloom_filter) ---->|
    |                                  |
    |--- getdata(block_hash) -------->|
    |                                  |
    |<-- merkleblock(partial merkle   |
    |    tree + matched txs) ---------|
```

**隱私問題**：
- Bloom filter 的 false positive rate 洩漏地址資訊
- 全節點可以透過調整 filter 參數推斷 SPV 節點的錢包地址
- 研究表明，即使 FP rate 很高，透過多個區塊的交集仍可識別地址

$$P(\text{address leaked}) \approx 1 - (1 - (1-\text{FPR})^n)^b$$

其中 $n$ 是非相關交易數，$b$ 是觀察的區塊數。

**DoS 問題**：
- 全節點必須為每個 SPV 連線維護獨立的 bloom filter
- 惡意 SPV 節點可以發送大量 `filterload` 消耗全節點資源
- Bitcoin Core v0.19 起預設禁用 bloom filter 服務

### BIP-157/158: Compact Block Filters (Neutrino)

BIP-157/158 反轉了查詢方向：全節點為每個區塊產生一個 compact filter，SPV 節點下載 filter 後本地判斷是否包含感興趣的交易。

**BIP-158: Filter 建構**

使用 Golomb-coded set (GCS) 編碼每個區塊中的所有 `scriptPubKey`：

$$\text{filter} = \text{GCS}(\{H(s) \mod (N \times M) : s \in \text{scripts}\})$$

其中：
- $N$ = 區塊中的元素數量
- $M$ = 784931（BIP-158 指定的 false positive 參數）
- $P$ = 19（精度參數，FP rate $\approx 2^{-P}$）

Filter 大小：

$$|\text{filter}| \approx N \times (P + \log_2(M/N)) \text{ bits} \approx N \times 20 \text{ bits}$$

對於 3,000 筆交易的區塊：

$$|\text{filter}| \approx 3000 \times 20 / 8 \approx 7{,}500 \text{ bytes}$$

**BIP-157: 協議**

```
SPV Node                           Full Node
    |                                  |
    |--- getcfilters(start, stop) ---->|
    |                                  |
    |<-- cfilter(filter_data) ---------|
    |                                  |
    |   [locally check if any of our   |
    |    scripts match the filter]     |
    |                                  |
    |   [if match: download full block]|
    |--- getdata(block_hash) -------->|
    |<-- block(full_block) -----------|
```

**隱私優勢**：
- 全節點不知道 SPV 節點關心哪些地址
- 下載 filter 和下載區塊是兩個獨立操作
- 可以從不同節點下載 filter 和區塊

**Filter header chain**：filter 的 header 組成自己的鏈，SPV 節點可以從多個節點下載 filter header 並交叉驗證。

### GCS 編碼

Golomb-coded set 是一種空間效率極高的機率性資料結構：

1. 將所有元素雜湊到 $[0, N \times M)$ 範圍
2. 排序
3. 計算相鄰差值
4. 使用 Golomb-Rice 編碼壓縮差值

Golomb-Rice 編碼：將值 $x$ 分為商 $q = \lfloor x / 2^P \rfloor$（unary 編碼）和餘數 $r = x \mod 2^P$（binary 編碼）。

### 與 Ethereum Light Client 的比較

| 特性 | Bitcoin SPV (Neutrino) | Ethereum Light Client |
|------|----------------------|----------------------|
| 驗證基礎 | PoW header chain | Sync committee 簽名 |
| Header 大小 | 80 bytes | ~500 bytes |
| 信任假設 | 算力多數誠實 | 2/3 sync committee 誠實 |
| 交易驗證 | Merkle proof | Merkle-Patricia proof |
| 狀態查詢 | 僅 UTXO 存在性 | 任意 state 查詢 |
| Finality | 機率性（N confirmations） | 確定性（sync committee 簽名） |

Ethereum 的 light client 可以透過 sync committee（512 個 validator）的 [BLS 簽名](/ethereum/cryptography/bls-signatures/) 驗證任何 beacon state，功能比 Bitcoin SPV 更強大但信任假設不同。

## 程式碼範例

```python
# SPV Merkle Proof 驗證
import hashlib

def double_sha256(data: bytes) -> bytes:
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()


def verify_merkle_proof(
    tx_hash: bytes,
    merkle_path: list[tuple[bytes, str]],  # (hash, "L" or "R")
    merkle_root: bytes,
) -> bool:
    """驗證交易的 Merkle proof"""
    current = tx_hash

    for sibling_hash, side in merkle_path:
        if side == "L":
            combined = sibling_hash + current
        else:
            combined = current + sibling_hash
        current = double_sha256(combined)

    return current == merkle_root


def spv_verify_transaction(tx_hash, block_height, header_chain, get_merkle_proof):
    """完整的 SPV 交易驗證流程"""
    # 1. 確認 header chain 的 PoW
    for i, header in enumerate(header_chain):
        if not verify_pow(header):
            return {"valid": False, "error": f"invalid PoW at height {i}"}

    # 2. 取得並驗證 Merkle proof
    proof = get_merkle_proof(tx_hash, block_height)
    target_header = header_chain[block_height]
    is_valid = verify_merkle_proof(
        bytes.fromhex(tx_hash), proof["path"], target_header.merkle_root
    )

    return {"valid": is_valid, "confirmations": len(header_chain) - block_height}
```

```javascript
// Neutrino: 使用 compact block filters 掃描相關交易
async function neutrinoScan(rpcUrl, watchScripts, scanDepth = 100) {
  async function rpc(method, params = []) {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    return (await res.json()).result;
  }

  const info = await rpc("getblockchaininfo");
  const tipHeight = info.blocks;
  const startHeight = Math.max(0, tipHeight - scanDepth);
  const matches = [];

  for (let h = startHeight; h <= tipHeight; h++) {
    const hash = await rpc("getblockhash", [h]);
    const filter = await rpc("getblockfilter", [hash, "basic"]);
    if (!filter) continue;

    // 本地 GCS 匹配（簡化：實際需要 GCS 解碼器）
    const hasMatch = filter.filter && filter.filter.length > 0;
    if (hasMatch) {
      const block = await rpc("getblock", [hash, 2]);
      const txs = block.tx.filter((tx) =>
        tx.vout.some((o) => watchScripts.includes(o.scriptPubKey.hex))
      );
      if (txs.length > 0) {
        matches.push({ height: h, txids: txs.map((t) => t.txid) });
      }
    }
  }

  return { scanned: { from: startHeight, to: tipHeight }, matches };
}
```

## 相關概念

- [Merkle Root](/bitcoin/cryptography/merkle-root/) - SPV 驗證的核心資料結構
- [區塊結構](/bitcoin/data-structures/bitcoin-block-structure/) - 區塊頭包含 merkle_root 和 PoW
- [Proof-of-Work](/bitcoin/consensus/pow-hashcash/) - SPV 節點驗證 header chain 的 PoW
- [最長鏈規則](/bitcoin/consensus/longest-chain-rule/) - SPV 選擇累計工作量最大的 header chain
- [節點發現](/bitcoin/network/peer-discovery/) - SPV 節點的 P2P 連線
- [區塊驗證](/bitcoin/consensus/block-validation/) - 全節點驗證 vs SPV 驗證
- [Bloom Filter](/fundamentals/data-structures/bloom-filter/) - BIP-37 使用的資料結構（已棄用）
- [Merkle Tree](/fundamentals/data-structures/merkle-tree/) - Merkle proof 的基礎
- [Beacon Chain (ETH)](/ethereum/consensus/beacon-chain/) - Ethereum light client 的 sync committee 驗證
- [BLS Signatures (ETH)](/ethereum/cryptography/bls-signatures/) - Ethereum light client 驗證的簽名方案
