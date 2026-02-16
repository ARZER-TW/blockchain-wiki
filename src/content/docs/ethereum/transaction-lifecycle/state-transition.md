---
title: "狀態轉換"
description: "State Transition, 狀態轉移, EVM 執行"
tags: [ethereum, state-transition, EVM, trie]
---

# 狀態轉換

## 概述

狀態轉換是 Ethereum 的核心計算過程：給定當前世界狀態 $\sigma$ 和一筆交易 $T$，EVM 執行後產生新狀態 $\sigma'$。所有帳戶餘額、合約儲存、nonce 的變更都反映在 [Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/) 中，新的 state root 寫入 [區塊 Header](/ethereum/consensus/block-header/)。這是交易生命週期的最後一步 -- 交易的效果在此刻實際生效。

## 核心原理

### 狀態轉換函數

Ethereum 的狀態轉換可以表示為：

$$\sigma' = \Upsilon(\sigma, T)$$

其中 $\Upsilon$ 是狀態轉換函數，$\sigma$ 是世界狀態（所有帳戶的映射），$T$ 是交易。

對於一個區塊 $B$ 包含的交易列表 $[T_0, T_1, ..., T_n]$：

$$\sigma_0 \xrightarrow{T_0} \sigma_1 \xrightarrow{T_1} \sigma_2 \cdots \xrightarrow{T_n} \sigma_{n+1}$$

交易嚴格按區塊內的順序執行，前一筆的結果是後一筆的輸入狀態。

### 帳戶狀態

世界狀態 $\sigma$ 是地址到帳戶狀態的映射。每個帳戶包含四個欄位：

| 欄位 | 說明 | 儲存位置 |
|------|------|----------|
| nonce | 交易計數（[EOA](/ethereum/accounts/eoa/)）或建立的合約數（[合約帳戶](/ethereum/accounts/contract-account/)） | [State Trie](/ethereum/data-structures/state-trie/) |
| balance | ETH 餘額（wei） | [State Trie](/ethereum/data-structures/state-trie/) |
| storageRoot | [Storage Trie](/ethereum/data-structures/storage-trie/) 的根雜湊 | [State Trie](/ethereum/data-structures/state-trie/)（值指向獨立 trie） |
| codeHash | 合約 bytecode 的 [Keccak-256](/ethereum/cryptography/keccak-256/) 雜湊 | [State Trie](/ethereum/data-structures/state-trie/)（code 另存） |

EOA 的 `storageRoot` 是空 trie 的雜湊，`codeHash` 是空 bytes 的 Keccak-256。

### 交易執行步驟

```
1. 預處理
   ├── 扣除 intrinsic gas
   ├── 發送者 nonce + 1
   ├── 發送者餘額 -= value + (gasLimit * effectiveGasPrice)
   └── 接收者餘額 += value

2. EVM 執行（若 to 是合約或 data 非空）
   ├── 載入合約 bytecode
   ├── 初始化執行環境（msg.sender, msg.value, calldata...）
   ├── 逐步執行 opcode
   ├── 每個 opcode 扣除對應 gas
   ├── SLOAD/SSTORE 讀寫 Storage Trie
   ├── LOG0-LOG4 產生事件日誌
   └── 子呼叫（CALL, DELEGATECALL, STATICCALL）

3. 後處理
   ├── 退還未使用的 gas：sender += remainingGas * effectiveGasPrice
   ├── 銷毀 baseFee 部分：baseFee * gasUsed（EIP-1559 燃燒）
   ├── 支付 priority fee 給 proposer：priorityFee * gasUsed
   ├── 若執行失敗（revert/OOG）：回滾狀態變更，gas 不退
   └── 產生交易回執（Receipt）
```

### 狀態 Trie 更新

交易執行後，變更的帳戶資料寫入 [State Trie](/ethereum/data-structures/state-trie/)（[Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/)）：

1. 修改帳戶的 nonce、balance
2. 合約的 SSTORE 修改 [Storage Trie](/ethereum/data-structures/storage-trie/)，產生新的 storageRoot
3. 更新後的帳戶資料用 [RLP 編碼](/ethereum/data-structures/rlp-encoding/) 序列化，插入 State Trie
4. 計算新的 state root（32 bytes 雜湊）

State root 是整個世界狀態的密碼學承諾 -- 任何一個帳戶的任何一個 bit 的變化，都會導致完全不同的 state root。

### 交易回執（Receipt）

每筆交易產生一個 receipt，包含：

| 欄位 | 說明 |
|------|------|
| status | 1 = 成功，0 = 失敗 |
| cumulativeGasUsed | 區塊中截止此交易累計 gas |
| logsBloom | 此交易的 [Bloom Filter](/ethereum/data-structures/bloom-filter/)（256 bytes） |
| logs[] | 事件日誌列表（address, topics, data） |

所有 receipt 組成 [Receipt Trie](/ethereum/data-structures/receipt-trie/)，其根雜湊寫入區塊 header。

### Gas 計算

每個 EVM opcode 有固定的 gas 成本（部分是動態的）：

| Opcode | Gas | 說明 |
|--------|-----|------|
| ADD, SUB | 3 | 算術運算 |
| MUL, DIV | 5 | 乘除 |
| SLOAD | 2,100 (cold) / 100 (warm) | 讀取 storage |
| SSTORE | 20,000 (new) / 5,000 (update) | 寫入 storage |
| CALL | 2,600 (cold) + value transfer | 外部呼叫 |
| CREATE | 32,000 + deployment | 建立合約 |

EIP-2929 引入了 cold/warm 存取概念：第一次存取（cold）較貴，同一交易中再次存取（warm）便宜。Access list（EIP-2930）可以預付 cold 存取費用。

### Revert 與 Out-of-Gas

- **REVERT**：回滾所有狀態變更，退還剩餘 gas。calldata 中可帶 error message
- **Out-of-Gas (OOG)**：gas 用完，回滾狀態變更，不退 gas
- **外層 vs 內層**：子呼叫的 revert 可以被外層 catch（CALL 回傳 0），不一定導致整筆交易失敗

兩種情況下，交易本身都算「被包含在區塊中」，nonce 遞增，gas 費照收。

## 在 Ethereum 中的應用

- **ETH 轉帳**：最簡單的狀態轉換 -- 只修改兩個帳戶的 balance
- **合約互動**：EVM 執行 bytecode，可能修改多個帳戶的 storage
- **合約部署**：創建新帳戶，codeHash 從空變為合約 bytecode 的雜湊
- **自毀（deprecated）**：SELFDESTRUCT 曾經刪除帳戶，Dencun 後只轉帳不刪除

## 程式碼範例

```javascript
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider('http://localhost:8545');

// --- 1. 觀察狀態轉換前後 ---
async function observeStateChange(txHash) {
  const tx = await provider.getTransaction(txHash);
  const receipt = await provider.getTransactionReceipt(txHash);

  // 取得交易所在區塊的前一個區塊（交易前狀態）
  const preBlock = receipt.blockNumber - 1;

  // 發送者狀態變化
  const [senderBefore, senderAfter] = await Promise.all([
    provider.getBalance(tx.from, preBlock),
    provider.getBalance(tx.from, receipt.blockNumber),
  ]);

  // 接收者狀態變化
  const [receiverBefore, receiverAfter] = await Promise.all([
    provider.getBalance(tx.to, preBlock),
    provider.getBalance(tx.to, receipt.blockNumber),
  ]);

  const gasUsed = receipt.gasUsed;
  const effectiveGasPrice = receipt.gasPrice; // actual price paid
  const gasCost = gasUsed * effectiveGasPrice;

  console.log('--- State Transition ---');
  console.log('Sender balance delta:', ethers.formatEther(senderAfter - senderBefore), 'ETH');
  console.log('Receiver balance delta:', ethers.formatEther(receiverAfter - receiverBefore), 'ETH');
  console.log('Gas cost:', ethers.formatEther(gasCost), 'ETH');
  console.log('Status:', receipt.status === 1 ? 'Success' : 'Reverted');
}

// --- 2. 讀取合約 storage slot ---
async function readStorage(contractAddr, slot) {
  const value = await provider.getStorage(contractAddr, slot);
  console.log(`Storage[${slot}]:`, value);
  return value;
}

// ERC-20 balanceOf 通常在 slot = keccak256(address . slot_index)
const userAddr = '0xUserAddress';
const balanceMappingSlot = 0; // 假設 balances mapping 在 slot 0
const storageKey = ethers.keccak256(
  ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'uint256'],
    [userAddr, balanceMappingSlot]
  )
);
await readStorage('0xTokenContract', storageKey);

// --- 3. 追蹤交易的 state diff（需要 debug API） ---
// const trace = await provider.send('debug_traceTransaction', [
//   txHash,
//   { tracer: 'prestateTracer' }
// ]);

// --- 4. 解析交易回執中的事件 ---
async function parseReceipt(txHash) {
  const receipt = await provider.getTransactionReceipt(txHash);
  console.log('Status:', receipt.status);
  console.log('Gas Used:', receipt.gasUsed.toString());
  console.log('Logs:');
  for (const log of receipt.logs) {
    console.log(`  Contract: ${log.address}`);
    console.log(`  Topics: ${log.topics}`);
    console.log(`  Data: ${log.data}`);
  }
}

// --- 5. 用 Proof 驗證帳戶狀態 ---
async function verifyAccountState(address, blockTag) {
  const tag = blockTag || 'latest';
  const proof = await provider.send('eth_getProof', [address, [], tag]);
  console.log('Nonce:', parseInt(proof.nonce, 16));
  console.log('Balance:', ethers.formatEther(BigInt(proof.balance)));
  console.log('Storage Hash:', proof.storageHash);
  console.log('Code Hash:', proof.codeHash);
  console.log('Proof length:', proof.accountProof.length, 'nodes');
}
```

## 相關概念

- [交易生命週期](/ethereum/transaction-lifecycle/transaction-lifecycle/) - 本筆記是流程第八步（最後）
- [共識與最終性](/ethereum/transaction-lifecycle/consensus-finality/) - 流程上一步：區塊被確認後狀態生效
- [Merkle Patricia Trie](/ethereum/data-structures/merkle-patricia-trie/) - 狀態儲存的核心資料結構
- [State Trie](/ethereum/data-structures/state-trie/) - 全域帳戶狀態樹
- [Storage Trie](/ethereum/data-structures/storage-trie/) - 合約儲存樹
- [Transaction Trie](/ethereum/data-structures/transaction-trie/) - 區塊內交易樹
- [Receipt Trie](/ethereum/data-structures/receipt-trie/) - 交易回執樹
- [RLP 編碼](/ethereum/data-structures/rlp-encoding/) - 帳戶資料序列化
- [Keccak-256](/ethereum/cryptography/keccak-256/) - state root、storage key 計算
- [EOA](/ethereum/accounts/eoa/) - 外部帳戶的狀態結構
- [合約帳戶](/ethereum/accounts/contract-account/) - 合約帳戶的狀態結構
- [Gas](/ethereum/accounts/gas/) - EVM 執行的計量
- [Bloom Filter](/ethereum/data-structures/bloom-filter/) - logsBloom 快速過濾
- [Precompiled Contracts](/ethereum/advanced/precompiled-contracts/) - 提供密碼學運算的預編譯合約
