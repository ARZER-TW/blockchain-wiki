---
title: "合約帳戶"
description: "合約帳戶, Contract Account, Smart Contract Account, CA"
tags: [ethereum, account, contract, smart-contract]
---

# 合約帳戶

## 概述

合約帳戶是 Ethereum 上由 bytecode 控制的帳戶，沒有私鑰。合約帳戶的行為完全由其部署時的程式碼決定，任何人都可以透過發送交易來觸發合約邏輯。與 [EOA](/ethereum/accounts/eoa/) 不同，合約帳戶可以擁有任意複雜的邏輯、獨立的 [Storage Trie](/ethereum/data-structures/storage-trie/)，但無法主動發起交易。

## 核心原理

### 帳戶結構

合約帳戶在 [State Trie](/ethereum/data-structures/state-trie/) 中的四元組：

| 欄位 | 合約帳戶的值 |
|------|-------------|
| `nonce` | 此合約透過 `CREATE` opcode 建立其他合約的次數 |
| `balance` | Wei 餘額（合約可以持有 ETH） |
| `storageRoot` | [Storage Trie](/ethereum/data-structures/storage-trie/) 的根 hash |
| `codeHash` | 合約 bytecode 的 `keccak256` hash |

### 與 EOA 的關鍵差異

| 特性 | [EOA](/ethereum/accounts/eoa/) | 合約帳戶 |
|------|---------|----------|
| 控制方式 | 私鑰 | Bytecode |
| 主動發起交易 | 可以 | 不可以 |
| Code | 無（見下方 EIP-7702 例外） | 有 |
| Storage | 無（見下方 EIP-7702 例外） | 有 |
| 建立方式 | 離線生成 | 部署交易 |
| Nonce 含義 | 交易數 | CREATE 數 |

### EIP-7702 對帳戶二元劃分的影響（Pectra，2025/5/7）

EIP-7702 引入 delegation designation 機制後，EOA 和合約帳戶之間的界線不再涇渭分明：

- **EOA 可以擁有「code」**：設定委託後，EOA 的 code 欄位會回傳 `0xef0100 + 委託合約地址`，不再是空的 `0x`
- **EOA 可以使用 storage**：委託合約的邏輯可以讀寫 EOA 地址下的 storage slot
- **但 EOA 仍保留私鑰**：與合約帳戶不同，EOA 隨時可以用私鑰發起普通交易、撤銷委託

**對開發者的影響**：
- `eth_getCode(address) == 0x` 不再能可靠判斷一個地址是 EOA。需要檢查回傳的 code 是否以 `0xef0100` 開頭（delegation designation prefix）
- 合約中 `EXTCODESIZE` 對設定了委託的 EOA 不再回傳 0
- 原本假設「EOA 不能在被呼叫時執行邏輯」的合約可能需要重新審視安全假設

實際上，帳戶模型正從嚴格的 EOA/合約二分法，走向一個更連續的光譜。EIP-7702（讓 EOA 獲得合約能力）和 [EIP-4337](/ethereum/accounts/eoa/)（讓合約帳戶獲得類似 EOA 的交易發起能力）從兩端推動這個融合。

### 合約部署

合約透過特殊交易部署（`to` 欄位為 `null`）：

```
Deploy Transaction {
  to:    null (or 0x)
  data:  init code (constructor + runtime bytecode)
  value: 初始 ETH（可選）
}
```

EVM 執行 init code，`RETURN` 的資料成為合約的 runtime bytecode，永久儲存在鏈上。

### 合約地址計算

#### CREATE（常規部署）

$$\text{address} = \text{keccak256}(\text{RLP}([\text{sender}, \text{nonce}]))[12:]$$

地址由部署者地址和其 [Nonce](/ethereum/accounts/nonce/) 決定——因此可以預測。

#### CREATE2（確定性部署）

$$\text{address} = \text{keccak256}(\texttt{0xff} \| \text{sender} \| \text{salt} \| \text{keccak256}(\text{initCode}))[12:]$$

地址由 sender、salt 和 init code 決定，不依賴 nonce。常用於：
- 工廠模式（Factory pattern）
- Counterfactual instantiation
- Deterministic deployment（跨鏈同地址）

### Code 和 Storage

**Code**（不可變）：
- 部署後 bytecode 不可修改（EIP-3541 禁止以 `0xEF` 開頭的 code）
- 讀取：`EXTCODESIZE`、`EXTCODECOPY`、`EXTCODEHASH`
- `codeHash` 存在 State Trie，實際 bytecode 另外儲存

**Storage**（可變）：
- 每個 slot 32 bytes，透過 `SLOAD`/`SSTORE` 操作
- Storage layout 由 Solidity 編譯器決定（見 [Storage Trie](/ethereum/data-structures/storage-trie/)）
- 最昂貴的 EVM 操作之一

### 合約互動

合約之間的呼叫方式：

| Opcode | 說明 |
|--------|------|
| `CALL` | 呼叫另一個合約，可轉 ETH |
| `STATICCALL` | 唯讀呼叫，不可修改狀態 |
| `DELEGATECALL` | 使用對方的 code 但自己的 storage（proxy pattern） |
| `CREATE` | 建立新合約 |
| `CREATE2` | 確定性建立新合約 |
| `SELFDESTRUCT` | 銷毀合約（EIP-6780 後限制為僅在同一交易建立時有效） |

### Proxy Pattern

因為 code 不可變，upgradeable 合約使用 proxy pattern：

```
User → Proxy (DELEGATECALL) → Implementation
       (storage在這)           (code在這)
```

- **Proxy**：固定不變的合約，storage 在此
- **Implementation**：可更換的邏輯合約
- `DELEGATECALL` 讓 proxy 用 implementation 的 code 操作自己的 storage

## 在 Ethereum 中的應用

- **DeFi**：Uniswap、Aave、MakerDAO 等協定都是合約帳戶
- **Token 標準**：ERC-20、ERC-721、ERC-1155 都是合約
- **[Precompiled Contracts](/ethereum/advanced/precompiled-contracts/)**：特殊地址（0x01-0x09）的「合約」，實際由 client 原生實作
- **DAO**：治理合約管理提案和投票
- **Bridge**：跨鏈橋的鎖定/解鎖邏輯

## 程式碼範例

### JavaScript（ethers.js）

```javascript
import { JsonRpcProvider, Contract, ContractFactory, keccak256, solidityPacked, getCreate2Address } from 'ethers';

const provider = new JsonRpcProvider('https://eth.llamarpc.com');

// 判斷是否為合約帳戶
async function isContract(address) {
  const code = await provider.getCode(address);
  return code !== '0x';
}

// USDC 是合約
const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
console.log('USDC is contract:', await isContract(usdc));

// 查詢合約的 codeHash
const code = await provider.getCode(usdc);
const codeHash = keccak256(code);
console.log('codeHash:', codeHash);
console.log('code size:', (code.length - 2) / 2, 'bytes');

// 預測 CREATE2 地址
const factory = '0x...';
const salt = '0x' + '00'.repeat(32);
const initCodeHash = keccak256('0x...');
const predicted = getCreate2Address(factory, salt, initCodeHash);
console.log('predicted address:', predicted);

// 讀取合約
const abi = ['function name() view returns (string)'];
const contract = new Contract(usdc, abi, provider);
const name = await contract.name();
console.log('name:', name);
```

### Python（web3.py）

```python
from web3 import Web3
from eth_utils import keccak
import rlp

w3 = Web3(Web3.HTTPProvider('https://eth.llamarpc.com'))

usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

# 判斷合約
code = w3.eth.get_code(usdc)
is_contract = len(code) > 0
print(f"is contract: {is_contract}")
print(f"code size: {len(code)} bytes")
print(f"codeHash: 0x{keccak(code).hex()}")

# 預測 CREATE 地址
def predict_create_address(sender: str, nonce: int) -> str:
    sender_bytes = bytes.fromhex(sender[2:])
    encoded = rlp.encode([sender_bytes, nonce])
    addr = keccak(encoded)[-20:]
    return Web3.to_checksum_address(addr)

deployer = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
predicted = predict_create_address(deployer, 0)
print(f"CREATE address (nonce=0): {predicted}")

# 預測 CREATE2 地址
def predict_create2_address(sender: str, salt: bytes, init_code_hash: bytes) -> str:
    data = b'\xff' + bytes.fromhex(sender[2:]) + salt + init_code_hash
    addr = keccak(data)[-20:]
    return Web3.to_checksum_address(addr)

salt = b'\x00' * 32
init_code_hash = keccak(b'\x00')  # placeholder
predicted2 = predict_create2_address(deployer, salt, init_code_hash)
print(f"CREATE2 address: {predicted2}")
```

## 相關概念

- [EOA](/ethereum/accounts/eoa/) - 與合約帳戶互補的外部擁有帳戶
- [State Trie](/ethereum/data-structures/state-trie/) - 合約帳戶狀態的儲存位置
- [Storage Trie](/ethereum/data-structures/storage-trie/) - 合約的持久化儲存
- [地址推導](/ethereum/accounts/address-derivation/) - CREATE 和 CREATE2 的地址計算
- [Nonce](/ethereum/accounts/nonce/) - 合約的 nonce 用於 CREATE 地址計算
- [Gas](/ethereum/accounts/gas/) - 合約操作的 gas 成本
- [Keccak-256](/ethereum/cryptography/keccak-256/) - codeHash 和地址計算的 hash 函數
- [RLP 編碼](/ethereum/data-structures/rlp-encoding/) - CREATE 地址計算使用 RLP
- [Precompiled Contracts](/ethereum/advanced/precompiled-contracts/) - 特殊的「原生合約」
