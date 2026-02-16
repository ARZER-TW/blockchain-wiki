---
title: "BLS Signatures in Alpenglow"
description: "BLS12-381 signature aggregation for validator vote compression in Solana Alpenglow"
tags: [solana, cryptography, BLS, alpenglow, votor, signature-aggregation]
---

# BLS Signatures in Alpenglow

## 概述

Alpenglow 是 Solana 的下一代共識協議，引入 [BLS Signatures](/fundamentals/cryptography/bls-signatures/) 來實現驗證者投票的高效聚合。在現有的 [Tower BFT](/solana/consensus/tower-bft/) 中，每個驗證者的投票（vote）是獨立的 [Ed25519](/solana/cryptography/ed25519/) 簽名，佔用大量頻寬和計算資源。Alpenglow 的 Votor 子協議使用 [BLS12-381](/fundamentals/cryptography/bls12-381/) 曲線上的 BLS 簽名，將數千個驗證者投票壓縮為一個固定大小的聚合簽名，從根本上改變共識的可擴展性瓶頸。

## 核心原理

### Tower BFT 的瓶頸

在現有 Tower BFT 中：

- 每個驗證者每 slot 發送一個 vote 交易
- 每個 vote 包含一個 Ed25519 簽名（64 bytes）
- 約 2,000 個活躍驗證者 = 約 128 KB 的簽名資料/slot
- Leader 必須接收、驗證和打包所有 vote 交易
- 這些 vote 佔據了區塊空間的很大比例

### Alpenglow / Votor 架構

Alpenglow 重新設計投票機制：

1. **BLS 金鑰註冊**：驗證者除了 Ed25519 金鑰外，還註冊一對 BLS12-381 金鑰
2. **投票簽名**：驗證者用 BLS 私鑰對 slot/block hash 簽名
3. **投票收集**：Leader 或專門的 aggregator 收集投票
4. **簽名聚合**：將所有投票壓縮為一個聚合簽名
5. **證書廣播**：聚合簽名 + bitfield 作為 vote certificate 廣播

### BLS 聚合數學

所有驗證者 $v_1, \ldots, v_n$ 對同一個 slot hash $m$ 簽名：

$$\sigma_i = \text{sk}_i \cdot H(m) \in G_2$$

聚合所有簽名：

$$\sigma_{\text{agg}} = \sum_{i=1}^{n} \sigma_i$$

聚合公鑰（根據投票者集合動態計算）：

$$\text{pk}_{\text{agg}} = \sum_{i \in S} \text{pk}_i$$

其中 $S$ 是本 slot 投票的驗證者集合。

驗證：

$$e(G_1, \sigma_{\text{agg}}) = e(\text{pk}_{\text{agg}}, H(m))$$

一次配對運算驗證所有投票，無論投票者有多少。

### Vote Certificate 結構

聚合投票以 vote certificate 形式傳播：

| 欄位 | 大小 | 說明 |
|------|------|------|
| `slot` | 8 bytes | 投票的 slot 編號 |
| `block_hash` | 32 bytes | 投票的區塊雜湊 |
| `bitfield` | ~250 bytes | 位元欄位，標記哪些驗證者投票 |
| `aggregated_signature` | 96 bytes | BLS 聚合簽名 |

總計約 386 bytes，取代了原本約 128 KB 的獨立 vote 交易。壓縮比超過 99.7%。

### Stake-Weighted 聚合

驗證者的投票權重與其 stake 成正比。聚合公鑰需要按 stake 加權：

$$\text{pk}_{\text{weighted}} = \sum_{i \in S} w_i \cdot \text{pk}_i$$

其中 $w_i$ 是驗證者 $i$ 的正規化 stake 權重。

達到 finality 的條件：

$$\sum_{i \in S} \text{stake}_i \geq \frac{2}{3} \cdot \text{total\_stake}$$

### 鏈下分發機制

Alpenglow 的投票不再作為交易上鏈，而是走獨立的 gossip/turbine 通道：

1. 驗證者產生 BLS 簽名後透過專用網路層發送
2. Aggregator 收集到足夠權重後生成 certificate
3. Certificate 透過 Turbine 廣播
4. 區塊中只包含最終的 certificate（數百 bytes）

這釋放了大量區塊空間給用戶交易。

### Rogue Key Attack 防護

與通用 [BLS Signatures](/fundamentals/cryptography/bls-signatures/) 相同，Alpenglow 需要防止 rogue key attack：

- 驗證者在啟動時提交 **Proof of Possession (PoP)**：$\text{PoP} = \text{sk} \cdot H_{\text{PoP}}(\text{pk})$
- PoP 在 stake 啟動程式中驗證並記錄
- 使用與投票簽名不同的 Domain Separation Tag (DST)

### 與 Ethereum Beacon Chain BLS 的比較

| 面向 | Solana Alpenglow | [Ethereum Beacon Chain](/ethereum/consensus/beacon-chain/) |
|------|-----------------|----------------------------------------------|
| 曲線 | [BLS12-381](/fundamentals/cryptography/bls12-381/) | [BLS12-381](/ethereum/cryptography/bls12-381/) |
| 聚合範圍 | 全部驗證者（~2,000） | 每 committee（~128 個） |
| 聚合頻率 | 每 slot（~400ms） | 每 slot（12s） |
| 結果 | 單一 certificate | Attestation aggregate |
| 鏈上成本 | ~386 bytes/slot | 多個 attestation |
| 目的 | 投票壓縮 + 頻寬節省 | [Attestation](/ethereum/consensus/attestation/) 聚合 |

Ethereum 將驗證者分成 committee 再聚合，Alpenglow 則嘗試一次聚合所有驗證者的投票。

## 程式碼範例

### Rust（模擬 Alpenglow BLS 投票聚合）

```rust
use blst::min_pk::{SecretKey, PublicKey, Signature, AggregateSignature};
use blst::BLST_ERROR;
use rand::RngCore;

const DST: &[u8] = b"SOLANA_ALPENGLOW_VOTE_BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_";

struct Validator {
    sk: SecretKey,
    pk: PublicKey,
    stake: u64,
}

fn generate_validators(n: usize) -> Vec<Validator> {
    let mut rng = rand::thread_rng();
    (0..n).map(|_| {
        let mut ikm = [0u8; 32];
        rng.fill_bytes(&mut ikm);
        let sk = SecretKey::key_gen(&ikm, &[]).unwrap();
        let pk = sk.sk_to_pk();
        Validator { sk, pk, stake: 1000 }
    }).collect()
}

fn aggregate_votes(
    validators: &[Validator],
    block_hash: &[u8],
) -> (AggregateSignature, Vec<bool>) {
    let mut agg_sig = AggregateSignature::new();
    let mut bitfield = vec![false; validators.len()];

    for (i, v) in validators.iter().enumerate() {
        // 每個驗證者簽署 block hash
        let sig = v.sk.sign(block_hash, DST, &[]);
        agg_sig.add_signature(&sig, true).unwrap();
        bitfield[i] = true;
    }

    (agg_sig, bitfield)
}

fn verify_certificate(
    validators: &[Validator],
    bitfield: &[bool],
    agg_sig: &Signature,
    block_hash: &[u8],
) -> bool {
    // 收集投票者的公鑰
    let pks: Vec<&PublicKey> = validators.iter()
        .enumerate()
        .filter(|(i, _)| bitfield[*i])
        .map(|(_, v)| &v.pk)
        .collect();

    let pk_refs: Vec<&PublicKey> = pks.iter().copied().collect();
    let msgs: Vec<&[u8]> = vec![block_hash; pk_refs.len()];

    let result = agg_sig.fast_aggregate_verify(
        true, block_hash, DST, &pk_refs
    );
    result == BLST_ERROR::BLST_SUCCESS
}

fn main() {
    let validators = generate_validators(100);
    let block_hash = b"slot_42_block_hash_abc123";

    let (agg_sig, bitfield) = aggregate_votes(&validators, block_hash);
    let sig = agg_sig.to_signature();

    let valid = verify_certificate(&validators, &bitfield, &sig, block_hash);
    println!("Vote certificate valid: {}", valid);
    println!("Voters: {}/{}", bitfield.iter().filter(|&&b| b).count(), validators.len());
    println!("Certificate size: ~386 bytes (vs {} bytes individual)", validators.len() * 64);
}
```

### TypeScript（概念示意）

```typescript
// BLS 聚合投票的概念示意
// 實際 Alpenglow 實作在 Solana validator client (Rust)

interface VoteCertificate {
  slot: number;
  blockHash: Uint8Array;     // 32 bytes
  bitfield: Uint8Array;      // ceil(numValidators / 8) bytes
  aggregatedSig: Uint8Array; // 96 bytes (BLS G2 point)
}

// 模擬 vote certificate 大小計算
function certificateSize(numValidators: number): number {
  const slotBytes = 8;
  const hashBytes = 32;
  const bitfieldBytes = Math.ceil(numValidators / 8);
  const sigBytes = 96;
  return slotBytes + hashBytes + bitfieldBytes + sigBytes;
}

// 與個別投票大小比較
function individualVotesSize(numVoters: number): number {
  const ed25519SigBytes = 64;
  const pubkeyBytes = 32;
  const slotBytes = 8;
  return numVoters * (ed25519SigBytes + pubkeyBytes + slotBytes);
}

const numValidators = 2000;
const certSize = certificateSize(numValidators);
const indivSize = individualVotesSize(numValidators);
console.log(`BLS certificate: ${certSize} bytes`);
console.log(`Individual votes: ${indivSize} bytes`);
console.log(`Compression: ${((1 - certSize / indivSize) * 100).toFixed(1)}%`);
```

## 相關概念

- [BLS Signatures](/fundamentals/cryptography/bls-signatures/) - BLS 簽名的數學原理（配對、聚合、PoP 防護）
- [BLS12-381](/fundamentals/cryptography/bls12-381/) - BLS 簽名使用的底層曲線
- [Alpenglow](/solana/consensus/alpenglow/) - Solana 下一代共識協議全貌
- [Tower BFT](/solana/consensus/tower-bft/) - 現有共識協議（Alpenglow 的前身）
- [Proof of History](/solana/consensus/proof-of-history/) - PoH 時鐘在共識中的角色
- [Ed25519](/solana/cryptography/ed25519/) - Solana 現有的簽章演算法
- [BLS Signatures (Ethereum)](/ethereum/cryptography/bls-signatures/) - Ethereum Beacon Chain 的 BLS 用法
- [BLS12-381 (Ethereum)](/ethereum/cryptography/bls12-381/) - Ethereum 的 BLS12-381 實作
- [Attestation (Ethereum)](/ethereum/consensus/attestation/) - Ethereum 的投票聚合對比
- [Beacon Chain](/ethereum/consensus/beacon-chain/) - Ethereum 共識層架構
