---
title: "智能合約執行環境：Script vs EVM vs SVM"
description: "Bitcoin Script、Ethereum EVM、Solana SVM/BPF 三大智能合約執行環境的架構、指令集、計算模型與 trade-off 比較"
tags: [comparison, bitcoin, ethereum, solana, smart-contract, evm, svm, bitcoin-script, bpf, execution]
---

# 智能合約執行環境：Script vs EVM vs SVM

## 概述

智能合約的執行環境定義了區塊鏈能夠「做什麼」——它是鏈上計算能力的邊界。三條主流公鏈選擇了差異極大的執行模型：Bitcoin 的 [Script](/bitcoin/data-structures/bitcoin-script/) 是一個故意受限的堆疊式語言，提供有限但極其安全的可編程性；Ethereum 的 EVM（Ethereum Virtual Machine）是一台圖靈完備的虛擬機，以 [gas](/ethereum/accounts/gas/) 機制限制計算資源；Solana 的 [SVM/Sealevel](/solana/runtime/svm-sealevel/) 則基於 [BPF/SBF](/solana/runtime/bpf-sbf/) 位元碼格式，以 [compute units](/solana/runtime/compute-units/) 為計量，原生支援平行執行。

這三種設計代表了從「最小化信任面」到「最大化計算能力」的光譜。Bitcoin Script 確保了任何人都可以在毫秒內驗證腳本；EVM 開啟了去中心化應用的時代；SVM 則推動了高性能鏈上計算的邊界。

## 快速比較表

| 屬性 | Bitcoin Script | EVM (Ethereum) | SVM/Sealevel (Solana) |
|------|---------------|----------------|----------------------|
| **計算模型** | 堆疊機（stack-based） | 堆疊機（stack-based） | 暫存器機（register-based） |
| **圖靈完備** | 否（故意受限） | 是（gas 限制） | 是（CU 限制） |
| **狀態模型** | 無狀態（stateless） | 有狀態（contract storage） | 有狀態（account data） |
| **執行方式** | 逐交易循序 | 逐交易循序 | 平行執行（Sealevel） |
| **位元碼格式** | Bitcoin Script opcodes | EVM bytecode | eBPF/SBF |
| **計量單位** | Script size (bytes) | Gas | Compute Units (CU) |
| **主要語言** | Script (assembly-like) | Solidity, Vyper | Rust, C |
| **可升級性** | 不可升級 | Proxy pattern | Upgradeable programs |
| **迴圈** | 不支援 | 支援（gas 限制） | 支援（CU 限制） |

## Bitcoin：Script

### 設計哲學

Bitcoin Script 的設計反映了 Satoshi Nakamoto 的保守哲學——**最小化攻擊面**。它故意不是圖靈完備的：沒有迴圈、沒有狀態、沒有浮點數。這不是技術限制，而是刻意的安全選擇。每個腳本都是一個**斷言程式（predicate）**，回答一個簡單的問題：「這筆花費是否被授權？」

### 技術細節

#### Stack-Based 執行模型

[Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) 使用後綴表示法（reverse Polish notation），所有操作在一個堆疊上進行：

```
// P2PKH 花費腳本執行過程
// scriptSig:  <sig> <pubkey>
// scriptPubKey: OP_DUP OP_HASH160 <pubKeyHash> OP_EQUALVERIFY OP_CHECKSIG

Stack: []
Push <sig>           -> [sig]
Push <pubkey>        -> [sig, pubkey]
OP_DUP               -> [sig, pubkey, pubkey]
OP_HASH160            -> [sig, pubkey, hash(pubkey)]
Push <pubKeyHash>     -> [sig, pubkey, hash(pubkey), pubKeyHash]
OP_EQUALVERIFY        -> [sig, pubkey]  // 驗證 hash 相等
OP_CHECKSIG           -> [true]         // 驗證簽名
```

#### 主要 Opcode 類別

| 類別 | Opcodes | 功能 |
|------|---------|------|
| **常數** | OP_0, OP_1, OP_PUSHDATA | 推送資料到堆疊 |
| **堆疊操作** | OP_DUP, OP_DROP, OP_SWAP | 操作堆疊元素 |
| **算術** | OP_ADD, OP_SUB, OP_EQUAL | 基礎數學運算 |
| **密碼學** | OP_CHECKSIG, OP_CHECKMULTISIG | 簽名驗證 |
| **Hash** | OP_HASH160, OP_SHA256, OP_RIPEMD160 | Hash 運算 |
| **流程控制** | OP_IF, OP_ELSE, OP_ENDIF | 條件分支（無迴圈） |
| **時間鎖** | OP_CHECKLOCKTIMEVERIFY, OP_CHECKSEQUENCEVERIFY | 時間條件 |

注意：OP_CAT、OP_MUL 等 opcodes 被 Satoshi 早期**停用**，以防止 DoS 攻擊。

#### Tapscript 擴展

[Tapscript](/bitcoin/advanced/tapscript/) 是 Taproot 升級引入的新腳本版本（version 1），增加了：

- `OP_CHECKSIGADD`：支援更高效的多簽（取代 OP_CHECKMULTISIG）
- 支援 [Schnorr 簽名](/bitcoin/cryptography/schnorr-signatures/) 的批量驗證
- 更靈活的腳本分支（MAST — Merkelized Abstract Syntax Trees）

```
// Tapscript 多簽範例（2-of-3）
<pubkey1> OP_CHECKSIG
<pubkey2> OP_CHECKSIGADD
<pubkey3> OP_CHECKSIGADD
2 OP_NUMEQUAL
```

#### 計算限制

| 限制 | 值 |
|------|-----|
| **最大 Script 大小** | 10,000 bytes |
| **最大堆疊大小** | 1,000 elements |
| **最大元素大小** | 520 bytes |
| **Opcode 執行上限** | 201 non-push opcodes (legacy) |
| **Sigops 限制** | 80,000 per block |

### 優勢

- **極高安全性**：有限的指令集意味著有限的攻擊面
- **可預測的執行時間**：沒有迴圈，執行時間有上界
- **形式化驗證可行**：Script 的簡潔性使形式化驗證更容易
- **共識穩定性**：15 年來幾乎無需修改

### 限制

- **無圖靈完備性**：無法實作複雜邏輯（DeFi、NFT 等）
- **無狀態**：腳本無法存取或修改持久化狀態
- **有限的運算能力**：算術運算限於 32-bit 整數
- **可組合性差**：腳本之間無法互相調用

## Ethereum：EVM

### 設計哲學

EVM 的設計哲學是建構一台「全球電腦」——一個圖靈完備的、確定性的執行環境，能夠運行任意複雜的智能合約。[Gas](/ethereum/accounts/gas/) 機制是關鍵的安全閥，確保每個計算步驟都有成本，防止無限迴圈和 DoS 攻擊。

### 技術細節

#### Stack-Based VM 架構

EVM 是一台 256-bit 字寬的堆疊機：

```
// EVM 執行環境
Machine State {
    stack:    256-bit word stack (max 1024 depth)
    memory:   byte-addressable, expandable
    storage:  256-bit key -> 256-bit value (persistent)
    pc:       program counter
    gas:      remaining gas
}
```

#### 狀態轉移函數

每個區塊的執行是一個 [state transition](/ethereum/transaction-lifecycle/state-transition/)：

$$\sigma_{t+1} = \Upsilon(\sigma_t, T)$$

其中：
- $\sigma_t$：世界狀態（所有帳戶的 nonce, balance, storage, code）
- $T$：交易
- $\Upsilon$：狀態轉移函數（EVM 執行引擎）

#### Opcode 分類與 Gas 成本

| 類別 | 範例 Opcodes | Gas 範圍 |
|------|-------------|----------|
| **算術** | ADD, MUL, SUB, DIV, MOD | 3-8 gas |
| **比較** | LT, GT, EQ, ISZERO | 3 gas |
| **Hash** | SHA3/KECCAK256 | 30 + 6/word gas |
| **環境** | ADDRESS, BALANCE, CALLER | 2-2600 gas |
| **堆疊** | POP, PUSH1-32, DUP1-16, SWAP1-16 | 2-3 gas |
| **Memory** | MLOAD, MSTORE, MSTORE8 | 3 gas + expansion |
| **Storage** | SLOAD, SSTORE | 100-20,000 gas |
| **控制流** | JUMP, JUMPI, STOP, RETURN | 1-8 gas |
| **Log** | LOG0-LOG4 | 375-1875 gas |
| **呼叫** | CALL, DELEGATECALL, STATICCALL | 100+ gas |
| **建立** | CREATE, CREATE2 | 32,000+ gas |

Storage 操作（SSTORE）是最昂貴的，因為它永久改變全域狀態：

$$\text{SSTORE cost} = \begin{cases} 20,000 & \text{zero to non-zero (cold)} \\ 5,000 & \text{non-zero to non-zero} \\ 5,000 + \text{refund} & \text{non-zero to zero} \end{cases}$$

#### Solidity 智能合約範例

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleSwap {
    mapping(address => uint256) public balances;

    // SSTORE: ~20,000 gas (cold) per balance update
    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    // SLOAD: ~2,100 gas (cold) + SSTORE: ~5,000 gas
    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        balances[msg.sender] -= amount;

        // External call: ~2,600 gas + value transfer
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
    }
}
```

#### Precompiled Contracts

[Precompiled Contracts](/ethereum/advanced/precompiled-contracts/) 是 EVM 中以原生代碼實作的合約，提供高效的密碼學運算：

| 地址 | 名稱 | Gas | 用途 |
|------|------|-----|------|
| 0x01 | ecrecover | 3,000 | ECDSA 簽名恢復 |
| 0x02 | SHA-256 | 60+12/word | SHA-256 hash |
| 0x05 | modexp | 動態 | 模冪運算 |
| 0x06-0x08 | BN256 | 6,000-45,000 | 橢圓曲線 pairing |
| 0x09 | Blake2 | 動態 | Blake2 hash |
| 0x0a | KZG | 50,000 | KZG point evaluation |

### 優勢

- **圖靈完備**：可以實作任意複雜的邏輯
- **強大的生態系統**：Solidity 是最成熟的智能合約語言
- **同步可組合性**：合約之間可以原子性地互相調用
- **確定性執行**：相同輸入永遠產生相同輸出
- **EVM 相容性**：眾多 L2 和 alt-L1 兼容 EVM

### 限制

- **循序執行**：交易必須一筆接一筆執行
- **Gas 成本高**：Storage 操作尤其昂貴
- **256-bit 字寬開銷**：大部分運算不需要 256-bit
- **Storage 永久佔用**：已部署的合約和資料永久佔用狀態
- **Reentrancy 風險**：外部調用可能導致重入攻擊

## Solana：SVM/Sealevel

### 設計哲學

Solana 的 [SVM（Solana Virtual Machine）](/solana/runtime/svm-sealevel/) 與 Sealevel 平行執行引擎的設計核心是**最大化硬體利用率**。透過要求交易預宣告所需帳戶，Sealevel 可以辨識不衝突的交易並**平行執行**。底層使用 [BPF/SBF](/solana/runtime/bpf-sbf/) 位元碼格式——一種源自 Linux kernel 的高效暫存器式虛擬機。

### 技術細節

#### Register-Based VM

SVM 使用 eBPF（extended Berkeley Packet Filter）衍生的 SBF（Solana BPF）位元碼：

```
// SBF 暫存器（11 個 64-bit registers）
r0: 返回值
r1-r5: 函數參數 / 臨時暫存器
r6-r9: callee-saved 暫存器
r10: 堆疊指標（唯讀）
```

與 EVM 的堆疊式架構不同，暫存器式 VM 更接近真實 CPU 架構，允許更高效的 JIT（Just-In-Time）編譯。

#### Sealevel 平行執行

<pre class="mermaid">
graph TD
    subgraph "交易池"
        T1[TX 1: write A, read B]
        T2[TX 2: write C, read D]
        T3[TX 3: write A, read C]
        T4[TX 4: write E, read F]
    end

    subgraph "Sealevel Scheduler"
        S[依帳戶依賴分析]
    end

    subgraph "平行執行"
        P1[Core 1: TX 1]
        P2[Core 2: TX 2 + TX 4]
        P3[等待: TX 3<br/>depends on TX 1 and TX 2]
    end

    T1 --> S
    T2 --> S
    T3 --> S
    T4 --> S
    S --> P1
    S --> P2
    S --> P3

    style P1 fill:#9945ff,color:#fff
    style P2 fill:#14f195,color:#000
    style P3 fill:#ff6b6b,color:#fff
</pre>

平行執行的關鍵規則：

$$\text{parallel}(T_i, T_j) \iff \text{write\_set}(T_i) \cap \text{accounts}(T_j) = \emptyset \land \text{write\_set}(T_j) \cap \text{accounts}(T_i) = \emptyset$$

#### Compute Units

[Compute Units](/solana/runtime/compute-units/) 是 Solana 的計算計量單位：

| 操作 | CU 成本 |
|------|---------|
| **基礎指令** | 1 CU / BPF instruction |
| **SHA-256 hash** | ~100 CU |
| **Ed25519 verify** | ~1,000 CU（precompile） |
| **secp256k1 verify** | ~3,000 CU（precompile） |
| **CPI 呼叫** | ~1,000 CU overhead |
| **Log 輸出** | ~100 CU / message |
| **系統呼叫** | ~150 CU |

交易預設限額 200,000 CU，最大可請求 1,400,000 CU。

#### Cross-Program Invocation (CPI)

[CPI](/solana/runtime/cpi/) 是 Solana 版本的合約間調用：

```rust
use anchor_lang::prelude::*;

#[program]
pub mod my_program {
    use super::*;

    pub fn swap_tokens(ctx: Context<SwapTokens>, amount: u64) -> Result<()> {
        // CPI: 調用 Token Program 進行轉帳
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_a.to_account_info(),
            to: ctx.accounts.pool_token_a.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        // 繼續執行 swap 邏輯...
        Ok(())
    }
}
```

CPI 的重要限制：
- 最大呼叫深度：4 層
- 每次 CPI 呼叫消耗額外 CU
- 被調用的 program 和帳戶必須在交易的帳戶列表中

#### Rent 機制

Solana 的帳戶需要維持最低餘額（rent-exempt minimum）：

$$\text{rent\_exempt\_minimum} = \text{LAMPORTS\_PER\_BYTE\_YEAR} \times (\text{account\_data\_size} + 128) \times 2$$

目前約為每 byte 每年 3.48 lamports，乘以 2 表示 2 年的免租最低額。

### 優勢

- **平行執行**：多核 CPU 的完整利用
- **高效的 BPF VM**：接近原生性能的 JIT 編譯
- **Rust 生態**：利用 Rust 的型別系統和安全保證
- **低計算成本**：Compute Unit 價格遠低於 EVM gas
- **Program 可升級**：支援透過 authority 升級 program 邏輯

### 限制

- **帳戶預宣告**：增加交易構建複雜度
- **CPI 深度限制**：4 層呼叫限制了可組合性
- **Account 大小限制**：單個 account 最大 10 MB
- **學習曲線陡峭**：Rust + 帳戶模型 + CPI 概念
- **除錯困難**：BPF 程式的除錯工具不如 EVM 成熟

## 深度比較

### 計算能力光譜

<pre class="mermaid">
graph LR
    A["Bitcoin Script<br/>受限的斷言語言<br/>無迴圈、無狀態"] --> B["Ethereum EVM<br/>圖靈完備 VM<br/>循序執行"]
    B --> C["Solana SVM<br/>圖靈完備 VM<br/>平行執行"]

    style A fill:#f7931a,color:#fff
    style B fill:#627eea,color:#fff
    style C fill:#9945ff,color:#fff
</pre>

### 執行模型對比

| 維度 | Bitcoin Script | EVM | SVM |
|------|---------------|-----|-----|
| **字寬** | 變長 (max 520B) | 256-bit | 64-bit |
| **堆疊/暫存器** | 堆疊 (1000 max) | 堆疊 (1024 max) | 11 暫存器 |
| **Memory** | 堆疊即 memory | 線性 byte array | 線性 byte array |
| **永久儲存** | 無 | Storage Trie (256->256) | Account data (bytes) |
| **跳轉** | OP_IF/ELSE (無 loop) | JUMP/JUMPI | JMP/JEQ (有 loop) |
| **外部呼叫** | 無 | CALL/DELEGATECALL | CPI (max depth 4) |
| **加密操作** | OP_CHECKSIG 系列 | Precompiles (0x01-0x0a) | Precompiles (Ed25519, secp256k1) |
| **部署成本** | N/A (嵌入 tx) | ~32,000 gas + code gas | ~1 SOL rent + deploy tx |

### 安全性比較

| 安全面向 | Bitcoin Script | EVM | SVM |
|----------|---------------|-----|-----|
| **攻擊面** | 極小（~100 opcodes） | 中等（~140 opcodes） | 大（完整 BPF ISA） |
| **常見漏洞** | Script malleability | Reentrancy, overflow | Account confusion, PDA issues |
| **形式化驗證** | 相對容易 | Solidity 有工具（Certora 等） | Rust 型別系統有幫助 |
| **升級風險** | 無（不可升級） | Proxy 相關風險 | Upgrade authority 風險 |
| **DoS 防護** | Script 大小限制 | Gas 限制 | CU 限制 |

### 開發者體驗

**Bitcoin Script**：
```
// 簡單的 2-of-3 多簽
OP_2 <pubkey1> <pubkey2> <pubkey3> OP_3 OP_CHECKMULTISIG
```

**Ethereum (Solidity)**：
```solidity
// ERC-20 Token transfer
function transfer(address to, uint256 amount) public returns (bool) {
    require(balanceOf[msg.sender] >= amount, "Insufficient balance");
    balanceOf[msg.sender] -= amount;
    balanceOf[to] += amount;
    emit Transfer(msg.sender, to, amount);
    return true;
}
```

**Solana (Rust/Anchor)**：
```rust
// SPL Token transfer (using Anchor framework)
pub fn transfer_tokens(ctx: Context<TransferTokens>, amount: u64) -> Result<()> {
    let cpi_accounts = Transfer {
        from: ctx.accounts.from.to_account_info(),
        to: ctx.accounts.to.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
    );
    token::transfer(cpi_ctx, amount)
}
```

## 實際影響

### 對開發者

| 面向 | Bitcoin Script | EVM | SVM |
|------|---------------|-----|-----|
| **學習曲線** | 中（assembly-like） | 低-中（Solidity 類 JS） | 高（Rust + 帳戶模型） |
| **工具成熟度** | 中 | 極高（Hardhat, Foundry...） | 高（Anchor, Seahorse...） |
| **除錯** | 困難 | 良好（Remix, Tenderly...） | 中等（solana-test-validator） |
| **測試** | 有限 | 豐富（Forge, Mocha...） | 良好（Anchor test, Bankrun） |
| **安全審計工具** | 少 | 豐富（Slither, Mythril...） | 成長中（Soteria, Sec3...） |

### 對使用者

- **Bitcoin**：腳本在幕後運行，使用者不直接互動。但限制性意味著某些功能（如複雜 DeFi）不可能在 L1 實現。
- **Ethereum**：豐富的 DApp 生態，但 gas 費用是主要摩擦點。智能合約風險（hack, exploit）是使用者需要承擔的。
- **Solana**：低費用的高頻互動體驗。但帳戶 rent 和偶爾的網路不穩定是使用者面臨的挑戰。

### 對生態系統

Bitcoin Script 的受限性催生了 [Lightning Network](/bitcoin/advanced/lightning-network/)、Ordinals、BitVM 等鏈上/鏈下的創新。EVM 的標準化創造了跨鏈可移植的智能合約生態（EVM-compatible chains）。SVM 的高性能推動了鏈上 CLOB（Central Limit Order Book）等在其他鏈上不可行的應用場景。

## 相關概念

- [Bitcoin Script](/bitcoin/data-structures/bitcoin-script/) - Bitcoin 腳本語言
- [Tapscript](/bitcoin/advanced/tapscript/) - Taproot 腳本升級
- [P2SH](/bitcoin/transactions/p2sh/) - Script Hash 交易
- [P2TR](/bitcoin/transactions/p2tr/) - Taproot 交易
- [State Transition (ETH)](/ethereum/transaction-lifecycle/state-transition/) - Ethereum 狀態轉移
- [Gas](/ethereum/accounts/gas/) - Ethereum gas 機制
- [Precompiled Contracts](/ethereum/advanced/precompiled-contracts/) - Ethereum 預編譯合約
- [SVM/Sealevel](/solana/runtime/svm-sealevel/) - Solana 執行引擎
- [BPF/SBF](/solana/runtime/bpf-sbf/) - Solana 位元碼格式
- [Compute Units](/solana/runtime/compute-units/) - Solana 計算單位
- [CPI](/solana/runtime/cpi/) - 跨程式調用
- [帳戶模型比較](/comparisons/account-models/) - 三鏈帳戶模型對比
- [手續費市場比較](/comparisons/fee-markets/) - 三鏈費用機制對比
- [共識機制比較](/comparisons/consensus-mechanisms/) - 三鏈共識機制對比
