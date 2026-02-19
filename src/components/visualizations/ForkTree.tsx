import { useState, useRef, useCallback, useMemo } from 'react'
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

interface TreeBlock {
  readonly id: string
  readonly slot: number
  readonly parentId: string | null
  readonly votes: number
  readonly isCanonical: boolean
  readonly isCheckpoint: boolean
  readonly justificationStatus: 'none' | 'justified' | 'finalized'
  readonly label?: string
}

interface TreeState {
  readonly blocks: ReadonlyArray<TreeBlock>
  readonly totalValidators: number
}

interface LayoutNode {
  readonly block: TreeBlock
  readonly x: number
  readonly y: number
  readonly depth: number
  readonly subtreeVotes: number
}

// ── Preset tree configurations ──

function makeNoForkTree(): TreeState {
  return {
    totalValidators: 100,
    blocks: [
      { id: 'g', slot: 0, parentId: null, votes: 0, isCanonical: true, isCheckpoint: true, justificationStatus: 'finalized', label: 'Genesis' },
      { id: 'a1', slot: 1, parentId: 'g', votes: 12, isCanonical: true, isCheckpoint: false, justificationStatus: 'none' },
      { id: 'a2', slot: 2, parentId: 'a1', votes: 15, isCanonical: true, isCheckpoint: false, justificationStatus: 'none' },
      { id: 'a3', slot: 3, parentId: 'a2', votes: 18, isCanonical: true, isCheckpoint: false, justificationStatus: 'none' },
      { id: 'a4', slot: 4, parentId: 'a3', votes: 20, isCanonical: true, isCheckpoint: false, justificationStatus: 'none' },
      { id: 'a5', slot: 5, parentId: 'a4', votes: 16, isCanonical: true, isCheckpoint: false, justificationStatus: 'none' },
    ],
  }
}

function makeSimpleForkTree(): TreeState {
  return {
    totalValidators: 100,
    blocks: [
      { id: 'g', slot: 0, parentId: null, votes: 0, isCanonical: true, isCheckpoint: true, justificationStatus: 'finalized', label: 'Genesis' },
      { id: 'a1', slot: 1, parentId: 'g', votes: 10, isCanonical: true, isCheckpoint: false, justificationStatus: 'none' },
      { id: 'a2', slot: 2, parentId: 'a1', votes: 8, isCanonical: true, isCheckpoint: false, justificationStatus: 'none' },
      { id: 'b2', slot: 2, parentId: 'a1', votes: 5, isCanonical: false, isCheckpoint: false, justificationStatus: 'none' },
      { id: 'a3', slot: 3, parentId: 'a2', votes: 14, isCanonical: true, isCheckpoint: false, justificationStatus: 'none' },
      { id: 'b3', slot: 3, parentId: 'b2', votes: 3, isCanonical: false, isCheckpoint: false, justificationStatus: 'none' },
      { id: 'a4', slot: 4, parentId: 'a3', votes: 12, isCanonical: true, isCheckpoint: false, justificationStatus: 'none' },
    ],
  }
}

function makeDeepReorgTree(): TreeState {
  return {
    totalValidators: 100,
    blocks: [
      { id: 'g', slot: 0, parentId: null, votes: 0, isCanonical: false, isCheckpoint: true, justificationStatus: 'finalized', label: 'Genesis' },
      { id: 'a1', slot: 1, parentId: 'g', votes: 6, isCanonical: false, isCheckpoint: false, justificationStatus: 'none' },
      { id: 'b1', slot: 1, parentId: 'g', votes: 8, isCanonical: true, isCheckpoint: false, justificationStatus: 'none' },
      { id: 'a2', slot: 2, parentId: 'a1', votes: 4, isCanonical: false, isCheckpoint: false, justificationStatus: 'none' },
      { id: 'b2', slot: 2, parentId: 'b1', votes: 10, isCanonical: true, isCheckpoint: false, justificationStatus: 'none' },
      { id: 'a3', slot: 3, parentId: 'a2', votes: 3, isCanonical: false, isCheckpoint: false, justificationStatus: 'none' },
      { id: 'b3', slot: 3, parentId: 'b2', votes: 14, isCanonical: true, isCheckpoint: false, justificationStatus: 'none' },
      { id: 'c2', slot: 2, parentId: 'a1', votes: 2, isCanonical: false, isCheckpoint: false, justificationStatus: 'none' },
      { id: 'b4', slot: 4, parentId: 'b3', votes: 11, isCanonical: true, isCheckpoint: false, justificationStatus: 'none' },
    ],
  }
}

function makeFinalityTree(): TreeState {
  return {
    totalValidators: 100,
    blocks: [
      { id: 'g', slot: 0, parentId: null, votes: 0, isCanonical: true, isCheckpoint: true, justificationStatus: 'finalized', label: 'Epoch 0' },
      { id: 'a1', slot: 1, parentId: 'g', votes: 12, isCanonical: true, isCheckpoint: false, justificationStatus: 'none' },
      { id: 'a2', slot: 2, parentId: 'a1', votes: 15, isCanonical: true, isCheckpoint: true, justificationStatus: 'justified', label: 'Epoch 1' },
      { id: 'a3', slot: 3, parentId: 'a2', votes: 18, isCanonical: true, isCheckpoint: false, justificationStatus: 'none' },
      { id: 'b3', slot: 3, parentId: 'a2', votes: 4, isCanonical: false, isCheckpoint: false, justificationStatus: 'none' },
      { id: 'a4', slot: 4, parentId: 'a3', votes: 20, isCanonical: true, isCheckpoint: true, justificationStatus: 'justified', label: 'Epoch 2' },
      { id: 'a5', slot: 5, parentId: 'a4', votes: 16, isCanonical: true, isCheckpoint: false, justificationStatus: 'none' },
    ],
  }
}

const PRESETS = [
  { label: 'No Forks', make: makeNoForkTree },
  { label: 'Simple Fork', make: makeSimpleForkTree },
  { label: 'Deep Reorg', make: makeDeepReorgTree },
  { label: 'Finality', make: makeFinalityTree },
] as const

// ── Layout computation ──

function computeSubtreeVotes(
  blockId: string,
  blocks: ReadonlyArray<TreeBlock>,
  cache: Map<string, number>,
): number {
  const cached = cache.get(blockId)
  if (cached !== undefined) return cached

  const block = blocks.find(b => b.id === blockId)
  if (!block) return 0

  const children = blocks.filter(b => b.parentId === blockId)
  const childVotes = children.reduce(
    (sum, child) => sum + computeSubtreeVotes(child.id, blocks, cache),
    0,
  )
  const total = block.votes + childVotes
  cache.set(blockId, total)
  return total
}

function recomputeCanonical(blocks: ReadonlyArray<TreeBlock>): ReadonlyArray<TreeBlock> {
  const cache = new Map<string, number>()
  blocks.forEach(b => computeSubtreeVotes(b.id, blocks, cache))

  const canonicalIds = new Set<string>()
  const root = blocks.find(b => b.parentId === null)
  if (!root) return blocks

  let current: TreeBlock | undefined = root
  while (current) {
    canonicalIds.add(current.id)
    const children = blocks.filter(b => b.parentId === current!.id)
    if (children.length === 0) break
    current = children.reduce((best, child) => {
      const bestVotes = cache.get(best.id) ?? 0
      const childVotes = cache.get(child.id) ?? 0
      return childVotes > bestVotes ? child : best
    }, children[0])
  }

  return blocks.map(b => ({
    ...b,
    isCanonical: canonicalIds.has(b.id),
  }))
}

function computeLayout(blocks: ReadonlyArray<TreeBlock>): ReadonlyArray<LayoutNode> {
  const cache = new Map<string, number>()
  blocks.forEach(b => computeSubtreeVotes(b.id, blocks, cache))

  const BLOCK_W = 120
  const BLOCK_H = 60
  const H_GAP = 40
  const V_GAP = 50

  // Build depth map (BFS from root)
  const depthMap = new Map<string, number>()
  const root = blocks.find(b => b.parentId === null)
  if (!root) return []

  const queue: Array<{ id: string; depth: number }> = [{ id: root.id, depth: 0 }]
  while (queue.length > 0) {
    const item = queue.shift()!
    depthMap.set(item.id, item.depth)
    const children = blocks.filter(b => b.parentId === item.id)
    children.forEach(c => queue.push({ id: c.id, depth: item.depth + 1 }))
  }

  // Group by depth
  const maxDepth = Math.max(...Array.from(depthMap.values()))
  const depthGroups: Map<number, string[]> = new Map()
  for (let d = 0; d <= maxDepth; d++) {
    depthGroups.set(d, [])
  }
  depthMap.forEach((depth, id) => {
    depthGroups.get(depth)!.push(id)
  })

  // Assign x positions: spread siblings at each depth
  const xMap = new Map<string, number>()

  // Total width needed
  let maxWidth = 0
  depthGroups.forEach(ids => {
    if (ids.length > maxWidth) maxWidth = ids.length
  })

  depthGroups.forEach((ids, depth) => {
    const totalW = ids.length * BLOCK_W + (ids.length - 1) * H_GAP
    const startX = -totalW / 2 + BLOCK_W / 2
    ids.forEach((id, i) => {
      xMap.set(id, startX + i * (BLOCK_W + H_GAP))
    })
  })

  return blocks.map(b => {
    const depth = depthMap.get(b.id) ?? 0
    return {
      block: b,
      x: xMap.get(b.id) ?? 0,
      y: depth * (BLOCK_H + V_GAP),
      depth,
      subtreeVotes: cache.get(b.id) ?? 0,
    }
  })
}

// ── Main component ──

export default function ForkTree() {
  const [state, setState] = useState<TreeState>(makeSimpleForkTree)
  const [selectedPreset, setSelectedPreset] = useState(1)
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null)
  const [showVotes, setShowVotes] = useState(true)
  const [showCheckpoints, setShowCheckpoints] = useState(true)
  const [animKey, setAnimKey] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const layout = useMemo(() => computeLayout(state.blocks), [state.blocks])

  // SVG viewport dimensions
  const BLOCK_W = 120
  const BLOCK_H = 60
  const PADDING = 60

  const svgBounds = useMemo(() => {
    if (layout.length === 0) return { minX: 0, minY: 0, width: 400, height: 300 }
    const xs = layout.map(n => n.x)
    const ys = layout.map(n => n.y)
    const minX = Math.min(...xs) - BLOCK_W / 2 - PADDING
    const maxX = Math.max(...xs) + BLOCK_W / 2 + PADDING
    const minY = Math.min(...ys) - PADDING
    const maxY = Math.max(...ys) + BLOCK_H + PADDING
    return { minX, minY: minY, width: maxX - minX, height: maxY - minY }
  }, [layout])

  const handlePreset = useCallback((index: number) => {
    setSelectedPreset(index)
    setSelectedBlock(null)
    const tree = PRESETS[index].make()
    setState(tree)
    setAnimKey(k => k + 1)
  }, [])

  const addVote = useCallback((blockId: string) => {
    setState(prev => {
      const updated = prev.blocks.map(b =>
        b.id === blockId ? { ...b, votes: b.votes + 1 } : b
      )
      return {
        ...prev,
        blocks: recomputeCanonical(updated),
      }
    })
    setAnimKey(k => k + 1)
  }, [])

  const removeVote = useCallback((blockId: string) => {
    setState(prev => {
      const block = prev.blocks.find(b => b.id === blockId)
      if (!block || block.votes <= 0) return prev
      const updated = prev.blocks.map(b =>
        b.id === blockId ? { ...b, votes: b.votes - 1 } : b
      )
      return {
        ...prev,
        blocks: recomputeCanonical(updated),
      }
    })
    setAnimKey(k => k + 1)
  }, [])

  // GSAP animation
  useGSAP(() => {
    if (!svgRef.current || animKey === 0) return
    const blocks = svgRef.current.querySelectorAll('.tree-block')
    const edges = svgRef.current.querySelectorAll('.tree-edge')

    const tl = gsap.timeline()
    tl.fromTo(edges,
      { opacity: 0, strokeDashoffset: 100 },
      { opacity: 1, strokeDashoffset: 0, duration: 0.4, ease: 'power2.out', stagger: 0.05 },
    )
    tl.fromTo(blocks,
      { opacity: 0, scale: 0.8, transformOrigin: 'center center' },
      { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(1.7)', stagger: 0.06 },
      0.1,
    )
  }, { scope: containerRef, dependencies: [animKey] })

  // Find selected block data
  const selectedNode = selectedBlock
    ? layout.find(n => n.block.id === selectedBlock)
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
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS.accent }} />
        <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>
          Fork Choice & Finality
        </span>
        <span style={{ fontSize: 13, color: COLORS.textDim }}>LMD-GHOST + Casper FFG</span>
      </div>

      {/* Controls */}
      <div style={{ padding: '16px 20px 0' }}>
        {/* Presets */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${PRESETS.length}, 1fr)`,
          gap: '8px',
          marginBottom: '12px',
        }}>
          {PRESETS.map((p, i) => (
            <button
              type="button"
              key={p.label}
              onClick={() => handlePreset(i)}
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
        </div>

        {/* Toggle options */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
          <ToggleButton
            label="Vote Counts"
            active={showVotes}
            onClick={() => setShowVotes(v => !v)}
          />
          <ToggleButton
            label="Checkpoints"
            active={showCheckpoints}
            onClick={() => setShowCheckpoints(v => !v)}
          />
        </div>
      </div>

      {/* SVG Tree */}
      <div style={{
        padding: '0 20px',
        overflowX: 'auto',
      }}>
        <svg
          ref={svgRef}
          viewBox={`${svgBounds.minX} ${svgBounds.minY} ${svgBounds.width} ${svgBounds.height}`}
          width="100%"
          style={{
            minHeight: 260,
            maxHeight: 440,
            display: 'block',
          }}
        >
          {/* Edges */}
          {layout.map(node => {
            if (!node.block.parentId) return null
            const parent = layout.find(n => n.block.id === node.block.parentId)
            if (!parent) return null
            const isCanonicalEdge = node.block.isCanonical && parent.block.isCanonical
            return (
              <line
                key={`edge-${node.block.id}`}
                className="tree-edge"
                x1={parent.x}
                y1={parent.y + BLOCK_H}
                x2={node.x}
                y2={node.y}
                stroke={isCanonicalEdge ? COLORS.green : COLORS.borderLight}
                strokeWidth={isCanonicalEdge ? 2.5 : 1.5}
                strokeDasharray={isCanonicalEdge ? 'none' : '6 4'}
                opacity={isCanonicalEdge ? 1 : 0.5}
              />
            )
          })}

          {/* Blocks */}
          {layout.map(node => {
            const b = node.block
            const isSelected = selectedBlock === b.id
            const blockColor = b.isCanonical ? COLORS.green : COLORS.textDim

            return (
              <g
                key={b.id}
                className="tree-block"
                onClick={() => setSelectedBlock(prev => prev === b.id ? null : b.id)}
                style={{ cursor: 'pointer' }}
              >
                {/* Checkpoint glow */}
                {showCheckpoints && b.isCheckpoint && (
                  <rect
                    x={node.x - BLOCK_W / 2 - 4}
                    y={node.y - 4}
                    width={BLOCK_W + 8}
                    height={BLOCK_H + 8}
                    rx={10}
                    fill="none"
                    stroke={b.justificationStatus === 'finalized' ? COLORS.purple : COLORS.yellow}
                    strokeWidth={2}
                    strokeDasharray={b.justificationStatus === 'justified' ? '6 3' : 'none'}
                    opacity={0.8}
                  />
                )}

                {/* Block rect */}
                <rect
                  x={node.x - BLOCK_W / 2}
                  y={node.y}
                  width={BLOCK_W}
                  height={BLOCK_H}
                  rx={8}
                  fill={isSelected ? COLORS.surfaceLight : COLORS.surface}
                  stroke={isSelected ? COLORS.accent : blockColor}
                  strokeWidth={isSelected ? 2 : 1.5}
                />

                {/* Slot number */}
                <text
                  x={node.x}
                  y={node.y + 22}
                  textAnchor="middle"
                  fill={blockColor}
                  fontSize={14}
                  fontWeight={700}
                  fontFamily="var(--sl-font-system-mono, monospace)"
                >
                  Slot {b.slot}
                </text>

                {/* Label (if any) */}
                {b.label && (
                  <text
                    x={node.x}
                    y={node.y + 38}
                    textAnchor="middle"
                    fill={COLORS.textDim}
                    fontSize={10}
                    fontFamily="var(--sl-font-system-mono, monospace)"
                  >
                    {b.label}
                  </text>
                )}

                {/* Vote count badge */}
                {showVotes && b.votes > 0 && (
                  <g>
                    <circle
                      cx={node.x + BLOCK_W / 2 - 2}
                      cy={node.y + 2}
                      r={12}
                      fill={b.isCanonical ? COLORS.green : COLORS.orange}
                      opacity={0.9}
                    />
                    <text
                      x={node.x + BLOCK_W / 2 - 2}
                      y={node.y + 6}
                      textAnchor="middle"
                      fill={COLORS.bg}
                      fontSize={10}
                      fontWeight={700}
                      fontFamily="var(--sl-font-system-mono, monospace)"
                    >
                      {b.votes}
                    </text>
                  </g>
                )}

                {/* Subtree vote total */}
                {showVotes && (
                  <text
                    x={node.x}
                    y={node.y + BLOCK_H + 14}
                    textAnchor="middle"
                    fill={COLORS.textDim}
                    fontSize={9}
                    fontFamily="var(--sl-font-system-mono, monospace)"
                  >
                    weight: {node.subtreeVotes}
                  </text>
                )}

                {/* Checkpoint badge */}
                {showCheckpoints && b.justificationStatus !== 'none' && (
                  <g>
                    <rect
                      x={node.x - BLOCK_W / 2}
                      y={node.y + BLOCK_H - 16}
                      width={BLOCK_W}
                      height={16}
                      rx={0}
                      ry={0}
                      fill={b.justificationStatus === 'finalized' ? `${COLORS.purple}44` : `${COLORS.yellow}44`}
                    />
                    <text
                      x={node.x}
                      y={node.y + BLOCK_H - 4}
                      textAnchor="middle"
                      fill={b.justificationStatus === 'finalized' ? COLORS.purple : COLORS.yellow}
                      fontSize={9}
                      fontWeight={700}
                      fontFamily="var(--sl-font-system-mono, monospace)"
                    >
                      {b.justificationStatus === 'finalized' ? 'FINALIZED' : 'JUSTIFIED'}
                    </text>
                  </g>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Selected block detail + vote controls */}
      {selectedNode && (
        <div style={{
          margin: '0 20px 16px',
          padding: '16px',
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: '10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <span style={{
              fontSize: 14,
              fontWeight: 700,
              color: selectedNode.block.isCanonical ? COLORS.green : COLORS.textDim,
              fontFamily: 'var(--sl-font-system-mono, monospace)',
            }}>
              Slot {selectedNode.block.slot} ({selectedNode.block.id})
            </span>
            {selectedNode.block.isCanonical && (
              <Badge text="CANONICAL" color={COLORS.green} />
            )}
            {selectedNode.block.justificationStatus === 'justified' && (
              <Badge text="JUSTIFIED" color={COLORS.yellow} />
            )}
            {selectedNode.block.justificationStatus === 'finalized' && (
              <Badge text="FINALIZED" color={COLORS.purple} />
            )}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '10px',
            marginBottom: '12px',
          }}>
            <StatChip label="Direct Votes" value={String(selectedNode.block.votes)} color={COLORS.accent} />
            <StatChip label="Subtree Weight" value={String(selectedNode.subtreeVotes)} color={COLORS.green} />
            <StatChip label="Depth" value={String(selectedNode.depth)} color={COLORS.cyan} />
          </div>

          {/* Vote controls */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => addVote(selectedNode.block.id)}
              style={{
                flex: 1,
                padding: '8px 16px',
                fontSize: 12,
                fontWeight: 600,
                borderRadius: '8px',
                border: `1px solid ${COLORS.green}66`,
                background: `${COLORS.green}18`,
                color: COLORS.green,
                cursor: 'pointer',
                fontFamily: 'var(--sl-font-system-mono, monospace)',
              }}
            >
              + Add Vote
            </button>
            <button
              type="button"
              onClick={() => removeVote(selectedNode.block.id)}
              style={{
                flex: 1,
                padding: '8px 16px',
                fontSize: 12,
                fontWeight: 600,
                borderRadius: '8px',
                border: `1px solid ${COLORS.red}66`,
                background: `${COLORS.red}18`,
                color: COLORS.red,
                cursor: 'pointer',
                fontFamily: 'var(--sl-font-system-mono, monospace)',
                opacity: selectedNode.block.votes > 0 ? 1 : 0.4,
              }}
            >
              - Remove Vote
            </button>
          </div>
        </div>
      )}

      {!selectedBlock && (
        <div style={{
          padding: '0 20px 16px',
          fontSize: 12,
          color: COLORS.textDim,
          textAlign: 'center' as const,
        }}>
          Click any block to view details and add/remove votes
        </div>
      )}

      {/* Legend */}
      <div style={{
        padding: '16px 20px',
        borderTop: `1px solid ${COLORS.border}`,
        background: COLORS.surface,
      }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap' as const,
          gap: '16px',
          marginBottom: '16px',
        }}>
          <LegendItem color={COLORS.green} label="Canonical chain (heaviest)" dashed={false} />
          <LegendItem color={COLORS.textDim} label="Fork (orphaned)" dashed />
          {showCheckpoints && (
            <>
              <LegendItem color={COLORS.yellow} label="Justified checkpoint" dashed />
              <LegendItem color={COLORS.purple} label="Finalized checkpoint" dashed={false} />
            </>
          )}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridAutoRows: '1fr',
          gap: '10px',
        }}>
          <FooterChip
            label="LMD-GHOST"
            desc="Latest Message Driven - Greedy Heaviest Observed SubTree"
          />
          <FooterChip
            label="Casper FFG"
            desc="Justified -> Finalized checkpoints via 2/3 supermajority"
          />
          <FooterChip
            label="Fork Choice"
            desc="Validators vote on head; heaviest subtree becomes canonical"
          />
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──

function ToggleButton({ label, active, onClick }: {
  readonly label: string
  readonly active: boolean
  readonly onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 12px',
        fontSize: 11,
        fontWeight: 600,
        borderRadius: '6px',
        border: `1px solid ${active ? COLORS.accent : COLORS.borderLight}`,
        background: active ? COLORS.accentDim : 'transparent',
        color: active ? COLORS.accent : COLORS.textDim,
        cursor: 'pointer',
        fontFamily: 'var(--sl-font-system-mono, monospace)',
      }}
    >
      {active ? '[x]' : '[ ]'} {label}
    </button>
  )
}

function Badge({ text, color }: {
  readonly text: string
  readonly color: string
}) {
  return (
    <span style={{
      fontSize: 9,
      fontWeight: 700,
      padding: '2px 6px',
      borderRadius: '3px',
      background: `${color}22`,
      color,
      letterSpacing: '0.05em',
      fontFamily: 'var(--sl-font-system-mono, monospace)',
    }}>
      {text}
    </span>
  )
}

function StatChip({ label, value, color }: {
  readonly label: string
  readonly value: string
  readonly color: string
}) {
  return (
    <div style={{
      padding: '8px 12px',
      background: COLORS.surfaceLight,
      borderRadius: '6px',
      textAlign: 'center' as const,
    }}>
      <div style={{ fontSize: 10, color: COLORS.textDim, marginBottom: '4px' }}>{label}</div>
      <div style={{
        fontSize: 16,
        fontWeight: 700,
        color,
        fontFamily: 'var(--sl-font-system-mono, monospace)',
      }}>
        {value}
      </div>
    </div>
  )
}

function LegendItem({ color, label, dashed }: {
  readonly color: string
  readonly label: string
  readonly dashed: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{
        width: 20,
        height: 3,
        background: color,
        borderRadius: 2,
        ...(dashed ? { background: `repeating-linear-gradient(90deg, ${color} 0px, ${color} 4px, transparent 4px, transparent 8px)` } : {}),
      }} />
      <span style={{ fontSize: 11, color: COLORS.textDim }}>{label}</span>
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
