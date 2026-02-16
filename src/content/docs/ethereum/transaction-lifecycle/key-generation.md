---
title: "密鑰生成與帳戶創建"
description: "Key Generation, 帳戶創建, 密鑰對生成"
tags: [ethereum, keys, account, cryptography]
---

# 密鑰生成與帳戶創建

> 本文聚焦 Ethereum 特定的實現細節。通用密鑰生成理論請參見 [密鑰生成](/fundamentals/concepts/key-generation/)。

## 概述

Ethereum 帳戶的建立完全是離線密碼學操作：使用 [CSPRNG](/fundamentals/cryptography/csprng/) 產生 256-bit 隨機私鑰，透過 [secp256k1](/ethereum/cryptography/secp256k1/) 橢圓曲線標量乘法得到公鑰，再經 [Keccak-256](/ethereum/cryptography/keccak-256/) 雜湊取最後 20 bytes 作為地址。帳戶不需要鏈上註冊，任何人都能獨立產生。

## Ethereum 密鑰推導

### 私鑰

私鑰 $k$ 是一個 256-bit 整數，滿足：

$$1 \leq k < n$$

其中 $n$ 是 [secp256k1](/ethereum/cryptography/secp256k1/) 曲線的階（order）：

$$n = \texttt{0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141}$$

### 公鑰推導

公鑰 $K$ 透過橢圓曲線標量乘法計算：

$$K = k \cdot G$$

其中 $G$ 是 [secp256k1](/ethereum/cryptography/secp256k1/) 的生成點。結果是曲線上一個點 $(x, y)$，非壓縮格式為 65 bytes：

$$K_{uncompressed} = \texttt{0x04} \| x \| y$$

Ethereum 使用非壓縮公鑰（去掉 `0x04` 前綴的 64 bytes）進行地址推導。

### Keccak-256 地址推導

```
地址 = Keccak-256(公鑰的 64 bytes)[12:32]
```

即取 [Keccak-256](/ethereum/cryptography/keccak-256/) 雜湊輸出的最後 20 bytes（160 bits）。這意味著：

1. 地址空間為 $2^{160}$，碰撞機率極低（生日攻擊需 $\approx 2^{80}$ 次嘗試）
2. 從地址無法反推公鑰（雜湊的單向性）
3. 公鑰在第一次發送交易前不會上鏈 -- 只有地址可見

流程圖：

```
CSPRNG → 私鑰(32B) → secp256k1 → 公鑰(64B) → Keccak-256 → 取後 20B → 地址(20B)
                                                                           ↓
                                                              EIP-55 checksum encoding
```

### EIP-55 地址校驗

[EIP-55 地址校驗](/ethereum/accounts/eip-55/) 在地址的十六進位表示中混合大小寫作為 checksum。對地址的小寫 hex 取 Keccak-256，若雜湊的第 $i$ 個半位元組 $\geq 8$，則地址第 $i$ 個字元大寫。這提供了約 99.986% 的錯誤偵測率。

### HD Wallet Ethereum 路徑

Ethereum 的 BIP-44 標準衍生路徑為：

```
m/44'/60'/0'/0/index
```

其中 `60` 是 Ethereum 的 coin type。MetaMask 等錢包預設使用此路徑，`index` 從 0 開始遞增產生多個帳戶。

## 在 Ethereum 中的應用

- **[EOA](/ethereum/accounts/eoa/)**：外部擁有帳戶由密鑰對控制，私鑰 = 完全控制權
- **[合約帳戶](/ethereum/accounts/contract-account/)**：地址由 deployer 地址和 nonce 計算（`CREATE`）或由 deployer、salt、init code 計算（`CREATE2`），不涉及密鑰對
- **[地址推導](/ethereum/accounts/address-derivation/)**：EOA 用上述流程；合約用 `Keccak-256(RLP([sender, nonce]))[12:32]`

## 程式碼範例

```javascript
import { ethers } from 'ethers';

// --- 方法 1：隨機產生新錢包 ---
const wallet = ethers.Wallet.createRandom();
console.log('Address:', wallet.address);
console.log('Private Key:', wallet.privateKey);
console.log('Public Key:', wallet.publicKey); // 壓縮格式 (33 bytes)
console.log('Mnemonic:', wallet.mnemonic.phrase);

// --- 方法 2：從私鑰建立 ---
const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const wallet2 = new ethers.Wallet(privateKey);

// --- 方法 3：手動推導地址 ---
// 從私鑰推導非壓縮公鑰
const signingKey = new ethers.SigningKey(privateKey);
const publicKeyUncompressed = signingKey.publicKey; // 0x04 + 64 bytes

// 移除 0x04 前綴，取 Keccak-256 後 20 bytes
const publicKeyBytes = publicKeyUncompressed.slice(4); // 去掉 "0x04"
const hash = ethers.keccak256('0x' + publicKeyBytes);
const address = '0x' + hash.slice(-40); // 後 20 bytes = 40 hex chars
console.log('Derived Address:', ethers.getAddress(address)); // EIP-55 checksum

// --- 方法 4：HD Wallet 推導 ---
const mnemonic = 'test test test test test test test test test test test junk';
const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic);
// Ethereum 標準路徑 m/44'/60'/0'/0/0
const child = hdNode.derivePath("m/44'/60'/0'/0/0");
console.log('HD Address:', child.address);

// --- 驗證地址格式 ---
console.log('Is valid address:', ethers.isAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'));
```

## 安全注意事項

- 私鑰一旦洩露，帳戶資產無法挽回。沒有「重設密碼」機制
- 不要使用弱隨機源（browser `Math.random()`、可預測的 seed）
- 私鑰的 entropy 需要完整的 256 bits；brain wallet（用密碼雜湊當私鑰）已被證明不安全
- 硬體錢包讓私鑰永遠不離開安全晶片，是目前最佳實踐

## 相關概念

- [密鑰生成（通用概念）](/fundamentals/concepts/key-generation/) - 跨鏈通用的密鑰生成理論
- [交易生命週期](/ethereum/transaction-lifecycle/transaction-lifecycle/) - 本筆記是流程第一步
- [CSPRNG](/fundamentals/cryptography/csprng/) - 私鑰的隨機數來源
- [secp256k1](/ethereum/cryptography/secp256k1/) - 公鑰推導使用的橢圓曲線
- [Keccak-256](/ethereum/cryptography/keccak-256/) - 地址推導的雜湊函數
- [橢圓曲線密碼學](/fundamentals/cryptography/elliptic-curve-cryptography/) - ECC 數學基礎
- [公鑰密碼學](/fundamentals/cryptography/public-key-cryptography/) - 非對稱加密通用概念
- [地址推導](/ethereum/accounts/address-derivation/) - 完整的地址推導規格
- [EIP-55 地址校驗](/ethereum/accounts/eip-55/) - 地址的 checksum 編碼
- [EOA](/ethereum/accounts/eoa/) - 由密鑰對控制的帳戶類型
- [交易構建](/ethereum/transaction-lifecycle/transaction-construction/) - 流程下一步
