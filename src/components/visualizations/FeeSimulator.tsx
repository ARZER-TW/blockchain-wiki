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

interface SimBlock {
  readonly number: number
  readonly gasUsed: number
  readonly gasLimit: number
  readonly baseFee: number
  readonly priorityFee: number
  readonly burned: number
  readonly minerReward: number
}

interface MempoolTx {
  readonly id: string
  readonly maxFee: number
  readonly maxPriorityFee: number
  readonly gasUnits: number
  readonly label: string
}

// ── Constants ──

const GAS_LIMIT = 30_000_000
const GAS_TARGET = 15_000_000
const INITIAL_BASE_FEE = 20 // Gwei
const MAX_BLOCKS = 24

// ── EIP-1559 formula ──

function computeNextBaseFee(currentBaseFee: number, gasUsed: number): number {
  if (gasUsed === GAS_TARGET) return currentBaseFee
  const delta = gasUsed - GAS_TARGET
  const change = (currentBaseFee * delta) / GAS_TARGET / 8
  const next = currentBaseFee + change
  return Math.max(next, 1) // base fee cannot go below 1
}

function generateGasUsed(mode: 'high' | 'low' | 'random'): number {
  switch (mode) {
    case 'high':
      return Math.floor(GAS_TARGET * (1.4 + Math.random() * 0.55))
    case 'low':
      return Math.floor(GAS_TARGET * (0.1 + Math.random() * 0.4))
    case 'random':
      return Math.floor(GAS_TARGET * (0.3 + Math.random() * 1.3))
  }
}

function createBlock(prev: SimBlock, gasUsed: number): SimBlock {
  const baseFee = prev.number === 0 ? INITIAL_BASE_FEE : computeNextBaseFee(prev.baseFee, prev.gasUsed)
  const priorityFee = 1.5 + Math.random() * 3 // 1.5-4.5 Gwei
  const burned = (baseFee * gasUsed) / 1e9 // in Gwei-gas -> ETH-like units
  const minerReward = (priorityFee * gasUsed) / 1e9
  return {
    number: prev.number + 1,
    gasUsed: Math.min(gasUsed, GAS_LIMIT),
    gasLimit: GAS_LIMIT,
    baseFee: Math.round(baseFee * 100) / 100,
    priorityFee: Math.round(priorityFee * 100) / 100,
    burned: Math.round(burned * 1000) / 1000,
    minerReward: Math.round(minerReward * 1000) / 1000,
  }
}

// ── Presets ──

interface Preset {
  readonly label: string
  readonly description: string
  readonly sequence: ReadonlyArray<'high' | 'low' | 'random'>
}

const PRESETS: ReadonlyArray<Preset> = [
  {
    label: 'Congestion Spike',
    description: 'Sudden demand surge drives base fee up rapidly',
    sequence: ['low', 'low', 'low', 'high', 'high', 'high', 'high', 'high', 'high', 'high', 'high', 'high'],
  },
  {
    label: 'Steady State',
    description: 'Blocks hover near 50% target, stable base fee',
    sequence: ['random', 'random', 'random', 'random', 'random', 'random', 'random', 'random', 'random', 'random', 'random', 'random'],
  },
  {
    label: 'Recovery',
    description: 'After congestion, demand drops and base fee decreases',
    sequence: ['high', 'high', 'high', 'high', 'low', 'low', 'low', 'low', 'low', 'low', 'low', 'low'],
  },
]

// ── Initial state: genesis block ──

function genesisBlock(): SimBlock {
  return {
    number: 0,
    gasUsed: GAS_TARGET,
    gasLimit: GAS_LIMIT,
    baseFee: INITIAL_BASE_FEE,
    priorityFee: 2,
    burned: 0,
    minerReward: 0,
  }
}

// ── Mempool transactions ──

function generateMempool(baseFee: number): ReadonlyArray<MempoolTx> {
  const types = [
    { label: 'ETH Transfer', gasUnits: 21000 },
    { label: 'ERC-20 Transfer', gasUnits: 65000 },
    { label: 'Uniswap Swap', gasUnits: 150000 },
    { label: 'NFT Mint', gasUnits: 120000 },
    { label: 'Contract Deploy', gasUnits: 800000 },
    { label: 'Bridge Deposit', gasUnits: 200000 },
    { label: 'Multisig Exec', gasUnits: 95000 },
    { label: 'Aave Borrow', gasUnits: 350000 },
  ]

  return types.map((t, i) => {
    const maxPriorityFee = 0.5 + Math.random() * 8
    const maxFee = baseFee * (1.1 + Math.random() * 0.5) + maxPriorityFee
    return {
      id: `tx-${i}`,
      maxFee: Math.round(maxFee * 100) / 100,
      maxPriorityFee: Math.round(maxPriorityFee * 100) / 100,
      gasUnits: t.gasUnits,
      label: t.label,
    }
  }).sort((a, b) => b.maxPriorityFee - a.maxPriorityFee)
}

// ── Component ──

export default function FeeSimulator() {
  const [blocks, setBlocks] = useState<ReadonlyArray<SimBlock>>([genesisBlock()])
  const [animKey, setAnimKey] = useState(0)
  const [autoRunning, setAutoRunning] = useState(false)
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const currentBlock = blocks[blocks.length - 1]
  const mempool = generateMempool(currentBlock.baseFee)

  const totalBurned = blocks.reduce((sum, b) => sum + b.burned, 0)
  const totalReward = blocks.reduce((sum, b) => sum + b.minerReward, 0)

  const addBlock = useCallback((mode: 'high' | 'low' | 'random') => {
    setBlocks(prev => {
      const last = prev[prev.length - 1]
      const gasUsed = generateGasUsed(mode)
      const newBlock = createBlock(last, gasUsed)
      const updated = [...prev, newBlock]
      return updated.length > MAX_BLOCKS ? updated.slice(updated.length - MAX_BLOCKS) : updated
    })
    setAnimKey(k => k + 1)
  }, [])

  const runPreset = useCallback((preset: Preset) => {
    stopAuto()
    setBlocks([genesisBlock()])
    let i = 0
    const interval = setInterval(() => {
      if (i >= preset.sequence.length) {
        clearInterval(interval)
        return
      }
      addBlock(preset.sequence[i])
      i++
    }, 300)
    autoRef.current = interval
  }, [addBlock])

  const toggleAuto = useCallback(() => {
    if (autoRunning) {
      stopAuto()
    } else {
      setAutoRunning(true)
      autoRef.current = setInterval(() => {
        addBlock('random')
      }, 800)
    }
  }, [autoRunning, addBlock])

  const stopAuto = useCallback(() => {
    setAutoRunning(false)
    if (autoRef.current) {
      clearInterval(autoRef.current)
      autoRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    stopAuto()
    setBlocks([genesisBlock()])
    setSelectedBlock(null)
    setAnimKey(k => k + 1)
  }, [stopAuto])

  // GSAP animation for new blocks
  useGSAP(() => {
    if (!containerRef.current || animKey === 0) return
    const bars = containerRef.current.querySelectorAll('.block-bar')
    const last = bars[bars.length - 1]
    if (last) {
      gsap.fromTo(last,
        { scaleY: 0, transformOrigin: 'bottom' },
        { scaleY: 1, duration: 0.3, ease: 'back.out(1.7)' },
      )
    }
  }, { scope: containerRef, dependencies: [animKey] })

  // SVG chart dimensions
  const chartW = 680
  const chartH = 140
  const barAreaH = 100
  const lineAreaH = 140
  const padding = { left: 50, right: 20, top: 10, bottom: 20 }
  const plotW = chartW - padding.left - padding.right
  const plotH = lineAreaH - padding.top - padding.bottom

  // Compute chart data
  const displayBlocks = blocks.slice(1) // skip genesis
  const maxBaseFee = Math.max(...displayBlocks.map(b => b.baseFee), INITIAL_BASE_FEE * 2)
  const xStep = displayBlocks.length > 1 ? plotW / (displayBlocks.length - 1) : plotW

  const linePath = displayBlocks.map((b, i) => {
    const x = padding.left + (displayBlocks.length > 1 ? i * xStep : plotW / 2)
    const y = padding.top + plotH - (b.baseFee / maxBaseFee) * plotH
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
  }).join(' ')

  const areaPath = displayBlocks.length > 0
    ? `${linePath} L ${padding.left + (displayBlocks.length > 1 ? (displayBlocks.length - 1) * xStep : plotW / 2)} ${padding.top + plotH} L ${padding.left} ${padding.top + plotH} Z`
    : ''

  // Bar width for gas usage
  const barW = displayBlocks.length > 0 ? Math.max(Math.min(plotW / displayBlocks.length - 2, 24), 4) : 20

  const inspectedBlock = selectedBlock !== null && selectedBlock < displayBlocks.length
    ? displayBlocks[selectedBlock]
    : null

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
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS.orange }} />
        <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>
          EIP-1559 Fee Simulator
        </span>
        <span style={{ fontSize: 13, color: COLORS.textDim }}>Base Fee Dynamics</span>
        <span style={{
          marginLeft: 'auto',
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: '4px',
          background: `${COLORS.orange}18`,
          color: COLORS.orange,
          fontWeight: 600,
        }}>
          London Fork
        </span>
      </div>

      {/* Controls */}
      <div style={{ padding: '16px 20px 0' }}>
        {/* Action buttons */}
        <div style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap' as const,
          marginBottom: '12px',
        }}>
          <ActionButton
            label="+ High Gas Block"
            color={COLORS.red}
            onClick={() => addBlock('high')}
            disabled={autoRunning}
          />
          <ActionButton
            label="+ Low Gas Block"
            color={COLORS.green}
            onClick={() => addBlock('low')}
            disabled={autoRunning}
          />
          <ActionButton
            label={autoRunning ? 'Stop Auto' : 'Auto Simulate'}
            color={COLORS.accent}
            onClick={toggleAuto}
            active={autoRunning}
          />
          <ActionButton
            label="Reset"
            color={COLORS.textDim}
            onClick={reset}
          />
        </div>

        {/* Presets */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${PRESETS.length}, 1fr)`,
          gap: '8px',
          marginBottom: '16px',
        }}>
          {PRESETS.map(p => (
            <button
              type="button"
              key={p.label}
              onClick={() => runPreset(p)}
              style={{
                padding: '8px 12px',
                fontSize: 12,
                borderRadius: '8px',
                border: `1px solid ${COLORS.borderLight}`,
                background: 'transparent',
                color: COLORS.textDim,
                cursor: 'pointer',
                fontFamily: 'var(--sl-font-system-mono, monospace)',
                textAlign: 'left' as const,
              }}
            >
              <div style={{ fontWeight: 600, color: COLORS.text, marginBottom: '2px' }}>{p.label}</div>
              <div style={{ fontSize: 11 }}>{p.description}</div>
            </button>
          ))}
        </div>

        {/* Stats bar */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px',
          padding: '12px 16px',
          background: COLORS.surfaceLight,
          borderRadius: '8px',
          marginBottom: '16px',
        }}>
          <StatCell
            label="Current Base Fee"
            value={`${currentBlock.baseFee.toFixed(2)} Gwei`}
            color={COLORS.orange}
          />
          <StatCell
            label="Blocks Simulated"
            value={`${displayBlocks.length}`}
            color={COLORS.accent}
          />
          <StatCell
            label="Total Burned"
            value={`${totalBurned.toFixed(3)} ETH*`}
            color={COLORS.red}
          />
          <StatCell
            label="Total Tips"
            value={`${totalReward.toFixed(3)} ETH*`}
            color={COLORS.green}
          />
        </div>
      </div>

      {/* Charts */}
      <div style={{ padding: '0 20px 16px' }}>
        {/* Base Fee Line Chart */}
        <SectionLabel text="Base Fee Trend (Gwei)" />
        <svg
          viewBox={`0 0 ${chartW} ${lineAreaH}`}
          width="100%"
          style={{ display: 'block', marginBottom: '16px' }}
        >
          {/* Y-axis gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map(frac => {
            const y = padding.top + plotH * (1 - frac)
            const val = (maxBaseFee * frac).toFixed(0)
            return (
              <g key={frac}>
                <line
                  x1={padding.left} y1={y}
                  x2={chartW - padding.right} y2={y}
                  stroke={COLORS.borderLight} strokeWidth={0.5} strokeDasharray="4 4"
                />
                <text x={padding.left - 6} y={y + 4} textAnchor="end"
                  fill={COLORS.textDim} fontSize={10} fontFamily="monospace">
                  {val}
                </text>
              </g>
            )
          })}

          {/* Area fill */}
          {displayBlocks.length > 0 && (
            <path d={areaPath} fill={`${COLORS.orange}15`} />
          )}

          {/* Line */}
          {displayBlocks.length > 1 && (
            <path d={linePath} fill="none" stroke={COLORS.orange} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          )}

          {/* Data points */}
          {displayBlocks.map((b, i) => {
            const x = padding.left + (displayBlocks.length > 1 ? i * xStep : plotW / 2)
            const y = padding.top + plotH - (b.baseFee / maxBaseFee) * plotH
            return (
              <circle
                key={i}
                cx={x} cy={y} r={selectedBlock === i ? 5 : 3}
                fill={selectedBlock === i ? COLORS.orange : COLORS.bg}
                stroke={COLORS.orange}
                strokeWidth={selectedBlock === i ? 2 : 1.5}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedBlock(selectedBlock === i ? null : i)}
              />
            )
          })}
        </svg>

        {/* Gas Usage Bar Chart */}
        <SectionLabel text="Block Gas Usage (vs 15M Target)" />
        <svg
          viewBox={`0 0 ${chartW} ${barAreaH}`}
          width="100%"
          style={{ display: 'block', marginBottom: '12px' }}
        >
          {/* Target line */}
          <line
            x1={padding.left}
            y1={padding.top + (barAreaH - padding.top - padding.bottom) * 0.5}
            x2={chartW - padding.right}
            y2={padding.top + (barAreaH - padding.top - padding.bottom) * 0.5}
            stroke={COLORS.yellow}
            strokeWidth={1}
            strokeDasharray="6 3"
          />
          <text
            x={padding.left - 6}
            y={padding.top + (barAreaH - padding.top - padding.bottom) * 0.5 + 4}
            textAnchor="end"
            fill={COLORS.yellow}
            fontSize={9}
            fontFamily="monospace"
          >
            50%
          </text>

          {/* Bars */}
          {displayBlocks.map((b, i) => {
            const fillRatio = b.gasUsed / b.gasLimit
            const maxBarH = barAreaH - padding.top - padding.bottom
            const barH = fillRatio * maxBarH
            const x = padding.left + (displayBlocks.length > 1 ? i * xStep : plotW / 2) - barW / 2
            const y = padding.top + maxBarH - barH
            const overTarget = b.gasUsed > GAS_TARGET
            const color = overTarget ? COLORS.red : COLORS.green
            return (
              <rect
                key={i}
                className="block-bar"
                x={x} y={y}
                width={barW} height={barH}
                rx={2}
                fill={selectedBlock === i ? color : `${color}88`}
                stroke={selectedBlock === i ? color : 'none'}
                strokeWidth={1}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedBlock(selectedBlock === i ? null : i)}
              />
            )
          })}
        </svg>

        {/* Selected block detail */}
        {inspectedBlock && (
          <BlockDetail block={inspectedBlock} index={selectedBlock!} />
        )}
      </div>

      {/* Mempool */}
      <div style={{ padding: '0 20px 20px' }}>
        <SectionLabel text={`Mempool (sorted by effective priority fee at base=${currentBlock.baseFee.toFixed(1)} Gwei)`} />
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '6px',
        }}>
          {mempool.map(tx => {
            const effectivePriority = Math.min(tx.maxPriorityFee, tx.maxFee - currentBlock.baseFee)
            const canInclude = tx.maxFee >= currentBlock.baseFee
            return (
              <div key={tx.id} style={{
                padding: '8px 12px',
                borderRadius: '6px',
                background: canInclude ? `${COLORS.green}0a` : `${COLORS.red}0a`,
                border: `1px solid ${canInclude ? COLORS.green + '33' : COLORS.red + '33'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: 12,
              }}>
                <span style={{
                  fontWeight: 600,
                  color: canInclude ? COLORS.green : COLORS.red,
                  minWidth: 110,
                }}>
                  {tx.label}
                </span>
                <span style={{
                  color: COLORS.textDim,
                  fontFamily: 'var(--sl-font-system-mono, monospace)',
                  fontSize: 11,
                }}>
                  max={tx.maxFee.toFixed(1)}
                </span>
                <span style={{
                  color: COLORS.textDim,
                  fontFamily: 'var(--sl-font-system-mono, monospace)',
                  fontSize: 11,
                }}>
                  tip={effectivePriority.toFixed(1)}
                </span>
                <span style={{
                  color: COLORS.textDim,
                  fontFamily: 'var(--sl-font-system-mono, monospace)',
                  fontSize: 11,
                  marginLeft: 'auto',
                }}>
                  {(tx.gasUnits / 1000).toFixed(0)}k gas
                </span>
                <span style={{
                  fontSize: 9,
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '3px',
                  background: canInclude ? `${COLORS.green}18` : `${COLORS.red}18`,
                  color: canInclude ? COLORS.green : COLORS.red,
                }}>
                  {canInclude ? 'INCLUDABLE' : 'PRICED OUT'}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '16px 20px',
        borderTop: `1px solid ${COLORS.border}`,
        background: COLORS.surface,
      }}>
        <div style={{
          fontSize: 11, color: COLORS.textDim, marginBottom: '6px',
          fontFamily: 'var(--sl-font-system-mono, monospace)',
        }}>
          newBaseFee = baseFee * (1 + (gasUsed - gasTarget) / gasTarget / 8)
        </div>
        <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: '12px' }}>
          * ETH values are approximate (gasUsed x fee / 1e9)
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridAutoRows: '1fr',
          gap: '10px',
        }}>
          <FooterChip
            label="Base Fee Burned"
            desc="Base fee is destroyed, making ETH deflationary under high demand"
          />
          <FooterChip
            label="Priority Fee (Tip)"
            desc="Incentive for validators to include your transaction"
          />
          <FooterChip
            label="12.5% Max Change"
            desc="Base fee can only change +/-12.5% per block (1/8 of delta)"
          />
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──

function ActionButton({ label, color, onClick, disabled, active }: {
  readonly label: string
  readonly color: string
  readonly onClick: () => void
  readonly disabled?: boolean
  readonly active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '6px 14px',
        fontSize: 12,
        fontWeight: 600,
        borderRadius: '6px',
        border: `1px solid ${active ? color : color + '44'}`,
        background: active ? `${color}22` : 'transparent',
        color: disabled ? COLORS.textDim : color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--sl-font-system-mono, monospace)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  )
}

function StatCell({ label, value, color }: {
  readonly label: string
  readonly value: string
  readonly color: string
}) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 600, color: COLORS.textDim,
        textTransform: 'uppercase' as const, letterSpacing: '0.08em',
        marginBottom: '4px',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 16, fontWeight: 700, color,
        fontFamily: 'var(--sl-font-system-mono, monospace)',
      }}>
        {value}
      </div>
    </div>
  )
}

function SectionLabel({ text }: { readonly text: string }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: COLORS.textDim,
      textTransform: 'uppercase' as const, letterSpacing: '0.08em',
      marginBottom: '8px',
    }}>
      {text}
    </div>
  )
}

function BlockDetail({ block, index }: {
  readonly block: SimBlock
  readonly index: number
}) {
  const fillPct = ((block.gasUsed / block.gasLimit) * 100).toFixed(1)
  const overTarget = block.gasUsed > GAS_TARGET
  return (
    <div style={{
      padding: '12px 16px',
      background: COLORS.surfaceLight,
      borderRadius: '8px',
      marginBottom: '12px',
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '12px',
      fontSize: 12,
    }}>
      <div>
        <span style={{ color: COLORS.textDim }}>Block </span>
        <span style={{ color: COLORS.text, fontWeight: 600, fontFamily: 'var(--sl-font-system-mono, monospace)' }}>
          #{index + 1}
        </span>
      </div>
      <div>
        <span style={{ color: COLORS.textDim }}>Gas: </span>
        <span style={{
          color: overTarget ? COLORS.red : COLORS.green,
          fontWeight: 600,
          fontFamily: 'var(--sl-font-system-mono, monospace)',
        }}>
          {fillPct}%
        </span>
      </div>
      <div>
        <span style={{ color: COLORS.textDim }}>Base Fee: </span>
        <span style={{ color: COLORS.orange, fontWeight: 600, fontFamily: 'var(--sl-font-system-mono, monospace)' }}>
          {block.baseFee.toFixed(2)}
        </span>
      </div>
      <div>
        <span style={{ color: COLORS.textDim }}>Burned: </span>
        <span style={{ color: COLORS.red, fontWeight: 600, fontFamily: 'var(--sl-font-system-mono, monospace)' }}>
          {block.burned.toFixed(3)}
        </span>
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
      <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.orange }}>{label}</span>
      <span style={{ fontSize: 11, color: COLORS.textDim, lineHeight: 1.4 }}>{desc}</span>
    </div>
  )
}
