---
title: "Proof-of-Work (Hashcash)"
description: "Proof-of-Work, PoW, Hashcash, 工作量證明, mining"
tags: [bitcoin, consensus, pow, hashcash, mining, sha-256]
---

# Proof-of-Work (Hashcash)

## 概述

Bitcoin 的 Proof-of-Work（PoW）機制源自 Adam Back 在 1997 年提出的 Hashcash 系統，原本用於對抗電子郵件垃圾信。Satoshi Nakamoto 將其改造為 [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) 的核心組件，作為 Sybil resistance 機制，將區塊生產權與算力投入綁定。礦工必須找到一個使區塊頭的雙重 [SHA-256](/bitcoin/cryptography/sha-256d/) 雜湊值低於目標閾值的 nonce，這個過程在經濟上保證了攻擊者無法輕易偽造工作量。

## 核心原理

### Mining Puzzle

Bitcoin 的挖礦本質上是暴力搜尋問題。礦工反覆修改區塊頭的某些欄位，計算雙重 SHA-256 雜湊，直到結果小於當前目標值：

$$\text{SHA-256}(\text{SHA-256}(\text{block\_header})) < \text{target}$$

由於 SHA-256 的 preimage resistance 特性，除了暴力嘗試之外沒有捷徑。這確保了找到有效 nonce 的計算成本與 target 成反比。

### 區塊頭結構

礦工可以修改的區塊頭欄位：

| 欄位 | 大小 | 說明 | 礦工可改？ |
|------|------|------|-----------|
| `version` | 4 bytes | 區塊版本號（BIP-9 用於 soft fork 信號） | 部分 bits |
| `prev_block_hash` | 32 bytes | 前一區塊的雜湊 | 否 |
| `merkle_root` | 32 bytes | 交易 Merkle tree 根 | 間接（改 coinbase） |
| `timestamp` | 4 bytes | Unix 時間戳 | 有限範圍 |
| `bits` | 4 bytes | 壓縮的目標值 | 否 |
| `nonce` | 4 bytes | 主要搜尋空間 | 是 |

### Nonce 搜尋空間

區塊頭的 `nonce` 只有 32 bits（約 43 億種可能），在現代算力下數秒內即可窮盡。因此礦工還需要修改其他欄位來擴展搜尋空間：

1. **nonce**：主要迭代欄位（$2^{32}$ 種）
2. **timestamp**：允許在合理範圍內調整（過去中位時間到未來 2 小時）
3. **extraNonce**：coinbase 交易的 scriptSig 中保留的額外空間，修改後 merkle_root 改變

搜尋空間的有效大小：

$$\text{search\_space} \approx 2^{32} \times \Delta t \times 2^{n_{\text{extra}}}$$

其中 $\Delta t$ 是時間戳可調範圍，$n_{\text{extra}}$ 是 extraNonce 的位元數。

### Target 與 Bits 欄位

Target 以 compact format 儲存在 `bits` 欄位中。4 bytes 的 `bits` 解碼公式為：

$$\text{target} = \text{mantissa} \times 2^{8(\text{exponent} - 3)}$$

其中 exponent 是第一個 byte，mantissa 是後三個 bytes。

例如 `bits = 0x1903a30c`：
- exponent = `0x19` = 25
- mantissa = `0x03a30c`
- target = `0x03a30c × 2^{8(25-3)}` = `0x03a30c × 2^{176}`

### 成功機率

每次雜湊嘗試成功的機率為：

$$P(\text{success per hash}) = \frac{\text{target}}{2^{256}}$$

與 [難度調整](/bitcoin/consensus/difficulty-adjustment/) 中的 difficulty 的關係：

$$\text{difficulty} = \frac{\text{target}_{\max}}{\text{target}_{\text{current}}}$$

$$P(\text{success per hash}) = \frac{1}{\text{difficulty} \times 2^{32}}$$

### ASIC 演進

Bitcoin 挖礦硬體經歷了四代演進：

| 世代 | 時期 | 效率 (J/TH) | 說明 |
|------|------|-------------|------|
| **CPU** | 2009-2010 | ~10,000,000 | Satoshi 用 CPU 挖出 genesis block |
| **GPU** | 2010-2012 | ~1,000,000 | 平行運算優勢，hashrate 提升 ~100x |
| **FPGA** | 2012-2013 | ~100,000 | 可程式硬體，能效比改善 |
| **ASIC** | 2013-至今 | ~20-30 | 專用晶片，效率提升數萬倍 |

現代 ASIC（如 Bitmain S21 Hyd）可達 335 TH/s，能效比約 16 J/TH。

### Hashcash 的原始設計

Adam Back 的 Hashcash 使用單次 SHA-1（而非雙重 SHA-256），格式為：

```
X-Hashcash: 1:20:060408:adam@cypherspace.org::::0000000000000000000000002KCSP
```

其中 `20` 表示需要 20 bits 前導零。Bitcoin 繼承了「部分雜湊碰撞」的核心概念，但改用更安全的 SHA-256d 且使用連續的 target 值而非離散的前導零位數。

## 程式碼範例

```python
# Bitcoin PoW 模擬：挖礦核心邏輯
import hashlib
import struct
import time

def double_sha256(data: bytes) -> bytes:
    """Bitcoin 的雙重 SHA-256 雜湊"""
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()


def bits_to_target(bits: int) -> int:
    """將 compact bits 格式轉換為完整 target 值"""
    exponent = (bits >> 24) & 0xFF
    mantissa = bits & 0x007FFFFF
    if exponent <= 3:
        return mantissa >> (8 * (3 - exponent))
    return mantissa << (8 * (exponent - 3))


def mine_block(version, prev_hash, merkle_root, timestamp, bits):
    """模擬挖礦：搜尋有效 nonce"""
    target = bits_to_target(bits)
    nonce = 0

    while nonce < 0xFFFFFFFF:
        header = struct.pack(
            "<I32s32sIII",
            version,
            bytes.fromhex(prev_hash)[::-1],
            bytes.fromhex(merkle_root)[::-1],
            timestamp,
            bits,
            nonce,
        )
        hash_result = double_sha256(header)
        hash_int = int.from_bytes(hash_result, "little")

        if hash_int < target:
            return nonce, hash_result[::-1].hex()

        nonce += 1

    return None, None


# 低難度範例
start = time.time()
nonce, block_hash = mine_block(
    version=0x20000000,
    prev_hash="0" * 64,
    merkle_root="a" * 64,
    timestamp=int(time.time()),
    bits=0x207FFFFF,  # 極低難度供示範
)
elapsed = time.time() - start
print(f"Found nonce={nonce} in {elapsed:.3f}s, hash={block_hash}")
```

```javascript
// 驗證 Bitcoin 區塊的 PoW
const crypto = require("crypto");

function doubleSha256(buffer) {
  const first = crypto.createHash("sha256").update(buffer).digest();
  return crypto.createHash("sha256").update(first).digest();
}

function bitsToTarget(bits) {
  const exponent = (bits >> 24) & 0xff;
  const mantissa = BigInt(bits & 0x007fffff);
  if (exponent <= 3) {
    return mantissa >> BigInt(8 * (3 - exponent));
  }
  return mantissa << BigInt(8 * (exponent - 3));
}

function verifyPow(blockHeaderHex, bits) {
  const headerBuffer = Buffer.from(blockHeaderHex, "hex");
  const hash = doubleSha256(headerBuffer);

  // Bitcoin 雜湊以 little-endian 儲存
  const hashInt = BigInt("0x" + Buffer.from(hash).reverse().toString("hex"));
  const target = bitsToTarget(bits);

  return {
    valid: hashInt < target,
    hash: Buffer.from(hash).reverse().toString("hex"),
    target: target.toString(16),
    difficulty: Number(bitsToTarget(0x1d00ffff)) / Number(target),
  };
}
```

## 相關概念

- [SHA-256d](/bitcoin/cryptography/sha-256d/) - Bitcoin PoW 使用的雙重雜湊函式
- [難度調整](/bitcoin/consensus/difficulty-adjustment/) - 根據全網算力動態調整 target
- [Nakamoto Consensus](/bitcoin/consensus/nakamoto-consensus/) - PoW 所服務的整體共識機制
- [區塊結構](/bitcoin/data-structures/bitcoin-block-structure/) - 礦工建構的完整區塊格式
- [區塊驗證](/bitcoin/consensus/block-validation/) - 包含 PoW 驗證在內的完整檢查清單
- [減半](/bitcoin/consensus/halving/) - 礦工的區塊獎勵遞減機制
- [自私挖礦](/bitcoin/consensus/selfish-mining/) - 利用 PoW 機制的策略性攻擊
- [Hash Function 概述](/fundamentals/cryptography/hash-function-overview/) - 密碼學雜湊函式的基本性質
- [SHA-256](/fundamentals/cryptography/sha-256/) - SHA-256 演算法的技術細節
- [Beacon Chain (ETH)](/ethereum/consensus/beacon-chain/) - Ethereum 從 PoW 遷移至 PoS 的共識層
- [Ethash (ETH)](/ethereum/consensus/ethash/) - Ethereum 曾使用的 PoW 演算法（已棄用）
