import { useState, useRef, useCallback, useEffect } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { keccak256, textToBytes, bytesToHex, hexToBytes } from './utils/keccak256'

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
}

interface PipelineData {
  readonly privateKey: string
  readonly publicKey: string
  readonly pubKeyX: string
  readonly pubKeyY: string
  readonly hash: string
  readonly rawAddress: string
  readonly checksumHash: string
  readonly checksumAddress: string
}

function derivePipeline(privHex: string): PipelineData {
  const privBytes = hexToBytes(privHex)
  const pubBytes = secp256k1.getPublicKey(privBytes, false)
  const pubHex = bytesToHex(pubBytes)
  const pubForHash = pubBytes.slice(1)
  const hash = keccak256(pubForHash)
  const rawAddress = hash.slice(24)
  const addrLower = rawAddress.toLowerCase()
  const checksumHash = keccak256(textToBytes(addrLower))
  const checksumAddress = addrLower.split('').map((char, i) => {
    if (/[a-f]/.test(char) && parseInt(checksumHash[i], 16) >= 8) {
      return char.toUpperCase()
    }
    return char
  }).join('')

  return {
    privateKey: privHex,
    publicKey: pubHex,
    pubKeyX: pubHex.slice(2, 66),
    pubKeyY: pubHex.slice(66),
    hash,
    rawAddress,
    checksumHash,
    checksumAddress,
  }
}

const PRESETS = [
  { label: 'Hardhat #0', value: 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' },
  { label: 'Hardhat #1', value: '59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' },
  { label: 'Key = 1', value: '0000000000000000000000000000000000000000000000000000000000000001' },
  { label: 'Key = 2', value: '0000000000000000000000000000000000000000000000000000000000000002' },
] as const

export default function AddressPipeline() {
  const [data, setData] = useState<PipelineData | null>(null)
  const [privKeyInput, setPrivKeyInput] = useState('')
  const [error, setError] = useState('')
  const [animKey, setAnimKey] = useState(0)
  const [isRandomKey, setIsRandomKey] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const tryDerive = useCallback((privHex: string, animate: boolean) => {
    try {
      setData(derivePipeline(privHex))
      setError('')
      if (animate) setAnimKey(k => k + 1)
    } catch {
      setError('Invalid private key')
      setData(null)
    }
  }, [])

  const generateRandom = useCallback(() => {
    try {
      const privHex = bytesToHex(secp256k1.utils.randomSecretKey())
      setPrivKeyInput(privHex)
      setIsRandomKey(true)
      tryDerive(privHex, true)
    } catch (e) {
      setError('Failed to generate key')
    }
  }, [tryDerive])

  const handleInputChange = useCallback((value: string) => {
    const cleaned = value.replace(/^0x/, '').replace(/\s/g, '').toLowerCase()
    setPrivKeyInput(cleaned)
    setIsRandomKey(false)
    if (cleaned.length === 64 && /^[0-9a-f]{64}$/.test(cleaned)) {
      tryDerive(cleaned, false)
    } else if (cleaned.length > 0) {
      setError(`${cleaned.length}/64 hex characters`)
    } else {
      setError('')
      setData(null)
    }
  }, [tryDerive])

  useEffect(() => {
    tryDerive(PRESETS[0].value, true)
    setPrivKeyInput(PRESETS[0].value)
  }, [])

  useGSAP(() => {
    if (!data || !containerRef.current || animKey === 0) return
    const steps = containerRef.current.querySelectorAll('.pipeline-step')
    const arrows = containerRef.current.querySelectorAll('.pipeline-arrow')
    const tl = gsap.timeline()
    steps.forEach((step, i) => {
      tl.fromTo(step,
        { scale: 1.015, boxShadow: `inset 0 0 0 1px ${COLORS.accent}` },
        { scale: 1, boxShadow: 'inset 0 0 0 0px transparent', duration: 0.4, ease: 'power2.out' },
        i * 0.12,
      )
    })
    arrows.forEach((arrow, i) => {
      tl.fromTo(arrow,
        { opacity: 0.2 },
        { opacity: 1, duration: 0.3, ease: 'power2.out' },
        i * 0.12 + 0.06,
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
          Ethereum Address Derivation
        </span>
        <span style={{ fontSize: 13, color: COLORS.textDim }}>Interactive Pipeline</span>
      </div>

      {/* Input section */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '8px',
          marginBottom: '12px',
        }}>
          <button type="button" onClick={generateRandom} style={{
            padding: '8px 12px',
            fontSize: 12,
            fontWeight: 600,
            borderRadius: '8px',
            border: `1px solid ${isRandomKey ? COLORS.accent : COLORS.borderLight}`,
            background: isRandomKey ? COLORS.accentDim : 'transparent',
            color: isRandomKey ? COLORS.accent : COLORS.textDim,
            cursor: 'pointer',
            fontFamily: 'var(--sl-font-system-mono, monospace)',
          }}>
            Random Key
          </button>
          {PRESETS.map(p => (
            <button
              type="button"
              key={p.label}
              onClick={() => { setPrivKeyInput(p.value); setIsRandomKey(false); tryDerive(p.value, true) }}
              style={{
                padding: '8px 12px',
                fontSize: 12,
                borderRadius: '8px',
                border: `1px solid ${!isRandomKey && data?.privateKey === p.value ? COLORS.accent : COLORS.borderLight}`,
                background: !isRandomKey && data?.privateKey === p.value ? COLORS.accentDim : 'transparent',
                color: !isRandomKey && data?.privateKey === p.value ? COLORS.accent : COLORS.textDim,
                cursor: 'pointer',
                fontFamily: 'var(--sl-font-system-mono, monospace)',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <Label text="Private Key (hex)" />
        <input
          type="text"
          value={privKeyInput}
          onChange={e => handleInputChange(e.target.value)}
          placeholder="Paste 64-character hex private key..."
          spellCheck={false}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: COLORS.surfaceLight,
            border: `1px solid ${error ? COLORS.red + '66' : COLORS.borderLight}`,
            borderRadius: '8px',
            color: COLORS.text,
            fontFamily: 'var(--sl-font-system-mono, monospace)',
            fontSize: 13,
            outline: 'none',
            boxSizing: 'border-box' as const,
          }}
        />
        {error && <div style={{ fontSize: 11, color: COLORS.red, marginTop: '4px' }}>{error}</div>}
      </div>

      {/* Pipeline */}
      {data ? (
        <div style={{ padding: '20px' }}>
          {/* Step 1: Private Key */}
          <Step n={1} title="Private Key" sub="256 bits (32 bytes)"
            note="Random integer in [1, n-1] where n = secp256k1 curve order">
            <Hex value={data.privateKey} />
          </Step>

          <Arrow label="secp256k1 scalar multiplication: PK = sk * G" />

          {/* Step 2: Public Key */}
          <Step n={2} title="Public Key (Uncompressed)" sub="520 bits (65 bytes)"
            note="Point on secp256k1 curve. Prefix 04 = uncompressed format">
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '6px' }}>
              <HexRow label="prefix" value="04" dim />
              <HexRow label="x" value={data.pubKeyX} />
              <HexRow label="y" value={data.pubKeyY} />
            </div>
          </Step>

          <Arrow label="Keccak-256 (hash 64 bytes, skip 04 prefix)" />

          {/* Step 3: Keccak-256 Hash */}
          <Step n={3} title="Keccak-256 Hash" sub="256 bits (32 bytes)"
            note="First 12 bytes discarded, last 20 bytes become the address">
            <div style={{ fontFamily: 'var(--sl-font-system-mono, monospace)', fontSize: 13, lineHeight: 1.8, wordBreak: 'break-all' as const }}>
              <span style={{ color: COLORS.textDim, opacity: 0.45 }}>{data.hash.slice(0, 24)}</span>
              <span style={{ color: COLORS.accent, fontWeight: 600 }}>{data.hash.slice(24)}</span>
            </div>
            <div style={{ display: 'flex', gap: '16px', marginTop: '6px' }}>
              <Legend color={COLORS.textDim} opacity={0.45} text="discard (12 bytes)" />
              <Legend color={COLORS.accent} text="keep (20 bytes)" />
            </div>
          </Step>

          <Arrow label="Take last 20 bytes: hash[12:]" />

          {/* Step 4: Raw Address */}
          <Step n={4} title="Raw Address" sub="160 bits (20 bytes)"
            note="Lowercase hex, no error detection">
            <Hex value={`0x${data.rawAddress}`} />
          </Step>

          <Arrow label="EIP-55: keccak256(lowercase_hex) as checksum signal" />

          {/* Step 5: Checksum Address */}
          <Step n={5} title="Checksum Address (EIP-55)" sub="Mixed-case encoding"
            note="If hash nibble >= 8 and character is a-f, uppercase it. Catches ~99.98% of typos">
            <ChecksumDetail address={data.checksumAddress} checksumHash={data.checksumHash} />
            <div style={{
              marginTop: '10px',
              padding: '10px 14px',
              background: COLORS.surfaceLight,
              borderRadius: '8px',
              fontFamily: 'var(--sl-font-system-mono, monospace)',
              fontSize: 14,
              fontWeight: 600,
              color: COLORS.accent,
              wordBreak: 'break-all' as const,
            }}>
              0x{data.checksumAddress}
            </div>
          </Step>
        </div>
      ) : !error ? (
        <div style={{ padding: '60px 20px', textAlign: 'center' as const, color: COLORS.textDim, fontSize: 14 }}>
          Click "Generate Random Key" or paste a private key to start
        </div>
      ) : null}

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
        <FooterChip label="EOA Identity" desc="Every externally-owned account" />
        <FooterChip label="Contract Address" desc="CREATE: keccak256(sender, nonce)[12:]" />
        <FooterChip label="Error Detection" desc="EIP-55 catches ~99.98% of typos" />
      </div>
    </div>
  )
}

// ── Sub-components ──

function Label({ text }: { readonly text: string }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.1em',
      color: COLORS.textDim,
      marginBottom: '6px',
    }}>
      {text}
    </div>
  )
}

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
          width: 24, height: 24, borderRadius: '50%',
          background: COLORS.accentDim, color: COLORS.accent,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, flexShrink: 0,
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
      display: 'flex', flexDirection: 'column' as const,
      alignItems: 'center', padding: '6px 0', gap: '3px',
    }}>
      <div style={{ width: 2, height: 12, background: COLORS.borderLight }} />
      <div style={{
        fontSize: 11, color: COLORS.textDim,
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
        width: 0, height: 0,
        borderLeft: '5px solid transparent',
        borderRight: '5px solid transparent',
        borderTop: `6px solid ${COLORS.borderLight}`,
      }} />
    </div>
  )
}

function Hex({ value }: { readonly value: string }) {
  return (
    <code style={{
      display: 'block',
      fontFamily: 'var(--sl-font-system-mono, monospace)',
      fontSize: 13, lineHeight: 1.8,
      color: COLORS.text,
      wordBreak: 'break-all' as const,
    }}>
      {value}
    </code>
  )
}

function HexRow({ label, value, dim }: {
  readonly label: string
  readonly value: string
  readonly dim?: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
      <span style={{
        fontSize: 11, fontWeight: 600, color: COLORS.textDim,
        minWidth: 42, textAlign: 'right' as const,
        fontFamily: 'var(--sl-font-system-mono, monospace)',
      }}>
        {label}
      </span>
      <code style={{
        fontSize: 12, lineHeight: 1.6,
        color: dim ? COLORS.textDim : COLORS.text,
        opacity: dim ? 0.5 : 1,
        wordBreak: 'break-all' as const,
        fontFamily: 'var(--sl-font-system-mono, monospace)',
      }}>
        {value}
      </code>
    </div>
  )
}

function Legend({ color, text, opacity }: {
  readonly color: string
  readonly text: string
  readonly opacity?: number
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ width: 8, height: 8, borderRadius: 2, background: color, opacity: opacity ?? 1 }} />
      <span style={{ fontSize: 10, color: COLORS.textDim }}>{text}</span>
    </div>
  )
}

function ChecksumDetail({ address, checksumHash }: {
  readonly address: string
  readonly checksumHash: string
}) {
  return (
    <div style={{
      background: COLORS.surfaceLight,
      borderRadius: '8px',
      padding: '12px',
      overflowX: 'auto' as const,
    }}>
      <Label text="Checksum signal (first 40 nibbles of hash)" />

      {/* Hash nibbles */}
      <div style={{
        fontFamily: 'var(--sl-font-system-mono, monospace)',
        fontSize: 11, letterSpacing: '0.6px',
        whiteSpace: 'nowrap' as const,
        marginBottom: '2px',
      }}>
        {checksumHash.slice(0, 40).split('').map((nibble, i) => {
          const isHigh = parseInt(nibble, 16) >= 8
          return (
            <span key={i} style={{
              color: isHigh ? COLORS.accent : COLORS.textDim,
              fontWeight: isHigh ? 700 : 400,
            }}>
              {nibble}
            </span>
          )
        })}
      </div>

      {/* Indicator row */}
      <div style={{
        fontFamily: 'var(--sl-font-system-mono, monospace)',
        fontSize: 11, letterSpacing: '0.6px',
        whiteSpace: 'nowrap' as const,
        marginBottom: '2px',
      }}>
        {address.split('').map((char, i) => {
          const isLetter = /[a-f]/i.test(char)
          const isHigh = parseInt(checksumHash[i], 16) >= 8
          const activated = isLetter && isHigh
          return (
            <span key={i} style={{
              color: activated ? COLORS.accent : COLORS.borderLight,
            }}>
              {activated ? '\u2191' : '\u00b7'}
            </span>
          )
        })}
      </div>

      {/* Address chars */}
      <div style={{
        fontFamily: 'var(--sl-font-system-mono, monospace)',
        fontSize: 11, letterSpacing: '0.6px',
        whiteSpace: 'nowrap' as const,
      }}>
        {address.split('').map((char, i) => {
          const isUpper = char !== char.toLowerCase()
          return (
            <span key={i} style={{
              color: isUpper ? COLORS.accent : COLORS.text,
              fontWeight: isUpper ? 700 : 400,
            }}>
              {char}
            </span>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '10px', fontSize: 10, color: COLORS.textDim }}>
        <span><span style={{ color: COLORS.accent, fontWeight: 700 }}>Highlighted</span>{' = nibble >= 8, letter UPPERCASED'}</span>
        <span>{'Dim = nibble < 8 or digit, unchanged'}</span>
      </div>
    </div>
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
