import { useState, useRef, useCallback, useEffect } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { keccak256, textToBytes } from './utils/keccak256'

// ── Diff helper ──
function diffHex(a: string, b: string): boolean[] {
  return Array.from({ length: 64 }, (_, i) => a[i] !== b[i])
}

// ── Styles ──
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
  changed: '#f97316',
}

export default function HashDemo() {
  const [input, setInput] = useState('Hello, Ethereum!')
  const [prevHash, setPrevHash] = useState('')
  const [currentHash, setCurrentHash] = useState('')
  const [diffMask, setDiffMask] = useState<boolean[]>(new Array(64).fill(false))
  const [showAvalanche, setShowAvalanche] = useState(false)
  const [stats, setStats] = useState({ bitsChanged: 0, percentage: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const hashGridRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<gsap.core.Timeline | null>(null)

  // Compute hash on input change
  const computeHash = useCallback((text: string) => {
    const bytes = textToBytes(text)
    return keccak256(bytes)
  }, [])

  // Initialize
  useEffect(() => {
    const h = computeHash(input)
    setCurrentHash(h)
    setPrevHash(h)
  }, [])

  // Handle input change with animation
  const handleInputChange = useCallback((newValue: string) => {
    const oldHash = computeHash(input)
    const newHash = computeHash(newValue)

    setInput(newValue)
    setPrevHash(oldHash)
    setCurrentHash(newHash)

    // Calculate diff
    const mask = diffHex(oldHash, newHash)
    setDiffMask(mask)

    // Count changed bits (approximate from hex chars)
    const hexChanged = mask.filter(Boolean).length
    // Each hex char is 4 bits, estimate ~2 bits change per hex char diff
    const bitsChanged = Math.round(hexChanged * 2.5)
    const percentage = Math.round((bitsChanged / 256) * 100)
    setStats({ bitsChanged, percentage })

    if (oldHash !== newHash) {
      setShowAvalanche(true)
    }
  }, [input, computeHash])

  // GSAP animation for hash change
  useGSAP(() => {
    if (!showAvalanche || !hashGridRef.current) return

    // Kill previous timeline
    if (timelineRef.current) {
      timelineRef.current.kill()
    }

    const cells = hashGridRef.current.querySelectorAll('.hash-cell')
    const changedCells = hashGridRef.current.querySelectorAll('.hash-cell.changed')

    const tl = gsap.timeline({
      onComplete: () => {
        setTimeout(() => setShowAvalanche(false), 2000)
      }
    })

    // Flash all changed cells
    tl.fromTo(changedCells, {
      backgroundColor: COLORS.changed,
      scale: 1.2,
      color: '#fff',
    }, {
      backgroundColor: 'transparent',
      scale: 1,
      color: COLORS.text,
      duration: 0.8,
      ease: 'power2.out',
      stagger: {
        each: 0.02,
        from: 'random',
      },
    })

    timelineRef.current = tl
  }, { scope: containerRef, dependencies: [currentHash, showAvalanche] })

  // Render hex grid
  const renderHashGrid = (hash: string, mask: boolean[]) => {
    if (!hash) return null
    const chars = hash.split('')

    return (
      <div ref={hashGridRef} style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gap: '2px',
        fontFamily: 'var(--sl-font-system-mono, "JetBrains Mono", monospace)',
      }}>
        {chars.map((char, idx) => {
          const isChanged = mask[idx]
          return (
            <span
              key={idx}
              className={`hash-cell ${isChanged ? 'changed' : ''}`}
              style={{
                height: '32px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: 600,
                color: isChanged ? COLORS.changed : COLORS.text,
                background: isChanged ? `${COLORS.changed}22` : 'transparent',
                border: `1px solid ${isChanged ? COLORS.changed + '44' : COLORS.border}`,
                transition: 'color 0.3s, border-color 0.3s',
              }}
            >
              {char}
            </span>
          )
        })}
      </div>
    )
  }

  // Demo presets
  const presets = [
    { label: 'Hello, Ethereum!', value: 'Hello, Ethereum!' },
    { label: 'Hello, Ethereum.', value: 'Hello, Ethereum.' },
    { label: 'transfer(address,uint256)', value: 'transfer(address,uint256)' },
    { label: 'Transfer(address,address,uint256)', value: 'Transfer(address,address,uint256)' },
    { label: '', value: '' },
  ]

  return (
    <div
      ref={containerRef}
      className="not-content"
      style={{
        background: COLORS.bg,
        borderRadius: '12px',
        border: `1px solid ${COLORS.border}`,
        overflow: 'hidden',
        marginTop: '24px',
        marginBottom: '24px',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: `1px solid ${COLORS.border}`,
        background: COLORS.surface,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}>
        <div style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: COLORS.accent,
        }} />
        <span style={{
          fontSize: '15px',
          fontWeight: 600,
          color: COLORS.text,
        }}>
          Keccak-256 Hash Function
        </span>
        <span style={{
          fontSize: '13px',
          color: COLORS.textDim,
        }}>
          Interactive Demo
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0',
      }}>
        {/* Left: Input */}
        <div style={{
          padding: '24px',
          borderRight: `1px solid ${COLORS.border}`,
        }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.1em',
            color: COLORS.textDim,
            marginBottom: '12px',
          }}>
            Input
          </div>

          <textarea
            value={input}
            onChange={e => handleInputChange(e.target.value)}
            style={{
              width: '100%',
              height: '80px',
              padding: '12px',
              background: COLORS.surfaceLight,
              border: `1px solid ${COLORS.borderLight}`,
              borderRadius: '8px',
              color: COLORS.text,
              fontFamily: 'var(--sl-font-system-mono, monospace)',
              fontSize: '14px',
              resize: 'vertical' as const,
              outline: 'none',
              boxSizing: 'border-box' as const,
            }}
            placeholder="Type anything..."
          />

          {/* Byte count */}
          <div style={{
            fontSize: '12px',
            color: COLORS.textDim,
            marginTop: '8px',
          }}>
            {textToBytes(input).length} bytes
          </div>

          {/* Presets */}
          <div style={{
            marginTop: '16px',
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.1em',
            color: COLORS.textDim,
            marginBottom: '8px',
          }}>
            Quick Presets
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '6px',
          }}>
            {presets.map((p, i) => (
              <button
                key={i}
                onClick={() => handleInputChange(p.value)}
                style={{
                  padding: '6px 10px',
                  fontSize: '12px',
                  borderRadius: '6px',
                  border: `1px solid ${input === p.value ? COLORS.accent : COLORS.borderLight}`,
                  background: input === p.value ? COLORS.accentDim : 'transparent',
                  color: input === p.value ? COLORS.accent : COLORS.textDim,
                  cursor: 'pointer',
                  fontFamily: 'var(--sl-font-system-mono, monospace)',
                  textAlign: 'center' as const,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap' as const,
                }}
              >
                {p.label || '(empty)'}
              </button>
            ))}
          </div>

          {/* Avalanche stats */}
          {showAvalanche && (
            <div style={{
              marginTop: '20px',
              padding: '16px',
              background: `${COLORS.changed}11`,
              border: `1px solid ${COLORS.changed}33`,
              borderRadius: '8px',
            }}>
              <div style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.1em',
                color: COLORS.changed,
                marginBottom: '8px',
              }}>
                Avalanche Effect
              </div>
              <div style={{
                fontSize: '24px',
                fontWeight: 700,
                color: COLORS.changed,
              }}>
                ~{stats.bitsChanged} / 256 bits
              </div>
              <div style={{
                fontSize: '13px',
                color: COLORS.textDim,
                marginTop: '4px',
              }}>
                ~{stats.percentage}% of output bits changed
              </div>
              {/* Visual bar */}
              <div style={{
                marginTop: '10px',
                height: '6px',
                background: COLORS.surfaceLight,
                borderRadius: '3px',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${stats.percentage}%`,
                  height: '100%',
                  background: `linear-gradient(90deg, ${COLORS.changed}, ${COLORS.yellow})`,
                  borderRadius: '3px',
                  transition: 'width 0.5s ease-out',
                }} />
              </div>
            </div>
          )}
        </div>

        {/* Right: Output */}
        <div style={{ padding: '24px' }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.1em',
            color: COLORS.textDim,
            marginBottom: '12px',
          }}>
            Keccak-256 Output (256 bits = 64 hex chars)
          </div>

          {renderHashGrid(currentHash, diffMask)}

          {/* Full hash string */}
          <div style={{
            marginTop: '16px',
            padding: '10px 12px',
            background: COLORS.surfaceLight,
            borderRadius: '8px',
            fontFamily: 'var(--sl-font-system-mono, monospace)',
            fontSize: '12px',
            color: COLORS.accent,
            wordBreak: 'break-all' as const,
            lineHeight: 1.6,
          }}>
            0x{currentHash}
          </div>

          {/* Properties */}
          <div style={{
            marginTop: '20px',
            display: 'flex',
            flexDirection: 'column' as const,
            gap: '8px',
          }}>
            <PropertyRow
              label="Deterministic"
              desc="Same input always produces the same output"
              status="always"
            />
            <PropertyRow
              label="Fixed Output"
              desc="Always 256 bits (32 bytes) regardless of input size"
              status="256 bits"
            />
            <PropertyRow
              label="Pre-image Resistant"
              desc="Cannot reverse the hash to find the input"
              status="2^256"
            />
            <PropertyRow
              label="Collision Resistant"
              desc="Practically impossible to find two inputs with the same hash"
              status="2^128"
            />
          </div>
        </div>
      </div>

      {/* Footer: Ethereum use cases */}
      <div style={{
        padding: '16px 20px',
        borderTop: `1px solid ${COLORS.border}`,
        background: COLORS.surface,
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gridAutoRows: '1fr',
        gap: '10px',
      }}>
        <UseCaseChip
          label="Address Derivation"
          formula="addr = keccak256(pubkey)[12:]"
        />
        <UseCaseChip
          label="Function Selector"
          formula="selector = keccak256(sig)[:4]"
        />
        <UseCaseChip
          label="Storage Slot"
          formula="slot = keccak256(key . slot_num)"
        />
        <UseCaseChip
          label="State Trie"
          formula="node_hash = keccak256(RLP(node))"
        />
      </div>
    </div>
  )
}

function PropertyRow({ label, desc, status }: {
  readonly label: string
  readonly desc: string
  readonly status: string
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px',
      background: COLORS.surfaceLight,
      borderRadius: '6px',
      fontSize: '12px',
    }}>
      <div>
        <span style={{ color: COLORS.text, fontWeight: 600 }}>{label}</span>
        <span style={{ color: COLORS.textDim, marginLeft: '8px' }}>{desc}</span>
      </div>
      <span style={{
        color: COLORS.green,
        fontFamily: 'var(--sl-font-system-mono, monospace)',
        fontWeight: 600,
        fontSize: '11px',
        padding: '2px 8px',
        background: `${COLORS.green}18`,
        borderRadius: '4px',
      }}>
        {status}
      </span>
    </div>
  )
}

function UseCaseChip({ label, formula }: {
  readonly label: string
  readonly formula: string
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
      <span style={{
        fontSize: '12px',
        fontWeight: 600,
        color: COLORS.accent,
      }}>
        {label}
      </span>
      <code style={{
        fontSize: '11px',
        color: COLORS.textDim,
        fontFamily: 'var(--sl-font-system-mono, monospace)',
      }}>
        {formula}
      </code>
    </div>
  )
}
