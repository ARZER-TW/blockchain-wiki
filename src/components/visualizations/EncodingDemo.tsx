import { useState, useRef, useCallback } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'

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
  orange: '#f97316',
  purple: '#a78bfa',
  cyan: '#22d3ee',
}

// ── RLP encoding types ──
type RlpInput = string | ReadonlyArray<RlpInput>

interface EncodedSegment {
  readonly bytes: ReadonlyArray<number>
  readonly role: 'prefix' | 'length' | 'data'
  readonly description: string
}

interface RlpResult {
  readonly segments: ReadonlyArray<EncodedSegment>
  readonly totalBytes: ReadonlyArray<number>
  readonly rule: string
  readonly ruleDescription: string
}

// ── RLP encoder with annotation ──
function rlpEncode(input: RlpInput): RlpResult {
  if (typeof input === 'string') {
    return rlpEncodeString(stringToBytes(input))
  }
  return rlpEncodeList(input)
}

function stringToBytes(str: string): ReadonlyArray<number> {
  return Array.from(new TextEncoder().encode(str))
}

function rlpEncodeString(data: ReadonlyArray<number>): RlpResult {
  if (data.length === 1 && data[0] < 0x80) {
    return {
      segments: [{
        bytes: [data[0]],
        role: 'data',
        description: `Single byte 0x${toHex(data[0])} (< 0x80), output directly`,
      }],
      totalBytes: [data[0]],
      rule: '0x00-0x7f',
      ruleDescription: `Single byte in [0x00, 0x7f]: no prefix needed`,
    }
  }

  if (data.length === 0) {
    return {
      segments: [{
        bytes: [0x80],
        role: 'prefix',
        description: 'Empty string: prefix = 0x80 + 0 = 0x80',
      }],
      totalBytes: [0x80],
      rule: '0x80-0xb7',
      ruleDescription: 'String of 0-55 bytes: prefix = 0x80 + length',
    }
  }

  if (data.length <= 55) {
    const prefix = 0x80 + data.length
    return {
      segments: [
        {
          bytes: [prefix],
          role: 'prefix',
          description: `String length ${data.length}: prefix = 0x80 + ${data.length} = 0x${toHex(prefix)}`,
        },
        {
          bytes: [...data],
          role: 'data',
          description: `Data: ${data.length} bytes`,
        },
      ],
      totalBytes: [prefix, ...data],
      rule: '0x80-0xb7',
      ruleDescription: `String of 0-55 bytes: prefix = 0x80 + length`,
    }
  }

  // Long string (> 55 bytes)
  const lenBytes = toBigEndianBytes(data.length)
  const prefix = 0xb7 + lenBytes.length
  return {
    segments: [
      {
        bytes: [prefix],
        role: 'prefix',
        description: `Long string: prefix = 0xb7 + ${lenBytes.length} = 0x${toHex(prefix)}`,
      },
      {
        bytes: [...lenBytes],
        role: 'length',
        description: `Length ${data.length} encoded as ${lenBytes.length} byte(s): 0x${lenBytes.map(toHex).join('')}`,
      },
      {
        bytes: [...data],
        role: 'data',
        description: `Data: ${data.length} bytes`,
      },
    ],
    totalBytes: [prefix, ...lenBytes, ...data],
    rule: '0xb8-0xbf',
    ruleDescription: `String > 55 bytes: prefix = 0xb7 + length-of-length`,
  }
}

function rlpEncodeList(items: ReadonlyArray<RlpInput>): RlpResult {
  // Encode each item and concatenate
  const encodedItems = items.map(item => rlpEncode(item))
  const payload: Array<number> = []
  for (const item of encodedItems) {
    payload.push(...item.totalBytes)
  }

  if (payload.length <= 55) {
    const prefix = 0xc0 + payload.length
    const segments: Array<EncodedSegment> = [
      {
        bytes: [prefix],
        role: 'prefix',
        description: `List payload ${payload.length} bytes: prefix = 0xc0 + ${payload.length} = 0x${toHex(prefix)}`,
      },
    ]

    // Add each item's bytes as data segments
    for (let i = 0; i < encodedItems.length; i++) {
      segments.push({
        bytes: [...encodedItems[i].totalBytes],
        role: 'data',
        description: `Item ${i}: ${typeof items[i] === 'string' ? `"${items[i]}"` : 'list'} (${encodedItems[i].totalBytes.length} bytes)`,
      })
    }

    return {
      segments,
      totalBytes: [prefix, ...payload],
      rule: '0xc0-0xf7',
      ruleDescription: `List with 0-55 bytes payload: prefix = 0xc0 + payload_length`,
    }
  }

  // Long list
  const lenBytes = toBigEndianBytes(payload.length)
  const prefix = 0xf7 + lenBytes.length
  const segments: Array<EncodedSegment> = [
    {
      bytes: [prefix],
      role: 'prefix',
      description: `Long list: prefix = 0xf7 + ${lenBytes.length} = 0x${toHex(prefix)}`,
    },
    {
      bytes: [...lenBytes],
      role: 'length',
      description: `Payload length ${payload.length} encoded as ${lenBytes.length} byte(s)`,
    },
  ]

  for (let i = 0; i < encodedItems.length; i++) {
    segments.push({
      bytes: [...encodedItems[i].totalBytes],
      role: 'data',
      description: `Item ${i}: ${typeof items[i] === 'string' ? `"${items[i]}"` : 'list'} (${encodedItems[i].totalBytes.length} bytes)`,
    })
  }

  return {
    segments,
    totalBytes: [prefix, ...lenBytes, ...payload],
    rule: '0xf8-0xff',
    ruleDescription: `List with > 55 bytes payload: prefix = 0xf7 + length-of-length`,
  }
}

function toBigEndianBytes(n: number): ReadonlyArray<number> {
  if (n === 0) return [0]
  const bytes: Array<number> = []
  let val = n
  while (val > 0) {
    bytes.unshift(val & 0xff)
    val = Math.floor(val / 256)
  }
  return bytes
}

function toHex(b: number): string {
  return b.toString(16).padStart(2, '0')
}

// ── Presets ──
interface Preset {
  readonly label: string
  readonly description: string
  readonly inputType: 'string' | 'list'
  readonly rawString?: string
  readonly rawList?: RlpInput
}

const PRESETS: ReadonlyArray<Preset> = [
  {
    label: '"dog"',
    description: 'Simple 3-byte string (0x80-0xb7 range)',
    inputType: 'string',
    rawString: 'dog',
  },
  {
    label: 'Empty ""',
    description: 'Empty string encodes as 0x80',
    inputType: 'string',
    rawString: '',
  },
  {
    label: '"\\x0f"',
    description: 'Single byte 0x0f < 0x80, no prefix needed',
    inputType: 'string',
    rawString: '\x0f',
  },
  {
    label: '["cat","dog"]',
    description: 'Simple list with two string items',
    inputType: 'list',
    rawList: ['cat', 'dog'],
  },
  {
    label: '[[],["cat"]]',
    description: 'Nested list showing recursive encoding',
    inputType: 'list',
    rawList: [[], ['cat']],
  },
  {
    label: '"hello"',
    description: '5-byte string showing prefix 0x85',
    inputType: 'string',
    rawString: 'hello',
  },
]

// ── Role colors ──
const ROLE_COLORS = {
  prefix: { color: COLORS.orange, label: 'Prefix' },
  length: { color: COLORS.yellow, label: 'Length' },
  data:   { color: COLORS.accent, label: 'Data' },
} as const

// ── Prefix range table ──
const PREFIX_RANGES = [
  { range: '0x00 - 0x7f', meaning: 'Single byte string', color: COLORS.green },
  { range: '0x80 - 0xb7', meaning: 'String (0-55 bytes)', color: COLORS.accent },
  { range: '0xb8 - 0xbf', meaning: 'String (> 55 bytes)', color: COLORS.purple },
  { range: '0xc0 - 0xf7', meaning: 'List (0-55 bytes payload)', color: COLORS.orange },
  { range: '0xf8 - 0xff', meaning: 'List (> 55 bytes payload)', color: COLORS.red },
] as const

export default function EncodingDemo() {
  const [selectedPreset, setSelectedPreset] = useState(0)
  const [customInput, setCustomInput] = useState('dog')
  const [inputMode, setInputMode] = useState<'string' | 'list'>('string')
  const [animKey, setAnimKey] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const bytesRef = useRef<HTMLDivElement>(null)

  // Compute encoding
  const encodingInput: RlpInput = inputMode === 'string'
    ? customInput
    : tryParseList(customInput)

  const result = rlpEncode(encodingInput)

  const handleSelectPreset = useCallback((index: number) => {
    const preset = PRESETS[index]
    setSelectedPreset(index)
    setInputMode(preset.inputType)
    if (preset.inputType === 'string') {
      setCustomInput(preset.rawString ?? '')
    } else {
      setCustomInput(JSON.stringify(preset.rawList))
    }
    setAnimKey(k => k + 1)
  }, [])

  const handleInputChange = useCallback((value: string) => {
    setCustomInput(value)
    setSelectedPreset(-1)
    setAnimKey(k => k + 1)
  }, [])

  const handleModeToggle = useCallback((mode: 'string' | 'list') => {
    setInputMode(mode)
    setSelectedPreset(-1)
    if (mode === 'list' && !customInput.startsWith('[')) {
      setCustomInput(`["${customInput}"]`)
    }
    setAnimKey(k => k + 1)
  }, [customInput])

  // GSAP animation for bytes
  useGSAP(() => {
    if (!bytesRef.current || animKey === 0) return
    const cells = bytesRef.current.querySelectorAll('.byte-cell')
    gsap.fromTo(cells,
      { opacity: 0.2, y: 4, scale: 0.9 },
      { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'power2.out', stagger: 0.03 },
    )
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
          RLP Encoding
        </span>
        <span style={{ fontSize: 13, color: COLORS.textDim }}>Byte-Level Visualizer</span>
        <span style={{
          marginLeft: 'auto',
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: '4px',
          background: `${COLORS.orange}18`,
          color: COLORS.orange,
          fontWeight: 600,
        }}>
          {result.totalBytes.length} bytes
        </span>
      </div>

      {/* Preset selector */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${PRESETS.length}, 1fr)`,
          gap: '6px',
          marginBottom: '16px',
        }}>
          {PRESETS.map((p, i) => (
            <button
              type="button"
              key={p.label}
              onClick={() => handleSelectPreset(i)}
              style={{
                padding: '8px 10px',
                fontSize: 11,
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
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          {(['string', 'list'] as const).map(mode => (
            <button
              type="button"
              key={mode}
              onClick={() => handleModeToggle(mode)}
              style={{
                padding: '6px 14px',
                fontSize: 11,
                fontWeight: 600,
                borderRadius: '6px',
                border: `1px solid ${inputMode === mode ? COLORS.accent : COLORS.borderLight}`,
                background: inputMode === mode ? COLORS.accentDim : 'transparent',
                color: inputMode === mode ? COLORS.accent : COLORS.textDim,
                cursor: 'pointer',
                fontFamily: 'var(--sl-font-system-mono, monospace)',
                textTransform: 'uppercase' as const,
              }}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Input */}
        <SectionLabel text={inputMode === 'string' ? 'String Input' : 'List Input (JSON format)'} />
        <input
          type="text"
          value={customInput}
          onChange={e => handleInputChange(e.target.value)}
          placeholder={inputMode === 'string' ? 'Type a string...' : '["cat", "dog"]'}
          spellCheck={false}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: COLORS.surfaceLight,
            border: `1px solid ${COLORS.borderLight}`,
            borderRadius: '8px',
            color: COLORS.text,
            fontFamily: 'var(--sl-font-system-mono, monospace)',
            fontSize: 14,
            outline: 'none',
            boxSizing: 'border-box' as const,
            marginBottom: '16px',
          }}
        />
      </div>

      {/* Two-column layout: Encoding details + Byte grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0',
      }}>
        {/* Left: Encoding breakdown */}
        <div style={{
          padding: '0 20px 20px',
          borderRight: `1px solid ${COLORS.border}`,
        }}>
          <SectionLabel text="Encoding Rule Applied" />
          <div style={{
            padding: '10px 14px',
            background: COLORS.surface,
            borderRadius: '8px',
            border: `1px solid ${COLORS.border}`,
            marginBottom: '12px',
          }}>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: COLORS.orange,
              fontFamily: 'var(--sl-font-system-mono, monospace)',
              marginBottom: '4px',
            }}>
              {result.rule}
            </div>
            <div style={{ fontSize: 12, color: COLORS.textDim, lineHeight: 1.5 }}>
              {result.ruleDescription}
            </div>
          </div>

          <SectionLabel text="Segment Breakdown" />
          <div style={{
            display: 'flex',
            flexDirection: 'column' as const,
            gap: '6px',
          }}>
            {result.segments.map((seg, i) => {
              const roleColor = ROLE_COLORS[seg.role]
              return (
                <div key={i} style={{
                  padding: '10px 12px',
                  background: `${roleColor.color}11`,
                  border: `1px solid ${roleColor.color}22`,
                  borderRadius: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: '3px',
                      background: `${roleColor.color}22`,
                      color: roleColor.color,
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.05em',
                    }}>
                      {roleColor.label}
                    </span>
                    <code style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: roleColor.color,
                      fontFamily: 'var(--sl-font-system-mono, monospace)',
                    }}>
                      {seg.bytes.map(b => `0x${toHex(b)}`).join(' ')}
                    </code>
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textDim, lineHeight: 1.5 }}>
                    {seg.description}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: Byte grid + Raw hex */}
        <div style={{ padding: '0 20px 20px' }}>
          <SectionLabel text="Encoded Bytes" />
          <div ref={bytesRef} style={{
            display: 'flex',
            flexWrap: 'wrap' as const,
            gap: '3px',
            marginBottom: '16px',
          }}>
            {renderByteGrid(result)}
          </div>

          {/* Raw hex output */}
          <SectionLabel text="Raw Hex Output" />
          <div style={{
            padding: '10px 14px',
            background: COLORS.surfaceLight,
            borderRadius: '8px',
            fontFamily: 'var(--sl-font-system-mono, monospace)',
            fontSize: 13,
            color: COLORS.accent,
            wordBreak: 'break-all' as const,
            lineHeight: 1.8,
            marginBottom: '16px',
          }}>
            0x{result.totalBytes.map(b => toHex(b)).join('')}
          </div>

          {/* Role legend */}
          <SectionLabel text="Legend" />
          <div style={{ display: 'flex', gap: '12px' }}>
            {(Object.keys(ROLE_COLORS) as ReadonlyArray<keyof typeof ROLE_COLORS>).map(role => (
              <div key={role} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: 10,
                  height: 10,
                  borderRadius: '2px',
                  background: ROLE_COLORS[role].color,
                }} />
                <span style={{ fontSize: 11, color: COLORS.textDim }}>
                  {ROLE_COLORS[role].label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Prefix range reference table */}
      <div style={{
        padding: '16px 20px',
        borderTop: `1px solid ${COLORS.border}`,
        background: COLORS.surface,
      }}>
        <SectionLabel text="RLP Prefix Range Table" />
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '6px',
          marginTop: '8px',
          marginBottom: '16px',
        }}>
          {PREFIX_RANGES.map(r => (
            <div key={r.range} style={{
              padding: '8px 10px',
              background: `${r.color}11`,
              border: `1px solid ${r.color}22`,
              borderRadius: '6px',
              textAlign: 'center' as const,
            }}>
              <code style={{
                fontSize: 11,
                fontWeight: 700,
                color: r.color,
                fontFamily: 'var(--sl-font-system-mono, monospace)',
              }}>
                {r.range}
              </code>
              <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: '3px', lineHeight: 1.3 }}>
                {r.meaning}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridAutoRows: '1fr',
          gap: '10px',
        }}>
          <FooterChip
            label="Two Types Only"
            desc="RLP knows only byte strings and lists -- no integers, booleans, or schemas"
          />
          <FooterChip
            label="Recursive"
            desc="Lists contain RLP-encoded items, enabling arbitrary nesting depth"
          />
          <FooterChip
            label="Ethereum Core"
            desc="Used for transactions, block headers, MPT nodes, account state, devp2p"
          />
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──

function tryParseList(input: string): RlpInput {
  try {
    const parsed = JSON.parse(input)
    if (Array.isArray(parsed)) {
      return normalizeList(parsed)
    }
    return String(parsed)
  } catch {
    return input
  }
}

function normalizeList(arr: ReadonlyArray<unknown>): RlpInput {
  return arr.map(item => {
    if (Array.isArray(item)) return normalizeList(item)
    return String(item)
  })
}

function renderByteGrid(result: RlpResult): ReadonlyArray<React.ReactNode> {
  const cells: Array<React.ReactNode> = []
  let byteIndex = 0

  for (const seg of result.segments) {
    const roleColor = ROLE_COLORS[seg.role]
    for (const b of seg.bytes) {
      cells.push(
        <span
          key={byteIndex}
          className="byte-cell"
          title={seg.description}
          style={{
            width: '36px',
            height: '36px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '4px',
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'var(--sl-font-system-mono, monospace)',
            color: roleColor.color,
            background: `${roleColor.color}18`,
            border: `1px solid ${roleColor.color}33`,
          }}
        >
          {toHex(b)}
        </span>
      )
      byteIndex++
    }
  }

  return cells
}

// ── Sub-components ──

function SectionLabel({ text }: { readonly text: string }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.1em',
      color: COLORS.textDim,
      marginBottom: '6px',
    }}>
      {text}
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
