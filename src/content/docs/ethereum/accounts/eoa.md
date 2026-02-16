---
title: "EOA"
description: "EOA, Externally Owned Account, 外部擁有帳戶"
tags: [ethereum, account, eoa, wallet]
---

# EOA

## 概述

EOA（Externally Owned Account）是由私鑰控制的 Ethereum 帳戶。與[合約帳戶](/ethereum/accounts/contract-account/)不同，EOA 沒有程式碼，只能透過持有私鑰的人發起交易。所有 Ethereum 上的交易最終都源自某個 EOA——即使是合約之間的互動，最初也是由 EOA 觸發。

## 核心原理

### 帳戶結構

EOA 在 [State Trie](/ethereum/data-structures/state-trie/) 中的四元組：

| 欄位 | EOA 的值 |
|------|----------|
| `nonce` | 已發送交易數量，從 0 開始 |
| `balance` | Wei 餘額（1 ETH = $10^{18}$ Wei） |
| `storageRoot` | 空 Trie root hash（`0x56e81f...`） |
| `codeHash` | 空 code hash：`keccak256(0x)` = `0xc5d246...` |

EOA 的識別方式：`codeHash == keccak256(0x)`。RPC 層面可用 `eth_getCode` 檢查——回傳 `0x` 即為 EOA。

### 控制機制

EOA 由 [secp256k1](/ethereum/cryptography/secp256k1/) 橢圓曲線上的一對密鑰控制：

```
私鑰 (256 bits) → 公鑰 (512 bits) → 地址 (160 bits)
```

完整的[地址推導](/ethereum/accounts/address-derivation/)流程：
1. 隨機生成 256-bit 私鑰（透過 [CSPRNG](/fundamentals/cryptography/csprng/)）
2. 橢圓曲線乘法得到公鑰：$P = k \cdot G$
3. 取公鑰的 [Keccak-256](/ethereum/cryptography/keccak-256/) hash 後 20 bytes 為地址

### 交易發起

只有 EOA 能發起交易。交易結構（[EIP-1559](/ethereum/accounts/eip-1559/) 格式）：

```
{
  chainId,
  nonce,              // 必須等於帳戶當前 nonce
  maxPriorityFeePerGas,
  maxFeePerGas,
  gasLimit,
  to,                 // 目標地址（合約或另一個 EOA）
  value,              // 轉帳 ETH 數量
  data,               // calldata（合約呼叫用）
  accessList,
}
```

交易必須用私鑰簽名（[ECDSA](/ethereum/cryptography/ecdsa/)），簽名後的 `(v, r, s)` 附加到交易上。任何人都可透過 [ECRECOVER](/ethereum/cryptography/ecrecover/) 從簽名還原出公鑰和地址，驗證發送者身份。

### EOA 的傳統限制

在 Pectra 升級前，EOA 有以下限制：

1. **單一操作**：一筆交易只能呼叫一個目標
2. **無條件邏輯**：無法設定花費條件、多重簽名等
3. **Gas 支付**：必須自己支付 gas（除非使用 meta-transaction）
4. **不可升級**：地址與私鑰綁定，無法更換控制方式

### EIP-7702：EOA 可執行合約邏輯（Pectra，2025/5/7）

EIP-7702 是 Pectra 硬分叉中對 EOA 影響最大的提案，根本性地改變了 EOA 的能力邊界。

**機制**：EOA 可以透過 Type 4（Set Code）交易，指定一個合約地址作為其「委託代碼」（delegation designation）。設定後，該 EOA 在被呼叫時會執行指定合約的 bytecode，但使用自己的 storage 和 balance。

**解鎖的能力**：
- **交易批次處理**（batching）：一筆交易中完成多個操作（如 approve + swap）
- **Gas 代付**（sponsored transactions）：第三方可以為 EOA 支付 gas
- **替代驗證方式**：支援 passkey、session key 等非 secp256k1 簽名驗證

**與 EOA 傳統模型的差異**：
- EOA 不再必然是「無 code」的帳戶——設定委託後，`eth_getCode` 會回傳 delegation designation（`0xef0100 + address`）
- 但 EOA 仍然保留私鑰控制權，可以隨時撤銷或更換委託
- 這模糊了 [EOA](/ethereum/accounts/eoa/) 和 [合約帳戶](/ethereum/accounts/contract-account/) 的傳統二元劃分

**實際採用**：上線一週內超過 11,000 個 EOA 完成授權。WhiteBIT 和 OKX 等交易所已整合 EIP-7702 支援。

### EIP-4337 Account Abstraction

EIP-4337 透過另一條路徑解決 EOA 的限制，讓合約帳戶也能發起「類交易」（UserOperation），實現：
- 社交恢復（social recovery）
- 多重簽名
- Gas 贊助（paymaster）
- Batch 操作

但底層仍然需要 bundler（本質是 EOA）來提交交易上鏈。

EIP-7702 和 EIP-4337 是互補而非互斥的方案：EIP-7702 讓現有 EOA 獲得部分合約能力；EIP-4337 則是完整的合約帳戶抽象化框架。兩者可以結合使用——EOA 透過 EIP-7702 委託給 EIP-4337 相容的合約，同時享有兩套機制的優勢。

## 在 Ethereum 中的應用

- **[密鑰生成與帳戶創建](/ethereum/transaction-lifecycle/key-generation/)**：EOA 的建立不需要鏈上操作，離線生成密鑰即可
- **[交易生命週期](/ethereum/transaction-lifecycle/transaction-lifecycle/)**：所有交易的起點
- **[Nonce](/ethereum/accounts/nonce/)**：防止重放攻擊，確保交易順序
- **[Gas](/ethereum/accounts/gas/)**：EOA 需要有足夠 ETH 支付 gas
- **[EIP-155 重放保護](/ethereum/accounts/eip-155/)**：chainId 防止跨鏈重放
- **DApp 互動**：使用者透過 EOA 與智能合約交互

## 程式碼範例

### JavaScript（ethers.js）

```javascript
import { Wallet, JsonRpcProvider, parseEther } from 'ethers';

// 建立新 EOA
const wallet = Wallet.createRandom();
console.log('address:', wallet.address);
console.log('private key:', wallet.privateKey);
console.log('mnemonic:', wallet.mnemonic.phrase);

// 從私鑰恢復
const restored = new Wallet('0x...');
console.log('restored address:', restored.address);

// 連接 provider
const provider = new JsonRpcProvider('https://eth.llamarpc.com');
const connected = wallet.connect(provider);

// 檢查是否為 EOA
async function isEOA(address) {
  const code = await provider.getCode(address);
  return code === '0x';
}

console.log('is EOA:', await isEOA(wallet.address));

// 查詢 EOA 狀態
const balance = await provider.getBalance(wallet.address);
const nonce = await provider.getTransactionCount(wallet.address);
console.log('balance:', balance.toString(), 'wei');
console.log('nonce:', nonce);

// 發送交易
const tx = await connected.sendTransaction({
  to: '0x...',
  value: parseEther('0.01'),
});
console.log('tx hash:', tx.hash);
const receipt = await tx.wait();
console.log('status:', receipt.status);
```

### Python（web3.py）

```python
from web3 import Web3
from eth_account import Account

w3 = Web3(Web3.HTTPProvider('https://eth.llamarpc.com'))

# 建立新 EOA
account = Account.create()
print(f"address: {account.address}")
print(f"private key: {account.key.hex()}")

# 從私鑰恢復
restored = Account.from_key('0x...')
print(f"restored: {restored.address}")

# 檢查是否為 EOA
def is_eoa(address: str) -> bool:
    code = w3.eth.get_code(address)
    return code == b''

# 查詢狀態
balance = w3.eth.get_balance(account.address)
nonce = w3.eth.get_transaction_count(account.address)
print(f"balance: {balance} wei")
print(f"nonce: {nonce}")
```

## 相關概念

- [合約帳戶](/ethereum/accounts/contract-account/) - 與 EOA 互補，由程式碼控制的帳戶
- [地址推導](/ethereum/accounts/address-derivation/) - 從私鑰到地址的完整計算過程
- [密鑰生成與帳戶創建](/ethereum/transaction-lifecycle/key-generation/) - EOA 的建立流程
- [secp256k1](/ethereum/cryptography/secp256k1/) - EOA 使用的橢圓曲線
- [ECDSA](/ethereum/cryptography/ecdsa/) - 交易簽名演算法
- [Nonce](/ethereum/accounts/nonce/) - EOA 的交易序號
- [State Trie](/ethereum/data-structures/state-trie/) - EOA 狀態的儲存位置
- [EIP-55 地址校驗](/ethereum/accounts/eip-55/) - 地址的 checksum 格式
- [交易生命週期](/ethereum/transaction-lifecycle/transaction-lifecycle/) - EOA 發起交易的完整流程
