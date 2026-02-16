---
title: "SHA-256d (Double SHA-256)"
description: "Bitcoin's double SHA-256 hashing: length extension attack prevention, block header hashing, txid computation, ASIC mining performance"
tags: [bitcoin, cryptography, hash-function, sha256d, mining, proof-of-work]
---

# SHA-256d (Double SHA-256)

## 概述

SHA-256d 是 Bitcoin 協議中最核心的雜湊運算，定義為對輸入連續執行兩次 SHA-256：

$$H(x) = \text{SHA-256}(\text{SHA-256}(x))$$

Satoshi Nakamoto 在 Bitcoin 的原始實作中選擇了 double hashing 方案，主要目的是防禦 Length Extension Attack。SHA-256d 被用於 block header hashing（即 Proof-of-Work 挑戰）、transaction ID（txid）計算、以及 Merkle root 的建構。

## SHA-256 內部結構回顧

SHA-256d 的安全性建立在 [SHA-256](/fundamentals/cryptography/sha-256/) 之上。理解 double hashing 為何能防禦特定攻擊，需要先回顧 SHA-256 的 Merkle-Damgard 結構。

### Merkle-Damgard 迭代

SHA-256 將訊息分成 512-bit 區塊，從初始向量 $H_0$ 開始逐一壓縮：

$$H_i = \text{Compress}(H_{i-1}, M_i) + H_{i-1}$$

最終輸出 $H_N$ 就是雜湊值。關鍵問題在於：$H_N$ 同時也是壓縮函數處理完最後一個區塊後的完整內部狀態。

### Message Schedule 與壓縮輪次

每個 512-bit 區塊經過 64 輪壓縮運算：

$$W_t = \sigma_1(W_{t-2}) + W_{t-7} + \sigma_0(W_{t-15}) + W_{t-16} \quad (16 \le t \le 63)$$

每輪使用 8 個 32-bit 工作變數，搭配 Choice、Majority 等布林函數：

$$T_1 = h + \Sigma_1(e) + \text{Ch}(e,f,g) + K_t + W_t$$

## 為何使用 Double Hashing

### Length Extension Attack

Merkle-Damgard 結構有一個固有弱點：已知 $H(m)$ 和 $|m|$ 時，攻擊者可以計算 $H(m \| \text{pad}(m) \| m')$，無需知道 $m$ 的內容。

**攻擊原理：** 因為 $H(m)$ 就是壓縮函數的最終狀態，攻擊者可以從這個狀態繼續壓縮新的區塊，等同於「接著」原始訊息繼續雜湊。

### Double Hashing 的防禦機制

$$H_{\text{double}}(x) = \text{SHA-256}(\text{SHA-256}(x))$$

第二次 SHA-256 的輸入是固定 256-bit（32 bytes），填充後恰好是一個 512-bit 區塊。攻擊者從 $H_{\text{double}}(x)$ 得到的是第二次 SHA-256 的最終狀態，但這個狀態無法用來延伸第一次 SHA-256 的計算，因為兩次 SHA-256 使用不同的初始狀態和不同的輸入。

### 其他替代方案

防禦 Length Extension Attack 還有其他方法：
- **HMAC**：$\text{HMAC}(K, m) = H((K \oplus \text{opad}) \| H((K \oplus \text{ipad}) \| m))$
- **Truncation**：截斷雜湊輸出（如 SHA-512/256）
- **Sponge construction**：如 [Keccak-256](/fundamentals/cryptography/keccak-256/) 天然免疫

Bitcoin 選擇 double hashing 的優勢在於實作簡單，且不需要額外的密鑰或結構改變。

## 在 Bitcoin 中的使用場景

### Block Header Hashing

Bitcoin 挖礦的核心運算。礦工不斷調整 nonce 直到找到滿足難度目標的雜湊：

$$\text{SHA-256d}(\text{header}) < \text{target}$$

Block header 是固定 80 bytes，包含 version、prev\_block\_hash、merkle\_root、timestamp、bits、nonce。

### Transaction ID (txid)

每筆交易的唯一識別碼：

$$\text{txid} = \text{SHA-256d}(\text{serialized\_tx})$$

注意：SegWit 交易的 txid 不包含 witness data，這是為了解決 transaction malleability 問題。

### Merkle Root 計算

區塊中所有交易的 [Merkle Root](/bitcoin/cryptography/merkle-root/) 使用 SHA-256d 合併節點：

$$\text{parent} = \text{SHA-256d}(H_{\text{left}} \| H_{\text{right}})$$

### 地址生成中的角色

Bitcoin 地址使用 HASH-160（RIPEMD-160(SHA-256(x))），其中的 SHA-256 是單次而非雙次。但 Base58Check 編碼中的 checksum 使用 SHA-256d 的前 4 bytes。

## 效能特性與 ASIC 挖礦

SHA-256d 的計算特性對 ASIC 設計特別友好：

- **固定輸入長度**：Block header 恆為 80 bytes（兩個 SHA-256 區塊），第二次 SHA-256 輸入恆為 32 bytes（一個區塊）
- **高度可平行化**：每次 nonce 嘗試獨立，可大量平行運算
- **純整數運算**：僅涉及 32-bit 加法、位元旋轉、邏輯運算，適合硬體最佳化
- **無記憶體需求**：不像 Ethash（memory-hard），SHA-256d 幾乎不需要記憶體

每次 block header hashing 需要 $64 \times 3 = 192$ 輪壓縮（兩個區塊的第一次 SHA-256 + 一個區塊的第二次 SHA-256）。現代 ASIC 如 Bitmain Antminer S21 可達到約 200 TH/s，即每秒 $2 \times 10^{14}$ 次 SHA-256d 運算。

## 程式碼範例

### Python

```python
import hashlib
import struct

def sha256d(data: bytes) -> bytes:
    """Bitcoin 的 double SHA-256"""
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()

# txid 計算（以 raw transaction bytes 為例）
raw_tx = bytes.fromhex(
    "01000000"  # version
    "01"        # input count
    "0000000000000000000000000000000000000000000000000000000000000000"
    "ffffffff"
    "07" "04ffff001d0104"  # coinbase script
    "ffffffff"
    "01"        # output count
    "00f2052a01000000"  # 50 BTC
    "43" "4104678afdb0fe5548271967f1a67130b7105cd6a828e03909"
    "a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c"
    "384df7ba0b8d578a4c702b6bf11d5fac"
    "00000000"
)
txid = sha256d(raw_tx)
# Bitcoin 以 little-endian 顯示 txid
print(f"txid: {txid[::-1].hex()}")

# Block header hashing（模擬）
def hash_block_header(
    version: int, prev_hash: bytes, merkle_root: bytes,
    timestamp: int, bits: int, nonce: int
) -> bytes:
    header = struct.pack('<I', version)
    header += prev_hash
    header += merkle_root
    header += struct.pack('<I', timestamp)
    header += struct.pack('<I', bits)
    header += struct.pack('<I', nonce)
    assert len(header) == 80
    return sha256d(header)

# Genesis block header
genesis_hash = hash_block_header(
    version=1,
    prev_hash=b'\x00' * 32,
    merkle_root=bytes.fromhex(
        "3ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a"
    )[::-1],
    timestamp=1231006505,
    bits=0x1d00ffff,
    nonce=2083236893,
)
print(f"Genesis block hash: {genesis_hash[::-1].hex()}")
```

### JavaScript

```javascript
import { createHash } from 'crypto';

function sha256d(data) {
  const first = createHash('sha256').update(data).digest();
  return createHash('sha256').update(first).digest();
}

// 驗證 double hashing 防禦 length extension
const msg = Buffer.from('Bitcoin block header simulation');
const singleHash = createHash('sha256').update(msg).digest();
const doubleHash = sha256d(msg);

// single hash 的輸出就是內部狀態 -> 可被 length extension
// double hash 的輸出是全新壓縮的結果 -> 無法延伸第一次的計算
console.log(`Single SHA-256: ${singleHash.toString('hex')}`);
console.log(`Double SHA-256: ${doubleHash.toString('hex')}`);

// SHA-256d 效能測量
function benchmarkSha256d(iterations) {
  const header = Buffer.alloc(80);
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    header.writeUInt32LE(i, 76); // 修改 nonce
    sha256d(header);
  }
  const elapsed = performance.now() - start;
  const hashRate = iterations / (elapsed / 1000);
  console.log(`${iterations} hashes in ${elapsed.toFixed(0)}ms`);
  console.log(`Hash rate: ${(hashRate / 1000).toFixed(1)} kH/s`);
}

benchmarkSha256d(100000);
```

## 相關概念

- [雜湊函數概述](/fundamentals/cryptography/hash-function-overview/) - 雜湊函數的安全性質與分類
- [SHA-256](/fundamentals/cryptography/sha-256/) - SHA-256d 的基礎單次雜湊函數
- [Bitcoin 雜湊函數](/bitcoin/cryptography/hash-functions-in-bitcoin/) - Bitcoin 中所有雜湊函數的完整對照
- [Merkle Root](/bitcoin/cryptography/merkle-root/) - 使用 SHA-256d 建構的交易 Merkle 樹
- [PoW/Hashcash](/bitcoin/consensus/pow-hashcash/) - SHA-256d 在工作量證明中的應用
- [Block Structure](/bitcoin/data-structures/bitcoin-block-structure/) - 80-byte block header 的詳細結構
- [Witness Data](/bitcoin/data-structures/witness-data/) - SegWit 對 txid 計算的影響
- [Serialization Formats](/bitcoin/data-structures/serialization-formats/) - 交易序列化與 SHA-256d 的關係
- [Keccak-256](/fundamentals/cryptography/keccak-256/) - 使用 Sponge 結構天然免疫 Length Extension Attack 的替代方案
