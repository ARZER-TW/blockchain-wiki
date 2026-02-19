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

// ── Account type definitions ──

type AccountTypeKey = 'emptyEOA' | 'fundedEOA' | 'simpleContract' | 'proxyContract'

interface AccountField {
  readonly name: string
  readonly displayName: string
  readonly value: string
  readonly description: string
  readonly isEmpty: boolean
  readonly color: string
}

interface AccountSample {
  readonly key: AccountTypeKey
  readonly label: string
  readonly type: 'EOA' | 'Contract'
  readonly typeLabel: string
  readonly address: string
  readonly fields: ReadonlyArray<AccountField>
  readonly notes: ReadonlyArray<string>
}

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

const EMPTY_STORAGE_ROOT = '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421'
const EMPTY_CODE_HASH = '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'

const SAMPLE_ACCOUNTS: ReadonlyArray<AccountSample> = [
  {
    key: 'emptyEOA',
    label: 'Empty EOA',
    type: 'EOA',
    typeLabel: 'Externally Owned Account',
    address: `0x${fakeHash(42).slice(0, 40)}`,
    fields: [
      {
        name: 'nonce',
        displayName: 'nonce',
        value: '0',
        description: 'Transaction count. This EOA has never sent a transaction.',
        isEmpty: false,
        color: COLORS.cyan,
      },
      {
        name: 'balance',
        displayName: 'balance',
        value: '0 Wei',
        description: 'No ETH balance. An empty EOA exists conceptually but may not yet be in the State Trie until it receives ETH or sends a transaction.',
        isEmpty: true,
        color: COLORS.green,
      },
      {
        name: 'storageRoot',
        displayName: 'storageRoot',
        value: EMPTY_STORAGE_ROOT,
        description: 'Hash of an empty Merkle Patricia Trie. EOAs have no storage — this value is always the empty trie root.',
        isEmpty: true,
        color: COLORS.orange,
      },
      {
        name: 'codeHash',
        displayName: 'codeHash',
        value: EMPTY_CODE_HASH,
        description: 'keccak256 of empty bytecode (0x). This identifies the account as an EOA — check via eth_getCode returning 0x.',
        isEmpty: true,
        color: COLORS.purple,
      },
    ],
    notes: [
      'Controlled by a private key on secp256k1',
      'Can initiate transactions (the only account type that can)',
      'eth_getCode returns 0x',
    ],
  },
  {
    key: 'fundedEOA',
    label: 'Funded EOA',
    type: 'EOA',
    typeLabel: 'Externally Owned Account',
    address: `0x${fakeHash(99).slice(0, 40)}`,
    fields: [
      {
        name: 'nonce',
        displayName: 'nonce',
        value: '42',
        description: 'This EOA has sent 42 transactions. Nonce prevents replay attacks and determines transaction ordering.',
        isEmpty: false,
        color: COLORS.cyan,
      },
      {
        name: 'balance',
        displayName: 'balance',
        value: '3.14 ETH (3,140,000,000,000,000,000 Wei)',
        description: 'Current ETH balance. Must have enough to cover gas fees (gasLimit * maxFeePerGas) for any transaction.',
        isEmpty: false,
        color: COLORS.green,
      },
      {
        name: 'storageRoot',
        displayName: 'storageRoot',
        value: EMPTY_STORAGE_ROOT,
        description: 'Always the empty trie root for EOAs. Even funded EOAs have no persistent storage.',
        isEmpty: true,
        color: COLORS.orange,
      },
      {
        name: 'codeHash',
        displayName: 'codeHash',
        value: EMPTY_CODE_HASH,
        description: 'keccak256 of empty bytecode. Still an EOA — no delegation via EIP-7702.',
        isEmpty: true,
        color: COLORS.purple,
      },
    ],
    notes: [
      'Active account with transaction history',
      'storageRoot and codeHash remain empty',
      'Nonce must match for each new transaction',
    ],
  },
  {
    key: 'simpleContract',
    label: 'Simple Contract',
    type: 'Contract',
    typeLabel: 'Contract Account',
    address: `0x${fakeHash(777).slice(0, 40)}`,
    fields: [
      {
        name: 'nonce',
        displayName: 'nonce',
        value: '1',
        description: 'For contracts, nonce counts the number of contracts created via the CREATE opcode. Starts at 1 after deployment (EIP-161).',
        isEmpty: false,
        color: COLORS.cyan,
      },
      {
        name: 'balance',
        displayName: 'balance',
        value: '100.5 ETH',
        description: 'Contracts can hold ETH. They receive ETH via transactions, selfdestruct, or block rewards (pre-merge). Cannot spend without code logic.',
        isEmpty: false,
        color: COLORS.green,
      },
      {
        name: 'storageRoot',
        displayName: 'storageRoot',
        value: `0x${fakeHash(888)}`,
        description: 'Root hash of this contract\'s Storage Trie. Each 256-bit slot maps a key to a value. Used for persistent state (balances mappings, owner addresses, etc.).',
        isEmpty: false,
        color: COLORS.orange,
      },
      {
        name: 'codeHash',
        displayName: 'codeHash',
        value: `0x${fakeHash(999)}`,
        description: 'keccak256 of the deployed runtime bytecode. Code is stored separately and is immutable after deployment. Referenced by this hash.',
        isEmpty: false,
        color: COLORS.purple,
      },
    ],
    notes: [
      'Created by a CREATE transaction (to = null)',
      'Code is immutable after deployment',
      'Cannot initiate transactions — only responds to calls',
    ],
  },
  {
    key: 'proxyContract',
    label: 'Proxy Contract',
    type: 'Contract',
    typeLabel: 'Contract Account (Proxy)',
    address: `0x${fakeHash(1234).slice(0, 40)}`,
    fields: [
      {
        name: 'nonce',
        displayName: 'nonce',
        value: '0',
        description: 'This proxy has never created another contract via CREATE. Most proxies do not create contracts.',
        isEmpty: false,
        color: COLORS.cyan,
      },
      {
        name: 'balance',
        displayName: 'balance',
        value: '0 Wei',
        description: 'Proxy contracts often hold no ETH themselves — the implementation contract or users hold the funds in storage slots.',
        isEmpty: true,
        color: COLORS.green,
      },
      {
        name: 'storageRoot',
        displayName: 'storageRoot',
        value: `0x${fakeHash(1235)}`,
        description: 'Storage contains the implementation address (EIP-1967 slot) and all state. DELEGATECALL executes implementation code but writes to this proxy\'s storage.',
        isEmpty: false,
        color: COLORS.orange,
      },
      {
        name: 'codeHash',
        displayName: 'codeHash',
        value: `0x${fakeHash(1236)}`,
        description: 'Hash of the minimal proxy bytecode — typically a short DELEGATECALL forwarder. The actual logic lives in the implementation contract.',
        isEmpty: false,
        color: COLORS.purple,
      },
    ],
    notes: [
      'Uses DELEGATECALL to forward calls to implementation',
      'Upgradeable: admin can change implementation address',
      'Storage layout must be compatible across upgrades',
    ],
  },
]

// ── Main Component ──

export default function AccountDiagram() {
  const [selectedAccount, setSelectedAccount] = useState<AccountTypeKey>('emptyEOA')
  const [expandedField, setExpandedField] = useState<string | null>(null)
  const [showEip7702, setShowEip7702] = useState(false)
  const [animKey, setAnimKey] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const account = SAMPLE_ACCOUNTS.find(a => a.key === selectedAccount) ?? SAMPLE_ACCOUNTS[0]

  const handleSelectAccount = useCallback((key: AccountTypeKey) => {
    setSelectedAccount(key)
    setExpandedField(null)
    setShowEip7702(false)
    setAnimKey(k => k + 1)
  }, [])

  const toggleField = useCallback((name: string) => {
    setExpandedField(prev => prev === name ? null : name)
  }, [])

  const toggleEip7702 = useCallback(() => {
    setShowEip7702(prev => !prev)
    setAnimKey(k => k + 1)
  }, [])

  // GSAP entrance animation
  useGSAP(() => {
    if (!containerRef.current || animKey === 0) return
    const cards = containerRef.current.querySelectorAll('.account-card')
    gsap.fromTo(cards,
      { opacity: 0.3, y: 12 },
      { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', stagger: 0.08 },
    )
  }, { scope: containerRef, dependencies: [animKey] })

  const isEOA = account.type === 'EOA'

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
        flexWrap: 'wrap',
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS.accent }} />
        <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>
          Ethereum Account Model
        </span>
        <span style={{ fontSize: 13, color: COLORS.textDim }}>EOA vs Contract Account</span>
        <AccountTypeBadge type={account.type} />
      </div>

      {/* Account selector */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '8px',
          marginBottom: '16px',
        }}>
          {SAMPLE_ACCOUNTS.map(a => (
            <button
              type="button"
              key={a.key}
              onClick={() => handleSelectAccount(a.key)}
              style={{
                padding: '8px 12px',
                fontSize: 12,
                borderRadius: '8px',
                border: `1px solid ${selectedAccount === a.key ? COLORS.accent : COLORS.borderLight}`,
                background: selectedAccount === a.key ? COLORS.accentDim : 'transparent',
                color: selectedAccount === a.key ? COLORS.accent : COLORS.textDim,
                cursor: 'pointer',
                fontFamily: 'var(--sl-font-system-mono, monospace)',
                textAlign: 'center',
              }}
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* Account identity */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '12px 16px',
          background: COLORS.surfaceLight,
          borderRadius: '8px',
          marginBottom: '16px',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: COLORS.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {account.typeLabel}
            </div>
            <code style={{ fontSize: 12, color: COLORS.accent, fontFamily: 'var(--sl-font-system-mono, monospace)', wordBreak: 'break-all' }}>
              {account.address}
            </code>
          </div>
          <div style={{
            padding: '4px 10px',
            borderRadius: '6px',
            background: isEOA ? `${COLORS.cyan}18` : `${COLORS.orange}18`,
            color: isEOA ? COLORS.cyan : COLORS.orange,
            fontSize: 11,
            fontWeight: 700,
          }}>
            {isEOA ? 'EOA' : 'Contract'}
          </div>
        </div>
      </div>

      {/* State Trie mapping visual */}
      <div style={{ padding: '0 20px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '12px',
          padding: '8px 12px',
          background: `${COLORS.accent}10`,
          borderRadius: '6px',
          border: `1px solid ${COLORS.accent}22`,
        }}>
          <span style={{ fontSize: 11, color: COLORS.textDim, fontWeight: 600 }}>
            State Trie:
          </span>
          <code style={{ fontSize: 11, color: COLORS.accent, fontFamily: 'var(--sl-font-system-mono, monospace)' }}>
            keccak256(address)
          </code>
          <span style={{ fontSize: 11, color: COLORS.textDim }}>-&gt;</span>
          <code style={{ fontSize: 11, color: COLORS.accent, fontFamily: 'var(--sl-font-system-mono, monospace)' }}>
            RLP(nonce, balance, storageRoot, codeHash)
          </code>
        </div>
      </div>

      {/* Account fields */}
      <div className="account-card" style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {account.fields.map(f => (
          <AccountFieldRow
            key={f.name}
            field={f}
            isExpanded={expandedField === f.name}
            onToggle={() => toggleField(f.name)}
            isEOA={isEOA}
          />
        ))}
      </div>

      {/* Notes */}
      <div className="account-card" style={{ padding: '0 20px 16px' }}>
        <div style={{
          padding: '12px 16px',
          background: COLORS.surfaceLight,
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}>
          {account.notes.map((note, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ color: isEOA ? COLORS.cyan : COLORS.orange, fontSize: 11, flexShrink: 0, marginTop: '2px' }}>
                {'\u25B8'}
              </span>
              <span style={{ fontSize: 12, color: COLORS.textDim, lineHeight: 1.5 }}>{note}</span>
            </div>
          ))}
        </div>
      </div>

      {/* EIP-7702 section */}
      <div style={{
        padding: '0 20px 20px',
      }}>
        <button
          type="button"
          onClick={toggleEip7702}
          style={{
            width: '100%',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: `${COLORS.yellow}10`,
            border: `1px solid ${COLORS.yellow}33`,
            borderRadius: '8px',
            cursor: 'pointer',
            color: COLORS.yellow,
          }}
        >
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            padding: '1px 6px',
            borderRadius: '3px',
            background: `${COLORS.yellow}18`,
            color: COLORS.yellow,
            letterSpacing: '0.05em',
          }}>
            PECTRA
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.yellow }}>
            EIP-7702: EOA Code Delegation
          </span>
          <span style={{
            marginLeft: 'auto',
            fontSize: 10,
            color: COLORS.textDim,
            transition: 'transform 0.2s',
            transform: showEip7702 ? 'rotate(90deg)' : 'rotate(0deg)',
          }}>
            {'\u25B6'}
          </span>
        </button>

        {showEip7702 && (
          <div className="account-card" style={{
            marginTop: '8px',
            padding: '16px',
            background: `${COLORS.yellow}08`,
            border: `1px solid ${COLORS.yellow}22`,
            borderRadius: '8px',
          }}>
            <div style={{ fontSize: 12, color: COLORS.textDim, lineHeight: 1.7, marginBottom: '12px' }}>
              EIP-7702 (Pectra, 2025/5/7) allows an EOA to set a <strong style={{ color: COLORS.yellow }}>delegation designation</strong> pointing to a contract address. When the EOA is called, it executes the delegate contract's bytecode using its own storage and balance.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Eip7702Row
                label="Before EIP-7702"
                field="codeHash"
                value="keccak256(0x) [empty]"
                valueColor={COLORS.textDim}
              />
              <Eip7702Row
                label="After Delegation"
                field="eth_getCode"
                value="0xef0100 + delegate_address"
                valueColor={COLORS.yellow}
              />
            </div>
            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {[
                'Transaction batching: approve + swap in one tx',
                'Gas sponsorship: third party pays gas',
                'Alternative auth: passkeys, session keys',
                'Revocable: EOA retains private key control',
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <span style={{ color: COLORS.yellow, fontSize: 10, marginTop: '3px', flexShrink: 0 }}>{'\u25B8'}</span>
                  <span style={{ fontSize: 11, color: COLORS.textDim, lineHeight: 1.5 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '16px 20px',
        borderTop: `1px solid ${COLORS.border}`,
        background: COLORS.surface,
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridAutoRows: '1fr',
          gap: '10px',
        }}>
          <FooterChip
            label="4-Field Tuple"
            desc="Every account is (nonce, balance, storageRoot, codeHash)"
          />
          <FooterChip
            label="State Trie Key"
            desc="keccak256(address) maps to RLP-encoded account data"
          />
          <FooterChip
            label="EIP-7702"
            desc="EOAs can now delegate to contract code (Pectra 2025)"
          />
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──

function AccountTypeBadge({ type }: { readonly type: 'EOA' | 'Contract' }) {
  const isEOA = type === 'EOA'
  return (
    <span style={{
      marginLeft: 'auto',
      fontSize: 11,
      padding: '2px 8px',
      borderRadius: '4px',
      background: isEOA ? `${COLORS.cyan}18` : `${COLORS.orange}18`,
      color: isEOA ? COLORS.cyan : COLORS.orange,
      fontWeight: 600,
    }}>
      {isEOA ? 'EOA' : 'Contract'}
    </span>
  )
}

function AccountFieldRow({ field, isExpanded, onToggle, isEOA }: {
  readonly field: AccountField
  readonly isExpanded: boolean
  readonly onToggle: () => void
  readonly isEOA: boolean
}) {
  return (
    <div
      style={{
        background: `${field.color}08`,
        border: `1px solid ${field.color}22`,
        borderRadius: '8px',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
      onClick={onToggle}
    >
      <div style={{
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}>
        {/* Color indicator */}
        <div style={{ width: 8, height: 8, borderRadius: 2, background: field.color, flexShrink: 0 }} />

        {/* Field name */}
        <code style={{
          fontSize: 12,
          fontWeight: 600,
          color: COLORS.text,
          fontFamily: 'var(--sl-font-system-mono, monospace)',
          minWidth: 100,
          flexShrink: 0,
        }}>
          {field.displayName}
        </code>

        {/* Empty badge for EOA fields */}
        {isEOA && field.isEmpty && (
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            padding: '1px 6px',
            borderRadius: '3px',
            background: `${COLORS.textDim}22`,
            color: COLORS.textDim,
            letterSpacing: '0.05em',
            flexShrink: 0,
          }}>
            EMPTY
          </span>
        )}

        {/* Value (truncated) */}
        <code style={{
          fontSize: 11,
          color: field.isEmpty ? COLORS.textDim : field.color,
          fontFamily: 'var(--sl-font-system-mono, monospace)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          opacity: field.isEmpty ? 0.5 : 0.85,
        }}>
          {field.value}
        </code>

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
              color: field.color,
              wordBreak: 'break-all',
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

function Eip7702Row({ label, field, value, valueColor }: {
  readonly label: string
  readonly field: string
  readonly value: string
  readonly valueColor: string
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 10px',
      background: COLORS.bg,
      borderRadius: '6px',
    }}>
      <span style={{ fontSize: 11, color: COLORS.textDim, fontWeight: 600, minWidth: 120 }}>{label}</span>
      <code style={{ fontSize: 11, color: COLORS.text, fontFamily: 'var(--sl-font-system-mono, monospace)', minWidth: 80 }}>{field}</code>
      <code style={{ fontSize: 11, color: valueColor, fontFamily: 'var(--sl-font-system-mono, monospace)', flex: 1 }}>{value}</code>
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
      flexDirection: 'column',
      gap: '4px',
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.accent }}>{label}</span>
      <span style={{ fontSize: 11, color: COLORS.textDim, lineHeight: 1.4 }}>{desc}</span>
    </div>
  )
}
