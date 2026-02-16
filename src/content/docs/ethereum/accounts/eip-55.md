---
title: "EIP-55 地址校驗"
description: "EIP-55, EIP-55 地址校驗, Mixed-Case Checksum, Address Checksum"
tags: [ethereum, account, address, checksum, eip-55]
---

# EIP-55 地址校驗

## 概述

EIP-55 定義了 Ethereum 地址的 mixed-case checksum 格式。利用 [Keccak-256](/ethereum/cryptography/keccak-256/) 對小寫地址做 hash，根據 hash 結果決定每個 hex 字元的大小寫。這個方法在不改變地址長度的前提下，提供約 99.986% 的錯誤偵測率——打錯任一字元幾乎必定被檢測到。

## 核心原理

### 演算法

輸入：40 hex 字元的地址（不含 `0x`）

```
1. 將地址轉為全小寫
2. 計算 keccak256(小寫地址的 ASCII 字串)
3. 對地址的每個字元（只處理字母 a-f）：
   - 若 hash 對應位置的 nibble >= 8，轉為大寫
   - 若 hash 對應位置的 nibble < 8，保持小寫
4. 數字 0-9 不受影響
```

### 手動範例

地址（小寫）：`5aaeb6053f3e94c9b9a09f33669435e7ef1beaed`

```
hash = keccak256("5aaeb6053f3e94c9b9a09f33669435e7ef1beaed")
     = 0x1b7a0c3e6d2f4a8b...

地址:  5  a  a  e  b  6  0  5  3  f  3  e  9  4  c  9  ...
hash:  1  b  7  a  0  c  3  e  6  d  2  f  4  a  8  b  ...

5 → 數字，不變 → 5
a → hash[1]=b(11)>=8 → A
a → hash[2]=7(7)<8 → a
e → hash[3]=a(10)>=8 → E
b → hash[4]=0(0)<8 → b
6 → 數字 → 6
0 → 數字 → 0
5 → 數字 → 5
3 → 數字 → 3
f → hash[9]=d(13)>=8 → F
...

結果: 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed
```

### 錯誤偵測能力

- 每個字母字元有 15/16 的機率被偵測到修改
- 假設地址平均有 ~15 個字母（40 hex 字元中扣掉數字）
- 單字元錯誤偵測率：$1 - 2^{-15} \approx 99.997\%$
- EIP-55 論文聲稱的平均偵測率：~99.986%

### 對全數字地址的處理

如果地址恰好全是 0-9（無字母），checksum 無作用。但這種機率極低（$(10/16)^{40} \approx 5 \times 10^{-9}$）。

### 向後相容

舊版全小寫或全大寫地址仍然有效——checksum 不是強制的。多數工具在收到全小寫地址時不報錯，但收到 mixed-case 時會驗證。

## 在 Ethereum 中的應用

- **錢包**：MetaMask、Ledger 等都顯示和驗證 checksum 地址
- **JSON-RPC**：`eth_getBalance` 等 RPC 回傳 checksum 格式
- **合約開發**：Solidity `address` 常量必須通過 checksum 驗證
- **前端 DApp**：使用者輸入地址時應驗證 checksum
- **Block explorer**：Etherscan 顯示 checksum 格式

### 不使用 checksum 的場景

- 鏈上：Ethereum 協定本身不區分大小寫，地址都是 20 bytes 二進位
- [State Trie](/ethereum/data-structures/state-trie/) key：`keccak256(address)` — 使用原始 bytes，不涉及大小寫

## 程式碼範例

### JavaScript（ethers.js）

```javascript
import { getAddress, keccak256, toUtf8Bytes } from 'ethers';

// ethers 內建 checksum
const checksummed = getAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed');
console.log('checksum:', checksummed);
// 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed

// 驗證 checksum（不正確的大小寫會 throw）
try {
  getAddress('0x5AAEB6053f3e94c9b9a09f33669435e7ef1beaed'); // 錯誤大小寫
} catch (e) {
  console.log('invalid checksum:', e.message);
}

// 手動實作 EIP-55
function toChecksumAddress(address) {
  const addr = address.toLowerCase().replace('0x', '');
  const hash = keccak256(toUtf8Bytes(addr)).replace('0x', '');
  let result = '0x';

  for (let i = 0; i < 40; i++) {
    const char = addr[i];
    if ('0123456789'.includes(char)) {
      result += char;
    } else {
      // hash 的第 i 個 nibble >= 8 → 大寫
      const hashNibble = parseInt(hash[i], 16);
      result += hashNibble >= 8 ? char.toUpperCase() : char;
    }
  }
  return result;
}

const manual = toChecksumAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed');
console.log('manual:', manual);
console.log('match:', manual === checksummed);

// 驗證
function isValidChecksum(address) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return false;
  // 全小寫或全大寫視為有效（非 checksum）
  const lower = address.toLowerCase();
  const upper = address.toUpperCase();
  if (address === lower || address === '0x' + upper.slice(2)) return true;
  // mixed-case 必須通過 checksum
  return toChecksumAddress(address) === address;
}

console.log('valid:', isValidChecksum(checksummed)); // true
console.log('valid (lowercase):', isValidChecksum(checksummed.toLowerCase())); // true
console.log('valid (wrong):', isValidChecksum('0x5AAEB6053f3e94c9b9a09f33669435e7ef1beaed')); // false
```

### Python

```python
from eth_utils import keccak, to_checksum_address, is_checksum_address

# 使用 eth_utils
addr = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed'
checksummed = to_checksum_address(addr)
print(f"checksum: {checksummed}")
# 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed

# 驗證
print(f"valid: {is_checksum_address(checksummed)}")
print(f"wrong: {is_checksum_address('0x5AAEB6053f3e94c9b9a09f33669435e7ef1beaed')}")

# 手動實作
def eip55_checksum(address: str) -> str:
    addr = address.lower().replace('0x', '')
    hash_hex = keccak(addr.encode('ascii')).hex()
    result = '0x'

    for i, char in enumerate(addr):
        if char in '0123456789':
            result += char
        else:
            nibble = int(hash_hex[i], 16)
            result += char.upper() if nibble >= 8 else char

    return result

manual = eip55_checksum(addr)
print(f"manual: {manual}")
print(f"match: {manual == checksummed}")

# 批量驗證
test_addresses = [
    '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',  # 正確
    '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',  # 正確
    '0x5AAEB6053F3E94C9B9A09F33669435E7EF1BEAED',  # 全大寫（視為有效）
    '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed',  # 全小寫（視為有效）
]

for a in test_addresses:
    print(f"{a}: checksum valid = {is_checksum_address(a)}")
```

## 相關概念

- [Keccak-256](/ethereum/cryptography/keccak-256/) - Checksum 計算使用的 hash 函數
- [地址推導](/ethereum/accounts/address-derivation/) - 地址的生成流程
- [EOA](/ethereum/accounts/eoa/) - 使用 checksum 地址的帳戶類型
- [合約帳戶](/ethereum/accounts/contract-account/) - 合約地址也適用 EIP-55
