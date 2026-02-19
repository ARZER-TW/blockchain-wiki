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

// ── Types ──

type Advantage = 'left' | 'right' | 'neutral'

interface ComparisonRow {
  readonly attribute: string
  readonly left: string
  readonly right: string
  readonly advantage: Advantage
  readonly note?: string
}

interface ComparisonTab {
  readonly id: string
  readonly label: string
  readonly leftName: string
  readonly rightName: string
  readonly leftColor: string
  readonly rightColor: string
  readonly rows: ReadonlyArray<ComparisonRow>
  readonly takeaways: ReadonlyArray<string>
}

// ── Comparison Data ──

const COMPARISONS: ReadonlyArray<ComparisonTab> = [
  {
    id: 'ecdsa-bls',
    label: 'ECDSA vs BLS',
    leftName: 'ECDSA (secp256k1)',
    rightName: 'BLS (BLS12-381)',
    leftColor: COLORS.cyan,
    rightColor: COLORS.purple,
    rows: [
      {
        attribute: 'Used In',
        left: 'Execution Layer (transactions)',
        right: 'Consensus Layer (attestations)',
        advantage: 'neutral',
      },
      {
        attribute: 'Curve',
        left: 'secp256k1 (Koblitz)',
        right: 'BLS12-381 (pairing-friendly)',
        advantage: 'neutral',
      },
      {
        attribute: 'Private Key Size',
        left: '32 bytes (256 bits)',
        right: '32 bytes (256 bits)',
        advantage: 'neutral',
      },
      {
        attribute: 'Public Key Size',
        left: '33 bytes (compressed)',
        right: '48 bytes (G1)',
        advantage: 'left',
        note: 'Smaller key saves on-chain space',
      },
      {
        attribute: 'Signature Size',
        left: '64 bytes (r, s) + 1 byte (v)',
        right: '96 bytes (G2)',
        advantage: 'left',
        note: 'Per-signature, ECDSA is more compact',
      },
      {
        attribute: 'Signature Aggregation',
        left: 'Not supported',
        right: 'Native aggregation',
        advantage: 'right',
        note: 'BLS can aggregate N signatures into 1 (96 bytes total)',
      },
      {
        attribute: 'Verification Speed',
        left: 'Fast (single curve op)',
        right: 'Slow (pairing operations)',
        advantage: 'left',
        note: 'Single BLS verify is ~10x slower than ECDSA',
      },
      {
        attribute: 'Aggregate Verification',
        left: 'N/A',
        right: 'Fast (2 pairings for N sigs)',
        advantage: 'right',
        note: 'Verifying 1000 aggregated sigs costs ~same as verifying 2',
      },
      {
        attribute: 'Key Recovery',
        left: 'ecrecover supported',
        right: 'Not supported',
        advantage: 'left',
        note: 'ECDSA can recover pubkey from signature (saves calldata)',
      },
      {
        attribute: 'Deterministic',
        left: 'Yes (RFC 6979)',
        right: 'Yes (inherently)',
        advantage: 'neutral',
        note: 'BLS is naturally deterministic; ECDSA needs RFC 6979',
      },
    ],
    takeaways: [
      'ECDSA is optimal for individual transactions: small signatures, fast single verification, and ecrecover saves calldata.',
      'BLS is essential for consensus: aggregating ~400K validator attestations per epoch into manageable batches.',
      'Ethereum uses both: ECDSA on the execution layer, BLS on the Beacon Chain consensus layer.',
    ],
  },
  {
    id: 'calldata-blob',
    label: 'Calldata vs Blob',
    leftName: 'Calldata',
    rightName: 'Blob (EIP-4844)',
    leftColor: COLORS.orange,
    rightColor: COLORS.green,
    rows: [
      {
        attribute: 'EIP',
        left: 'Original (pre-Dencun)',
        right: 'EIP-4844 (Dencun, 2024/3)',
        advantage: 'neutral',
      },
      {
        attribute: 'Cost (per byte)',
        left: '16 gas (non-zero), 4 gas (zero)',
        right: '~1 gas equivalent (blob gas market)',
        advantage: 'right',
        note: 'Blobs are ~10-100x cheaper per byte',
      },
      {
        attribute: 'Max Size per Tx',
        left: 'Limited by block gas (~1.8 MB theoretical)',
        right: '6 blobs x 128 KB = 768 KB per block',
        advantage: 'neutral',
        note: 'Different constraints: gas vs blob count',
      },
      {
        attribute: 'Availability Period',
        left: 'Permanent (on-chain forever)',
        right: '~18 days (4096 epochs)',
        advantage: 'left',
        note: 'Blob data is pruned after ~18 days',
      },
      {
        attribute: 'Accessible by EVM',
        left: 'Yes (CALLDATALOAD, CALLDATACOPY)',
        right: 'No (only commitment hash visible)',
        advantage: 'left',
        note: 'Contracts cannot read blob content directly',
      },
      {
        attribute: 'Fee Market',
        left: 'Shares block gas with execution',
        right: 'Separate blob gas market (EIP-1559 style)',
        advantage: 'right',
        note: 'Blob fees do not compete with execution gas',
      },
      {
        attribute: 'Who Pays',
        left: 'Transaction sender',
        right: 'Transaction sender (blob gas)',
        advantage: 'neutral',
      },
      {
        attribute: 'Primary User',
        left: 'Smart contracts, L1 interactions',
        right: 'L2 rollups (batch posting)',
        advantage: 'neutral',
        note: 'Blobs designed specifically for rollup data',
      },
      {
        attribute: 'Commitment Scheme',
        left: 'N/A (raw bytes)',
        right: 'KZG commitment (BLS12-381)',
        advantage: 'right',
        note: 'Enables data availability sampling (future DAS)',
      },
      {
        attribute: 'Target per Block',
        left: '15M gas (50% of 30M limit)',
        right: '3 blobs (393,216 blob gas)',
        advantage: 'neutral',
        note: 'Both use EIP-1559 targeting mechanism',
      },
    ],
    takeaways: [
      'Blobs reduced L2 transaction costs by 10-100x by providing cheap temporary data availability.',
      'Calldata remains necessary for any data that contracts need to read or that must persist permanently.',
      'The separate blob fee market prevents L2 data posting from competing with L1 execution for gas.',
    ],
  },
  {
    id: 'mpt-verkle',
    label: 'MPT vs Verkle',
    leftName: 'Merkle Patricia Trie',
    rightName: 'Verkle Tree',
    leftColor: COLORS.accent,
    rightColor: COLORS.yellow,
    rows: [
      {
        attribute: 'Status',
        left: 'Current (since genesis)',
        right: 'Planned (post-Pectra)',
        advantage: 'neutral',
      },
      {
        attribute: 'Branching Factor',
        left: '16 (hex nibbles)',
        right: '256 (one byte)',
        advantage: 'right',
        note: 'Wider branching means shallower trees',
      },
      {
        attribute: 'Tree Depth',
        left: '~7-8 levels (for account trie)',
        right: '~3-4 levels',
        advantage: 'right',
        note: 'Shallower tree = fewer nodes in proofs',
      },
      {
        attribute: 'Proof Size',
        left: '~4 KB per account (Merkle proof)',
        right: '~150 bytes per account',
        advantage: 'right',
        note: 'Verkle proofs are ~30x smaller',
      },
      {
        attribute: 'Commitment Scheme',
        left: 'Keccak-256 (hash-based)',
        right: 'Pedersen / IPA (elliptic curve)',
        advantage: 'neutral',
        note: 'Different cryptographic foundations',
      },
      {
        attribute: 'Proof Verification',
        left: 'Re-hash each level',
        right: 'Inner Product Argument (IPA)',
        advantage: 'right',
        note: 'IPA verification is efficient for multiproofs',
      },
      {
        attribute: 'Stateless Client Support',
        left: 'Impractical (proofs too large)',
        right: 'Core design goal',
        advantage: 'right',
        note: 'Enables validators without full state storage',
      },
      {
        attribute: 'Node Size',
        left: 'Variable (branch=17 items, leaf=2)',
        right: 'Fixed 256 children per inner node',
        advantage: 'neutral',
      },
      {
        attribute: 'Quantum Resistance',
        left: 'Yes (hash-based)',
        right: 'No (elliptic curve)',
        advantage: 'left',
        note: 'Hash-based commitments are quantum-safe',
      },
      {
        attribute: 'Migration',
        left: 'N/A',
        right: 'Overlay tree + gradual conversion',
        advantage: 'neutral',
        note: 'New state in Verkle; old state migrates over time',
      },
    ],
    takeaways: [
      'Verkle Trees are the key enabler for stateless Ethereum: ~30x smaller proofs make it practical for validators to operate without storing full state.',
      'The tradeoff is moving from quantum-resistant hashing to elliptic curve commitments (IPA), which may need replacement if quantum computing advances.',
      'Migration will use an overlay approach: new state goes directly to Verkle, while existing MPT state is gradually converted.',
    ],
  },
]

// ── Main Component ──

export default function ComparisonTable() {
  const [activeTab, setActiveTab] = useState(0)
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const [animKey, setAnimKey] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const comparison = COMPARISONS[activeTab]

  const handleTabChange = useCallback((index: number) => {
    setActiveTab(index)
    setExpandedRow(null)
    setAnimKey(k => k + 1)
  }, [])

  const toggleRow = useCallback((index: number) => {
    setExpandedRow(prev => prev === index ? null : index)
  }, [])

  // GSAP entrance animation
  useGSAP(() => {
    if (!containerRef.current || animKey === 0) return
    const rows = containerRef.current.querySelectorAll('.comparison-row')
    gsap.fromTo(rows,
      { opacity: 0.3, x: -8 },
      { opacity: 1, x: 0, duration: 0.3, ease: 'power2.out', stagger: 0.04 },
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
          Ethereum Technology Comparisons
        </span>
        <span style={{ fontSize: 13, color: COLORS.textDim }}>Side-by-Side Analysis</span>
      </div>

      {/* Tab selector */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COMPARISONS.length}, 1fr)`,
          gap: '8px',
          marginBottom: '16px',
        }}>
          {COMPARISONS.map((c, i) => (
            <button
              type="button"
              key={c.id}
              onClick={() => handleTabChange(i)}
              style={{
                padding: '8px 12px',
                fontSize: 12,
                borderRadius: '8px',
                border: `1px solid ${activeTab === i ? COLORS.accent : COLORS.borderLight}`,
                background: activeTab === i ? COLORS.accentDim : 'transparent',
                color: activeTab === i ? COLORS.accent : COLORS.textDim,
                cursor: 'pointer',
                fontFamily: 'var(--sl-font-system-mono, monospace)',
                fontWeight: activeTab === i ? 600 : 400,
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Column headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '140px 1fr 1fr',
          gap: '8px',
          padding: '10px 14px',
          background: COLORS.surfaceLight,
          borderRadius: '8px 8px 0 0',
          borderBottom: `1px solid ${COLORS.border}`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textDim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Attribute
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: comparison.leftColor }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: comparison.leftColor }}>
              {comparison.leftName}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: comparison.rightColor }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: comparison.rightColor }}>
              {comparison.rightName}
            </span>
          </div>
        </div>
      </div>

      {/* Comparison rows */}
      <div style={{ padding: '0 20px' }}>
        {comparison.rows.map((row, i) => (
          <ComparisonRowItem
            key={`${comparison.id}-${i}`}
            row={row}
            index={i}
            isLast={i === comparison.rows.length - 1}
            isExpanded={expandedRow === i}
            onToggle={() => toggleRow(i)}
            leftColor={comparison.leftColor}
            rightColor={comparison.rightColor}
          />
        ))}
      </div>

      {/* Takeaways */}
      <div style={{ padding: '16px 20px 20px' }}>
        <div style={{
          padding: '14px 16px',
          background: `${COLORS.accent}08`,
          border: `1px solid ${COLORS.accent}22`,
          borderRadius: '8px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.accent, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>
            Key Takeaways
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {comparison.takeaways.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ color: COLORS.accent, fontSize: 11, flexShrink: 0, marginTop: '2px' }}>{'\u25B8'}</span>
                <span style={{ fontSize: 12, color: COLORS.textDim, lineHeight: 1.6 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend footer */}
      <div style={{
        padding: '16px 20px',
        borderTop: `1px solid ${COLORS.border}`,
        background: COLORS.surface,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          flexWrap: 'wrap',
        }}>
          <LegendItem color={COLORS.green} label="Advantage" />
          <LegendItem color={COLORS.red} label="Disadvantage" />
          <LegendItem color={COLORS.yellow} label="Neutral / Context-dependent" />
          <span style={{ marginLeft: 'auto', fontSize: 11, color: COLORS.textDim }}>
            Click any row for details
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──

function ComparisonRowItem({ row, index, isLast, isExpanded, onToggle, leftColor, rightColor }: {
  readonly row: ComparisonRow
  readonly index: number
  readonly isLast: boolean
  readonly isExpanded: boolean
  readonly onToggle: () => void
  readonly leftColor: string
  readonly rightColor: string
}) {
  const leftAdv = row.advantage === 'left'
  const rightAdv = row.advantage === 'right'
  const neutral = row.advantage === 'neutral'

  return (
    <div
      className="comparison-row"
      style={{
        borderBottom: isLast ? 'none' : `1px solid ${COLORS.border}`,
        cursor: row.note ? 'pointer' : 'default',
      }}
      onClick={row.note ? onToggle : undefined}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: '140px 1fr 1fr',
        gap: '8px',
        padding: '10px 14px',
        alignItems: 'center',
        background: index % 2 === 0 ? 'transparent' : `${COLORS.surfaceLight}40`,
      }}>
        {/* Attribute name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            fontSize: 12,
            fontWeight: 600,
            color: COLORS.text,
          }}>
            {row.attribute}
          </span>
          {row.note && (
            <span style={{
              fontSize: 10,
              color: COLORS.textDim,
              transition: 'transform 0.2s',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              flexShrink: 0,
            }}>
              {'\u25B6'}
            </span>
          )}
        </div>

        {/* Left value */}
        <CellValue
          value={row.left}
          isAdvantage={leftAdv}
          isDisadvantage={rightAdv}
          isNeutral={neutral}
          color={leftColor}
        />

        {/* Right value */}
        <CellValue
          value={row.right}
          isAdvantage={rightAdv}
          isDisadvantage={leftAdv}
          isNeutral={neutral}
          color={rightColor}
        />
      </div>

      {/* Expanded note */}
      {isExpanded && row.note && (
        <div style={{
          padding: '0 14px 10px',
          marginLeft: 140 + 8,
        }}>
          <div style={{
            padding: '6px 10px',
            background: COLORS.bg,
            borderRadius: '6px',
            fontSize: 11,
            color: COLORS.textDim,
            lineHeight: 1.6,
            borderLeft: `2px solid ${COLORS.accent}`,
          }}>
            {row.note}
          </div>
        </div>
      )}
    </div>
  )
}

function CellValue({ value, isAdvantage, isDisadvantage, isNeutral, color }: {
  readonly value: string
  readonly isAdvantage: boolean
  readonly isDisadvantage: boolean
  readonly isNeutral: boolean
  readonly color: string
}) {
  const bgColor = isAdvantage
    ? `${COLORS.green}12`
    : isDisadvantage
      ? `${COLORS.red}08`
      : 'transparent'

  const borderColor = isAdvantage
    ? `${COLORS.green}33`
    : isDisadvantage
      ? `${COLORS.red}22`
      : 'transparent'

  const textColor = isNeutral ? COLORS.textDim : color

  return (
    <div style={{
      padding: '6px 10px',
      borderRadius: '6px',
      background: bgColor,
      border: `1px solid ${borderColor}`,
    }}>
      <span style={{
        fontSize: 11,
        color: textColor,
        fontFamily: 'var(--sl-font-system-mono, monospace)',
        lineHeight: 1.5,
      }}>
        {value}
      </span>
    </div>
  )
}

function LegendItem({ color, label }: {
  readonly color: string
  readonly label: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{
        width: 10,
        height: 10,
        borderRadius: 2,
        background: `${color}33`,
        border: `1px solid ${color}66`,
      }} />
      <span style={{ fontSize: 11, color: COLORS.textDim }}>{label}</span>
    </div>
  )
}
