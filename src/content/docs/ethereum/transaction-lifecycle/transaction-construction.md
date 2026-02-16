---
title: "交易構建"
description: "Transaction Construction, 交易組裝, 交易建構"
tags: [ethereum, transaction, construction, RLP]
---

# 交易構建

## 概述

交易構建是將使用者意圖轉化為結構化資料的過程。需要填入 nonce、gas 參數、目標地址、金額、calldata 等欄位，並根據交易類型選擇對應的序列化方式（[RLP 編碼](/ethereum/data-structures/rlp-encoding/) 或 typed transaction envelope）。構建完成後的序列化資料將作為 [交易簽名](/ethereum/transaction-lifecycle/transaction-signing/) 的輸入。

## 核心原理

### 交易欄位

#### Legacy Transaction（Type 0）

| 欄位 | 型別 | 說明 |
|------|------|------|
| nonce | uint64 | 發送者已發送的交易數量（[Nonce](/ethereum/accounts/nonce/)） |
| gasPrice | uint256 | 每單位 gas 的價格（wei） |
| gasLimit | uint64 | 最大 gas 消耗量 |
| to | address (20B) | 接收者地址；`null` 表示合約部署 |
| value | uint256 | 轉帳金額（wei） |
| data | bytes | calldata（合約呼叫或 init code） |

#### EIP-1559 Transaction（Type 2）

在 Legacy 基礎上替換 gasPrice 為兩個欄位：

| 欄位 | 型別 | 說明 |
|------|------|------|
| chainId | uint256 | 鏈 ID（[EIP-155 重放保護](/ethereum/accounts/eip-155/)） |
| nonce | uint64 | 同上 |
| maxPriorityFeePerGas | uint256 | 給 validator 的小費上限 |
| maxFeePerGas | uint256 | 願意支付的最大 gas 單價 |
| gasLimit | uint64 | 同上 |
| to | address | 同上 |
| value | uint256 | 同上 |
| data | bytes | 同上 |
| accessList | list | EIP-2930 存取列表 |

實際支付的 gas price：

$$\text{effectiveGasPrice} = \min(\text{maxFeePerGas},\ \text{baseFee} + \text{maxPriorityFeePerGas})$$

其中 baseFee 由協議根據區塊使用率動態調整（[EIP-1559 費用市場](/ethereum/accounts/eip-1559/)）。

### EIP-7702 Transaction（Type 4，Pectra 2025/5/7）

Type 4 交易在 Type 2 的基礎上新增 `authorization_list` 欄位：

| 欄位 | 型別 | 說明 |
|------|------|------|
| chainId | uint256 | 鏈 ID |
| nonce | uint64 | 同上 |
| maxPriorityFeePerGas | uint256 | 同 Type 2 |
| maxFeePerGas | uint256 | 同 Type 2 |
| gasLimit | uint64 | 同上 |
| to | address | 目標地址 |
| value | uint256 | 同上 |
| data | bytes | 同上 |
| accessList | list | 同 Type 2 |
| authorizationList | list | **EIP-7702 新增**：授權列表 |

每個 authorization entry 結構：

| 欄位 | 說明 |
|------|------|
| chainId | 授權生效的鏈 ID（0 = 所有鏈） |
| address | 委託目標合約地址 |
| nonce | 授權者當前 nonce |
| yParity, r, s | 授權者的 ECDSA 簽名 |

交易發送者和授權者可以是不同的 EOA，這是 gas 代付功能的基礎。

### 序列化

**Legacy（Type 0）**：直接 RLP 編碼

$$\text{encoded} = \text{RLP}([\text{nonce}, \text{gasPrice}, \text{gasLimit}, \text{to}, \text{value}, \text{data}])$$

簽名前（含 EIP-155 chain ID）：

$$\text{signable} = \text{RLP}([\text{nonce}, \text{gasPrice}, \text{gasLimit}, \text{to}, \text{value}, \text{data}, \text{chainId}, 0, 0])$$

**Typed Transaction（Type 1/2/3/4）**：

$$\text{encoded} = \text{txType} \| \text{RLP}(\text{fields})$$

`txType` 是單一 byte（`0x01`, `0x02`, `0x03`, `0x04`），後面接該類型專屬欄位的 RLP 編碼。

### Nonce 管理

[Nonce](/ethereum/accounts/nonce/) 是交易排序和防重放的關鍵：

- 必須等於發送者已確認交易數量（`pending` 狀態下為包含 pending 的計數）
- nonce 不連續的交易會卡在 mempool
- 同一 nonce 的新交易可以替換舊的（需要更高 gas price）

### Gas 估算

`gasLimit` 設得太低會導致 out-of-gas revert（gas 照扣）；太高則鎖住不必要的 ETH。常見策略：

1. 呼叫 `eth_estimateGas` 取得估算值
2. 加上 20-30% 的 buffer
3. 純 ETH 轉帳固定為 21,000 gas

## 在 Ethereum 中的應用

- **ETH 轉帳**：`to` = 收款地址，`value` = 金額，`data` = 空
- **合約呼叫**：`to` = 合約地址，`data` = [ABI 編碼](/ethereum/data-structures/abi-encoding/) 的函數選擇器 + 參數
- **合約部署**：`to` = null，`data` = init code（constructor bytecode + args）
- **EIP-4844 blob 交易**：Type 3，額外帶有 blob hash 和 blob sidecar（[EIP-4844 Proto-Danksharding](/ethereum/advanced/eip-4844/)）

## 程式碼範例

```javascript
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider('http://localhost:8545');
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// --- 1. 純 ETH 轉帳（EIP-1559） ---
const transferTx = {
  type: 2,
  to: '0xRecipient',
  value: ethers.parseEther('1.0'),
  chainId: 1n,
};

// --- 2. 合約呼叫 ---
const iface = new ethers.Interface(['function transfer(address to, uint256 amount)']);
const calldata = iface.encodeFunctionData('transfer', [
  '0xRecipient',
  ethers.parseUnits('100', 18),
]);

const contractCallTx = {
  type: 2,
  to: '0xTokenContractAddress',
  data: calldata,
  value: 0n,
};

// --- 3. 自動填充欄位 ---
// ethers.js 會自動查詢 nonce、estimateGas、feeData
const populatedTx = await wallet.populateTransaction(contractCallTx);
console.log('Nonce:', populatedTx.nonce);
console.log('Gas Limit:', populatedTx.gasLimit);
console.log('Max Fee:', ethers.formatUnits(populatedTx.maxFeePerGas, 'gwei'), 'gwei');

// --- 4. 手動組裝（完全控制） ---
const [nonce, feeData] = await Promise.all([
  provider.getTransactionCount(wallet.address, 'pending'),
  provider.getFeeData(),
]);

const manualTx = {
  type: 2,
  chainId: 1n,
  nonce: nonce,
  to: '0xRecipient',
  value: ethers.parseEther('0.5'),
  data: '0x',
  maxFeePerGas: feeData.maxFeePerGas,
  maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
  gasLimit: 21000n,
};

// --- 5. 取得序列化結果（簽名前） ---
const serializedUnsigned = ethers.Transaction.from(manualTx).unsignedSerialized;
console.log('Unsigned serialized:', serializedUnsigned);

// --- 6. 合約部署 ---
const deployTx = {
  type: 2,
  data: '0x608060405234801561001057600080fd5b50...', // contract bytecode
  // to 欄位省略 = 合約部署
};
```

## 相關概念

- [交易生命週期](/ethereum/transaction-lifecycle/transaction-lifecycle/) - 本筆記是流程第二步
- [密鑰生成與帳戶創建](/ethereum/transaction-lifecycle/key-generation/) - 流程上一步
- [交易簽名](/ethereum/transaction-lifecycle/transaction-signing/) - 流程下一步：對構建結果簽章
- [RLP 編碼](/ethereum/data-structures/rlp-encoding/) - 交易序列化格式
- [ABI 編碼](/ethereum/data-structures/abi-encoding/) - 合約呼叫資料編碼
- [Nonce](/ethereum/accounts/nonce/) - 交易序號管理
- [Gas](/ethereum/accounts/gas/) - 計算資源計量
- [EIP-1559 費用市場](/ethereum/accounts/eip-1559/) - Type 2 交易的費用機制
- [EIP-155 重放保護](/ethereum/accounts/eip-155/) - Chain ID 防跨鏈重放
- [EIP-4844 Proto-Danksharding](/ethereum/advanced/eip-4844/) - Type 3 blob 交易
