---
title: "SHA-256 in Proof of History"
description: "SHA-256 sequential hash chain as Solana's cryptographic clock"
tags: [solana, cryptography, sha-256, proof-of-history, VDF, consensus]
---

# SHA-256 in Proof of History

## 概述

Solana 的 [Proof of History (PoH)](/solana/consensus/proof-of-history/) 核心是一條 [SHA-256](/fundamentals/cryptography/sha-256/) 連續雜湊鏈。每個雜湊的輸出成為下一個雜湊的輸入，形成一條不可偽造的時間序列。由於 [雜湊函數](/fundamentals/cryptography/hash-function-overview/) 的單向性，這條鏈只能依序計算、無法平行化——它本質上是一個 Verifiable Delay Function (VDF)。Solana 利用這條雜湊鏈作為「密碼學時鐘」，讓驗證者不需要互相通訊就能就事件順序達成共識。

## 核心原理

### 連續雜湊鏈

PoH 的基本構造極其簡單：

$$h_n = \text{SHA-256}(h_{n-1})$$

從某個初始值 $h_0$ 開始，反覆對前一個雜湊值取 SHA-256：

$$h_0 \xrightarrow{\text{SHA-256}} h_1 \xrightarrow{\text{SHA-256}} h_2 \xrightarrow{\text{SHA-256}} \cdots \xrightarrow{\text{SHA-256}} h_n$$

每次雜湊運算稱為一個 **tick**。如果我們知道單核心 SHA-256 的速度上限，那麼 $n$ 個 tick 就代表了一段不可壓縮的最小時間。

### 為什麼無法平行化

SHA-256 的雪崩效應（avalanche effect）使得：

$$h_n = \text{SHA-256}(\text{SHA-256}(\cdots \text{SHA-256}(h_0) \cdots))$$

每一步都依賴前一步的完整輸出。沒有數學捷徑可以跳過中間步驟直接從 $h_0$ 計算 $h_n$。這正是 VDF 的核心性質——計算必須依序進行，但驗證可以平行化。

### 交易穿插

交易被穿插（interleave）到雜湊鏈中，證明其順序：

$$h_{k+1} = \text{SHA-256}(h_k \| \text{tx}_i)$$

將交易資料 $\text{tx}_i$ 與當前雜湊值 $h_k$ 串聯後一起雜湊。這在雜湊鏈中創造了一個可驗證的錨點：交易 $\text{tx}_i$ 必然發生在 tick $k$ 之後、tick $k+1$ 之前。

```
h_100 -> h_101 -> h_102 -> h_103(tx_A) -> h_104 -> h_105(tx_B) -> ...
```

由此可知 `tx_A` 在 `tx_B` 之前，且兩者之間相隔約 2 個 tick 的時間。

### Tick 與 Slot 的關係

| 概念 | 說明 |
|------|------|
| Tick | 一次 SHA-256 雜湊運算 |
| Ticks per slot | 每個 slot 包含的 tick 數（目前為 64） |
| Slot | Solana 的基本時間單位（約 400ms） |
| Slot duration | $\frac{64 \text{ ticks}}{\text{hash rate}}$ |

Solana 的目標 tick rate 約為 160 ticks/second，因此：

$$\text{slot duration} \approx \frac{64}{160} = 0.4 \text{ seconds}$$

### VDF 性質

PoH 的 SHA-256 鏈具有 VDF 的三個關鍵性質：

1. **Sequential computation**：產生 $n$ 個雜湊需要 $\Omega(n)$ 次順序運算
2. **Efficient verification**：給定 $(h_0, h_n, n)$，驗證者可以平行驗證中間段
3. **Uniqueness**：給定相同輸入，輸出唯一確定

驗證的平行化：將 $n$ 個雜湊分成 $k$ 段，$k$ 個 CPU 核心同時驗證各段的連續性：

$$\text{驗證時間} \approx \frac{n}{k} \text{ 次雜湊}$$

### 硬體需求

PoH 的安全假設建立在 SHA-256 單核心運算速度的物理上限：

- Leader 需要最快的單核心 SHA-256 吞吐量
- 目前的瓶頸是 CPU 的單執行緒效能
- ASIC 或 GPU 無法獲得顯著優勢，因為 SHA-256 的順序依賴性限制了平行化
- Solana 建議使用高時脈主頻的 CPU（如 AMD EPYC / Intel Xeon）

### 與傳統 BFT 時間戳的對比

| 方面 | 傳統 BFT | Solana PoH |
|------|----------|------------|
| 時間來源 | 節點間 NTP 同步 | 密碼學雜湊鏈 |
| 排序 | 需要多輪通訊 | Leader 單方面決定 |
| 延遲 | 通訊往返時間 | 單核心雜湊時間 |
| 驗證 | 需要 $\frac{2}{3}$ 簽名 | 任何人可平行驗證 |

PoH 的核心優勢：Leader 不需要等待其他驗證者確認順序，大幅降低共識延遲。

## 程式碼範例

### Rust（模擬 PoH 雜湊鏈）

```rust
use sha2::{Sha256, Digest};

/// PoH 雜湊鏈的單一 entry
struct PohEntry {
    hash: [u8; 32],
    num_hashes: u64,     // 自上一個 entry 經過的雜湊次數
    transactions: Vec<Vec<u8>>,  // 穿插的交易（可能為空）
}

/// 模擬 PoH 雜湊鏈生成
fn generate_poh_chain(
    initial_hash: [u8; 32],
    ticks_per_slot: u64,
    transactions: &[Vec<u8>],
) -> Vec<PohEntry> {
    let mut entries = Vec::new();
    let mut current_hash = initial_hash;
    let mut tx_index = 0;

    for tick in 0..ticks_per_slot {
        // 連續雜湊：h_n = SHA-256(h_{n-1})
        let mut hasher = Sha256::new();
        hasher.update(current_hash);

        // 如果有交易要穿插，將交易混入雜湊
        let mut slot_txs = Vec::new();
        if tx_index < transactions.len() && tick % 8 == 0 {
            hasher.update(&transactions[tx_index]);
            slot_txs.push(transactions[tx_index].clone());
            tx_index += 1;
        }

        current_hash = hasher.finalize().into();
        entries.push(PohEntry {
            hash: current_hash,
            num_hashes: 1,
            transactions: slot_txs,
        });
    }

    entries
}

/// 驗證 PoH 鏈的完整性
fn verify_poh_chain(
    initial_hash: [u8; 32],
    entries: &[PohEntry],
) -> bool {
    let mut expected_hash = initial_hash;

    for entry in entries {
        let mut hasher = Sha256::new();
        hasher.update(expected_hash);
        for tx in &entry.transactions {
            hasher.update(tx);
        }
        expected_hash = hasher.finalize().into();

        if expected_hash != entry.hash {
            return false;
        }
    }

    true
}

fn main() {
    let genesis_hash = [0u8; 32];
    let txs = vec![
        b"transfer 10 SOL to Alice".to_vec(),
        b"mint NFT #42".to_vec(),
    ];

    let chain = generate_poh_chain(genesis_hash, 64, &txs);
    let valid = verify_poh_chain(genesis_hash, &chain);
    println!("PoH chain valid: {}", valid);
    println!("Chain length: {} entries", chain.len());
}
```

### TypeScript（PoH 概念驗證）

```typescript
import { createHash } from 'crypto';

function sha256(data: Buffer): Buffer {
  return createHash('sha256').update(data).digest();
}

// 模擬 PoH tick
function pohTick(prevHash: Buffer): Buffer {
  return sha256(prevHash);
}

// 穿插交易
function pohMixin(prevHash: Buffer, tx: Buffer): Buffer {
  return sha256(Buffer.concat([prevHash, tx]));
}

// 生成 PoH 鏈
let hash = Buffer.alloc(32, 0); // genesis
const chain: { hash: Buffer; tick: number; tx?: string }[] = [];

for (let i = 0; i < 64; i++) {
  if (i === 10) {
    const tx = Buffer.from('transfer 5 SOL');
    hash = pohMixin(hash, tx);
    chain.push({ hash, tick: i, tx: 'transfer 5 SOL' });
  } else {
    hash = pohTick(hash);
    chain.push({ hash, tick: i });
  }
}

console.log(`Generated ${chain.length} ticks`);
console.log(`Final hash: ${chain[chain.length - 1].hash.toString('hex').slice(0, 16)}...`);
```

## 相關概念

- [雜湊函數概述](/fundamentals/cryptography/hash-function-overview/) - 雜湊函數的通用性質與安全要求
- [SHA-256](/fundamentals/cryptography/sha-256/) - SHA-256 演算法的內部結構
- [Proof of History](/solana/consensus/proof-of-history/) - PoH 在 Solana 共識中的角色
- [Tower BFT](/solana/consensus/tower-bft/) - 基於 PoH 的 BFT 共識協議
- [SHA-256d (Bitcoin)](/bitcoin/cryptography/sha-256d/) - Bitcoin 的雙重 SHA-256 用法
- [PoW/Hashcash (Bitcoin)](/bitcoin/consensus/pow-hashcash/) - Bitcoin 將 SHA-256 用於工作量證明
- [Ethash (Ethereum)](/ethereum/consensus/ethash/) - Ethereum 歷史上的 PoW 演算法
- [Validators](/ethereum/consensus/validators/) - 驗證者在共識中的角色對比
- [Block Structure (Ethereum)](/ethereum/consensus/block-structure/) - 區塊結構中的時間戳概念
