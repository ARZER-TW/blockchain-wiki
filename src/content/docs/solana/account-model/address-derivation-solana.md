---
title: "Solana Address Derivation"
description: "Ed25519 keypair generation, Base58 encoding, and HD wallet paths for Solana"
tags: [solana, account-model, address-derivation, Ed25519, Base58, HD-wallet]
---

# Solana Address Derivation

## 概述

Solana 的地址推導與 Ethereum 有根本的差異。Ethereum 地址經過 [Keccak-256](/fundamentals/cryptography/keccak-256/) 雜湊後截取 20 bytes，而 Solana 的地址直接就是 [Ed25519](/solana/cryptography/ed25519/) 公鑰本身——32 bytes，以 Base58 編碼顯示。沒有額外的雜湊步驟，沒有 checksum 機制（如 [EIP-55](/ethereum/accounts/eip-55/)），地址就是公鑰的直接表示。這種設計使得地址推導極為簡潔，同時與 Ed25519 簽名系統無縫整合。

## 核心原理

### 金鑰生成流程

```
Random Seed (32 bytes)
     |
     v
  SHA-512
     |
     v
  64 bytes
     |
     +-- 前 32 bytes --> clamp --> 私鑰標量 a
     |
     +-- 後 32 bytes --> nonce prefix (簽名用)
     |
     v
  a * B (Ed25519 base point)
     |
     v
  Public Key (32 bytes, compressed Edwards y + sign bit)
     |
     v
  Base58 encode
     |
     v
  Solana Address (43-44 characters)
```

### 公鑰即地址

Solana 的設計決策：**公鑰 = 地址**（無雜湊）

$$\text{address} = \text{Base58}(\text{pubkey}_{32\text{ bytes}})$$

與 Ethereum 的比較：

$$\text{ETH address} = \text{0x} \| \text{Keccak256}(\text{pubkey}_{64\text{ bytes}})[12:32]$$

Ethereum 透過雜湊將 64-byte 公鑰壓縮為 20-byte 地址，引入了碰撞可能性（雖然極低）。Solana 直接使用完整公鑰，零資訊損失。

### Ed25519 Keypair 結構

Solana 的 keypair 格式（64 bytes）：

| Offset | 大小 | 內容 |
|--------|------|------|
| 0-31 | 32 bytes | Secret key seed |
| 32-63 | 32 bytes | Public key |

注意：這不是 Ed25519 的「expanded secret key」，而是 `seed || public_key` 的串接。實際簽名時，seed 會透過 SHA-512 展開。

### Base58 編碼

Solana 使用 **Base58Check-less** 編碼（不含 checksum）：

字元集（58 個字元，排除 0, O, I, l 以避免混淆）：
```
123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
```

32-byte 公鑰的 Base58 表示通常為 43-44 個字元。

與 Bitcoin 的 Base58Check（含 4-byte checksum）不同，Solana 的 Base58 **不含 checksum**。錯誤檢測依賴應用層（如錢包 UI 的地址驗證）。

### HD Wallet（BIP-44）

Solana 遵循 BIP-44 的 HD wallet 路徑標準：

$$m / 44' / 501' / \text{account}' / \text{change}'$$

| 層級 | 值 | 說明 |
|------|-----|------|
| Purpose | 44' | BIP-44 標準 |
| Coin type | 501' | Solana 的幣種 ID（SLIP-44 註冊） |
| Account | 0', 1', ... | 帳戶索引 |
| Change | 0' | 通常固定為 0（Solana 不使用 UTXO 找零模式） |

常見路徑：
- **Phantom**: `m/44'/501'/0'/0'`（第一個帳戶）
- **多帳戶**: `m/44'/501'/n'/0'`（第 n 個帳戶）

從 mnemonic 到地址：
```
Mnemonic (12/24 words)
    |
    v
BIP-39 seed (64 bytes)
    |
    v
BIP-32 master key
    |
    v
Derive path m/44'/501'/0'/0'
    |
    v
Ed25519 seed (32 bytes)
    |
    v
Keypair -> Address
```

### Vanity Address

Vanity address 是包含特定前綴或後綴的地址。由於 Base58 的非線性映射，需要暴力搜尋：

```
目標前綴 "Sol" (3 chars)
  搜尋空間 ≈ 58^3 ≈ 195,112 次
  以現代 GPU 約數秒完成

目標前綴 "SolPay" (6 chars)
  搜尋空間 ≈ 58^6 ≈ 38 billion
  需要數小時
```

Solana CLI 內建 vanity address 生成器：`solana-keygen grind --starts-with Sol:1`

### 特殊地址

| 地址 | 用途 |
|------|------|
| `11111111111111111111111111111111` | [System Program](/solana/account-model/system-program/) |
| `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` | SPL Token Program |
| `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` | Token-2022 Program |
| `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL` | ATA Program |
| `Vote111111111111111111111111111111111111111` | Vote Program |
| `Stake11111111111111111111111111111111111111` | Stake Program |

### PDA 地址

[PDA（Program Derived Address）](/solana/account-model/pda/) 是一種特殊的地址推導，結果保證不在 Ed25519 曲線上：

$$\text{PDA} = \text{SHA-256}(\text{seeds} \| \text{program\_id} \| \text{"ProgramDerivedAddress"})$$

PDA 沒有對應的私鑰，只能由程式透過 CPI 控制。

## 程式碼範例

### TypeScript（@solana/web3.js）

```typescript
import {
  Keypair,
  PublicKey,
} from '@solana/web3.js';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import bs58 from 'bs58';

// === 隨機金鑰生成 ===
const keypair = Keypair.generate();
console.log('Address:', keypair.publicKey.toBase58());
console.log('Public key bytes:', keypair.publicKey.toBytes().length); // 32
console.log('Secret key bytes:', keypair.secretKey.length); // 64

// === 從 seed 恢復 ===
const seed = keypair.secretKey.slice(0, 32);
const restored = Keypair.fromSeed(seed);
console.log('Restored:', restored.publicKey.toBase58());
console.log('Same:', keypair.publicKey.equals(restored.publicKey));

// === HD Wallet (BIP-44) ===
const mnemonic = bip39.generateMnemonic(256); // 24 words
const bip39Seed = bip39.mnemonicToSeedSync(mnemonic);
const path = "m/44'/501'/0'/0'";
const derived = derivePath(path, bip39Seed.toString('hex'));
const hdKeypair = Keypair.fromSeed(derived.key);
console.log('HD address:', hdKeypair.publicKey.toBase58());

// === 多帳戶推導 ===
for (let i = 0; i < 5; i++) {
  const accountPath = `m/44'/501'/${i}'/0'`;
  const { key } = derivePath(accountPath, bip39Seed.toString('hex'));
  const kp = Keypair.fromSeed(key);
  console.log(`Account ${i}: ${kp.publicKey.toBase58()}`);
}

// === Base58 編解碼 ===
const pubkeyBytes = keypair.publicKey.toBytes();
const base58Address = bs58.encode(pubkeyBytes);
console.log('Base58:', base58Address);
const decoded = bs58.decode(base58Address);
console.log('Decoded bytes:', decoded.length); // 32

// === 驗證地址格式 ===
function isValidSolanaAddress(address: string): boolean {
  try {
    const pubkey = new PublicKey(address);
    return PublicKey.isOnCurve(pubkey.toBytes());
  } catch {
    return false;
  }
}

// 注意：PDA 也是有效地址，但 isOnCurve = false
function isValidAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}
```

### Rust

```rust
use solana_sdk::signer::keypair::Keypair;
use solana_sdk::signer::Signer;
use solana_sdk::pubkey::Pubkey;
use ed25519_dalek::SigningKey;

// 金鑰生成
let keypair = Keypair::new();
let pubkey = keypair.pubkey();
println!("Address: {}", pubkey); // Base58 encoded

// 從 32-byte seed
let seed: [u8; 32] = [/* ... */];
let keypair = Keypair::from_seed(&seed).unwrap();

// 公鑰就是地址
let address_bytes: [u8; 32] = pubkey.to_bytes();
let address_string: String = pubkey.to_string(); // Base58

// 從 Base58 字串解析
let parsed: Pubkey = "11111111111111111111111111111111".parse().unwrap();
assert_eq!(parsed, solana_sdk::system_program::ID);

// 檢查是否在曲線上
let on_curve = pubkey.is_on_curve();
println!("On Ed25519 curve: {}", on_curve);

// PDA 推導
let (pda, bump) = Pubkey::find_program_address(
    &[b"vault", &[42u8]],
    &solana_sdk::pubkey!("MyProg111111111111111111111111111111111111"),
);
assert!(!pda.is_on_curve()); // PDA 永遠不在曲線上
```

## 相關概念

- [Ed25519](/solana/cryptography/ed25519/) - Solana 使用的簽章演算法（公鑰格式）
- [PDA](/solana/account-model/pda/) - 離開 Ed25519 曲線的程式衍生地址
- [Account Model](/solana/account-model/account-model-overview/) - 地址在帳戶模型中的角色
- [公鑰密碼學](/fundamentals/cryptography/public-key-cryptography/) - 公鑰/私鑰對的通用概念
- [Address Derivation (Ethereum)](/ethereum/accounts/address-derivation/) - Ethereum 的地址推導流程比較
- [EIP-55 (Ethereum)](/ethereum/accounts/eip-55/) - Ethereum 的地址 checksum（Solana 無此機制）
- [System Program](/solana/account-model/system-program/) - 帳戶建立時使用地址
- [Token Accounts](/solana/account-model/token-accounts/) - ATA 的地址推導
- [SHA-256](/fundamentals/cryptography/sha-256/) - PDA 推導使用的雜湊函數
- [Schnorr Signatures (Bitcoin)](/bitcoin/cryptography/schnorr-signatures/) - Bitcoin 的地址推導使用不同的曲線和編碼
