import { useState, useRef, useCallback, useEffect } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { keccak256, bytesToHex, hexToBytes } from './utils/keccak256'

const COLORS = {
  bg: '#0a0e14',
  surface: '#111827',
  surfaceLight: '#1e293b',
  border: '#1e293b',
  borderLight: '#334155',
  text: '#e2e8f0',
  textDim: '#64748b',
  accent: '#627eea',
  accentDim: '#627eea44',
  green: '#4ade80',
  red: '#ef4444',
  yellow: '#fbbf24',
  orange: '#f97316',
  purple: '#a78bfa',
  cyan: '#22d3ee',
}

// ── Transaction types ──

interface TransactionFields {
  readonly type: number
  readonly chainId: number
  readonly nonce: number
  readonly to: string
  readonly value: string
  readonly gasLimit: number
  readonly maxFeePerGas: string
  readonly maxPriorityFeePerGas: string
  readonly data: string
}

interface SigningResult {
  readonly tx: TransactionFields
  readonly privateKey: string
  readonly publicKey: string
  readonly serialized: string
  readonly txHash: string
  readonly r: string
  readonly s: string
  readonly v: number
  readonly recoveredPubKey: string
  readonly recoveredAddress: string
  readonly senderAddress: string
  readonly signatureValid: boolean
}

// ── Minimal RLP encoding (sufficient for demonstration) ──

function rlpEncodeLength(len: number, offset: number): Uint8Array {
  if (len < 56) {
    return new Uint8Array([len + offset])
  }
  const hexLen = len.toString(16)
  const lenOfLen = hexLen.length / 2 + (hexLen.length % 2 ? 0.5 : 0)
  const lenBytes = Math.ceil(lenOfLen)
  const result = new Uint8Array(1 + lenBytes)
  result[0] = offset + 55 + lenBytes
  for (let i = lenBytes - 1; i >= 0; i--) {
    result[1 + i] = len & 0xff
    len = len >> 8
  }
  return result
}

function rlpEncodeBytes(data: Uint8Array): Uint8Array {
  if (data.length === 1 && data[0] < 0x80) {
    return data
  }
  const prefix = rlpEncodeLength(data.length, 0x80)
  const result = new Uint8Array(prefix.length + data.length)
  result.set(prefix)
  result.set(data, prefix.length)
  return result
}

function rlpEncodeList(items: ReadonlyArray<Uint8Array>): Uint8Array {
  let totalLen = 0
  for (const item of items) totalLen += item.length
  const prefix = rlpEncodeLength(totalLen, 0xc0)
  const result = new Uint8Array(prefix.length + totalLen)
  result.set(prefix)
  let offset = prefix.length
  for (const item of items) {
    result.set(item, offset)
    offset += item.length
  }
  return result
}

function numberToBytes(n: number): Uint8Array {
  if (n === 0) return new Uint8Array([])
  const hex = n.toString(16)
  const padded = hex.length % 2 ? '0' + hex : hex
  return hexToBytes(padded)
}

function bigintToBytes(hex: string): Uint8Array {
  const cleaned = hex.replace(/^0x/, '')
  if (cleaned === '0' || cleaned === '') return new Uint8Array([])
  const padded = cleaned.length % 2 ? '0' + cleaned : cleaned
  return hexToBytes(padded)
}

// ── Signing logic ──

function serializeType2Tx(tx: TransactionFields): Uint8Array {
  const items = [
    rlpEncodeBytes(numberToBytes(tx.chainId)),
    rlpEncodeBytes(numberToBytes(tx.nonce)),
    rlpEncodeBytes(bigintToBytes(tx.maxPriorityFeePerGas)),
    rlpEncodeBytes(bigintToBytes(tx.maxFeePerGas)),
    rlpEncodeBytes(numberToBytes(tx.gasLimit)),
    rlpEncodeBytes(hexToBytes(tx.to.replace(/^0x/, ''))),
    rlpEncodeBytes(bigintToBytes(tx.value)),
    rlpEncodeBytes(hexToBytes(tx.data.replace(/^0x/, ''))),
    rlpEncodeList([]), // accessList (empty)
  ]

  const rlpPayload = rlpEncodeList(items)
  // Type 2 envelope: 0x02 || RLP(...)
  const result = new Uint8Array(1 + rlpPayload.length)
  result[0] = 0x02
  result.set(rlpPayload, 1)
  return result
}

function performSigning(tx: TransactionFields, privKeyHex: string): SigningResult {
  const privBytes = hexToBytes(privKeyHex)
  const pubBytes = secp256k1.getPublicKey(privBytes, false) // 65 bytes uncompressed
  const pubHex = bytesToHex(pubBytes)

  // Derive sender address
  const pubForHash = pubBytes.slice(1)
  const addrHash = keccak256(pubForHash)
  const senderAddress = addrHash.slice(24)

  // Serialize transaction
  const serialized = serializeType2Tx(tx)
  const serializedHex = bytesToHex(serialized)

  // Hash the serialized transaction
  const txHash = keccak256(serialized)
  const txHashBytes = hexToBytes(txHash)

  // Sign — @noble/curves v2: sign() returns 64-byte Uint8Array (r || s)
  const rawSig = secp256k1.sign(txHashBytes, privBytes)
  const r = bytesToHex(rawSig.slice(0, 32))
  const s = bytesToHex(rawSig.slice(32, 64))

  // Determine recovery bit (v) by trying both values
  const pubCompressed = secp256k1.getPublicKey(privBytes, true)
  const pubCompressedHex = bytesToHex(pubCompressed)
  let v = 0
  for (let tryV = 0; tryV <= 1; tryV++) {
    const sig65 = new Uint8Array(65)
    sig65[0] = tryV
    sig65.set(rawSig, 1)
    try {
      const rec = secp256k1.recoverPublicKey(sig65, txHashBytes)
      if (bytesToHex(rec) === pubCompressedHex) {
        v = tryV
        break
      }
    } catch {
      // Try next recovery bit
    }
  }

  // ECRECOVER: recover public key from signature using determined v
  const sig65 = new Uint8Array(65)
  sig65[0] = v
  sig65.set(rawSig, 1)
  const recoveredCompressed = secp256k1.recoverPublicKey(sig65, txHashBytes)
  // Decompress: parse compressed point, serialize as uncompressed
  const recoveredPoint = secp256k1.Point.fromHex(bytesToHex(recoveredCompressed))
  const recoveredPubBytes = hexToBytes(recoveredPoint.toHex(false))
  const recoveredPubHex = bytesToHex(recoveredPubBytes)

  // Derive address from recovered public key
  const recoveredPubForHash = recoveredPubBytes.slice(1)
  const recoveredAddrHash = keccak256(recoveredPubForHash)
  const recoveredAddress = recoveredAddrHash.slice(24)

  return {
    tx,
    privateKey: privKeyHex,
    publicKey: pubHex,
    serialized: serializedHex,
    txHash,
    r,
    s,
    v,
    recoveredPubKey: recoveredPubHex,
    recoveredAddress,
    senderAddress,
    signatureValid: recoveredAddress === senderAddress,
  }
}

// ── Presets ──

const TX_PRESETS: ReadonlyArray<{
  readonly label: string
  readonly tx: TransactionFields
  readonly key: string
}> = [
  {
    label: 'Simple Transfer',
    tx: {
      type: 2,
      chainId: 1,
      nonce: 0,
      to: '70997970C51812dc3A010C7d01b50e0d17dc79C8',
      value: 'de0b6b3a7640000', // 1 ETH
      gasLimit: 21000,
      maxFeePerGas: '6fc23ac00', // 30 Gwei
      maxPriorityFeePerGas: '77359400', // 2 Gwei
      data: '',
    },
    key: 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  },
  {
    label: 'Contract Call',
    tx: {
      type: 2,
      chainId: 1,
      nonce: 42,
      to: 'dAC17F958D2ee523a2206206994597C13D831ec7',
      value: '0',
      gasLimit: 65000,
      maxFeePerGas: '9502f9000', // 40 Gwei
      maxPriorityFeePerGas: 'b2d05e00', // 3 Gwei
      data: 'a9059cbb000000000000000000000000abcdef1234567890abcdef1234567890abcdef120000000000000000000000000000000000000000000000000000000005f5e100',
    },
    key: '59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  },
  {
    label: 'Zero Value',
    tx: {
      type: 2,
      chainId: 1,
      nonce: 100,
      to: '0000000000000000000000000000000000000001',
      value: '0',
      gasLimit: 21000,
      maxFeePerGas: '3b9aca00', // 1 Gwei
      maxPriorityFeePerGas: '3b9aca00',
      data: '',
    },
    key: '0000000000000000000000000000000000000000000000000000000000000001',
  },
]

// ── Tab type ──
type TabMode = 'sign' | 'recover'

// ── Component ──

export default function SignatureFlow() {
  const [result, setResult] = useState<SigningResult | null>(null)
  const [selectedPreset, setSelectedPreset] = useState(0)
  const [tab, setTab] = useState<TabMode>('sign')
  const [animKey, setAnimKey] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const signPreset = useCallback((index: number) => {
    const preset = TX_PRESETS[index]
    try {
      const res = performSigning(preset.tx, preset.key)
      setResult(res)
      setSelectedPreset(index)
      setAnimKey(k => k + 1)
    } catch {
      // Signing failed
    }
  }, [])

  const signRandom = useCallback(() => {
    const preset = TX_PRESETS[selectedPreset]
    try {
      const privHex = bytesToHex(secp256k1.utils.randomSecretKey())
      const res = performSigning(preset.tx, privHex)
      setResult(res)
      setAnimKey(k => k + 1)
    } catch {
      // Signing failed
    }
  }, [selectedPreset])

  useEffect(() => {
    signPreset(0)
  }, [])

  // GSAP
  useGSAP(() => {
    if (!containerRef.current || animKey === 0) return
    const steps = containerRef.current.querySelectorAll('.pipeline-step')
    const arrows = containerRef.current.querySelectorAll('.pipeline-arrow')
    const tl = gsap.timeline()
    steps.forEach((step, i) => {
      tl.fromTo(
        step,
        { scale: 1.015, boxShadow: `inset 0 0 0 1px ${COLORS.accent}` },
        { scale: 1, boxShadow: 'inset 0 0 0 0px transparent', duration: 0.4, ease: 'power2.out' },
        i * 0.1,
      )
    })
    arrows.forEach((arrow, i) => {
      tl.fromTo(
        arrow,
        { opacity: 0.2 },
        { opacity: 1, duration: 0.3, ease: 'power2.out' },
        i * 0.1 + 0.05,
      )
    })
  }, { scope: containerRef, dependencies: [animKey] })

  return (
    <div ref={containerRef} className="not-content" style={{
      background: COLORS.bg,
      borderRadius: '12px',
      border: `1px solid ${COLORS.border}`,
      overflow: 'hidden',
      marginTop: '24px',
      marginBottom: '24px',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: `1px solid ${COLORS.border}`,
        background: COLORS.surface,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS.accent }} />
        <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>
          Transaction Signing Flow
        </span>
        <span style={{ fontSize: 13, color: COLORS.textDim }}>ECDSA Pipeline</span>
      </div>

      {/* Controls */}
      <div style={{ padding: '16px 20px 0' }}>
        {/* Preset buttons */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${TX_PRESETS.length + 1}, 1fr)`,
          gap: '8px',
          marginBottom: '12px',
        }}>
          {TX_PRESETS.map((p, i) => (
            <button
              type="button"
              key={p.label}
              onClick={() => signPreset(i)}
              style={{
                padding: '8px 12px',
                fontSize: 12,
                borderRadius: '8px',
                border: `1px solid ${selectedPreset === i ? COLORS.accent : COLORS.borderLight}`,
                background: selectedPreset === i ? COLORS.accentDim : 'transparent',
                color: selectedPreset === i ? COLORS.accent : COLORS.textDim,
                cursor: 'pointer',
                fontFamily: 'var(--sl-font-system-mono, monospace)',
              }}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={signRandom}
            style={{
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: '8px',
              border: `1px solid ${COLORS.borderLight}`,
              background: 'transparent',
              color: COLORS.textDim,
              cursor: 'pointer',
              fontFamily: 'var(--sl-font-system-mono, monospace)',
            }}
          >
            Random Key
          </button>
        </div>

        {/* Tab selector */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
          <TabButton
            label="Sign Transaction"
            active={tab === 'sign'}
            onClick={() => setTab('sign')}
          />
          <TabButton
            label="ECRECOVER"
            active={tab === 'recover'}
            onClick={() => setTab('recover')}
          />
        </div>
      </div>

      {/* Pipeline */}
      {result && (
        <div style={{ padding: '0 20px 20px' }}>
          {tab === 'sign' ? (
            <SignPipeline result={result} />
          ) : (
            <RecoverPipeline result={result} />
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{
        padding: '16px 20px',
        borderTop: `1px solid ${COLORS.border}`,
        background: COLORS.surface,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridAutoRows: '1fr',
        gap: '10px',
      }}>
        <FooterChip label="Type 2 (EIP-1559)" desc="0x02 || RLP([chainId, nonce, ...])" />
        <FooterChip label="No 'from' field" desc="Sender derived via ECRECOVER from (r,s,v)" />
        <FooterChip label="EIP-155 Replay Protection" desc="chainId prevents cross-chain replay" />
      </div>
    </div>
  )
}

// ── Sign Pipeline ──

function SignPipeline({ result }: { readonly result: SigningResult }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0' }}>
      {/* Step 1: Raw TX Fields */}
      <Step n={1} title="Raw Transaction Fields" sub="Type 2 (EIP-1559)"
        note="Transaction fields before serialization. Note: no 'from' field -- sender is derived from signature.">
        <TxFieldsDisplay tx={result.tx} />
      </Step>

      <Arrow label="Type 2 envelope: 0x02 || RLP([chainId, nonce, maxPriorityFee, maxFee, gas, to, value, data, accessList])" />

      {/* Step 2: Serialized TX */}
      <Step n={2} title="Serialized Transaction" sub={`${Math.ceil(result.serialized.length / 2)} bytes`}
        note="EIP-2718 typed transaction: type byte (0x02) prepended to RLP-encoded fields. This is the unsigned transaction payload.">
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '6px' }}>
          <FieldRow label="type" value="02" highlight />
          <FieldRow label="RLP" value={result.serialized.slice(2)} truncate />
        </div>
      </Step>

      <Arrow label="txHash = Keccak-256(0x02 || RLP(...))" />

      {/* Step 3: Transaction Hash */}
      <Step n={3} title="Transaction Hash (signing input)" sub="256 bits (32 bytes)"
        note="Keccak-256 of the serialized unsigned transaction. This is the value that gets signed by ECDSA.">
        <Hex value={result.txHash} color={COLORS.yellow} />
      </Step>

      <Arrow label="ECDSA sign: k random, R=kG, r=R.x mod n, s=k^{-1}(z+r*sk) mod n" />

      {/* Step 4: Private Key */}
      <Step n={4} title="ECDSA Signing" sub="secp256k1 curve"
        note="The private key signs the hash. r = x-coordinate of random point R=kG. s = cryptographic proof of private key knowledge.">
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '6px' }}>
          <FieldRow label="sk" value={result.privateKey} dimLabel />
          <div style={{ height: 1, background: COLORS.border, margin: '4px 0' }} />
          <FieldRow label="r" value={result.r} />
          <FieldRow label="s" value={result.s} />
          <FieldRow label="v" value={String(result.v)} highlight />
        </div>
        <div style={{ marginTop: '8px', fontSize: 11, color: COLORS.textDim }}>
          v (recovery ID) = {result.v} -- enables public key recovery without knowing the public key
        </div>
      </Step>

      <Arrow label="Assemble: signed TX = 0x02 || RLP([...fields, v, r, s])" />

      {/* Step 5: Signed TX */}
      <Step n={5} title="Signed Transaction" sub="Ready to broadcast"
        note="The signed transaction includes the original fields plus (v, r, s). Any node can now recover the sender address.">
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '8px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
            <StatusBadge label="Type 2" color={COLORS.accent} />
            <StatusBadge label={`chainId: ${result.tx.chainId}`} color={COLORS.cyan} />
            <StatusBadge label={`nonce: ${result.tx.nonce}`} color={COLORS.textDim} />
          </div>
          <div style={{
            fontFamily: 'var(--sl-font-system-mono, monospace)',
            fontSize: 11,
            color: COLORS.green,
            padding: '8px 10px',
            background: `${COLORS.green}11`,
            borderRadius: '6px',
            lineHeight: 1.6,
          }}>
            Sender: 0x{result.senderAddress}
          </div>
        </div>
      </Step>
    </div>
  )
}

// ── Recover Pipeline ──

function RecoverPipeline({ result }: { readonly result: SigningResult }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0' }}>
      {/* Step 1: Extract signature */}
      <Step n={1} title="Extract Signature from Signed TX" sub="(r, s, v)"
        note="Parse the signed transaction to extract the ECDSA signature components.">
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '6px' }}>
          <FieldRow label="r" value={result.r} />
          <FieldRow label="s" value={result.s} />
          <FieldRow label="v" value={String(result.v)} highlight />
        </div>
      </Step>

      <Arrow label="Re-serialize unsigned TX fields, compute hash" />

      {/* Step 2: Reconstruct hash */}
      <Step n={2} title="Reconstruct Transaction Hash" sub="Keccak-256"
        note="Strip the signature, re-serialize the unsigned fields, and hash. This must match the original signing input.">
        <Hex value={result.txHash} color={COLORS.yellow} />
      </Step>

      <Arrow label="ECRECOVER: Q = r^{-1}(s*R - z*G) where R is recovered from (r, v)" />

      {/* Step 3: ECRECOVER */}
      <Step n={3} title="ECRECOVER (Public Key Recovery)" sub="secp256k1 point recovery"
        note="From r, recover curve point R (v selects which of two possible y-values). Then compute Q = r^{-1}(sR - zG). This is the signer's public key.">
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '6px' }}>
          <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: '4px' }}>
            Step A: R.x = r, R.y selected by v = {result.v} (y parity)
          </div>
          <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: '4px' }}>
            Step B: Q = r^(-1) * (s*R - z*G)
          </div>
          <FieldRow label="PK" value={result.recoveredPubKey} truncate />
        </div>
      </Step>

      <Arrow label="address = keccak256(pubkey[1:])[12:]" />

      {/* Step 4: Derive address */}
      <Step n={4} title="Derive Sender Address" sub="Last 20 bytes of keccak256(pubkey)"
        note="Hash the recovered public key (without 04 prefix), take the last 20 bytes. This is the transaction sender.">
        <div style={{
          fontFamily: 'var(--sl-font-system-mono, monospace)',
          fontSize: 14,
          fontWeight: 600,
          color: COLORS.accent,
          padding: '10px 14px',
          background: COLORS.surfaceLight,
          borderRadius: '8px',
          wordBreak: 'break-all' as const,
        }}>
          0x{result.recoveredAddress}
        </div>
      </Step>

      <Arrow label="Compare recovered address with expected sender" />

      {/* Step 5: Verification */}
      <Step n={5} title="Signature Verification" sub={result.signatureValid ? 'VALID' : 'INVALID'}
        note="If the recovered address matches the expected sender, the signature is valid. The sender provably controlled the private key.">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 14px',
          background: result.signatureValid ? `${COLORS.green}11` : `${COLORS.red}11`,
          border: `1px solid ${result.signatureValid ? COLORS.green : COLORS.red}33`,
          borderRadius: '8px',
        }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: result.signatureValid ? `${COLORS.green}22` : `${COLORS.red}22`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            fontWeight: 700,
            color: result.signatureValid ? COLORS.green : COLORS.red,
          }}>
            {result.signatureValid ? 'OK' : 'X'}
          </div>
          <div>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: result.signatureValid ? COLORS.green : COLORS.red,
            }}>
              {result.signatureValid ? 'Signature Valid' : 'Signature Invalid'}
            </div>
            <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: '2px' }}>
              recovered 0x{result.recoveredAddress.slice(0, 8)}... {result.signatureValid ? '==' : '!='} sender 0x{result.senderAddress.slice(0, 8)}...
            </div>
          </div>
        </div>
      </Step>
    </div>
  )
}

// ── TX Fields display ──

function TxFieldsDisplay({ tx }: { readonly tx: TransactionFields }) {
  const valueEth = parseInt(tx.value, 16) / 1e18
  const maxFeeGwei = parseInt(tx.maxFeePerGas, 16) / 1e9
  const maxPriorityGwei = parseInt(tx.maxPriorityFeePerGas, 16) / 1e9

  const fields = [
    { name: 'chainId', value: String(tx.chainId), color: COLORS.cyan },
    { name: 'nonce', value: String(tx.nonce), color: COLORS.textDim },
    { name: 'to', value: `0x${tx.to.slice(0, 8)}...${tx.to.slice(-6)}`, color: COLORS.accent },
    { name: 'value', value: `${valueEth} ETH`, color: COLORS.green },
    { name: 'gasLimit', value: tx.gasLimit.toLocaleString(), color: COLORS.orange },
    { name: 'maxFeePerGas', value: `${maxFeeGwei.toFixed(1)} Gwei`, color: COLORS.orange },
    { name: 'maxPriorityFee', value: `${maxPriorityGwei.toFixed(1)} Gwei`, color: COLORS.orange },
    { name: 'data', value: tx.data ? `${tx.data.length / 2} bytes` : '(empty)', color: COLORS.textDim },
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '4px',
    }}>
      {fields.map(f => (
        <div key={f.name} style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '4px 8px',
          background: COLORS.surfaceLight,
          borderRadius: '4px',
          fontSize: 11,
          fontFamily: 'var(--sl-font-system-mono, monospace)',
        }}>
          <span style={{ color: COLORS.textDim }}>{f.name}</span>
          <span style={{ color: f.color, fontWeight: 600 }}>{f.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Sub-components ──

function Step({ n, title, sub, note, children }: {
  readonly n: number
  readonly title: string
  readonly sub: string
  readonly note: string
  readonly children: React.ReactNode
}) {
  return (
    <div className="pipeline-step" style={{
      padding: '16px',
      background: COLORS.surface,
      border: `1px solid ${COLORS.border}`,
      borderRadius: '10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <span style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: COLORS.accentDim,
          color: COLORS.accent,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
        }}>
          {n}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>{title}</span>
        <span style={{ fontSize: 12, color: COLORS.textDim }}>{sub}</span>
      </div>
      {children}
      <div style={{ marginTop: '8px', fontSize: 11, color: COLORS.textDim, lineHeight: 1.6 }}>
        {note}
      </div>
    </div>
  )
}

function Arrow({ label }: { readonly label: string }) {
  return (
    <div className="pipeline-arrow" style={{
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      padding: '6px 0',
      gap: '3px',
    }}>
      <div style={{ width: 2, height: 12, background: COLORS.borderLight }} />
      <div style={{
        fontSize: 11,
        color: COLORS.textDim,
        fontFamily: 'var(--sl-font-system-mono, monospace)',
        textAlign: 'center' as const,
        padding: '3px 10px',
        background: `${COLORS.accent}11`,
        borderRadius: '4px',
        border: `1px solid ${COLORS.accent}22`,
        maxWidth: '100%',
      }}>
        {label}
      </div>
      <div style={{
        width: 0,
        height: 0,
        borderLeft: '5px solid transparent',
        borderRight: '5px solid transparent',
        borderTop: `6px solid ${COLORS.borderLight}`,
      }} />
    </div>
  )
}

function Hex({ value, color }: {
  readonly value: string
  readonly color?: string
}) {
  return (
    <code style={{
      display: 'block',
      fontFamily: 'var(--sl-font-system-mono, monospace)',
      fontSize: 13,
      lineHeight: 1.8,
      color: color ?? COLORS.text,
      wordBreak: 'break-all' as const,
      fontWeight: color ? 600 : 400,
    }}>
      {value}
    </code>
  )
}

function FieldRow({ label, value, highlight, dimLabel, truncate }: {
  readonly label: string
  readonly value: string
  readonly highlight?: boolean
  readonly dimLabel?: boolean
  readonly truncate?: boolean
}) {
  const displayValue = truncate && value.length > 40
    ? value.slice(0, 20) + '...' + value.slice(-20)
    : value

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        color: dimLabel ? `${COLORS.textDim}88` : COLORS.textDim,
        minWidth: 32,
        textAlign: 'right' as const,
        fontFamily: 'var(--sl-font-system-mono, monospace)',
      }}>
        {label}
      </span>
      <code style={{
        fontSize: 12,
        lineHeight: 1.6,
        color: highlight ? COLORS.accent : COLORS.text,
        fontWeight: highlight ? 600 : 400,
        wordBreak: 'break-all' as const,
        fontFamily: 'var(--sl-font-system-mono, monospace)',
      }}>
        {displayValue}
      </code>
    </div>
  )
}

function StatusBadge({ label, color }: {
  readonly label: string
  readonly color: string
}) {
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: '4px',
      background: `${color}18`,
      color,
      fontFamily: 'var(--sl-font-system-mono, monospace)',
    }}>
      {label}
    </span>
  )
}

function TabButton({ label, active, onClick }: {
  readonly label: string
  readonly active: boolean
  readonly onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 16px',
        fontSize: 12,
        fontWeight: 600,
        borderRadius: '8px',
        border: `1px solid ${active ? COLORS.accent : COLORS.borderLight}`,
        background: active ? COLORS.accentDim : 'transparent',
        color: active ? COLORS.accent : COLORS.textDim,
        cursor: 'pointer',
        fontFamily: 'var(--sl-font-system-mono, monospace)',
      }}
    >
      {label}
    </button>
  )
}

function FooterChip({ label, desc }: {
  readonly label: string
  readonly desc: string
}) {
  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: '6px',
      border: `1px solid ${COLORS.borderLight}`,
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '4px',
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.accent }}>{label}</span>
      <span style={{ fontSize: 11, color: COLORS.textDim, lineHeight: 1.4 }}>{desc}</span>
    </div>
  )
}
