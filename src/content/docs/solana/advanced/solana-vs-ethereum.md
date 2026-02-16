---
title: "Solana vs Ethereum Architecture Comparison"
description: "Solana vs Ethereum, architecture comparison, account model, execution, consensus, fees, scaling"
tags: [solana, advanced, comparison, ethereum, architecture, tradeoffs]
---

# Solana vs Ethereum Architecture Comparison

## 概述

Solana 和 Ethereum 是兩種根本不同的區塊鏈架構哲學。Ethereum 走模組化路線（execution + consensus + DA 分層，rollup-centric scaling），而 Solana 走單體高效能路線（monolithic, hardware-scaling）。本文從帳戶模型、執行引擎、共識、費用、狀態管理、終局性、客戶端多樣性和擴展策略等維度做系統性比較，幫助理解兩者的設計取捨。

## 核心原理

### 帳戶模型

| 特性 | Solana | Ethereum |
|------|--------|----------|
| 結構 | 平面命名空間（flat） | 巢狀 storage tries |
| 帳戶 | 全域唯一 Pubkey + data | 地址 -> account state -> storage trie |
| 狀態存取 | 帳戶預先宣告 | 動態 SLOAD/SSTORE |
| 程式/合約 | Code 與 data 分離 | Code 和 storage 在同一帳戶 |
| 代幣 | 獨立 Token Account per holder | ERC-20 mapping 在合約 storage |

```
Solana Account:
  [lamports | owner | executable | rent_epoch | data...]
  -> 所有帳戶在同一層級
  -> data 由 owner program 解釋

Ethereum Account:
  [nonce | balance | storageRoot | codeHash]
  -> storageRoot 指向 Patricia Trie
  -> 合約 storage 是巢狀結構
```

### 執行引擎

```
Solana (SVM + Sealevel):
  - Register-based VM (11 registers, 64-bit)
  - 並行執行: 帳戶預宣告 -> 依賴圖 -> 多 CPU 核心
  - Bytecode: SBF (eBPF fork)
  - 語言: Rust / C
  - CPI: program 呼叫 program

Ethereum (EVM):
  - Stack-based VM (1024 depth, 256-bit words)
  - 循序執行: 逐筆交易
  - Bytecode: EVM opcodes
  - 語言: Solidity / Vyper
  - CALL/DELEGATECALL/STATICCALL
```

並行 vs 循序是最大的效能差異來源：

```
Solana (4 core example):
  Core 1: TX1, TX5, TX9  (all write different accounts)
  Core 2: TX2, TX6, TX10
  Core 3: TX3, TX7
  Core 4: TX4, TX8
  -> 理論 4x throughput

Ethereum:
  Single thread: TX1 -> TX2 -> TX3 -> ... -> TX10
  -> 每筆交易可能修改任意 storage
  -> 無法安全並行化（注: Pectra 提案中有 parallel EVM 討論）
```

### 共識機制

| 特性 | Solana | Ethereum |
|------|--------|----------|
| 機制 | PoH + Tower BFT / Alpenglow | Casper FFG + LMD GHOST |
| 出塊時間 | ~400ms（slot） | ~12s（slot） |
| Epoch | ~2 天 (~432,000 slots) | ~6.4 分鐘 (32 slots) |
| Leader 選擇 | Stake-weighted schedule | RANDAO |
| 投票機制 | Vote transactions（鏈上） | Attestations（鏈上） |
| Finality | ~6.4s (optimistic) / ~12.8s | ~12.8 分鐘 (2 epochs) |
| BFT 閾值 | 2/3 stake | 2/3 stake |

### 費用模型

```
Solana:
  base fee = 5,000 lamports/signature (固定)
  priority fee = CU_limit * CU_price (競標)
  分配: base 50% burn/50% validator; priority 100% validator (SIMD-0096)

Ethereum (EIP-1559):
  base fee = 動態調整 (根據區塊使用率)
  priority fee = tip (使用者設定)
  分配: base fee 100% burn; priority fee 100% validator
  base fee 變動: 每區塊最多 +/- 12.5%
```

| 費用特性 | Solana | Ethereum |
|----------|--------|----------|
| 基本轉帳 | ~$0.00025 | ~$0.50-5.00 |
| DEX swap | ~$0.001 | ~$5-50 |
| NFT mint | ~$0.001 | ~$10-100 |
| 可預測性 | 較高（固定 base） | 波動大（動態 base） |
| 燃燒機制 | 50% base fee | 100% base fee |

### 狀態管理

```
Solana:
  - Rent-exempt: 帳戶需存入最低 lamports
  - 關閉帳戶: 回收 lamports + 空間
  - 無 state 膨脹問題（經濟激勵清理）
  - AccountsDB: 平面檔案系統儲存

Ethereum:
  - 無 rent（曾提案但未實施）
  - State trie 持續增長
  - State expiry / Verkle trees（研究中）
  - LevelDB/PebbleDB 儲存 Patricia Trie
```

### 終局性（Finality）

| 階段 | Solana | Ethereum |
|------|--------|----------|
| 交易確認 | ~400ms (1 slot) | ~12s (1 slot) |
| Optimistic finality | ~6.4s (~16 slots) | N/A |
| Full finality | ~12.8s (~32 slots) | ~12.8 分鐘 (2 epochs) |
| 經濟安全性 | 2/3 stake | 2/3 stake |

Solana 的 finality 快約 60 倍，但安全模型與驗證者數量有關。

### 客戶端多樣性

```
Solana:
  Agave (Rust): ~79%
  Frankendancer (C/C++): ~21%
  -> 尚未達到 "無單一客戶端 > 33%" 的目標

Ethereum:
  Execution Layer:
    Geth (Go): ~55%
    Nethermind (C#): ~20%
    Besu (Java): ~10%
    Erigon (Go): ~10%
    Reth (Rust): ~5%
  Consensus Layer:
    Prysm (Go): ~35%
    Lighthouse (Rust): ~30%
    Teku (Java): ~15%
    Nimbus (Nim): ~10%
    Lodestar (TS): ~10%
```

Ethereum 的客戶端多樣性遠優於 Solana。

### 擴展策略

```
Solana (Monolithic / Hardware-scaling):
  - 單一鏈處理所有交易
  - 硬體升級 -> 更高 TPS
  - Firedancer: 更高效的客戶端
  - State Compression / ZK Compression: 降低狀態成本
  - 不依賴 rollups（但有 SVM rollups 出現）

Ethereum (Modular / Rollup-centric):
  - L1: settlement + DA
  - L2 Rollups: execution (Optimistic / ZK)
  - Danksharding: 更多 DA 空間
  - Data availability: EIP-4844 blobs
  - 模組化: 各層可獨立優化
```

### 開發者體驗

| 特性 | Solana | Ethereum |
|------|--------|----------|
| 主要語言 | Rust（Anchor framework） | Solidity（Hardhat/Foundry） |
| 學習曲線 | 陡峭（帳戶模型、ownership） | 相對平緩（OOP 風格） |
| 框架 | Anchor | Hardhat, Foundry, Truffle |
| 測試 | bankrun, solana-test-validator | Hardhat test, Forge test |
| 部署成本 | 低（~1 SOL） | 高（gas 費用） |
| 升級 | 原生支援 | 需 proxy pattern |

### 去中心化指標

| 指標 | Solana | Ethereum |
|------|--------|----------|
| 驗證者數量 | ~1,800 | ~1,000,000 (含 home stakers) |
| 最低質押 | 無最低限制（但需硬體） | 32 ETH |
| 硬體需求 | 高（12+ cores, 256GB RAM） | 低（4 cores, 16GB RAM） |
| 中本係數 | ~31 | ~2-3 (考慮 staking pools) |
| 年化收益 | ~7-8% | ~3-4% |

## 程式碼範例

```typescript
// 同一功能在兩個平台的實作對比

// --- Solana: 查詢帳戶資訊 ---
import { Connection, PublicKey } from "@solana/web3.js";

async function solanaQuery() {
  const connection = new Connection("https://api.mainnet-beta.solana.com");

  // Solana: 直接查詢帳戶（平面結構）
  const accountInfo = await connection.getAccountInfo(
    new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
  );

  // 查詢 token 餘額: 需要知道 token account 地址
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    new PublicKey("...wallet..."),
    { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
  );

  // Solana: slot-based 時間
  const slot = await connection.getSlot();
  const blockTime = await connection.getBlockTime(slot);

  // 費用: 固定 base + 可選 priority
  const fees = await connection.getRecentPrioritizationFees();

  return { accountInfo, tokenAccounts, slot, fees };
}

// --- Ethereum (ethers.js): 查詢帳戶資訊 ---
// import { JsonRpcProvider, Contract } from 'ethers';
//
// async function ethereumQuery() {
//   const provider = new JsonRpcProvider('https://eth.llamarpc.com');
//
//   // Ethereum: 查詢帳戶（nonce, balance）
//   const balance = await provider.getBalance('0x...');
//   const nonce = await provider.getTransactionCount('0x...');
//
//   // 查詢 token 餘額: 呼叫合約的 balanceOf
//   const erc20 = new Contract('0x...token...', [
//     'function balanceOf(address) view returns (uint256)'
//   ], provider);
//   const tokenBalance = await erc20.balanceOf('0x...');
//
//   // Ethereum: block-based 時間
//   const block = await provider.getBlock('latest');
//
//   // 費用: 動態 EIP-1559
//   const feeData = await provider.getFeeData();
//
//   return { balance, nonce, tokenBalance, block, feeData };
// }
```

```rust
// Solana program: 帳戶所有權模型
// 程式只能修改自己 own 的帳戶
use anchor_lang::prelude::*;

declare_id!("CmpDemo111111111111111111111111111111111111");

#[program]
pub mod comparison_demo {
    use super::*;

    // Solana: 程式透過帳戶存取狀態
    // 每個帳戶有明確的 owner
    pub fn update_data(ctx: Context<UpdateData>, new_value: u64) -> Result<()> {
        // 帳戶由 program own, 可直接修改 data
        let account = &mut ctx.accounts.data;
        account.value = new_value;
        account.last_updater = ctx.accounts.authority.key();
        Ok(())
    }
}

// Ethereum 等價 (Solidity):
// contract DataStore {
//     uint256 public value;
//     address public lastUpdater;
//
//     function updateData(uint256 newValue) external {
//         value = newValue;        // 直接修改 storage slot
//         lastUpdater = msg.sender;
//     }
// }
//
// 差異:
// Solana: 帳戶由外部傳入, program 驗證後修改
// Ethereum: storage 屬於合約, 直接讀寫

#[derive(Accounts)]
pub struct UpdateData<'info> {
    #[account(mut, has_one = authority)]
    pub data: Account<'info, DataStore>,
    pub authority: Signer<'info>,
}

#[account]
pub struct DataStore {
    pub value: u64,
    pub authority: Pubkey,
    pub last_updater: Pubkey,
}
```

## 相關概念

- [Account Model](/solana/account-model/account-model-overview/) - Solana 帳戶模型詳解
- [SVM/Sealevel](/solana/runtime/svm-sealevel/) - Solana 的並行執行引擎
- [Tower BFT](/solana/consensus/tower-bft/) - Solana 的 BFT 共識
- [Firedancer](/solana/advanced/firedancer/) - Solana 客戶端多樣性的進展
- [Network Economics](/solana/advanced/network-economics/) - Solana 經濟模型
- [TX Lifecycle (ETH)](/ethereum/transaction-lifecycle/transaction-lifecycle/) - Ethereum 交易生命週期
- [Gas (ETH)](/ethereum/accounts/gas/) - Ethereum 費用模型
- [Casper FFG (ETH)](/ethereum/consensus/casper-ffg/) - Ethereum 共識機制
- [Jito MEV](/solana/advanced/jito-mev/) - MEV 機制比較
- [ZK Compression](/solana/advanced/zk-compression/) - Solana 狀態擴展方案
