import { useState, useRef, useCallback, useEffect } from 'react'
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

interface StepDetail {
  readonly title: string
  readonly subtitle: string
  readonly description: string
  readonly dataPreview: string
  readonly color: string
  readonly icon: string
}

interface TxPreset {
  readonly label: string
  readonly description: string
  readonly steps: ReadonlyArray<StepDetail>
}

// ── Step data for different TX types ──

function makeSimpleTransferSteps(): ReadonlyArray<StepDetail> {
  return [
    {
      title: 'Key Generation',
      subtitle: 'secp256k1',
      description: 'Generate a random 256-bit private key. Derive the public key via elliptic curve multiplication (PK = sk * G). Hash the public key with Keccak-256 and take the last 20 bytes as the Ethereum address.',
      dataPreview: 'sk: 0xac09...ff80 -> addr: 0xf39F...2266',
      color: COLORS.cyan,
      icon: 'K',
    },
    {
      title: 'TX Construction',
      subtitle: 'EIP-1559 (Type 2)',
      description: 'Build the transaction object: specify recipient (to), value in wei, gas limit, maxFeePerGas, maxPriorityFeePerGas, nonce (sender sequence number), and chainId (EIP-155 replay protection).',
      dataPreview: 'to: 0x70..., value: 1 ETH, nonce: 42, chainId: 1',
      color: COLORS.accent,
      icon: 'T',
    },
    {
      title: 'Signing',
      subtitle: 'ECDSA + Keccak-256',
      description: 'RLP-encode the transaction fields and hash with Keccak-256 to get the signing hash. Sign with the private key using ECDSA on secp256k1, producing (r, s, v) signature components. The signature allows anyone to recover the sender address.',
      dataPreview: 'sig: { r: 0x3a..., s: 0x7b..., v: 27 }',
      color: COLORS.purple,
      icon: 'S',
    },
    {
      title: 'Broadcast',
      subtitle: 'DevP2P Gossip',
      description: 'Submit the signed TX via eth_sendRawTransaction to a node. The node validates: signature is valid, nonce matches, sender has sufficient balance, gas limit is reasonable. If valid, propagate to peers via the gossip protocol.',
      dataPreview: 'eth_sendRawTransaction(0x02f87001...)',
      color: COLORS.green,
      icon: 'B',
    },
    {
      title: 'Mempool',
      subtitle: 'Pending Pool',
      description: 'The transaction enters the mempool (txpool) on each node. Transactions are ordered by effective gas price. Searchers and builders scan the mempool for MEV opportunities. The TX waits here until a block producer includes it.',
      dataPreview: 'pending: 4,231 TXs | queued: 892 TXs',
      color: COLORS.yellow,
      icon: 'M',
    },
    {
      title: 'Block Production',
      subtitle: 'PBS: Proposer-Builder Separation',
      description: 'Builders collect transactions from the mempool, order them for maximum value extraction, and construct full blocks. Builders submit bids to relays. The proposer (selected validator) picks the highest-bid block header via MEV-Boost, without seeing the block body.',
      dataPreview: 'builder -> relay -> proposer (MEV-Boost)',
      color: COLORS.orange,
      icon: 'P',
    },
    {
      title: 'Consensus',
      subtitle: 'Attestation + Finality',
      description: 'The proposer broadcasts the block. Attesters in the current slot committee vote on the block via LMD-GHOST fork choice. After 2 consecutive justified epochs, Casper FFG finalizes the checkpoint. The block becomes irreversible after ~13 minutes (2 epochs).',
      dataPreview: '2/3 supermajority -> justified -> finalized',
      color: COLORS.red,
      icon: 'C',
    },
    {
      title: 'State Transition',
      subtitle: 'EVM Execution',
      description: 'The EVM executes the transaction: debit sender balance, credit recipient, deduct gas fees (base fee burned, priority fee to proposer). Update the state trie, transaction trie, and receipt trie. Emit logs/events. Generate the transaction receipt with status (success/revert).',
      dataPreview: 'status: 1 (success), gasUsed: 21000',
      color: COLORS.green,
      icon: 'E',
    },
  ]
}

function makeContractCallSteps(): ReadonlyArray<StepDetail> {
  return [
    {
      title: 'Key Generation',
      subtitle: 'secp256k1',
      description: 'The caller must have an EOA with a private key. The contract address is derived separately (CREATE: keccak256(sender, nonce)[12:] or CREATE2: keccak256(0xff, sender, salt, initCodeHash)[12:]).',
      dataPreview: 'EOA: 0xf39F... -> Contract: 0x5FbD...',
      color: COLORS.cyan,
      icon: 'K',
    },
    {
      title: 'TX Construction',
      subtitle: 'ABI Encoding',
      description: 'Build the transaction with "to" set to the contract address. The "data" field contains the function selector (first 4 bytes of keccak256(signature)) followed by ABI-encoded parameters. Value may be 0 or include ETH for payable functions.',
      dataPreview: 'data: 0xa9059cbb000...  (transfer(address,uint256))',
      color: COLORS.accent,
      icon: 'T',
    },
    {
      title: 'Signing',
      subtitle: 'ECDSA + Keccak-256',
      description: 'Identical to simple transfer: RLP-encode, hash, sign. The data field is included in the signing hash, ensuring the contract call parameters cannot be tampered with.',
      dataPreview: 'sig: { r: 0x1f..., s: 0x9c..., v: 28 }',
      color: COLORS.purple,
      icon: 'S',
    },
    {
      title: 'Broadcast',
      subtitle: 'DevP2P Gossip',
      description: 'Same broadcast and validation flow. Nodes additionally check that the gas limit is sufficient for the estimated computation (though exact gas consumption is unknown until execution).',
      dataPreview: 'gasLimit: 150,000 (estimated for contract call)',
      color: COLORS.green,
      icon: 'B',
    },
    {
      title: 'Mempool',
      subtitle: 'MEV Opportunities',
      description: 'Contract calls are prime targets for MEV: front-running, sandwich attacks, arbitrage. Searchers simulate the TX locally to find profitable ordering. Private mempools (Flashbots Protect) can bypass public mempool exposure.',
      dataPreview: 'MEV risk: sandwich attack on DEX swap',
      color: COLORS.yellow,
      icon: 'M',
    },
    {
      title: 'Block Production',
      subtitle: 'PBS + MEV Bundle',
      description: 'Builders include MEV bundles (searcher TXs bundled with target TXs) to maximize block value. Order matters: the builder carefully sequences TXs to extract maximum value while respecting dependencies.',
      dataPreview: 'bundle: [frontrun, target, backrun]',
      color: COLORS.orange,
      icon: 'P',
    },
    {
      title: 'Consensus',
      subtitle: 'Attestation + Finality',
      description: 'Same consensus process: block is attested by the slot committee, enters fork choice. Contract call results are deterministic -- all validators executing the block will reach the same state.',
      dataPreview: '2/3 supermajority -> justified -> finalized',
      color: COLORS.red,
      icon: 'C',
    },
    {
      title: 'State Transition',
      subtitle: 'EVM Opcode Execution',
      description: 'EVM loads the contract bytecode, executes opcodes (PUSH, CALL, SSTORE, etc.). Each opcode consumes gas. State changes (storage writes, balance transfers) are applied. Events are emitted as logs. If execution reverts, all state changes are rolled back but gas is still consumed.',
      dataPreview: 'status: 1, gasUsed: 65,421, logs: [Transfer]',
      color: COLORS.green,
      icon: 'E',
    },
  ]
}

function makeBlobTxSteps(): ReadonlyArray<StepDetail> {
  return [
    {
      title: 'Key Generation',
      subtitle: 'secp256k1',
      description: 'Standard key generation. Blob transactions (EIP-4844, Type 3) are typically sent by L2 rollup sequencers posting batch data to L1.',
      dataPreview: 'L2 sequencer EOA: 0x6887...',
      color: COLORS.cyan,
      icon: 'K',
    },
    {
      title: 'TX Construction',
      subtitle: 'EIP-4844 (Type 3)',
      description: 'In addition to standard fields, include blob_versioned_hashes and max_fee_per_blob_gas. Blobs contain ~128 KB of data each (up to 6 per block). Blobs use KZG polynomial commitments for data availability sampling.',
      dataPreview: 'blobs: 3, max_fee_per_blob_gas: 1 gwei',
      color: COLORS.accent,
      icon: 'T',
    },
    {
      title: 'Signing',
      subtitle: 'ECDSA + KZG Commitment',
      description: 'Sign the transaction including blob versioned hashes. KZG commitments are computed for each blob: commit(polynomial) -> G1 point. The commitment hash (versioned_hash = SHA256(commitment)[1:] with 0x01 prefix) links the blob to the TX.',
      dataPreview: 'KZG commitment: 0x01a0b1c2...',
      color: COLORS.purple,
      icon: 'S',
    },
    {
      title: 'Broadcast',
      subtitle: 'Blob Sidecar',
      description: 'Blob data is propagated separately from the block via "blob sidecar" on the P2P network. Nodes validate: blob count within limits, KZG proofs valid, blob gas pricing correct. Blobs are pruned after ~18 days.',
      dataPreview: 'sidecar: 3 blobs (384 KB total)',
      color: COLORS.green,
      icon: 'B',
    },
    {
      title: 'Mempool',
      subtitle: 'Blob Pool',
      description: 'Blob transactions have a separate fee market from regular transactions. The blob base fee adjusts independently using the same EIP-1559 mechanism: target 3 blobs per block, max 6. Higher demand = higher blob gas price.',
      dataPreview: 'blobBaseFee: 0.5 gwei, target: 3/6 blobs',
      color: COLORS.yellow,
      icon: 'M',
    },
    {
      title: 'Block Production',
      subtitle: 'PBS + Blob Inclusion',
      description: 'Builders include blob TXs considering both regular gas revenue and blob gas revenue. Blob space is limited (6 blobs max = ~768 KB), creating competition among L2 sequencers for blob inclusion.',
      dataPreview: 'block blobs: 5/6, blobGasUsed: 655,360',
      color: COLORS.orange,
      icon: 'P',
    },
    {
      title: 'Consensus',
      subtitle: 'Data Availability',
      description: 'Validators verify blob KZG proofs as part of block validation. Future: danksharding will use Data Availability Sampling (DAS) where each validator only samples a few cells of each blob, enabling much higher throughput.',
      dataPreview: 'KZG proof verified, blob available',
      color: COLORS.red,
      icon: 'C',
    },
    {
      title: 'State Transition',
      subtitle: 'BLOBHASH Opcode',
      description: 'Blob data is NOT accessible to the EVM during execution. Only the versioned_hash is available via the BLOBHASH opcode. L2 contracts verify blob data commitments match expectations. Blob base fee is burned. After ~18 days, blob data is pruned from nodes.',
      dataPreview: 'BLOBHASH(0) -> 0x01a0b1c2...',
      color: COLORS.green,
      icon: 'E',
    },
  ]
}

const PRESETS: ReadonlyArray<TxPreset> = [
  {
    label: 'Simple Transfer',
    description: 'ETH transfer between two EOAs',
    steps: makeSimpleTransferSteps(),
  },
  {
    label: 'Contract Call',
    description: 'ERC-20 token transfer via smart contract',
    steps: makeContractCallSteps(),
  },
  {
    label: 'Blob TX (EIP-4844)',
    description: 'L2 rollup data posted to L1',
    steps: makeBlobTxSteps(),
  },
]

// ── Main component ──

export default function TransactionFlow() {
  const [selectedPreset, setSelectedPreset] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  const [expandedStep, setExpandedStep] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [animKey, setAnimKey] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const flowRef = useRef<HTMLDivElement>(null)
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const steps = PRESETS[selectedPreset].steps

  const handlePreset = useCallback((index: number) => {
    setSelectedPreset(index)
    setCurrentStep(0)
    setExpandedStep(null)
    setIsPlaying(false)
    if (playTimerRef.current) clearTimeout(playTimerRef.current)
    setAnimKey(k => k + 1)
  }, [])

  const goToStep = useCallback((step: number) => {
    setCurrentStep(step)
    setExpandedStep(step)
    setAnimKey(k => k + 1)
  }, [])

  const nextStep = useCallback(() => {
    setCurrentStep(prev => {
      const next = Math.min(prev + 1, steps.length - 1)
      setExpandedStep(next)
      return next
    })
    setAnimKey(k => k + 1)
  }, [steps.length])

  const prevStep = useCallback(() => {
    setCurrentStep(prev => {
      const next = Math.max(prev - 1, 0)
      setExpandedStep(next)
      return next
    })
    setAnimKey(k => k + 1)
  }, [])

  // Auto-play logic
  useEffect(() => {
    if (!isPlaying) return
    if (currentStep >= steps.length - 1) {
      setIsPlaying(false)
      return
    }
    playTimerRef.current = setTimeout(() => {
      nextStep()
    }, 2000)
    return () => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current)
    }
  }, [isPlaying, currentStep, steps.length, nextStep])

  const togglePlay = useCallback(() => {
    setIsPlaying(prev => {
      if (!prev && currentStep >= steps.length - 1) {
        setCurrentStep(0)
        setExpandedStep(0)
        setAnimKey(k => k + 1)
      }
      return !prev
    })
  }, [currentStep, steps.length])

  // GSAP animation
  useGSAP(() => {
    if (!flowRef.current || animKey === 0) return
    const cards = flowRef.current.querySelectorAll('.flow-card')
    const arrows = flowRef.current.querySelectorAll('.flow-arrow')

    const tl = gsap.timeline()
    tl.fromTo(cards,
      { opacity: 0.3, y: 6 },
      { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out', stagger: 0.04 },
    )
    tl.fromTo(arrows,
      { opacity: 0 },
      { opacity: 1, duration: 0.25, ease: 'power2.out', stagger: 0.04 },
      0.05,
    )
  }, { scope: containerRef, dependencies: [animKey] })

  // Scroll active step into view
  useEffect(() => {
    if (!flowRef.current) return
    const activeCard = flowRef.current.querySelector(`[data-step="${currentStep}"]`)
    if (activeCard) {
      activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [currentStep])

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
          Transaction Lifecycle
        </span>
        <span style={{ fontSize: 13, color: COLORS.textDim }}>8-Stage Flow</span>
        <span style={{
          marginLeft: 'auto',
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: '4px',
          background: `${steps[currentStep].color}18`,
          color: steps[currentStep].color,
          fontWeight: 600,
          fontFamily: 'var(--sl-font-system-mono, monospace)',
        }}>
          {currentStep + 1}/{steps.length}
        </span>
      </div>

      {/* Preset selector */}
      <div style={{ padding: '16px 20px 0' }}>
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
                textAlign: 'left' as const,
              }}
            >
              <div style={{ fontWeight: 600 }}>{p.label}</div>
              <div style={{ fontSize: 10, marginTop: '2px', opacity: 0.7 }}>{p.description}</div>
            </button>
          ))}
        </div>

        {/* Playback controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '12px',
        }}>
          <button type="button" onClick={prevStep} disabled={currentStep === 0} style={{
            ...controlBtnStyle,
            opacity: currentStep === 0 ? 0.3 : 1,
          }}>
            {'<'} Prev
          </button>
          <button type="button" onClick={togglePlay} style={{
            ...controlBtnStyle,
            background: isPlaying ? `${COLORS.red}18` : `${COLORS.green}18`,
            borderColor: isPlaying ? `${COLORS.red}66` : `${COLORS.green}66`,
            color: isPlaying ? COLORS.red : COLORS.green,
            minWidth: 80,
          }}>
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button type="button" onClick={nextStep} disabled={currentStep >= steps.length - 1} style={{
            ...controlBtnStyle,
            opacity: currentStep >= steps.length - 1 ? 0.3 : 1,
          }}>
            Next {'>'}
          </button>

          {/* Progress bar */}
          <div style={{
            flex: 1,
            height: 4,
            background: COLORS.surfaceLight,
            borderRadius: 2,
            overflow: 'hidden',
            marginLeft: '8px',
          }}>
            <div style={{
              width: `${((currentStep + 1) / steps.length) * 100}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${COLORS.accent}, ${steps[currentStep].color})`,
              borderRadius: 2,
              transition: 'width 0.4s ease-out',
            }} />
          </div>
        </div>
      </div>

      {/* Flow diagram */}
      <div
        ref={flowRef}
        style={{
          padding: '16px 20px',
          overflowX: 'auto',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0',
        }}
      >
        {steps.map((step, i) => (
          <div
            key={i}
            style={{ display: 'flex', alignItems: 'flex-start', flexShrink: 0 }}
          >
            {/* Step card */}
            <div
              className="flow-card"
              data-step={i}
              onClick={() => {
                goToStep(i)
                setExpandedStep(prev => prev === i ? null : i)
              }}
              style={{
                width: 160,
                padding: '12px',
                background: i === currentStep ? COLORS.surfaceLight : COLORS.surface,
                border: `1.5px solid ${i === currentStep ? step.color : i < currentStep ? `${COLORS.green}44` : COLORS.border}`,
                borderRadius: '10px',
                cursor: 'pointer',
                transition: 'border-color 0.3s, background 0.3s',
                opacity: i <= currentStep ? 1 : 0.5,
              }}
            >
              {/* Step number + icon */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: i <= currentStep ? `${step.color}22` : COLORS.bg,
                  color: i <= currentStep ? step.color : COLORS.textDim,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  flexShrink: 0,
                  fontFamily: 'var(--sl-font-system-mono, monospace)',
                  border: `1px solid ${i <= currentStep ? `${step.color}44` : COLORS.borderLight}`,
                }}>
                  {step.icon}
                </span>
                <span style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: COLORS.textDim,
                  fontFamily: 'var(--sl-font-system-mono, monospace)',
                }}>
                  {i + 1}/{steps.length}
                </span>
                {i < currentStep && (
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: COLORS.green,
                    marginLeft: 'auto',
                  }}>
                    DONE
                  </span>
                )}
                {i === currentStep && (
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: step.color,
                    marginLeft: 'auto',
                  }}>
                    ACTIVE
                  </span>
                )}
              </div>

              {/* Title */}
              <div style={{
                fontSize: 12,
                fontWeight: 600,
                color: i <= currentStep ? COLORS.text : COLORS.textDim,
                marginBottom: '4px',
              }}>
                {step.title}
              </div>

              {/* Subtitle */}
              <div style={{
                fontSize: 10,
                color: step.color,
                fontFamily: 'var(--sl-font-system-mono, monospace)',
                opacity: i <= currentStep ? 1 : 0.5,
              }}>
                {step.subtitle}
              </div>
            </div>

            {/* Arrow between cards */}
            {i < steps.length - 1 && (
              <div className="flow-arrow" style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0 4px',
                flexShrink: 0,
                alignSelf: 'center',
              }}>
                <div style={{
                  width: 20,
                  height: 2,
                  background: i < currentStep ? COLORS.green : COLORS.borderLight,
                  transition: 'background 0.3s',
                }} />
                <div style={{
                  width: 0,
                  height: 0,
                  borderTop: '5px solid transparent',
                  borderBottom: '5px solid transparent',
                  borderLeft: `6px solid ${i < currentStep ? COLORS.green : COLORS.borderLight}`,
                  transition: 'border-color 0.3s',
                }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Expanded detail panel */}
      {expandedStep !== null && (
        <div style={{
          margin: '0 20px 16px',
          padding: '16px',
          background: COLORS.surface,
          border: `1px solid ${steps[expandedStep].color}33`,
          borderRadius: '10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <span style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: `${steps[expandedStep].color}22`,
              color: steps[expandedStep].color,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'var(--sl-font-system-mono, monospace)',
              border: `1px solid ${steps[expandedStep].color}44`,
            }}>
              {steps[expandedStep].icon}
            </span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>
                Step {expandedStep + 1}: {steps[expandedStep].title}
              </div>
              <div style={{
                fontSize: 11,
                color: steps[expandedStep].color,
                fontFamily: 'var(--sl-font-system-mono, monospace)',
              }}>
                {steps[expandedStep].subtitle}
              </div>
            </div>
          </div>

          <div style={{
            fontSize: 13,
            lineHeight: 1.7,
            color: COLORS.textDim,
            marginBottom: '12px',
          }}>
            {steps[expandedStep].description}
          </div>

          <div style={{
            padding: '10px 12px',
            background: COLORS.bg,
            borderRadius: '8px',
            fontFamily: 'var(--sl-font-system-mono, monospace)',
            fontSize: 11,
            color: steps[expandedStep].color,
            lineHeight: 1.6,
            wordBreak: 'break-all' as const,
          }}>
            {steps[expandedStep].dataPreview}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        padding: '16px 20px',
        borderTop: `1px solid ${COLORS.border}`,
        background: COLORS.surface,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gridAutoRows: '1fr',
        gap: '10px',
      }}>
        <FooterChip label="EIP-1559" desc="Dual fee: base (burned) + priority (tip)" />
        <FooterChip label="EIP-155" desc="chainId prevents cross-chain replay attacks" />
        <FooterChip label="PBS" desc="Proposer-Builder Separation (MEV-Boost)" />
        <FooterChip label="Finality" desc="~13 min via Casper FFG (2 epochs)" />
      </div>
    </div>
  )
}

// ── Shared styles ──

const controlBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: 11,
  fontWeight: 600,
  borderRadius: '6px',
  border: `1px solid ${COLORS.borderLight}`,
  background: 'transparent',
  color: COLORS.textDim,
  cursor: 'pointer',
  fontFamily: 'var(--sl-font-system-mono, monospace)',
}

// ── Sub-components ──

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
