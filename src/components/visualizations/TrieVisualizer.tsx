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

// ── Node type colors ──
const NODE_COLORS = {
  branch:    { color: COLORS.accent,  bg: '#627eea18', label: 'Branch' },
  extension: { color: COLORS.purple,  bg: '#a78bfa18', label: 'Extension' },
  leaf:      { color: COLORS.green,   bg: '#4ade8018', label: 'Leaf' },
  empty:     { color: COLORS.textDim, bg: '#64748b18', label: 'Empty' },
} as const

type NodeType = keyof typeof NODE_COLORS

// ── Trie data structures ──
interface TrieLeaf {
  readonly type: 'leaf'
  readonly path: ReadonlyArray<number>
  readonly value: string
  readonly fullKey: string
}

interface TrieExtension {
  readonly type: 'extension'
  readonly path: ReadonlyArray<number>
  readonly child: TrieNode
}

interface TrieBranch {
  readonly type: 'branch'
  readonly children: ReadonlyArray<TrieNode | null>
  readonly value: string | null
}

interface TrieEmpty {
  readonly type: 'empty'
}

type TrieNode = TrieLeaf | TrieExtension | TrieBranch | TrieEmpty

interface KeyValue {
  readonly key: string
  readonly value: string
}

interface Preset {
  readonly label: string
  readonly description: string
  readonly entries: ReadonlyArray<KeyValue>
}

// ── Hex-prefix encoding ──
function hexPrefixEncode(nibbles: ReadonlyArray<number>, isLeaf: boolean): string {
  const flag = isLeaf ? 2 : 0
  let encoded: ReadonlyArray<number>
  if (nibbles.length % 2 === 1) {
    encoded = [flag + 1, ...nibbles]
  } else {
    encoded = [flag, 0, ...nibbles]
  }
  const bytes: Array<string> = []
  for (let i = 0; i < encoded.length; i += 2) {
    bytes.push(((encoded[i] << 4) | encoded[i + 1]).toString(16).padStart(2, '0'))
  }
  return bytes.join('')
}

// ── Trie builder (simplified, builds visual tree from key-value pairs) ──
function stringToNibbles(hex: string): ReadonlyArray<number> {
  return hex.split('').map(c => parseInt(c, 16))
}

function sharedPrefix(a: ReadonlyArray<number>, b: ReadonlyArray<number>): ReadonlyArray<number> {
  const result: Array<number> = []
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) break
    result.push(a[i])
  }
  return result
}

function buildTrie(entries: ReadonlyArray<KeyValue>): TrieNode {
  if (entries.length === 0) return { type: 'empty' }

  const nibbleEntries = entries.map(e => ({
    nibbles: stringToNibbles(e.key),
    value: e.value,
    fullKey: e.key,
  }))

  return buildNode(nibbleEntries)
}

interface NibbleEntry {
  readonly nibbles: ReadonlyArray<number>
  readonly value: string
  readonly fullKey: string
}

function buildNode(entries: ReadonlyArray<NibbleEntry>): TrieNode {
  if (entries.length === 0) return { type: 'empty' }

  if (entries.length === 1) {
    const e = entries[0]
    return {
      type: 'leaf',
      path: e.nibbles,
      value: e.value,
      fullKey: e.fullKey,
    }
  }

  // Find shared prefix among all entries
  let prefix = entries[0].nibbles
  for (let i = 1; i < entries.length; i++) {
    prefix = sharedPrefix(prefix, entries[i].nibbles)
  }

  // Strip prefix from all entries
  const stripped = entries.map(e => ({
    ...e,
    nibbles: e.nibbles.slice(prefix.length),
  }))

  // If there's a shared prefix, create an extension node
  if (prefix.length > 0) {
    const child = buildBranch(stripped)
    return {
      type: 'extension',
      path: prefix,
      child,
    }
  }

  return buildBranch(stripped)
}

function buildBranch(entries: ReadonlyArray<NibbleEntry>): TrieNode {
  // Group by first nibble
  const buckets: Array<Array<NibbleEntry>> = Array.from({ length: 16 }, () => [])
  let branchValue: string | null = null

  for (const e of entries) {
    if (e.nibbles.length === 0) {
      branchValue = e.value
    } else {
      buckets[e.nibbles[0]].push({
        ...e,
        nibbles: e.nibbles.slice(1),
      })
    }
  }

  const children: Array<TrieNode | null> = buckets.map(bucket => {
    if (bucket.length === 0) return null
    return buildNode(bucket)
  })

  return {
    type: 'branch',
    children,
    value: branchValue,
  }
}

// ── Presets ──
const PRESETS: ReadonlyArray<Preset> = [
  {
    label: 'Empty',
    description: 'Empty trie (no entries)',
    entries: [],
  },
  {
    label: 'Simple (2 keys)',
    description: 'Two keys sharing prefix "do"',
    entries: [
      { key: '646f65', value: 'reindeer' },  // "doe"
      { key: '646f67', value: 'puppy' },      // "dog"
    ],
  },
  {
    label: 'Classic (3 keys)',
    description: 'doe/dog/dogglesworth (from Ethereum docs)',
    entries: [
      { key: '646f65', value: 'reindeer' },     // "doe"
      { key: '646f67', value: 'puppy' },         // "dog"
      { key: '646f676768', value: 'cat' },       // "doggh" (simplified dogglesworth)
    ],
  },
  {
    label: 'Account Keys',
    description: 'Different address prefixes showing branch diversity',
    entries: [
      { key: 'a711355', value: 'Account A' },
      { key: 'a77d337', value: 'Account B' },
      { key: 'a7f9365', value: 'Account C' },
      { key: 'a7f9368', value: 'Account D' },
    ],
  },
]

// ── Count nodes by type ──
function countNodes(node: TrieNode): Record<NodeType, number> {
  const counts: Record<NodeType, number> = { branch: 0, extension: 0, leaf: 0, empty: 0 }

  function walk(n: TrieNode) {
    counts[n.type]++
    if (n.type === 'branch') {
      for (const child of n.children) {
        if (child) walk(child)
      }
    } else if (n.type === 'extension') {
      walk(n.child)
    }
  }

  walk(node)
  return counts
}

export default function TrieVisualizer() {
  const [selectedPreset, setSelectedPreset] = useState(2)
  const [customEntries, setCustomEntries] = useState<ReadonlyArray<KeyValue>>(PRESETS[2].entries)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [animKey, setAnimKey] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const trie = buildTrie(customEntries)
  const nodeCounts = countNodes(trie)

  const handleSelectPreset = useCallback((index: number) => {
    setSelectedPreset(index)
    setCustomEntries(PRESETS[index].entries)
    setSelectedNodeId(null)
    setAnimKey(k => k + 1)
  }, [])

  const handleInsert = useCallback(() => {
    const cleanKey = newKey.replace(/^0x/, '').toLowerCase()
    if (cleanKey.length === 0 || !/^[0-9a-f]+$/.test(cleanKey)) return
    if (newValue.length === 0) return

    setCustomEntries(prev => {
      const existing = prev.findIndex(e => e.key === cleanKey)
      if (existing >= 0) {
        return prev.map((e, i) => i === existing ? { key: cleanKey, value: newValue } : e)
      }
      return [...prev, { key: cleanKey, value: newValue }]
    })
    setNewKey('')
    setNewValue('')
    setSelectedPreset(-1)
    setAnimKey(k => k + 1)
  }, [newKey, newValue])

  const handleRemoveEntry = useCallback((key: string) => {
    setCustomEntries(prev => prev.filter(e => e.key !== key))
    setSelectedPreset(-1)
    setAnimKey(k => k + 1)
  }, [])

  // GSAP entrance animation
  useGSAP(() => {
    if (!containerRef.current || animKey === 0) return
    const nodes = containerRef.current.querySelectorAll('.trie-node')
    gsap.fromTo(nodes,
      { opacity: 0.3, y: 6, scale: 0.97 },
      { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: 'power2.out', stagger: 0.05 },
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
          Merkle Patricia Trie
        </span>
        <span style={{ fontSize: 13, color: COLORS.textDim }}>Interactive Visualizer</span>
        <span style={{
          marginLeft: 'auto',
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: '4px',
          background: `${COLORS.green}18`,
          color: COLORS.green,
          fontWeight: 600,
        }}>
          {customEntries.length} {customEntries.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {/* Preset selector */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${PRESETS.length}, 1fr)`,
          gap: '8px',
          marginBottom: '16px',
        }}>
          {PRESETS.map((p, i) => (
            <button
              type="button"
              key={p.label}
              onClick={() => handleSelectPreset(i)}
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

        {/* Insert form */}
        <div style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-end',
          marginBottom: '16px',
        }}>
          <div style={{ flex: 1 }}>
            <SectionLabel text="Key (hex)" />
            <input
              type="text"
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              placeholder="e.g. a7f93"
              spellCheck={false}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <SectionLabel text="Value" />
            <input
              type="text"
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              placeholder="e.g. Alice"
              spellCheck={false}
              style={inputStyle}
            />
          </div>
          <button
            type="button"
            onClick={handleInsert}
            style={{
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: '8px',
              border: `1px solid ${COLORS.accent}`,
              background: COLORS.accentDim,
              color: COLORS.accent,
              cursor: 'pointer',
              fontFamily: 'var(--sl-font-system-mono, monospace)',
              whiteSpace: 'nowrap' as const,
            }}
          >
            Insert
          </button>
        </div>
      </div>

      {/* Current entries table */}
      {customEntries.length > 0 && (
        <div style={{ padding: '0 20px 16px' }}>
          <SectionLabel text="Stored Key-Value Pairs" />
          <div style={{
            background: COLORS.surface,
            borderRadius: '8px',
            border: `1px solid ${COLORS.border}`,
            overflow: 'hidden',
          }}>
            {customEntries.map((entry) => (
              <div
                key={entry.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 12px',
                  borderBottom: `1px solid ${COLORS.border}`,
                  fontSize: 12,
                }}
              >
                <code style={{
                  color: COLORS.accent,
                  fontFamily: 'var(--sl-font-system-mono, monospace)',
                  minWidth: 100,
                }}>
                  0x{entry.key}
                </code>
                <span style={{ color: COLORS.textDim }}>=</span>
                <span style={{ color: COLORS.text, flex: 1 }}>{entry.value}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveEntry(entry.key)}
                  style={{
                    padding: '2px 8px',
                    fontSize: 10,
                    borderRadius: '4px',
                    border: `1px solid ${COLORS.red}44`,
                    background: `${COLORS.red}11`,
                    color: COLORS.red,
                    cursor: 'pointer',
                    fontFamily: 'var(--sl-font-system-mono, monospace)',
                  }}
                >
                  DEL
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Node count summary */}
      <div style={{
        padding: '0 20px 16px',
        display: 'flex',
        gap: '8px',
      }}>
        {(Object.keys(NODE_COLORS) as ReadonlyArray<NodeType>).map(type => (
          <div key={type} style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 10px',
            background: NODE_COLORS[type].bg,
            borderRadius: '6px',
            border: `1px solid ${NODE_COLORS[type].color}22`,
          }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: type === 'branch' ? '2px' : '50%',
              background: NODE_COLORS[type].color,
            }} />
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: NODE_COLORS[type].color,
            }}>
              {NODE_COLORS[type].label}
            </span>
            <span style={{
              fontSize: 11,
              color: COLORS.textDim,
              marginLeft: 'auto',
              fontFamily: 'var(--sl-font-system-mono, monospace)',
            }}>
              {nodeCounts[type]}
            </span>
          </div>
        ))}
      </div>

      {/* Trie visualization */}
      <div style={{
        padding: '0 20px 20px',
        overflowX: 'auto' as const,
      }}>
        <TrieNodeView
          node={trie}
          depth={0}
          path=""
          selectedId={selectedNodeId}
          onSelect={setSelectedNodeId}
        />
      </div>

      {/* Hex-prefix encoding reference */}
      <div style={{
        padding: '16px 20px',
        borderTop: `1px solid ${COLORS.border}`,
        background: COLORS.surface,
      }}>
        <SectionLabel text="Hex-Prefix Encoding" />
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '6px',
          marginTop: '8px',
          marginBottom: '16px',
        }}>
          <HpCell prefix="0x00" nodeType="Extension" parity="even" />
          <HpCell prefix="0x1_" nodeType="Extension" parity="odd" />
          <HpCell prefix="0x20" nodeType="Leaf" parity="even" />
          <HpCell prefix="0x3_" nodeType="Leaf" parity="odd" />
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridAutoRows: '1fr',
          gap: '10px',
        }}>
          <FooterChip
            label="4 Node Types"
            desc="Branch (16 slots + value), Extension (shared path), Leaf (path + value), Empty"
          />
          <FooterChip
            label="Merkle Proofs"
            desc="Root hash commits to entire state; any key verifiable with O(log n) nodes"
          />
          <FooterChip
            label="Path Compression"
            desc="Extension nodes skip shared nibbles, reducing tree depth"
          />
        </div>
      </div>
    </div>
  )
}

// ── Input style ──
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  background: COLORS.surfaceLight,
  border: `1px solid ${COLORS.borderLight}`,
  borderRadius: '8px',
  color: COLORS.text,
  fontFamily: 'var(--sl-font-system-mono, monospace)',
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box' as const,
}

// ── Recursive trie node renderer ──
function TrieNodeView({ node, depth, path, selectedId, onSelect }: {
  readonly node: TrieNode
  readonly depth: number
  readonly path: string
  readonly selectedId: string | null
  readonly onSelect: (id: string | null) => void
}) {
  const nodeId = `${node.type}-${depth}-${path}`
  const isSelected = selectedId === nodeId
  const colors = NODE_COLORS[node.type]

  if (node.type === 'empty') {
    return (
      <div
        className="trie-node"
        onClick={() => onSelect(isSelected ? null : nodeId)}
        style={{
          padding: '12px 16px',
          background: colors.bg,
          border: `1px solid ${isSelected ? colors.color : colors.color + '33'}`,
          borderRadius: '10px',
          cursor: 'pointer',
          transition: 'border-color 0.2s',
        }}
      >
        <NodeHeader type="empty" label="Empty Trie" />
        <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: '6px' }}>
          No data stored. Insert a key-value pair to begin.
        </div>
      </div>
    )
  }

  if (node.type === 'leaf') {
    const hp = hexPrefixEncode(node.path, true)
    return (
      <div
        className="trie-node"
        onClick={(e) => { e.stopPropagation(); onSelect(isSelected ? null : nodeId) }}
        style={{
          padding: '12px 16px',
          background: colors.bg,
          border: `1px solid ${isSelected ? colors.color : colors.color + '33'}`,
          borderRadius: '10px',
          cursor: 'pointer',
          transition: 'border-color 0.2s',
        }}
      >
        <NodeHeader type="leaf" label="Leaf Node" />
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column' as const, gap: '4px' }}>
          <KvRow label="path" value={nibblesToString(node.path)} color={colors.color} />
          <KvRow label="hp" value={`0x${hp}`} color={COLORS.yellow} />
          <KvRow label="value" value={node.value} color={COLORS.text} />
          <KvRow label="full key" value={`0x${node.fullKey}`} color={COLORS.textDim} />
        </div>
      </div>
    )
  }

  if (node.type === 'extension') {
    const hp = hexPrefixEncode(node.path, false)
    return (
      <div className="trie-node" style={{ display: 'flex', flexDirection: 'column' as const, gap: '0' }}>
        <div
          onClick={() => onSelect(isSelected ? null : nodeId)}
          style={{
            padding: '12px 16px',
            background: colors.bg,
            border: `1px solid ${isSelected ? colors.color : colors.color + '33'}`,
            borderRadius: '10px',
            cursor: 'pointer',
            transition: 'border-color 0.2s',
          }}
        >
          <NodeHeader type="extension" label="Extension Node" />
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column' as const, gap: '4px' }}>
            <KvRow label="shared path" value={nibblesToString(node.path)} color={colors.color} />
            <KvRow label="hp" value={`0x${hp}`} color={COLORS.yellow} />
          </div>
        </div>
        <ConnectorLine />
        <div style={{ paddingLeft: '24px' }}>
          <TrieNodeView
            node={node.child}
            depth={depth + 1}
            path={path + nibblesToString(node.path)}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </div>
      </div>
    )
  }

  // Branch node
  const activeSlots = node.children
    .map((child, i) => child ? i : -1)
    .filter(i => i >= 0)

  return (
    <div className="trie-node" style={{ display: 'flex', flexDirection: 'column' as const, gap: '0' }}>
      <div
        onClick={() => onSelect(isSelected ? null : nodeId)}
        style={{
          padding: '12px 16px',
          background: colors.bg,
          border: `1px solid ${isSelected ? colors.color : colors.color + '33'}`,
          borderRadius: '10px',
          cursor: 'pointer',
          transition: 'border-color 0.2s',
        }}
      >
        <NodeHeader type="branch" label="Branch Node" />

        {/* 16 slot indicators */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(16, 1fr)',
          gap: '2px',
          marginTop: '8px',
        }}>
          {node.children.map((child, i) => (
            <div key={i} style={{
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 9,
              fontWeight: 600,
              fontFamily: 'var(--sl-font-system-mono, monospace)',
              borderRadius: '3px',
              background: child ? `${COLORS.accent}33` : `${COLORS.textDim}11`,
              color: child ? COLORS.accent : COLORS.borderLight,
              border: `1px solid ${child ? COLORS.accent + '44' : 'transparent'}`,
            }}>
              {i.toString(16).toUpperCase()}
            </div>
          ))}
        </div>

        {node.value && (
          <div style={{ marginTop: '8px' }}>
            <KvRow label="value" value={node.value} color={COLORS.text} />
          </div>
        )}

        <div style={{ marginTop: '6px', fontSize: 10, color: COLORS.textDim }}>
          Active slots: [{activeSlots.map(s => s.toString(16)).join(', ')}]
          {node.value ? ' + terminal value' : ''}
        </div>
      </div>

      {/* Children */}
      {activeSlots.length > 0 && (
        <div style={{
          display: 'flex',
          flexDirection: 'column' as const,
          gap: '0',
          paddingLeft: '24px',
        }}>
          {activeSlots.map(slot => {
            const child = node.children[slot]
            if (!child) return null
            return (
              <div key={slot}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 0',
                }}>
                  <div style={{
                    width: 2,
                    height: 12,
                    background: COLORS.borderLight,
                    marginLeft: '8px',
                  }} />
                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: COLORS.accent,
                    fontFamily: 'var(--sl-font-system-mono, monospace)',
                    padding: '1px 6px',
                    background: COLORS.accentDim,
                    borderRadius: '3px',
                  }}>
                    slot {slot.toString(16)}
                  </span>
                </div>
                <TrieNodeView
                  node={child}
                  depth={depth + 1}
                  path={path + slot.toString(16)}
                  selectedId={selectedId}
                  onSelect={onSelect}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──

function nibblesToString(nibbles: ReadonlyArray<number>): string {
  return nibbles.map(n => n.toString(16)).join('')
}

function NodeHeader({ type, label }: {
  readonly type: NodeType
  readonly label: string
}) {
  const colors = NODE_COLORS[type]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{
        width: 8,
        height: 8,
        borderRadius: type === 'branch' ? '2px' : '50%',
        background: colors.color,
      }} />
      <span style={{ fontSize: 12, fontWeight: 700, color: colors.color }}>
        {label}
      </span>
    </div>
  )
}

function KvRow({ label, value, color }: {
  readonly label: string
  readonly value: string
  readonly color: string
}) {
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
      <span style={{
        fontSize: 10,
        fontWeight: 600,
        color: COLORS.textDim,
        minWidth: 60,
        textAlign: 'right' as const,
        fontFamily: 'var(--sl-font-system-mono, monospace)',
      }}>
        {label}
      </span>
      <code style={{
        fontSize: 12,
        color,
        fontFamily: 'var(--sl-font-system-mono, monospace)',
        wordBreak: 'break-all' as const,
      }}>
        {value}
      </code>
    </div>
  )
}

function ConnectorLine() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      padding: '2px 0',
    }}>
      <div style={{ width: 2, height: 10, background: COLORS.borderLight }} />
      <div style={{
        width: 0,
        height: 0,
        borderLeft: '4px solid transparent',
        borderRight: '4px solid transparent',
        borderTop: `5px solid ${COLORS.borderLight}`,
      }} />
    </div>
  )
}

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

function HpCell({ prefix, nodeType, parity }: {
  readonly prefix: string
  readonly nodeType: string
  readonly parity: string
}) {
  const isLeaf = nodeType === 'Leaf'
  const color = isLeaf ? COLORS.green : COLORS.purple
  return (
    <div style={{
      padding: '8px 10px',
      background: `${color}11`,
      border: `1px solid ${color}22`,
      borderRadius: '6px',
      textAlign: 'center' as const,
    }}>
      <code style={{
        fontSize: 13,
        fontWeight: 700,
        color,
        fontFamily: 'var(--sl-font-system-mono, monospace)',
      }}>
        {prefix}
      </code>
      <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: '2px' }}>
        {nodeType} ({parity})
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
