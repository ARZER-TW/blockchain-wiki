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

type SlotStatus = 'proposed' | 'missed' | 'empty'
type CheckpointState = 'pending' | 'justified' | 'finalized'

interface SlotData {
  readonly slotNumber: number
  readonly status: SlotStatus
  readonly proposerIndex: number
  readonly proposerName: string
  readonly attestationCount: number
  readonly attestationTotal: number
  readonly syncParticipation: number
}

interface EpochData {
  readonly epochNumber: number
  readonly slots: ReadonlyArray<SlotData>
  readonly checkpointState: CheckpointState
  readonly totalAttestations: number
  readonly participation: number
}

// ── Constants ──

const SLOTS_PER_EPOCH = 32
const SLOT_DURATION = 12 // seconds
const VALIDATOR_NAMES = [
  'Lido-1', 'Coinbase-3', 'Kiln-7', 'Figment-2',
  'RocketPool-5', 'Allnodes-8', 'P2P-4', 'Staked.us-6',
  'Attestant-9', 'Bitcoin Suisse-1', 'Everstake-3', 'Chorus One-2',
  'Blockdaemon-7', 'StakeFish-4', 'InfStones-8', 'HashQuark-5',
]

// ── Data generators ──

function pseudoRandom(seed: number): number {
  let s = seed
  s = (s * 1103515245 + 12345) & 0x7fffffff
  return (s % 1000) / 1000
}

function generateSlot(
  slotNumber: number,
  missRate: number,
  seed: number,
): SlotData {
  const r = pseudoRandom(seed + slotNumber * 17)
  const status: SlotStatus = r < missRate ? 'missed' : 'proposed'
  const proposerIndex = Math.floor(pseudoRandom(seed + slotNumber * 31) * VALIDATOR_NAMES.length)
  const baseAttestations = status === 'proposed'
    ? Math.floor(200 + pseudoRandom(seed + slotNumber * 43) * 200)
    : Math.floor(pseudoRandom(seed + slotNumber * 43) * 50)
  const total = 400
  const syncParticipation = status === 'proposed'
    ? 0.85 + pseudoRandom(seed + slotNumber * 59) * 0.14
    : 0

  return {
    slotNumber,
    status,
    proposerIndex,
    proposerName: VALIDATOR_NAMES[proposerIndex],
    attestationCount: baseAttestations,
    attestationTotal: total,
    syncParticipation: Math.round(syncParticipation * 100) / 100,
  }
}

function generateEpoch(
  epochNumber: number,
  missRate: number,
  checkpointState: CheckpointState,
  seed: number,
): EpochData {
  const startSlot = epochNumber * SLOTS_PER_EPOCH
  const slots = Array.from({ length: SLOTS_PER_EPOCH }, (_, i) =>
    generateSlot(startSlot + i, missRate, seed),
  )
  const totalAttestations = slots.reduce((s, sl) => s + sl.attestationCount, 0)
  const totalPossible = slots.reduce((s, sl) => s + sl.attestationTotal, 0)
  const participation = totalPossible > 0 ? totalAttestations / totalPossible : 0

  return {
    epochNumber,
    slots,
    checkpointState,
    totalAttestations,
    participation: Math.round(participation * 1000) / 10,
  }
}

// ── Preset scenarios ──

interface Preset {
  readonly label: string
  readonly description: string
  readonly epochs: ReadonlyArray<EpochData>
}

function makeNormalPreset(): Preset {
  return {
    label: 'Normal Epoch',
    description: 'Healthy network with high participation and fast finality',
    epochs: [
      generateEpoch(100, 0.02, 'finalized', 42),
      generateEpoch(101, 0.03, 'finalized', 43),
      generateEpoch(102, 0.02, 'justified', 44),
      generateEpoch(103, 0.01, 'pending', 45),
    ],
  }
}

function makeMissedPreset(): Preset {
  return {
    label: 'Missed Slots',
    description: 'Several validators offline, increased miss rate',
    epochs: [
      generateEpoch(200, 0.05, 'finalized', 55),
      generateEpoch(201, 0.15, 'justified', 56),
      generateEpoch(202, 0.25, 'justified', 57),
      generateEpoch(203, 0.10, 'pending', 58),
    ],
  }
}

function makeFinalityDelayPreset(): Preset {
  return {
    label: 'Finality Delay',
    description: 'Low participation prevents justification, finality stalls',
    epochs: [
      generateEpoch(300, 0.03, 'finalized', 70),
      generateEpoch(301, 0.40, 'pending', 71),
      generateEpoch(302, 0.45, 'pending', 72),
      generateEpoch(303, 0.35, 'pending', 73),
    ],
  }
}

const ALL_PRESETS: ReadonlyArray<Preset> = [
  makeNormalPreset(),
  makeMissedPreset(),
  makeFinalityDelayPreset(),
]

// ── Component ──

export default function SlotEpochTimeline() {
  const [activePreset, setActivePreset] = useState(0)
  const [selectedSlot, setSelectedSlot] = useState<{ epoch: number; slot: number } | null>(null)
  const [animKey, setAnimKey] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)

  const preset = ALL_PRESETS[activePreset]
  const epochs = preset.epochs

  const handlePresetChange = useCallback((index: number) => {
    setActivePreset(index)
    setSelectedSlot(null)
    setAnimKey(k => k + 1)
  }, [])

  const handleSlotClick = useCallback((epochIdx: number, slotIdx: number) => {
    setSelectedSlot(prev => {
      if (prev && prev.epoch === epochIdx && prev.slot === slotIdx) return null
      return { epoch: epochIdx, slot: slotIdx }
    })
  }, [])

  // GSAP animation
  useGSAP(() => {
    if (!containerRef.current || animKey === 0) return
    const epochGroups = containerRef.current.querySelectorAll('.epoch-group')
    gsap.fromTo(epochGroups,
      { opacity: 0, x: -20 },
      { opacity: 1, x: 0, duration: 0.4, ease: 'power2.out', stagger: 0.1 },
    )
  }, { scope: containerRef, dependencies: [animKey] })

  // Selected slot details
  const selectedSlotData = selectedSlot
    ? epochs[selectedSlot.epoch]?.slots[selectedSlot.slot] ?? null
    : null
  const selectedEpochData = selectedSlot
    ? epochs[selectedSlot.epoch] ?? null
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
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS.cyan }} />
        <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>
          Slot / Epoch Timeline
        </span>
        <span style={{ fontSize: 13, color: COLORS.textDim }}>Beacon Chain Consensus</span>
        <span style={{
          marginLeft: 'auto',
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: '4px',
          background: `${COLORS.cyan}18`,
          color: COLORS.cyan,
          fontWeight: 600,
        }}>
          Consensus Layer
        </span>
      </div>

      {/* Preset selector */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${ALL_PRESETS.length}, 1fr)`,
          gap: '8px',
          marginBottom: '16px',
        }}>
          {ALL_PRESETS.map((p, i) => (
            <button
              type="button"
              key={p.label}
              onClick={() => handlePresetChange(i)}
              style={{
                padding: '8px 12px',
                fontSize: 12,
                borderRadius: '8px',
                border: `1px solid ${activePreset === i ? COLORS.cyan : COLORS.borderLight}`,
                background: activePreset === i ? `${COLORS.cyan}18` : 'transparent',
                color: activePreset === i ? COLORS.cyan : COLORS.textDim,
                cursor: 'pointer',
                fontFamily: 'var(--sl-font-system-mono, monospace)',
                textAlign: 'left' as const,
              }}
            >
              <div style={{ fontWeight: 600, color: activePreset === i ? COLORS.cyan : COLORS.text, marginBottom: '2px' }}>
                {p.label}
              </div>
              <div style={{ fontSize: 11 }}>{p.description}</div>
            </button>
          ))}
        </div>

        {/* Legend */}
        <div style={{
          display: 'flex',
          gap: '16px',
          marginBottom: '16px',
          flexWrap: 'wrap' as const,
        }}>
          <LegendItem color={COLORS.green} label="Proposed" />
          <LegendItem color={COLORS.red} label="Missed" />
          <LegendItem color={COLORS.textDim} label="Empty" />
          <div style={{ width: 1, height: 16, background: COLORS.borderLight, alignSelf: 'center' }} />
          <LegendItem color={COLORS.green} label="Finalized" outline />
          <LegendItem color={COLORS.yellow} label="Justified" outline />
          <LegendItem color={COLORS.textDim} label="Pending" outline />
        </div>
      </div>

      {/* Timeline */}
      <div
        ref={timelineRef}
        style={{
          padding: '0 20px 16px',
          overflowX: 'auto' as const,
          overflowY: 'hidden' as const,
        }}
      >
        <div style={{
          display: 'flex',
          gap: '0',
          minWidth: 'fit-content',
        }}>
          {epochs.map((epoch, epochIdx) => (
            <EpochBlock
              key={epoch.epochNumber}
              epoch={epoch}
              epochIdx={epochIdx}
              selectedSlot={selectedSlot}
              onSlotClick={handleSlotClick}
              isLast={epochIdx === epochs.length - 1}
            />
          ))}
        </div>
      </div>

      {/* Slot detail panel */}
      {selectedSlotData && selectedEpochData && (
        <div style={{ padding: '0 20px 16px' }}>
          <SlotDetailPanel
            slot={selectedSlotData}
            epoch={selectedEpochData}
          />
        </div>
      )}

      {/* Summary stats */}
      <div style={{ padding: '0 20px 20px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px',
          padding: '12px 16px',
          background: COLORS.surfaceLight,
          borderRadius: '8px',
        }}>
          <SummaryCell
            label="Total Slots"
            value={`${epochs.length * SLOTS_PER_EPOCH}`}
            color={COLORS.accent}
          />
          <SummaryCell
            label="Proposed"
            value={`${epochs.reduce((s, e) => s + e.slots.filter(sl => sl.status === 'proposed').length, 0)}`}
            color={COLORS.green}
          />
          <SummaryCell
            label="Missed"
            value={`${epochs.reduce((s, e) => s + e.slots.filter(sl => sl.status === 'missed').length, 0)}`}
            color={COLORS.red}
          />
          <SummaryCell
            label="Avg Participation"
            value={`${(epochs.reduce((s, e) => s + e.participation, 0) / epochs.length).toFixed(1)}%`}
            color={COLORS.yellow}
          />
        </div>
      </div>

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
        <FooterChip
          label="Slot = 12 seconds"
          desc="Minimum time unit. Each slot may have one block proposed by a validator."
        />
        <FooterChip
          label="Epoch = 32 slots"
          desc="Full attestation cycle (6.4 min). Checkpoints evaluated at epoch boundaries."
        />
        <FooterChip
          label="Finality = 2 epochs"
          desc="Casper FFG: justified checkpoint becomes finalized when next epoch is also justified."
        />
      </div>
    </div>
  )
}

// ── Sub-components ──

function EpochBlock({ epoch, epochIdx, selectedSlot, onSlotClick, isLast }: {
  readonly epoch: EpochData
  readonly epochIdx: number
  readonly selectedSlot: { epoch: number; slot: number } | null
  readonly onSlotClick: (epochIdx: number, slotIdx: number) => void
  readonly isLast: boolean
}) {
  const checkpointColor = epoch.checkpointState === 'finalized'
    ? COLORS.green
    : epoch.checkpointState === 'justified'
      ? COLORS.yellow
      : COLORS.textDim

  return (
    <div className="epoch-group" style={{ display: 'flex' }}>
      {/* Checkpoint boundary marker (left edge) */}
      <div style={{
        width: 3,
        background: checkpointColor,
        borderRadius: '2px',
        position: 'relative' as const,
        flexShrink: 0,
      }}>
        {/* Checkpoint label */}
        <div style={{
          position: 'absolute' as const,
          top: -22,
          left: '50%',
          transform: 'translateX(-50%)',
          whiteSpace: 'nowrap' as const,
          fontSize: 9,
          fontWeight: 700,
          color: checkpointColor,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.05em',
        }}>
          {epoch.checkpointState === 'finalized' ? 'FIN' : epoch.checkpointState === 'justified' ? 'JUST' : 'PEND'}
        </div>
      </div>

      {/* Epoch content */}
      <div style={{
        padding: '0 8px',
        paddingRight: isLast ? '8px' : '0',
      }}>
        {/* Epoch header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '8px',
          paddingTop: '4px',
        }}>
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            color: COLORS.text,
            fontFamily: 'var(--sl-font-system-mono, monospace)',
          }}>
            Epoch {epoch.epochNumber}
          </span>
          <span style={{
            fontSize: 10,
            color: checkpointColor,
            fontWeight: 600,
            padding: '1px 5px',
            borderRadius: '3px',
            background: `${checkpointColor}18`,
          }}>
            {epoch.checkpointState}
          </span>
          <span style={{
            fontSize: 10,
            color: COLORS.textDim,
            fontFamily: 'var(--sl-font-system-mono, monospace)',
          }}>
            {epoch.participation}% part.
          </span>
        </div>

        {/* Slot grid (4 rows x 8 cols) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(8, 1fr)',
          gap: '3px',
        }}>
          {epoch.slots.map((slot, slotIdx) => {
            const isSelected = selectedSlot?.epoch === epochIdx && selectedSlot?.slot === slotIdx
            return (
              <SlotCell
                key={slot.slotNumber}
                slot={slot}
                isSelected={isSelected}
                onClick={() => onSlotClick(epochIdx, slotIdx)}
              />
            )
          })}
        </div>

        {/* Attestation bar */}
        <div style={{ marginTop: '6px' }}>
          <div style={{
            height: 4,
            background: COLORS.bg,
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${epoch.participation}%`,
              height: '100%',
              background: epoch.participation >= 66.7
                ? COLORS.green
                : epoch.participation >= 50
                  ? COLORS.yellow
                  : COLORS.red,
              borderRadius: 2,
              transition: 'width 0.4s ease-out',
            }} />
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '2px',
          }}>
            <span style={{ fontSize: 9, color: COLORS.textDim }}>
              0%
            </span>
            <span style={{
              fontSize: 9,
              color: COLORS.yellow,
              fontWeight: 600,
            }}>
              66.7% (2/3)
            </span>
            <span style={{ fontSize: 9, color: COLORS.textDim }}>
              100%
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function SlotCell({ slot, isSelected, onClick }: {
  readonly slot: SlotData
  readonly isSelected: boolean
  readonly onClick: () => void
}) {
  const statusColor = slot.status === 'proposed'
    ? COLORS.green
    : slot.status === 'missed'
      ? COLORS.red
      : COLORS.textDim

  const attRatio = slot.attestationCount / slot.attestationTotal
  const attOpacity = 0.3 + attRatio * 0.7

  return (
    <div
      onClick={onClick}
      title={`Slot ${slot.slotNumber} - ${slot.proposerName}`}
      style={{
        width: 28,
        height: 28,
        borderRadius: '4px',
        background: isSelected ? `${statusColor}33` : `${statusColor}18`,
        border: `1.5px solid ${isSelected ? statusColor : `${statusColor}44`}`,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative' as const,
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {/* Slot number */}
      <span style={{
        fontSize: 7,
        fontWeight: 600,
        color: statusColor,
        fontFamily: 'var(--sl-font-system-mono, monospace)',
        opacity: 0.9,
      }}>
        {slot.slotNumber % SLOTS_PER_EPOCH}
      </span>

      {/* Attestation indicator */}
      <div style={{
        width: 12,
        height: 2,
        borderRadius: 1,
        background: statusColor,
        opacity: attOpacity,
        marginTop: 1,
      }} />
    </div>
  )
}

function SlotDetailPanel({ slot, epoch }: {
  readonly slot: SlotData
  readonly epoch: EpochData
}) {
  const statusColor = slot.status === 'proposed' ? COLORS.green : slot.status === 'missed' ? COLORS.red : COLORS.textDim
  const attPct = ((slot.attestationCount / slot.attestationTotal) * 100).toFixed(1)

  return (
    <div style={{
      padding: '16px',
      background: COLORS.surfaceLight,
      borderRadius: '10px',
      border: `1px solid ${statusColor}33`,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '12px',
      }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: statusColor,
        }} />
        <span style={{
          fontSize: 14, fontWeight: 700, color: COLORS.text,
          fontFamily: 'var(--sl-font-system-mono, monospace)',
        }}>
          Slot {slot.slotNumber}
        </span>
        <span style={{
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: '4px',
          background: `${statusColor}18`,
          color: statusColor,
          fontWeight: 600,
          textTransform: 'uppercase' as const,
        }}>
          {slot.status}
        </span>
        <span style={{ fontSize: 12, color: COLORS.textDim }}>
          Epoch {epoch.epochNumber} ({epoch.checkpointState})
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px',
      }}>
        {/* Proposer */}
        <DetailSection title="Proposer">
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>
            {slot.proposerName}
          </div>
          <div style={{
            fontSize: 11, color: COLORS.textDim,
            fontFamily: 'var(--sl-font-system-mono, monospace)',
          }}>
            index: {slot.proposerIndex}
          </div>
          <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: '4px' }}>
            Selected via RANDAO + effective balance weighting
          </div>
        </DetailSection>

        {/* Attestations */}
        <DetailSection title="Attestations">
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>
            {slot.attestationCount} / {slot.attestationTotal}
          </div>
          <div style={{
            height: 6,
            background: COLORS.bg,
            borderRadius: 3,
            overflow: 'hidden',
            marginTop: '6px',
          }}>
            <div style={{
              width: `${attPct}%`,
              height: '100%',
              background: Number(attPct) >= 66.7 ? COLORS.green : COLORS.yellow,
              borderRadius: 3,
            }} />
          </div>
          <div style={{
            fontSize: 11, color: COLORS.textDim, marginTop: '4px',
            fontFamily: 'var(--sl-font-system-mono, monospace)',
          }}>
            {attPct}% committee participation
          </div>
        </DetailSection>

        {/* Sync Committee */}
        <DetailSection title="Sync Committee">
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>
            {(slot.syncParticipation * 100).toFixed(0)}% / 512
          </div>
          <div style={{
            height: 6,
            background: COLORS.bg,
            borderRadius: 3,
            overflow: 'hidden',
            marginTop: '6px',
          }}>
            <div style={{
              width: `${slot.syncParticipation * 100}%`,
              height: '100%',
              background: COLORS.purple,
              borderRadius: 3,
            }} />
          </div>
          <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: '4px' }}>
            Light client support signatures
          </div>
        </DetailSection>
      </div>

      {/* Time info */}
      <div style={{
        marginTop: '12px',
        padding: '8px 12px',
        background: COLORS.bg,
        borderRadius: '6px',
        fontFamily: 'var(--sl-font-system-mono, monospace)',
        fontSize: 11,
        color: COLORS.textDim,
        display: 'flex',
        gap: '20px',
      }}>
        <span>t=0s: Block proposed</span>
        <span>t=4s: Attesters vote</span>
        <span>t=8s: Aggregation</span>
        <span>t=12s: Next slot</span>
      </div>
    </div>
  )
}

function DetailSection({ title, children }: {
  readonly title: string
  readonly children: React.ReactNode
}) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 600, color: COLORS.textDim,
        textTransform: 'uppercase' as const, letterSpacing: '0.08em',
        marginBottom: '6px',
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function LegendItem({ color, label, outline }: {
  readonly color: string
  readonly label: string
  readonly outline?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
      <div style={{
        width: 10,
        height: 10,
        borderRadius: outline ? '2px' : '2px',
        background: outline ? 'transparent' : color,
        border: outline ? `2px solid ${color}` : 'none',
      }} />
      <span style={{ fontSize: 11, color: COLORS.textDim }}>{label}</span>
    </div>
  )
}

function SummaryCell({ label, value, color }: {
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
      <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.cyan }}>{label}</span>
      <span style={{ fontSize: 11, color: COLORS.textDim, lineHeight: 1.4 }}>{desc}</span>
    </div>
  )
}
