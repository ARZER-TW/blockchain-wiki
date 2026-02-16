---
title: "Firedancer"
description: "Firedancer, Jump Crypto, C/C++ validator, tile architecture, kernel bypass, Frankendancer"
tags: [solana, advanced, firedancer, validator, client-diversity, jump-crypto]
---

# Firedancer

## 概述

Firedancer 是由 Jump Crypto（Jump Trading 子公司）從零開始以 C/C++ 重寫的 Solana 驗證者客戶端。採用 tile 架構實現模組化隔離，每個功能元件在獨立 process 中運行並透過共享記憶體通訊。使用 kernel-bypass networking（直接操作網卡，繞過 OS 網路堆疊）以達到極低延遲。目標是實現 1M+ TPS，同時提升 Solana 的客戶端多樣性。截至 2025 年底，Frankendancer（Firedancer 網路層 + Agave runtime）已有 207 個驗證者，佔約 20.9% staked SOL。

## 核心原理

### 為何需要 Firedancer

```
問題:
  1. 客戶端單一化風險: Agave (Rust) 是唯一成熟客戶端
     -> 一個 bug 可以癱瘓整個網路
  2. 效能瓶頸: Agave 的架構限制了 throughput
  3. 延遲: OS 網路堆疊增加處理延遲

Firedancer 目標:
  1. 獨立實作 -> 不同語言、不同 bug profile
  2. tile 架構 -> 更好的資源利用
  3. kernel bypass -> 消除 OS 開銷
  4. 1M+ TPS -> 為未來擴展做準備
```

### Tile 架構

Firedancer 將驗證者功能拆分為獨立的 **tiles**：

```
+---------------------------------------------------+
|                   Firedancer Node                   |
|                                                     |
|  [Net Tile]  [QUIC Tile]  [Verify Tile]  ...      |
|      |           |             |                    |
|      +-----+-----+-----+------+                    |
|            |     |      |                           |
|      Shared Memory (mmap regions)                   |
|            |     |      |                           |
|      +-----+-----+-----+------+                    |
|      |           |             |                    |
|  [Dedup Tile] [Pack Tile] [Bank Tile]              |
|                   |             |                    |
|            [PoH Tile]  [Store Tile]                 |
+---------------------------------------------------+
```

每個 tile 的特性：
- **獨立 process**：一個 tile crash 不會影響其他 tile
- **共享記憶體 IPC**：零拷貝資料傳遞
- **CPU 綁定**：每個 tile 綁定到特定 CPU 核心
- **無鎖設計**：使用 lock-free 資料結構

### 關鍵 Tiles

| Tile | 功能 |
|------|------|
| Net | 網路 I/O（kernel bypass） |
| QUIC | QUIC 協定處理 |
| Verify | Ed25519 簽名驗證 |
| Dedup | 交易去重 |
| Pack | 交易排序打包（Banking Stage 等價） |
| Bank | SVM 執行 |
| PoH | Proof of History 計算 |
| Store | AccountsDB 寫入 |
| Shred | 區塊分片 |
| Repair | 缺失資料修復 |

### Kernel-Bypass Networking

```
傳統路徑 (Agave):
  NIC -> OS kernel -> socket buffer -> userspace (copy)
  延遲: ~10-50 us

Kernel-bypass (Firedancer):
  NIC -> DPDK/io_uring -> userspace (zero-copy)
  延遲: ~1-5 us

效能提升:
  - 封包處理: ~10x 提升
  - 網路吞吐: 接近線速 (line rate)
  - 延遲: 降低 10x
```

Firedancer 使用 XDP（eXpress Data Path）或類似技術直接從網卡讀取封包。

### Frankendancer

Frankendancer 是過渡方案：Firedancer 的網路和共識層 + Agave 的 runtime：

```
Frankendancer = Firedancer (networking + consensus) + Agave (SVM runtime)

部署狀態 (2025 年底):
  - 207 validators
  - ~20.9% staked SOL
  - mainnet-beta 生產環境

Full Firedancer = 完整 C/C++ 實作（含 SVM）
  - 仍在開發中
  - testnet 測試
```

### 客戶端多樣性

| 客戶端 | 語言 | 佔比 (2025) | 狀態 |
|--------|------|-------------|------|
| Agave | Rust | ~79% | 成熟，主要客戶端 |
| Frankendancer | C/C++ + Rust | ~21% | 生產環境 |
| Full Firedancer | C/C++ | <1% | 開發中 |

客戶端多樣性的重要性：
- **容錯**：一個客戶端的 bug 不會導致 >33% 節點故障
- **安全**：不同語言、不同實作減少共模故障
- **治理**：多團隊維護避免單一控制

### 與 Ethereum 客戶端多樣性的比較

| 特性 | Solana | Ethereum |
|------|--------|----------|
| 執行層客戶端 | Agave, Firedancer | Geth, Nethermind, Besu, Erigon, Reth |
| 共識層客戶端 | 同上（整合） | Prysm, Lighthouse, Teku, Nimbus, Lodestar |
| 最大單一佔比 | Agave ~79% | Geth ~55% (降低中) |
| 多樣性目標 | 無單一客戶端 >33% | 無單一客戶端 >33% |
| 開發語言 | Rust + C/C++ | Go, Rust, Java, C#, TypeScript |

Ethereum 有 5+ 個執行層客戶端和 5+ 個共識層客戶端，多樣性更高。Solana 正在追趕。

### 效能指標

Firedancer 的設計目標：

```
TPS:
  Agave: ~3,000-5,000 TPS (實際)
  Firedancer: 1,000,000+ TPS (目標)
  測試紀錯: 600k+ TPS (demo, 2022)

延遲:
  封包處理: <5 us (kernel bypass)
  交易執行: 與 SVM 效能相同
  End-to-end: 目標顯著低於 Agave

記憶體效率:
  Tile 架構: 每個 tile 獨立記憶體空間
  共享記憶體: 零拷貝 IPC
  記憶體映射: mmap 方式管理
```

## 程式碼範例

```typescript
import { Connection, PublicKey } from "@solana/web3.js";

// 檢查驗證者客戶端版本（可間接判斷是否為 Firedancer）
async function checkValidatorVersions(connection: Connection) {
  const voteAccounts = await connection.getVoteAccounts();

  const allValidators = [
    ...voteAccounts.current,
    ...voteAccounts.delinquent,
  ];

  // 取得 cluster nodes 資訊
  const clusterNodes = await connection.getClusterNodes();
  const nodeMap = new Map(
    clusterNodes.map((node) => [node.pubkey, node])
  );

  const clientStats = { agave: 0, firedancer: 0, unknown: 0 };
  const stakeStats = { agave: 0n, firedancer: 0n, unknown: 0n };

  for (const validator of allValidators) {
    const node = nodeMap.get(validator.nodePubkey);
    const version = node?.version ?? "unknown";
    const stake = BigInt(validator.activatedStake);

    // Firedancer 節點通常有不同的版本字串格式
    if (version.includes("fd_") || version.includes("firedancer")) {
      clientStats.firedancer++;
      stakeStats.firedancer += stake;
    } else if (version.match(/^\d+\.\d+\.\d+/)) {
      clientStats.agave++;
      stakeStats.agave += stake;
    } else {
      clientStats.unknown++;
      stakeStats.unknown += stake;
    }
  }

  const totalStake =
    stakeStats.agave + stakeStats.firedancer + stakeStats.unknown;

  return {
    totalValidators: allValidators.length,
    clientDistribution: clientStats,
    stakeDistribution: {
      agave: `${((Number(stakeStats.agave) / Number(totalStake)) * 100).toFixed(1)}%`,
      firedancer: `${((Number(stakeStats.firedancer) / Number(totalStake)) * 100).toFixed(1)}%`,
    },
  };
}

// 監控不同客戶端的 slot 生產表現
async function compareClientPerformance(
  connection: Connection,
  numSlots: number
) {
  const results = [];
  const currentSlot = await connection.getSlot();
  const leaders = await connection.getSlotLeaders(
    currentSlot - numSlots,
    numSlots
  );

  for (let i = 0; i < numSlots; i++) {
    const slot = currentSlot - numSlots + i;
    try {
      const block = await connection.getBlock(slot, {
        maxSupportedTransactionVersion: 0,
        transactionDetails: "none",
      });
      results.push({
        slot,
        leader: leaders[i].toBase58(),
        txCount: block?.transactions?.length ?? 0,
        blockTime: block?.blockTime,
      });
    } catch {
      results.push({ slot, leader: leaders[i].toBase58(), skipped: true });
    }
  }

  return results;
}
```

```rust
// 程式無需關心底層是 Agave 還是 Firedancer
// 兩者執行相同的 SBF bytecode，行為應完全一致
use anchor_lang::prelude::*;

declare_id!("FDDemo1111111111111111111111111111111111111");

#[program]
pub mod client_agnostic_program {
    use super::*;

    // 此程式在 Agave 和 Firedancer 上的執行結果應相同
    // 客戶端多樣性要求所有客戶端對相同輸入產生相同輸出
    pub fn deterministic_operation(
        ctx: Context<DeterministicOp>,
        input: u64,
    ) -> Result<()> {
        let account = &mut ctx.accounts.data;

        // 確定性計算: 相同輸入 -> 相同輸出
        let hash_input = [
            input.to_le_bytes().as_ref(),
            account.seed.to_le_bytes().as_ref(),
        ]
        .concat();

        let hash = anchor_lang::solana_program::hash::hash(&hash_input);
        account.result = u64::from_le_bytes(
            hash.to_bytes()[..8].try_into().unwrap()
        );
        account.operations += 1;

        // 紀錄用: 不影響狀態轉換
        msg!(
            "Operation #{}: input={}, result={}",
            account.operations,
            input,
            account.result
        );

        Ok(())
    }
}

#[derive(Accounts)]
pub struct DeterministicOp<'info> {
    #[account(mut)]
    pub data: Account<'info, DeterministicData>,
    pub authority: Signer<'info>,
}

#[account]
pub struct DeterministicData {
    pub seed: u64,
    pub result: u64,
    pub operations: u64,
}
```

## 相關概念

- [Validators and Staking](/solana/consensus/validators-staking/) - Firedancer 作為驗證者客戶端
- [Banking Stage](/solana/runtime/banking-stage/) - Firedancer 重新設計的交易處理 pipeline
- [Alpenglow](/solana/consensus/alpenglow/) - 下一代共識協定
- [SVM/Sealevel](/solana/runtime/svm-sealevel/) - 兩個客戶端共享的執行引擎規範
- [BPF/SBF](/solana/runtime/bpf-sbf/) - 客戶端必須相容的 bytecode 格式
- [Solana vs Ethereum](/solana/advanced/solana-vs-ethereum/) - 客戶端多樣性的跨鏈比較
- [Network Economics](/solana/advanced/network-economics/) - 驗證者運營成本與客戶端選擇
- [Jito MEV](/solana/advanced/jito-mev/) - Jito 與 Firedancer 的整合
- [Gulf Stream](/solana/consensus/gulf-stream/) - 交易轉發機制的實作差異
