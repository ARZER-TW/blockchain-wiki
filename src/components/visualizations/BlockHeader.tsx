import { useState, useRef, useCallback } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'

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

// ── Category colors ──
const CAT = {
  chain:     { color: COLORS.accent,  bg: '#627eea18', label: 'Chain Links' },
  state:     { color: COLORS.green,   bg: '#4ade8018', label: 'State Roots' },
  gas:       { color: COLORS.orange,  bg: '#f9731618', label: 'Gas & Fees' },
  consensus: { color: COLORS.yellow,  bg: '#fbbf2418', label: 'Consensus (PoS)' },
  identity:  { color: COLORS.cyan,    bg: '#22d3ee18', label: 'Block Identity' },
  blob:      { color: COLORS.purple,  bg: '#a78bfa18', label: 'EIP-4844 Blobs' },
} as const

type CategoryKey = keyof typeof CAT

interface BlockField {
  readonly name: string
  readonly displayName: string
  readonly value: string
  readonly bytes: number
  readonly description: string
  readonly category: CategoryKey
  readonly postMerge?: 'deprecated' | 'renamed' | 'new'
  readonly postMergeNote?: string
}

interface SampleBlock {
  readonly label: string
  readonly number: number
  readonly fields: ReadonlyArray<BlockField>
}

// ── Sample block data ──
function makeSampleBlock(
  label: string,
  num: number,
  gasLimit: number,
  gasUsed: number,
  baseFee: string,
  blobGasUsed: number,
  excessBlobGas: number,
): SampleBlock {
  return {
    label,
    number: num,
    fields: [
      // Chain Links
      {
        name: 'parentHash', displayName: 'parentHash',
        value: `0x${fakeHash(num - 1)}`, bytes: 32,
        description: 'Keccak-256 hash of the parent block header. Creates the chain structure — each block references exactly one parent.',
        category: 'chain',
      },
      // State Roots
      {
        name: 'stateRoot', displayName: 'stateRoot',
        value: `0x${fakeHash(num * 3)}`, bytes: 32,
        description: 'Root hash of the State Trie. Represents the complete state of all accounts (balances, nonces, storage, code hashes).',
        category: 'state',
      },
      {
        name: 'transactionsRoot', displayName: 'transactionsRoot',
        value: `0x${fakeHash(num * 5)}`, bytes: 32,
        description: 'Root hash of the Transaction Trie. Allows Merkle proof verification of any transaction inclusion.',
        category: 'state',
      },
      {
        name: 'receiptsRoot', displayName: 'receiptsRoot',
        value: `0x${fakeHash(num * 7)}`, bytes: 32,
        description: 'Root hash of the Receipt Trie. Contains transaction outcomes: status, gas used, logs/events.',
        category: 'state',
      },
      {
        name: 'withdrawalsRoot', displayName: 'withdrawalsRoot',
        value: `0x${fakeHash(num * 11)}`, bytes: 32,
        description: 'Root hash of the Withdrawals list (Shanghai upgrade). Enables validator staking withdrawals at the execution layer.',
        category: 'state', postMerge: 'new', postMergeNote: 'Added in Shanghai (2023)',
      },
      // Gas & Fees
      {
        name: 'gasLimit', displayName: 'gasLimit',
        value: gasLimit.toLocaleString(), bytes: 8,
        description: 'Maximum gas allowed in this block. Target is 15M gas (50% of limit). Validators vote to adjust +-1/1024 per block.',
        category: 'gas',
      },
      {
        name: 'gasUsed', displayName: 'gasUsed',
        value: gasUsed.toLocaleString(), bytes: 8,
        description: 'Total gas consumed by all transactions in this block. If > 15M target, baseFee increases; if < 15M, it decreases.',
        category: 'gas',
      },
      {
        name: 'baseFeePerGas', displayName: 'baseFeePerGas',
        value: `${baseFee} Gwei`, bytes: 32,
        description: 'EIP-1559 base fee. Algorithmically adjusted: increases when blocks are >50% full, decreases when <50%. This fee is BURNED.',
        category: 'gas',
      },
      // Consensus
      {
        name: 'beneficiary', displayName: 'beneficiary (fee_recipient)',
        value: `0x${fakeAddr(num)}`, bytes: 20,
        description: 'Address receiving priority fees (tips). Set by the block proposer. Base fee is burned, only priority fee goes here.',
        category: 'consensus',
      },
      {
        name: 'mixHash', displayName: 'prevRandao',
        value: `0x${fakeHash(num * 13)}`, bytes: 32,
        description: 'RANDAO randomness from the Beacon Chain. Was `mixHash` in PoW (used for Ethash verification). Now provides on-chain randomness.',
        category: 'consensus', postMerge: 'renamed', postMergeNote: 'mixHash -> prevRandao',
      },
      {
        name: 'difficulty', displayName: 'difficulty',
        value: '0', bytes: 32,
        description: 'Always 0 after The Merge. Was the Ethash mining difficulty in PoW. Retained for backwards compatibility.',
        category: 'consensus', postMerge: 'deprecated', postMergeNote: 'Always 0 (post-merge)',
      },
      {
        name: 'nonce', displayName: 'nonce',
        value: '0x0000000000000000', bytes: 8,
        description: 'Always 0 after The Merge. Was the PoW mining nonce. Retained for backwards compatibility.',
        category: 'consensus', postMerge: 'deprecated', postMergeNote: 'Always 0 (post-merge)',
      },
      {
        name: 'ommersHash', displayName: 'ommersHash (sha3Uncles)',
        value: '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347', bytes: 32,
        description: 'Always keccak256(RLP([])). Uncle/ommer blocks are impossible under PoS. This is the hash of an empty list.',
        category: 'consensus', postMerge: 'deprecated', postMergeNote: 'Always empty list hash',
      },
      // Block Identity
      {
        name: 'number', displayName: 'number',
        value: num.toLocaleString(), bytes: 8,
        description: 'Block height (monotonically increasing). Under PoS, one block per 12-second slot. Number != Slot.',
        category: 'identity',
      },
      {
        name: 'timestamp', displayName: 'timestamp',
        value: `${1700000000 + num * 12}`, bytes: 8,
        description: 'Unix timestamp. Under PoS, timestamps are exactly 12 seconds apart (one per slot).',
        category: 'identity',
      },
      {
        name: 'extraData', displayName: 'extraData',
        value: '0x (empty)', bytes: 0,
        description: 'Arbitrary data (max 32 bytes). Often contains client version string. Not consensus-critical.',
        category: 'identity',
      },
      {
        name: 'logsBloom', displayName: 'logsBloom',
        value: '256 bytes (2048 bits)', bytes: 256,
        description: 'Bloom filter for log entries. Enables fast filtering of event logs without scanning every receipt.',
        category: 'identity',
      },
      // EIP-4844 Blobs
      {
        name: 'blobGasUsed', displayName: 'blobGasUsed',
        value: blobGasUsed.toLocaleString(), bytes: 8,
        description: 'Total blob gas consumed in this block. Each blob = 131,072 gas. Target: 3 blobs (393,216 gas). Max: 6 blobs.',
        category: 'blob', postMerge: 'new', postMergeNote: 'Added in Dencun (2024)',
      },
      {
        name: 'excessBlobGas', displayName: 'excessBlobGas',
        value: excessBlobGas.toLocaleString(), bytes: 8,
        description: 'Running counter of excess blob gas above target. Used to calculate blob base fee (similar to EIP-1559 for blobs).',
        category: 'blob', postMerge: 'new', postMergeNote: 'Added in Dencun (2024)',
      },
      {
        name: 'parentBeaconBlockRoot', displayName: 'parentBeaconBlockRoot',
        value: `0x${fakeHash(num * 17)}`, bytes: 32,
        description: 'Root of the parent Beacon Block. EIP-4788: allows smart contracts to access Beacon Chain state (validator info, etc.).',
        category: 'blob', postMerge: 'new', postMergeNote: 'Added in Dencun (2024)',
      },
    ],
  }
}

// Deterministic fake hashes from a seed number
function fakeHash(seed: number): string {
  const chars = '0123456789abcdef'
  let result = ''
  let s = seed
  for (let i = 0; i < 64; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    result += chars[s % 16]
  }
  return result
}

function fakeAddr(seed: number): string {
  return fakeHash(seed * 19).slice(0, 40)
}

const SAMPLE_BLOCKS: ReadonlyArray<SampleBlock> = [
  makeSampleBlock('High Activity',  21000000, 30000000, 29856742, '45.2', 786432, 1245184),
  makeSampleBlock('Average Block',  21500000, 30000000, 15234567, '12.8', 393216, 0),
  makeSampleBlock('Low Activity',   22000000, 30000000, 3421098,  '3.1',  0,      0),
  makeSampleBlock('Full Blobs',     22500000, 30000000, 21567890, '28.5', 786432, 2490368),
]

export default function BlockHeader() {
  const [selectedBlock, setSelectedBlock] = useState(0)
  const [expandedField, setExpandedField] = useState<string | null>(null)
  const [animKey, setAnimKey] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const block = SAMPLE_BLOCKS[selectedBlock]

  const handleSelectBlock = useCallback((index: number) => {
    setSelectedBlock(index)
    setExpandedField(null)
    setAnimKey(k => k + 1)
  }, [])

  const toggleField = useCallback((name: string) => {
    setExpandedField(prev => prev === name ? null : name)
  }, [])

  // GSAP entrance animation
  useGSAP(() => {
    if (!containerRef.current || animKey === 0) return
    const groups = containerRef.current.querySelectorAll('.field-group')
    gsap.fromTo(groups,
      { opacity: 0.3, y: 8 },
      { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', stagger: 0.06 },
    )
  }, { scope: containerRef, dependencies: [animKey] })

  // Compute gas utilization
  const gasLimitField = block.fields.find(f => f.name === 'gasLimit')
  const gasUsedField = block.fields.find(f => f.name === 'gasUsed')
  const gasLimit = gasLimitField ? parseInt(gasLimitField.value.replace(/,/g, ''), 10) : 30000000
  const gasUsed = gasUsedField ? parseInt(gasUsedField.value.replace(/,/g, ''), 10) : 0
  const gasPercent = Math.round((gasUsed / gasLimit) * 100)
  const gasTarget = 50 // 50% = 15M target

  // Compute blob utilization
  const blobField = block.fields.find(f => f.name === 'blobGasUsed')
  const blobGasUsed = blobField ? parseInt(blobField.value.replace(/,/g, ''), 10) : 0
  const blobTarget = 393216
  const blobMax = 786432
  const blobPercent = Math.round((blobGasUsed / blobMax) * 100)
  const blobCount = Math.round(blobGasUsed / 131072)

  // Group fields by category
  const groups: ReadonlyArray<{ key: CategoryKey; fields: ReadonlyArray<BlockField> }> = (
    ['chain', 'state', 'gas', 'consensus', 'identity', 'blob'] as const
  ).map(key => ({
    key,
    fields: block.fields.filter(f => f.category === key),
  }))

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
          Ethereum Block Header
        </span>
        <span style={{ fontSize: 13, color: COLORS.textDim }}>Annotated Reference</span>
        <span style={{
          marginLeft: 'auto',
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: '4px',
          background: `${COLORS.yellow}18`,
          color: COLORS.yellow,
          fontWeight: 600,
        }}>
          Post-Merge (PoS)
        </span>
      </div>

      {/* Block selector */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${SAMPLE_BLOCKS.length}, 1fr)`,
          gap: '8px',
          marginBottom: '16px',
        }}>
          {SAMPLE_BLOCKS.map((b, i) => (
            <button
              type="button"
              key={b.label}
              onClick={() => handleSelectBlock(i)}
              style={{
                padding: '8px 12px',
                fontSize: 12,
                borderRadius: '8px',
                border: `1px solid ${selectedBlock === i ? COLORS.accent : COLORS.borderLight}`,
                background: selectedBlock === i ? COLORS.accentDim : 'transparent',
                color: selectedBlock === i ? COLORS.accent : COLORS.textDim,
                cursor: 'pointer',
                fontFamily: 'var(--sl-font-system-mono, monospace)',
              }}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* Block number display */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '12px 16px',
          background: COLORS.surfaceLight,
          borderRadius: '8px',
          marginBottom: '16px',
        }}>
          <div>
            <div style={{ fontSize: 11, color: COLORS.textDim, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.1em' }}>
              Block
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontFamily: 'var(--sl-font-system-mono, monospace)' }}>
              #{block.number.toLocaleString()}
            </div>
          </div>
          <div style={{ width: 1, height: 36, background: COLORS.borderLight }} />
          <div style={{ flex: 1 }}>
            <GasBar label="Gas" used={gasPercent} target={gasTarget} color={COLORS.orange} />
          </div>
          <div style={{ width: 1, height: 36, background: COLORS.borderLight }} />
          <div style={{ flex: 1 }}>
            <GasBar label={`Blobs (${blobCount}/6)`} used={blobPercent} target={Math.round((blobTarget / blobMax) * 100)} color={COLORS.purple} />
          </div>
        </div>
      </div>

      {/* Field groups */}
      <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column' as const, gap: '12px' }}>
        {groups.map(g => (
          <FieldGroup
            key={g.key}
            category={g.key}
            fields={g.fields}
            expandedField={expandedField}
            onToggle={toggleField}
          />
        ))}
      </div>

      {/* Block hash footer */}
      <div style={{
        padding: '16px 20px',
        borderTop: `1px solid ${COLORS.border}`,
        background: COLORS.surface,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: COLORS.textDim, marginBottom: '8px' }}>
          blockHash = keccak256(RLP(header_fields))
        </div>
        <code style={{
          display: 'block',
          fontSize: 12,
          color: COLORS.accent,
          fontFamily: 'var(--sl-font-system-mono, monospace)',
          wordBreak: 'break-all' as const,
          lineHeight: 1.6,
        }}>
          0x{fakeHash(block.number * 31)}
        </code>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridAutoRows: '1fr',
          gap: '10px',
          marginTop: '16px',
        }}>
          <FooterChip
            label="RLP Encoding"
            desc="All fields serialized via Recursive Length Prefix"
          />
          <FooterChip
            label="20 Fields Total"
            desc="15 original + 5 added by Shanghai/Dencun"
          />
          <FooterChip
            label="Light Client Proofs"
            desc="Trie roots enable Merkle proof verification"
          />
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──

function GasBar({ label, used, target, color }: {
  readonly label: string
  readonly used: number
  readonly target: number
  readonly color: string
}) {
  const overTarget = used > target
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ fontSize: 11, color: COLORS.textDim, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: overTarget ? COLORS.red : color, fontFamily: 'var(--sl-font-system-mono, monospace)' }}>
          {used}%
        </span>
      </div>
      <div style={{ height: 6, background: COLORS.bg, borderRadius: 3, overflow: 'hidden', position: 'relative' as const }}>
        {/* Target marker */}
        <div style={{
          position: 'absolute' as const,
          left: `${target}%`,
          top: 0,
          bottom: 0,
          width: 1,
          background: COLORS.textDim,
          zIndex: 1,
        }} />
        {/* Fill bar */}
        <div style={{
          width: `${Math.min(used, 100)}%`,
          height: '100%',
          background: overTarget ? `linear-gradient(90deg, ${color}, ${COLORS.red})` : color,
          borderRadius: 3,
          transition: 'width 0.4s ease-out',
        }} />
      </div>
    </div>
  )
}

function FieldGroup({ category, fields, expandedField, onToggle }: {
  readonly category: CategoryKey
  readonly fields: ReadonlyArray<BlockField>
  readonly expandedField: string | null
  readonly onToggle: (name: string) => void
}) {
  const cat = CAT[category]
  return (
    <div className="field-group" style={{
      background: cat.bg,
      border: `1px solid ${cat.color}22`,
      borderRadius: '10px',
      overflow: 'hidden',
    }}>
      {/* Group header */}
      <div style={{
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderBottom: `1px solid ${cat.color}22`,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: cat.color }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: cat.color }}>{cat.label}</span>
        <span style={{ fontSize: 11, color: COLORS.textDim, marginLeft: 'auto' }}>
          {fields.length} field{fields.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Fields */}
      <div style={{ display: 'flex', flexDirection: 'column' as const }}>
        {fields.map((f, i) => (
          <FieldRow
            key={f.name}
            field={f}
            catColor={cat.color}
            isExpanded={expandedField === f.name}
            isLast={i === fields.length - 1}
            onToggle={() => onToggle(f.name)}
          />
        ))}
      </div>
    </div>
  )
}

function FieldRow({ field, catColor, isExpanded, isLast, onToggle }: {
  readonly field: BlockField
  readonly catColor: string
  readonly isExpanded: boolean
  readonly isLast: boolean
  readonly onToggle: () => void
}) {
  return (
    <div
      style={{
        borderBottom: isLast ? 'none' : `1px solid ${COLORS.border}`,
        cursor: 'pointer',
      }}
      onClick={onToggle}
    >
      <div style={{
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}>
        {/* Field name */}
        <code style={{
          fontSize: 12,
          fontWeight: 600,
          color: COLORS.text,
          fontFamily: 'var(--sl-font-system-mono, monospace)',
          minWidth: 170,
          flexShrink: 0,
        }}>
          {field.displayName}
        </code>

        {/* Post-merge badge */}
        {field.postMerge && (
          <PostMergeBadge type={field.postMerge} note={field.postMergeNote} />
        )}

        {/* Value (truncated) */}
        <code style={{
          fontSize: 11,
          color: catColor,
          fontFamily: 'var(--sl-font-system-mono, monospace)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap' as const,
          opacity: 0.85,
        }}>
          {field.value}
        </code>

        {/* Bytes indicator */}
        <span style={{
          fontSize: 10,
          color: COLORS.textDim,
          fontFamily: 'var(--sl-font-system-mono, monospace)',
          flexShrink: 0,
        }}>
          {field.bytes}B
        </span>

        {/* Expand indicator */}
        <span style={{
          fontSize: 10,
          color: COLORS.textDim,
          transition: 'transform 0.2s',
          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
          flexShrink: 0,
        }}>
          {'\u25B6'}
        </span>
      </div>

      {/* Expanded description */}
      {isExpanded && (
        <div style={{
          padding: '0 14px 12px',
          fontSize: 12,
          lineHeight: 1.7,
          color: COLORS.textDim,
        }}>
          {field.description}
          {field.value.startsWith('0x') && field.value.length > 20 && (
            <div style={{
              marginTop: '8px',
              padding: '8px 10px',
              background: COLORS.bg,
              borderRadius: '6px',
              fontFamily: 'var(--sl-font-system-mono, monospace)',
              fontSize: 11,
              color: catColor,
              wordBreak: 'break-all' as const,
              lineHeight: 1.6,
            }}>
              {field.value}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PostMergeBadge({ type, note }: {
  readonly type: 'deprecated' | 'renamed' | 'new'
  readonly note?: string
}) {
  const styles: Record<string, { bg: string; color: string; text: string }> = {
    deprecated: { bg: `${COLORS.red}18`, color: COLORS.red, text: 'DEPRECATED' },
    renamed:    { bg: `${COLORS.yellow}18`, color: COLORS.yellow, text: 'RENAMED' },
    new:        { bg: `${COLORS.green}18`, color: COLORS.green, text: 'NEW' },
  }
  const s = styles[type]
  return (
    <span
      title={note}
      style={{
        fontSize: 9,
        fontWeight: 700,
        padding: '1px 6px',
        borderRadius: '3px',
        background: s.bg,
        color: s.color,
        letterSpacing: '0.05em',
        flexShrink: 0,
      }}
    >
      {s.text}
    </span>
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
