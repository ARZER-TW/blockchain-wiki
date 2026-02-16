---
title: "地址推導"
description: "地址推導, Address Derivation, Ethereum Address, 地址生成"
tags: [ethereum, account, address, cryptography, key-derivation]
---

# 地址推導

## 概述

Ethereum 地址是 20 bytes（160 bits）的識別符。[EOA](/ethereum/accounts/eoa/) 的地址由私鑰透過橢圓曲線和雜湊函數推導；[合約帳戶](/ethereum/accounts/contract-account/)的地址由部署者地址和 nonce（或 salt + init code）計算。兩者都不需要鏈上操作——地址在鏈下就能確定。

## 核心原理

### EOA 地址推導

完整步驟：

```
Step 1: 生成私鑰
  private_key = random 256-bit integer ∈ [1, n-1]
  其中 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
  (secp256k1 曲線的 order)

Step 2: 計算公鑰
  public_key = private_key × G
  其中 G 是 secp256k1 的 generator point
  結果是曲線上的點 (x, y)，各 32 bytes

Step 3: 取非壓縮公鑰（去掉 0x04 前綴）
  uncompressed = x || y  (64 bytes)

Step 4: Keccak-256 雜湊
  hash = keccak256(uncompressed)  (32 bytes)

Step 5: 取後 20 bytes
  address = hash[12:]  (20 bytes)
```

數學表示：

$$\text{address} = \text{keccak256}(P_x \| P_y)[12:32]$$

其中 $P = k \cdot G$，$k$ 是私鑰，$G$ 是 [secp256k1](/ethereum/cryptography/secp256k1/) generator point。

### 為什麼取後 20 bytes

- 安全性：20 bytes = 160 bits，碰撞需 $2^{80}$ 次計算（birthday attack），目前不可行
- 空間效率：比 32 bytes 節省 12 bytes 的鏈上儲存
- 歷史決定：Bitcoin 也用 20 bytes 地址（RIPEMD-160）

### 合約地址推導

#### CREATE

$$\text{address} = \text{keccak256}(\text{RLP}([\text{sender}, \text{nonce}]))[12:]$$

- `sender`：部署者的 20 bytes 地址
- `nonce`：部署者當前的 [Nonce](/ethereum/accounts/nonce/)（第一次部署時 nonce = 0）
- [RLP 編碼](/ethereum/data-structures/rlp-encoding/) 後取 [Keccak-256](/ethereum/cryptography/keccak-256/) 的後 20 bytes

特殊情況：nonce = 0 時 RLP 編碼為 `0x80`（空 string），不是 `0x00`。

#### CREATE2（EIP-1014）

$$\text{address} = \text{keccak256}(\texttt{0xff} \| \text{sender} \| \text{salt} \| \text{keccak256}(\text{initCode}))[12:]$$

- `0xff`：1 byte 前綴，防止與 CREATE 碰撞
- `sender`：工廠合約地址（20 bytes）
- `salt`：32 bytes 任意值
- `initCode`：合約的 init code（constructor + runtime bytecode）的 keccak256 hash

CREATE2 的優勢：地址只取決於 sender、salt、initCode，不依賴 nonce，因此可以預測和重現。

### 地址格式

- 原始：`0x` + 40 hex characters（全小寫或全大寫）
- [EIP-55 地址校驗](/ethereum/accounts/eip-55/)：mixed-case checksum 格式
- ICAP：基於 IBAN 的格式（較少使用）

## 在 Ethereum 中的應用

- **[密鑰生成與帳戶創建](/ethereum/transaction-lifecycle/key-generation/)**：錢包建立時自動推導地址
- **[State Trie](/ethereum/data-structures/state-trie/)**：key 是 `keccak256(address)`
- **[合約帳戶](/ethereum/accounts/contract-account/)**：CREATE/CREATE2 地址計算
- **[ECRECOVER](/ethereum/cryptography/ecrecover/)**：從簽名恢復地址以驗證身份
- **[交易簽名](/ethereum/transaction-lifecycle/transaction-signing/)**：不直接簽地址，但可從簽名還原
- **Vanity address**：暴力搜尋特定前綴的地址（如 `0x0000...`）
- **Counterfactual deployment**：CREATE2 讓合約在部署前就有確定地址

## 程式碼範例

### JavaScript（ethers.js）

```javascript
import {
  Wallet,
  keccak256,
  getBytes,
  SigningKey,
  computeAddress,
  getCreate2Address,
  getCreateAddress,
  encodeRlp,
  toBeHex,
} from 'ethers';

// === EOA 地址推導（完整步驟）===

// Step 1: 私鑰
const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

// Step 2: 公鑰（使用 SigningKey）
const signingKey = new SigningKey(privateKey);
const publicKey = signingKey.publicKey;
console.log('public key:', publicKey);
// 非壓縮公鑰格式: 0x04 + x(32 bytes) + y(32 bytes)

// Step 3: 去掉 0x04 前綴
const pubKeyNoPrefix = '0x' + publicKey.slice(4); // 去掉 '0x04'

// Step 4: keccak256
const hash = keccak256(getBytes(pubKeyNoPrefix));

// Step 5: 取後 20 bytes
const address = '0x' + hash.slice(26); // 26 = 2('0x') + 24(12 bytes * 2)
console.log('derived address:', address);

// 驗證：ethers 內建方法
const builtIn = computeAddress(privateKey);
console.log('ethers address:', builtIn);
console.log('match:', address.toLowerCase() === builtIn.toLowerCase());

// === CREATE 地址推導 ===
const deployer = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const nonce = 0;

// 方法 1: ethers 內建
const createAddr = getCreateAddress({ from: deployer, nonce });
console.log('CREATE address:', createAddr);

// 方法 2: 手動計算
const rlpEncoded = encodeRlp([deployer, nonce === 0 ? '0x' : toBeHex(nonce)]);
const createAddrManual = '0x' + keccak256(getBytes(rlpEncoded)).slice(26);
console.log('CREATE manual:', createAddrManual);

// === CREATE2 地址推導 ===
const factory = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'; // Uniswap V2 Factory
const salt = '0x' + '00'.repeat(32);
const initCodeHash = keccak256('0x3d602d80600a3d3981f3');

// 方法 1: ethers 內建
const create2Addr = getCreate2Address(factory, salt, initCodeHash);
console.log('CREATE2 address:', create2Addr);
```

### Python

```python
from eth_utils import keccak
from eth_keys import keys
import rlp

# === EOA 地址推導 ===

# Step 1: 私鑰
private_key_bytes = bytes.fromhex(
    'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
)

# Step 2: 公鑰
pk = keys.PrivateKey(private_key_bytes)
public_key = pk.public_key

# 非壓縮公鑰（64 bytes，不含 0x04 前綴）
pub_bytes = public_key.to_bytes()  # 64 bytes
print(f"public key: 0x04{pub_bytes.hex()}")

# Step 3-5: keccak256 → 後 20 bytes
address = keccak(pub_bytes)[-20:]
print(f"address: 0x{address.hex()}")

# 驗證
print(f"eth_keys address: {public_key.to_checksum_address()}")

# === CREATE 地址推導 ===
def create_address(sender: str, nonce: int) -> str:
    sender_bytes = bytes.fromhex(sender[2:])
    data = rlp.encode([sender_bytes, nonce])
    addr = keccak(data)[-20:]
    return f"0x{addr.hex()}"

deployer = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
for n in range(5):
    addr = create_address(deployer, n)
    print(f"CREATE nonce={n}: {addr}")

# === CREATE2 地址推導 ===
def create2_address(sender: str, salt: bytes, init_code_hash: bytes) -> str:
    data = b'\xff' + bytes.fromhex(sender[2:]) + salt + init_code_hash
    addr = keccak(data)[-20:]
    return f"0x{addr.hex()}"

factory = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'
salt = b'\x00' * 32
init_code_hash = keccak(b'\x00')
addr = create2_address(factory, salt, init_code_hash)
print(f"CREATE2: {addr}")
```

## 相關概念

- [secp256k1](/ethereum/cryptography/secp256k1/) - EOA 地址推導使用的橢圓曲線
- [Keccak-256](/ethereum/cryptography/keccak-256/) - 地址推導的 hash 函數
- [EOA](/ethereum/accounts/eoa/) - 由私鑰控制的帳戶
- [合約帳戶](/ethereum/accounts/contract-account/) - CREATE/CREATE2 部署的帳戶
- [EIP-55 地址校驗](/ethereum/accounts/eip-55/) - 地址的 mixed-case checksum
- [Nonce](/ethereum/accounts/nonce/) - CREATE 地址計算的輸入之一
- [RLP 編碼](/ethereum/data-structures/rlp-encoding/) - CREATE 地址計算使用 RLP
- [ECDSA](/ethereum/cryptography/ecdsa/) - 橢圓曲線數位簽章，使用相同的密鑰對
- [ECRECOVER](/ethereum/cryptography/ecrecover/) - 從簽名恢復地址
- [密鑰生成與帳戶創建](/ethereum/transaction-lifecycle/key-generation/) - 完整的帳戶建立流程
- [CSPRNG](/ethereum/cryptography/csprng/) - 安全的私鑰隨機生成
