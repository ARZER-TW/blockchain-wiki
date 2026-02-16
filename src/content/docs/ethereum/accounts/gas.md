---
title: "Gas"
description: "Gas, Gas Fee, Gas Limit, Gas Price, 手續費"
tags: [ethereum, gas, evm, transaction, fee]
---

# Gas

## 概述

Gas 是 Ethereum 的計算計量單位。每個 EVM 操作都消耗固定量的 gas，發送交易的人必須支付 gas fee 來補償驗證者執行計算的成本。Gas 機制防止了無限迴圈攻擊、spam 攻擊，並讓計算資源有合理的市場定價。

## 核心原理

### 核心概念

| 術語 | 定義 |
|------|------|
| Gas | 計算單位，每個 opcode 有固定 gas cost |
| Gas Limit | 交易願意消耗的 gas 上限 |
| Gas Used | 交易實際消耗的 gas |
| Gas Price | 每單位 gas 的價格（Wei） |
| Base Fee | 協定決定的最低 gas price（[EIP-1559](/ethereum/accounts/eip-1559/)） |
| Priority Fee（Tip） | 給驗證者的小費 |
| Max Fee | 願意支付的最高 gas price |

### Gas 費用計算

#### Pre-EIP-1559（Legacy）

$$\text{Fee} = \text{gasUsed} \times \text{gasPrice}$$

全部費用給礦工。

#### Post-EIP-1559

$$\text{Fee} = \text{gasUsed} \times (\text{baseFee} + \text{priorityFee})$$

- Base fee 被**燃燒**（burn），從流通中移除
- Priority fee 給驗證者
- 實際 gas price = $\min(\text{maxFeePerGas}, \text{baseFee} + \text{maxPriorityFeePerGas})$
- 多付的部分退還

### EVM Opcode Gas Cost

常見 opcode 的 gas 成本：

| Opcode | Gas | 說明 |
|--------|-----|------|
| `ADD` / `SUB` / `MUL` | 3 | 算術 |
| `DIV` / `MOD` | 5 | 除法 |
| `EXP` | 10 + 50/byte | 指數 |
| `SHA3`（keccak256） | 30 + 6/word | 雜湊 |
| `SLOAD`（cold） | 2100 | 讀取 storage（首次） |
| `SLOAD`（warm） | 100 | 讀取 storage（同交易再次） |
| `SSTORE`（new value） | 20000 | 寫入 storage（零 → 非零） |
| `SSTORE`（update） | 5000 | 更新 storage（非零 → 非零） |
| `SSTORE`（clear） | 5000 + 4800 refund | 清除 storage（非零 → 零） |
| `CALL`（cold） | 2600 | 呼叫外部合約（首次） |
| `CALL`（warm） | 100 | 呼叫外部合約（同交易再次） |
| `CREATE` | 32000 | 建立合約 |
| `LOG0` - `LOG4` | 375 + 8/byte + 375/topic | 產生 event |
| `BALANCE`（cold） | 2600 | 查詢餘額（首次） |
| `BALANCE`（warm） | 100 | 查詢餘額（再次） |

### Intrinsic Gas

每筆交易的固定最低 gas：

$$G_{\text{intrinsic}} = 21000 + G_{\text{calldata}} + G_{\text{accessList}} + G_{\text{create}}$$

- 基礎：21,000 gas（純 ETH 轉帳的成本）
- Calldata：每個零 byte 4 gas，每個非零 byte 16 gas
- Access list（EIP-2930）：每個地址 2400 gas，每個 storage key 1900 gas
- 合約建立（to = null）：額外 32,000 gas

#### EIP-7623：Calldata 成本調整（Pectra，2025/5/7）

EIP-7623 提高了 calldata 的有效成本，目的是降低 block size 的最大變異。在 EIP-7623 之前，理論上一個區塊可以幾乎全部塞滿 calldata，產生極大的 block（接近 1.8 MB）。EIP-7623 設定了一個「floor cost」機制：如果交易的 calldata 佔比過高，其 gas 計算會切換到較高的 calldata 費率，有效降低了最大 block size。

這對 L2 rollup 的 data availability 成本有直接影響——大量使用 calldata 的交易（如 rollup batch posting）的成本會增加，進一步推動 rollup 轉向使用 EIP-4844 的 blob 空間。

### Cold / Warm Access（EIP-2929）

每個交易維護一個 `accessed_addresses` 和 `accessed_storage_keys` 集合：

- **Cold access**：首次存取某地址或 storage key，較貴
- **Warm access**：同交易中再次存取，便宜
- 發送者和接收者的地址自動為 warm

這個機制讓 gas cost 更準確地反映 I/O 成本。

### Block Gas Limit

- 每個區塊有 gas limit（目前為 60M gas，見下方歷史）
- 驗證者可以投票微調（上下 1/1024）
- 所有交易的 gasUsed 之和不能超過 block gas limit
- 限制了每個區塊的計算量

#### Gas Limit 歷史演進

| 時間 | Gas Limit | 事件 |
|------|-----------|------|
| 2015 | 5,000 | Genesis |
| 2020 | 12.5M | 社群逐步提高 |
| 2021 | 30M | 穩定在 30M |
| 2025/2 | 36M | 驗證者投票提升 |
| 2025/7 | 45M | 持續提升 |
| 2025/11 | 60M | Fusaka 前夕，EIP-7935 提案將 60M 設為預設值 |

#### EIP-7825：單筆交易 Gas 上限（Fusaka，2025/12/3）

EIP-7825 設定單筆交易的 gas 上限為 16,777,216（約 16.78M），防止單筆交易消耗過多區塊資源。這是一個防 DoS 機制——在 block gas limit 提升到 60M 的情況下，若沒有交易級別的上限，單筆巨型交易可能造成節點處理延遲。

#### EIP-7883：特定數學運算 Gas 調整（Fusaka，2025/12/3）

EIP-7883 提高了特定數學運算（modular exponentiation 等）的 gas 成本，使其更準確地反映實際計算負擔。這修正了先前某些 precompile 操作被低估的 gas 定價。

#### EIP-7935：預設 Block Gas Limit 60M（Fusaka，2025/12/3）

EIP-7935 將預設 block gas limit 從 30M 提升至 60M，正式化了社群已經透過驗證者投票達成的目標。此前 gas limit 的提升依賴驗證者自行設定，EIP-7935 將 60M 寫入協定預設值。

### Gas Refund

某些操作會產生 gas refund：

- `SSTORE`：清除 storage slot（非零 → 零）退 4800 gas
- `SELFDESTRUCT`：已在 EIP-3529 中移除退款

退款上限：交易 gasUsed 的 20%（EIP-3529 之後從 50% 降低）。

## 在 Ethereum 中的應用

- **[交易構建](/ethereum/transaction-lifecycle/transaction-construction/)**：設定 gasLimit、maxFeePerGas、maxPriorityFeePerGas
- **[EIP-1559 費用市場](/ethereum/accounts/eip-1559/)**：base fee 動態調整和燃燒機制
- **[區塊生產](/ethereum/transaction-lifecycle/block-production/)**：驗證者根據 gas limit 選擇交易
- **合約優化**：開發者需要最小化 gas 消耗
- **[Storage Trie](/ethereum/data-structures/storage-trie/)**：SSTORE 是最貴的操作之一
- **DeFi**：Gas war 在高需求時推高 gas price
- **Layer 2**：L2 透過批次處理降低每筆交易的 gas 成本

### Gas Estimation

RPC `eth_estimateGas` 模擬交易執行並回傳預估 gasUsed。但這是近似值：
- 狀態可能在模擬後改變
- 建議加 10-20% buffer 作為 gasLimit

## 程式碼範例

### JavaScript（ethers.js）

```javascript
import { JsonRpcProvider, parseEther, formatUnits, Wallet } from 'ethers';

const provider = new JsonRpcProvider('https://eth.llamarpc.com');

// 查詢當前 gas 資訊
const feeData = await provider.getFeeData();
console.log('gasPrice:', formatUnits(feeData.gasPrice, 'gwei'), 'gwei');
console.log('maxFeePerGas:', formatUnits(feeData.maxFeePerGas, 'gwei'), 'gwei');
console.log('maxPriorityFeePerGas:', formatUnits(feeData.maxPriorityFeePerGas, 'gwei'), 'gwei');

// 取得最新區塊的 baseFee
const block = await provider.getBlock('latest');
console.log('baseFee:', formatUnits(block.baseFeePerGas, 'gwei'), 'gwei');
console.log('gasLimit:', block.gasLimit.toString());
console.log('gasUsed:', block.gasUsed.toString());
console.log('utilization:', (Number(block.gasUsed) / Number(block.gasLimit) * 100).toFixed(1), '%');

// 估算 gas
const gasEstimate = await provider.estimateGas({
  from: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  data: '0xa9059cbb' + '0'.repeat(128), // transfer calldata
});
console.log('estimated gas:', gasEstimate.toString());

// 計算 calldata gas cost
function calldataGasCost(data) {
  const bytes = data.startsWith('0x') ? data.slice(2) : data;
  let gas = 0;
  for (let i = 0; i < bytes.length; i += 2) {
    const byte = parseInt(bytes.slice(i, i + 2), 16);
    gas += byte === 0 ? 4 : 16;
  }
  return gas;
}

const calldata = '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000000000000000064';
const cdGas = calldataGasCost(calldata);
console.log('calldata gas:', cdGas);
console.log('intrinsic gas:', 21000 + cdGas);

// 計算交易費用
const gasUsed = 65000n;
const baseFee = block.baseFeePerGas;
const priorityFee = 2000000000n; // 2 gwei
const totalFee = gasUsed * (baseFee + priorityFee);
const burnedFee = gasUsed * baseFee;
const validatorFee = gasUsed * priorityFee;

console.log('total fee:', formatUnits(totalFee, 'ether'), 'ETH');
console.log('burned:', formatUnits(burnedFee, 'ether'), 'ETH');
console.log('to validator:', formatUnits(validatorFee, 'ether'), 'ETH');
```

### Python（web3.py）

```python
from web3 import Web3

w3 = Web3(Web3.HTTPProvider('https://eth.llamarpc.com'))

# 當前 gas price
gas_price = w3.eth.gas_price
print(f"gas price: {w3.from_wei(gas_price, 'gwei')} gwei")

# 最新區塊
block = w3.eth.get_block('latest')
print(f"baseFee: {w3.from_wei(block['baseFeePerGas'], 'gwei')} gwei")
print(f"gasLimit: {block['gasLimit']}")
print(f"gasUsed: {block['gasUsed']}")
print(f"utilization: {block['gasUsed'] / block['gasLimit'] * 100:.1f}%")

# 估算 gas
estimate = w3.eth.estimate_gas({
    'from': '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    'to': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    'value': 0,
})
print(f"estimated gas: {estimate}")

# Calldata gas 計算
def calldata_gas(data: bytes) -> int:
    return sum(4 if b == 0 else 16 for b in data)

cd = bytes.fromhex('a9059cbb' + '00' * 64)
print(f"calldata gas: {calldata_gas(cd)}")
print(f"intrinsic gas: {21000 + calldata_gas(cd)}")

# EVM opcode gas 表（部分）
opcode_gas = {
    'ADD': 3, 'MUL': 3, 'SUB': 3, 'DIV': 5,
    'SLOAD_cold': 2100, 'SLOAD_warm': 100,
    'SSTORE_new': 20000, 'SSTORE_update': 5000,
    'CALL_cold': 2600, 'CALL_warm': 100,
    'CREATE': 32000, 'SHA3_base': 30,
}

for op, gas in opcode_gas.items():
    print(f"{op}: {gas} gas")
```

## 相關概念

- [EIP-1559 費用市場](/ethereum/accounts/eip-1559/) - Base fee / priority fee / 燃燒機制
- [交易構建](/ethereum/transaction-lifecycle/transaction-construction/) - Gas 參數的設定
- [區塊生產](/ethereum/transaction-lifecycle/block-production/) - Block gas limit 和交易選擇
- [Storage Trie](/ethereum/data-structures/storage-trie/) - SSTORE/SLOAD 的 gas 成本
- [交易生命週期](/ethereum/transaction-lifecycle/transaction-lifecycle/) - Gas 影響交易的處理優先順序
- [記憶池](/ethereum/transaction-lifecycle/mempool/) - Gas price 決定交易在 mempool 中的優先順序
- [Nonce](/ethereum/accounts/nonce/) - 交易替換需要更高 gas price
- [EOA](/ethereum/accounts/eoa/) - EOA 需要持有 ETH 支付 gas
