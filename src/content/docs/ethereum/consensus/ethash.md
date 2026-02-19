---
title: "Ethash"
description: "Ethash, PoW, Proof of Work"
tags: [ethereum, consensus, pow, mining, history]
sidebar:
  order: 10
---

# Ethash

## 概述

Ethash 是 Ethereum 在 The Merge 前使用的 Proof of Work 演算法。設計目標是 memory-hard，抵抗 ASIC 專用礦機，讓 GPU 礦工能公平參與。2022 年 9 月 The Merge 後，Ethereum 轉向 Proof of Stake，Ethash 已停用，但理解它有助於理解 [區塊 Header](/ethereum/consensus/block-header/) 中 `difficulty`、`nonce`、`mixHash` 欄位的歷史語義。

## 核心原理

### 整體流程

Ethash 的核心是 Hashimoto 演算法的變體，依賴大量記憶體讀取：

1. 生成 **Seed**（每 30000 個區塊更新一次，稱為一個 epoch）
2. 從 Seed 生成 16MB 的 **Cache**
3. 從 Cache 生成約 1GB 的 **DAG**（Directed Acyclic Graph）
4. 挖礦時反覆從 DAG 讀取資料，混合後與 target 比較

### Seed 生成

$$\text{seed}_0 = \text{keccak256}(\texttt{0x00} \times 32)$$
$$\text{seed}_n = \text{keccak256}(\text{seed}_{n-1})$$

每個 epoch（30000 blocks）計算一次新的 seed。

### Cache 生成

Cache 大小隨 epoch 增長（初始約 16MB），由 seed 經過反覆 [Keccak-256](/ethereum/cryptography/keccak-256/) hash 生成：

1. 第一個 cache 元素：$c_0 = \text{keccak512}(\text{seed})$
2. 後續元素：$c_i = \text{keccak512}(c_{i-1})$
3. 生成後進行 3 輪 RandMemoHash（類似 Strict Memory Hard Hash）

### DAG 生成

DAG 大小初始約 1GB，每個 epoch 增長約 8MB。每個 DAG 項目由 cache 中的元素混合而成：

```
for i in range(dag_size):
    mix = cache[i % cache_size]
    for j in range(256):
        idx = fnv(i ^ j, mix) % cache_size
        mix = fnv(mix, cache[idx])
    dag[i] = keccak512(mix)
```

FNV 是一個簡單的非加密 hash function：

$$\text{FNV}(a, b) = ((a \times \texttt{0x01000193}) \oplus b) \mod 2^{32}$$

### Hashimoto 挖礦循環

給定 header hash $H$ 和 nonce $n$：

1. 計算初始 mix：$\text{seed} = \text{keccak512}(H \| n)$
2. 進行 64 輪 DAG 讀取：
   - 計算 DAG index：$\text{idx} = \text{FNV}(\text{seed}[0] \oplus i, \text{mix}[\text{i mod mix\_size}]) \mod \text{dag\_pages}$
   - 從 DAG 讀取 128 bytes
   - 用 FNV 混合到 mix 中
3. 壓縮 mix 到 32 bytes 得到 `mixHash`
4. 計算最終 hash：$\text{result} = \text{keccak256}(\text{seed} \| \text{mixHash})$
5. 檢查：$\text{result} \leq \frac{2^{256}}{\text{difficulty}}$

### Memory-Hard 特性

每次 hash 運算需要讀取 DAG 中 64 個隨機位置（共 8KB），而 DAG 大小約 1GB。記憶體頻寬成為瓶頸而非計算速度，這使得：

- GPU 挖礦效率高（高記憶體頻寬）
- ASIC 優勢被削弱（記憶體成本佔比高）
- 輕節點只需 cache（16MB）即可驗證

### 難度調整

difficulty 動態調整確保平均出塊時間約 13-15 秒：

$$d_n = d_{n-1} + d_{n-1} \times \max\left(-99, \left\lfloor\frac{1 - (t_n - t_{n-1})}{10}\right\rfloor\right) \div 2048$$

其中 $t_n$ 是區塊 $n$ 的時間戳。

## 在 Ethereum 中的應用

### 歷史角色

Ethash 從 2015 年 Ethereum 主網啟動一直使用到 2022 年 The Merge：

- 保護網路安全約 7 年
- 巔峰時期全網算力超過 1 PH/s
- 激勵了大量 GPU 礦工參與

### Post-Merge 遺留

[區塊 Header](/ethereum/consensus/block-header/) 中 Ethash 相關欄位被重新利用：

- `difficulty`：固定為 0
- `nonce`：固定為 `0x0000000000000000`
- `mixHash`：改為 `prevRandao`，攜帶 [RANDAO](/ethereum/consensus/randao/) 隨機值

The Merge 的觸發條件就是 Terminal Total Difficulty（TTD），當累計 difficulty 達到 $58750000000000000000000$ 時，切換到 PoS。

## 程式碼範例

```python
# Ethash 驗證（簡化版）
import hashlib

def fnv(a: int, b: int) -> int:
    return ((a * 0x01000193) ^ b) & 0xFFFFFFFF

def ethash_verify(header_hash: bytes, nonce: bytes, mix_hash: bytes,
                  difficulty: int, dag_lookup) -> bool:
    """
    輕節點驗證：只需 cache 即可重新計算 mix_hash 和 result。
    """
    # 1. 計算 seed
    seed = keccak512(header_hash + nonce)

    # 2. 進行 64 輪 DAG 讀取（輕節點用 cache 即時計算 DAG 項目）
    mix = list(seed)
    for i in range(64):
        idx = fnv(seed[0] ^ i, mix[i % len(mix)]) % dag_size
        dag_item = dag_lookup(idx)  # 從 cache 計算
        mix = [fnv(m, d) for m, d in zip(mix, dag_item)]

    # 3. 壓縮 mix
    computed_mix = compress(mix)

    # 4. 驗證 mix_hash
    if computed_mix != mix_hash:
        return False

    # 5. 驗證 difficulty
    result = keccak256(seed + computed_mix)
    return int.from_bytes(result, 'big') <= (2**256 // difficulty)
```

```javascript
// 檢查 post-merge 區塊的 Ethash 欄位是否正確歸零
async function verifyPostMergeHeader(provider, blockNumber) {
  const block = await provider.getBlock(blockNumber);

  const checks = {
    difficultyIsZero: block.difficulty === 0n,
    nonceIsZero: block.nonce === "0x0000000000000000",
    // mixHash 現在是 prevRandao，應該是非零的隨機值
    prevRandaoSet: block.mixHash !== "0x" + "0".repeat(64),
  };

  return checks;
}
```

## 相關概念

- [區塊 Header](/ethereum/consensus/block-header/) - difficulty/nonce/mixHash 欄位的定義
- [區塊結構](/ethereum/consensus/block-structure/) - Ethash 驗證是舊區塊驗證流程的核心
- [Keccak-256](/ethereum/cryptography/keccak-256/) - Ethash 內部大量使用 Keccak hash
- [RANDAO](/ethereum/consensus/randao/) - mixHash 欄位在 post-merge 的替代用途
- [Beacon Chain](/ethereum/consensus/beacon-chain/) - 取代 Ethash 的新共識機制
- [Validators](/ethereum/consensus/validators/) - 取代礦工的新出塊角色
