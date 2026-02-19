import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { keccak256, bytesToHex, hexToBytes } from './utils/keccak256'

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

// ── Small prime field curve for visualization ──
// Using y^2 = x^3 + 7 mod p (same form as secp256k1, tiny field)
const VISUAL_P = 97
const VISUAL_A = 0
const VISUAL_B = 7

function modPow(base: number, exp: number, mod: number): number {
  let result = 1
  base = ((base % mod) + mod) % mod
  while (exp > 0) {
    if (exp % 2 === 1) result = (result * base) % mod
    exp = Math.floor(exp / 2)
    base = (base * base) % mod
  }
  return result
}

function modInverse(a: number, mod: number): number {
  return modPow(a, mod - 2, mod)
}

interface CurvePoint {
  readonly x: number
  readonly y: number
}

function getCurvePoints(): ReadonlyArray<CurvePoint> {
  const points: CurvePoint[] = []
  for (let x = 0; x < VISUAL_P; x++) {
    const rhs = (modPow(x, 3, VISUAL_P) + VISUAL_A * x + VISUAL_B) % VISUAL_P
    for (let y = 0; y < VISUAL_P; y++) {
      if ((y * y) % VISUAL_P === rhs) {
        points.push({ x, y })
      }
    }
  }
  return points
}

// Point at infinity represented as null
function pointAdd(
  p1: CurvePoint | null,
  p2: CurvePoint | null,
): CurvePoint | null {
  if (p1 === null) return p2
  if (p2 === null) return p1

  const mod = VISUAL_P

  if (p1.x === p2.x && p1.y !== p2.y) {
    return null // point at infinity
  }

  let slope: number
  if (p1.x === p2.x && p1.y === p2.y) {
    if (p1.y === 0) return null
    // Tangent: slope = (3x^2 + a) / (2y)
    slope =
      ((3 * modPow(p1.x, 2, mod) + VISUAL_A) * modInverse(2 * p1.y, mod)) %
      mod
  } else {
    // Secant: slope = (y2 - y1) / (x2 - x1)
    slope =
      (((p2.y - p1.y + mod) % mod) * modInverse((p2.x - p1.x + mod) % mod, mod)) %
      mod
  }

  const x3 = ((slope * slope - p1.x - p2.x) % mod + mod) % mod
  const y3 = ((slope * (p1.x - x3) - p1.y) % mod + mod) % mod

  return { x: x3, y: y3 }
}

function scalarMul(k: number, p: CurvePoint): CurvePoint | null {
  let result: CurvePoint | null = null
  let addend: CurvePoint | null = p
  let n = k

  while (n > 0) {
    if (n % 2 === 1) {
      result = pointAdd(result, addend)
    }
    addend = pointAdd(addend, addend)
    n = Math.floor(n / 2)
  }

  return result
}

// A generator point on our small curve (has large order)
const VISUAL_G: CurvePoint = (() => {
  const points = getCurvePoints()
  // Find a generator with reasonable order
  for (const p of points) {
    let order = 1
    let current: CurvePoint | null = p
    while (current !== null && order < VISUAL_P * 2) {
      current = pointAdd(current, p)
      order++
    }
    if (current === null && order > 20) {
      return p
    }
  }
  return points[0]
})()

// Compute order of VISUAL_G
const VISUAL_ORDER = (() => {
  let order = 1
  let current: CurvePoint | null = VISUAL_G
  while (current !== null) {
    current = pointAdd(current, VISUAL_G)
    order++
  }
  return order
})()

// ── Presets ──
type PresetMode = 'addition' | 'scalar' | 'ecdsa'

interface Preset {
  readonly label: string
  readonly mode: PresetMode
  readonly description: string
}

const PRESETS: ReadonlyArray<Preset> = [
  {
    label: 'Point Addition',
    mode: 'addition',
    description: 'P + Q = R on the curve. The line through P and Q intersects at a third point; reflect it across x-axis to get R.',
  },
  {
    label: 'Scalar Multiplication',
    mode: 'scalar',
    description: 'k * G computed by repeated point addition (double-and-add). This is the trapdoor: easy to compute k*G, hard to reverse.',
  },
  {
    label: 'ECDSA Signing',
    mode: 'ecdsa',
    description: 'Sign a message: random k -> R = k*G -> r = R.x -> s = k^{-1}(z + r*sk) mod n. Uses real secp256k1 for computation.',
  },
]

// ── SVG Helpers ──
const SVG_SIZE = 400
const SVG_PAD = 30

function toSVGX(x: number): number {
  return SVG_PAD + ((x / VISUAL_P) * (SVG_SIZE - 2 * SVG_PAD))
}

function toSVGY(y: number): number {
  return SVG_SIZE - SVG_PAD - ((y / VISUAL_P) * (SVG_SIZE - 2 * SVG_PAD))
}

// ── Real secp256k1 ECDSA signing ──
interface ECDSAResult {
  readonly privateKeyHex: string
  readonly publicKeyHex: string
  readonly messageHash: string
  readonly r: string
  readonly s: string
  readonly v: number
  readonly address: string
}

function performECDSA(privKeyHex: string, message: string): ECDSAResult {
  const privBytes = hexToBytes(privKeyHex)
  const pubBytes = secp256k1.getPublicKey(privBytes, false)
  const pubHex = bytesToHex(pubBytes)

  const msgBytes = new TextEncoder().encode(message)
  const msgHash = keccak256(msgBytes)
  const msgHashBytes = hexToBytes(msgHash)

  // @noble/curves v2: sign() returns 64-byte Uint8Array (r || s)
  const rawSig = secp256k1.sign(msgHashBytes, privBytes)
  const r = bytesToHex(rawSig.slice(0, 32))
  const s = bytesToHex(rawSig.slice(32, 64))

  // Determine recovery bit by trying both values
  const pubCompressedHex = bytesToHex(secp256k1.getPublicKey(privBytes, true))
  let v: number = 0
  for (let tryV = 0; tryV <= 1; tryV++) {
    const sig65 = new Uint8Array(65)
    sig65[0] = tryV
    sig65.set(rawSig, 1)
    try {
      const rec = secp256k1.recoverPublicKey(sig65, msgHashBytes)
      if (bytesToHex(rec) === pubCompressedHex) { v = tryV; break }
    } catch { /* try next */ }
  }

  // Derive address
  const pubForHash = pubBytes.slice(1)
  const addrHash = keccak256(pubForHash)
  const address = addrHash.slice(24)

  return {
    privateKeyHex: privKeyHex,
    publicKeyHex: pubHex,
    messageHash: msgHash,
    r,
    s,
    v: v ?? 0,
    address,
  }
}

// ── Component ──
export default function CurveVisualizer() {
  const [mode, setMode] = useState<PresetMode>('addition')
  const [animKey, setAnimKey] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Point addition state
  const [addK1, setAddK1] = useState(3)
  const [addK2, setAddK2] = useState(7)

  // Scalar multiplication state
  const [scalarK, setScalarK] = useState(5)

  // ECDSA state
  const [ecdsaResult, setEcdsaResult] = useState<ECDSAResult | null>(null)
  const [ecdsaMessage, setEcdsaMessage] = useState('Transfer 1 ETH')

  const allPoints = useMemo(() => getCurvePoints(), [])

  // Point addition computation
  const addP = useMemo(() => scalarMul(addK1, VISUAL_G), [addK1])
  const addQ = useMemo(() => scalarMul(addK2, VISUAL_G), [addK2])
  const addR = useMemo(() => pointAdd(addP, addQ), [addP, addQ])

  // Scalar multiplication: compute intermediate points for animation
  const scalarSteps = useMemo(() => {
    const steps: ReadonlyArray<CurvePoint | null> = Array.from(
      { length: scalarK },
      (_, i) => scalarMul(i + 1, VISUAL_G),
    )
    return steps
  }, [scalarK])

  // Initialize ECDSA
  const runECDSA = useCallback(() => {
    try {
      const privHex = bytesToHex(secp256k1.utils.randomSecretKey())
      const result = performECDSA(privHex, ecdsaMessage)
      setEcdsaResult(result)
      setAnimKey(k => k + 1)
    } catch {
      // Silently handle edge cases
    }
  }, [ecdsaMessage])

  useEffect(() => {
    runECDSA()
  }, [])

  // GSAP animation
  useGSAP(() => {
    if (!containerRef.current || animKey === 0) return

    const steps = containerRef.current.querySelectorAll('.viz-step')
    const arrows = containerRef.current.querySelectorAll('.viz-arrow')
    const tl = gsap.timeline()

    steps.forEach((step, i) => {
      tl.fromTo(
        step,
        { scale: 1.015, boxShadow: `inset 0 0 0 1px ${COLORS.accent}` },
        { scale: 1, boxShadow: 'inset 0 0 0 0px transparent', duration: 0.4, ease: 'power2.out' },
        i * 0.12,
      )
    })
    arrows.forEach((arrow, i) => {
      tl.fromTo(
        arrow,
        { opacity: 0.2 },
        { opacity: 1, duration: 0.3, ease: 'power2.out' },
        i * 0.12 + 0.06,
      )
    })

    // Animate SVG points
    if (svgRef.current) {
      const dots = svgRef.current.querySelectorAll('.highlight-dot')
      tl.fromTo(
        dots,
        { scale: 0, transformOrigin: 'center' },
        { scale: 1, duration: 0.5, ease: 'back.out(2)', stagger: 0.1 },
        0,
      )
      const lines = svgRef.current.querySelectorAll('.anim-line')
      tl.fromTo(
        lines,
        { strokeDashoffset: 600 },
        { strokeDashoffset: 0, duration: 0.8, ease: 'power2.out', stagger: 0.15 },
        0.2,
      )
    }
  }, { scope: containerRef, dependencies: [animKey, mode] })

  const handleModeChange = useCallback((newMode: PresetMode) => {
    setMode(newMode)
    setAnimKey(k => k + 1)
  }, [])

  const handleAddK1Change = useCallback((val: number) => {
    setAddK1(val)
    setAnimKey(k => k + 1)
  }, [])

  const handleAddK2Change = useCallback((val: number) => {
    setAddK2(val)
    setAnimKey(k => k + 1)
  }, [])

  const handleScalarChange = useCallback((val: number) => {
    setScalarK(val)
    setAnimKey(k => k + 1)
  }, [])

  const currentPreset = PRESETS.find(p => p.mode === mode)

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
          Elliptic Curve Cryptography
        </span>
        <span style={{ fontSize: 13, color: COLORS.textDim }}>Interactive Visualizer</span>
      </div>

      {/* Mode selector */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${PRESETS.length}, 1fr)`,
          gap: '8px',
          marginBottom: '12px',
        }}>
          {PRESETS.map(p => (
            <button
              type="button"
              key={p.mode}
              onClick={() => handleModeChange(p.mode)}
              style={{
                padding: '8px 12px',
                fontSize: 12,
                borderRadius: '8px',
                border: `1px solid ${mode === p.mode ? COLORS.accent : COLORS.borderLight}`,
                background: mode === p.mode ? COLORS.accentDim : 'transparent',
                color: mode === p.mode ? COLORS.accent : COLORS.textDim,
                cursor: 'pointer',
                fontFamily: 'var(--sl-font-system-mono, monospace)',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {currentPreset && (
          <div style={{
            fontSize: 12,
            color: COLORS.textDim,
            lineHeight: 1.6,
            marginBottom: '16px',
            padding: '10px 14px',
            background: COLORS.surfaceLight,
            borderRadius: '8px',
          }}>
            {currentPreset.description}
          </div>
        )}
      </div>

      {/* Main content area */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '400px 1fr',
        gap: '0',
        minHeight: '420px',
      }}>
        {/* Left: SVG curve plot */}
        <div style={{
          padding: '0 20px 20px',
          borderRight: `1px solid ${COLORS.border}`,
        }}>
          <Label text={`y\u00B2 = x\u00B3 + 7 (mod ${VISUAL_P})`} />
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
            style={{
              width: '100%',
              height: 'auto',
              background: COLORS.surface,
              borderRadius: '8px',
              border: `1px solid ${COLORS.borderLight}`,
            }}
          >
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map(f => (
              <g key={f}>
                <line
                  x1={SVG_PAD}
                  y1={SVG_PAD + f * (SVG_SIZE - 2 * SVG_PAD)}
                  x2={SVG_SIZE - SVG_PAD}
                  y2={SVG_PAD + f * (SVG_SIZE - 2 * SVG_PAD)}
                  stroke={COLORS.border}
                  strokeWidth="0.5"
                />
                <line
                  x1={SVG_PAD + f * (SVG_SIZE - 2 * SVG_PAD)}
                  y1={SVG_PAD}
                  x2={SVG_PAD + f * (SVG_SIZE - 2 * SVG_PAD)}
                  y2={SVG_SIZE - SVG_PAD}
                  stroke={COLORS.border}
                  strokeWidth="0.5"
                />
              </g>
            ))}

            {/* All curve points */}
            {allPoints.map((pt, i) => (
              <circle
                key={i}
                cx={toSVGX(pt.x)}
                cy={toSVGY(pt.y)}
                r={2}
                fill={COLORS.textDim}
                opacity={0.3}
              />
            ))}

            {/* Mode-specific overlay */}
            {mode === 'addition' && (
              <PointAdditionOverlay p={addP} q={addQ} r={addR} />
            )}
            {mode === 'scalar' && (
              <ScalarMulOverlay steps={scalarSteps} g={VISUAL_G} />
            )}
            {mode === 'ecdsa' && (
              <ECDSAOverlay g={VISUAL_G} />
            )}
          </svg>
        </div>

        {/* Right: Details panel */}
        <div style={{ padding: '0 20px 20px', overflow: 'auto' }}>
          {mode === 'addition' && (
            <PointAdditionPanel
              k1={addK1}
              k2={addK2}
              p={addP}
              q={addQ}
              r={addR}
              onK1Change={handleAddK1Change}
              onK2Change={handleAddK2Change}
            />
          )}
          {mode === 'scalar' && (
            <ScalarMulPanel
              k={scalarK}
              steps={scalarSteps}
              onKChange={handleScalarChange}
            />
          )}
          {mode === 'ecdsa' && (
            <ECDSAPanel
              result={ecdsaResult}
              message={ecdsaMessage}
              onMessageChange={setEcdsaMessage}
              onSign={runECDSA}
            />
          )}
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
        <FooterChip label="secp256k1" desc="y^2 = x^3 + 7 over a 256-bit prime field" />
        <FooterChip label="Trapdoor Function" desc="k*G is easy; finding k from k*G is infeasible" />
        <FooterChip label="ECDSA" desc="Signatures: (r, s, v) from private key + message hash" />
      </div>
    </div>
  )
}

// ── SVG Overlays ──

function PointAdditionOverlay({ p, q, r }: {
  readonly p: CurvePoint | null
  readonly q: CurvePoint | null
  readonly r: CurvePoint | null
}) {
  if (!p || !q) return null

  const px = toSVGX(p.x)
  const py = toSVGY(p.y)
  const qx = toSVGX(q.x)
  const qy = toSVGY(q.y)

  return (
    <g>
      {/* Line through P and Q */}
      <line
        className="anim-line"
        x1={px} y1={py} x2={qx} y2={qy}
        stroke={COLORS.yellow}
        strokeWidth="1"
        strokeDasharray="600"
        opacity={0.6}
      />

      {/* Point P */}
      <circle className="highlight-dot" cx={px} cy={py} r={6} fill={COLORS.green} />
      <text x={px + 10} y={py - 8} fill={COLORS.green} fontSize="12" fontWeight="700">P</text>

      {/* Point Q */}
      <circle className="highlight-dot" cx={qx} cy={qy} r={6} fill={COLORS.cyan} />
      <text x={qx + 10} y={qy - 8} fill={COLORS.cyan} fontSize="12" fontWeight="700">Q</text>

      {/* Result R */}
      {r && (
        <>
          <line
            className="anim-line"
            x1={toSVGX(r.x)} y1={toSVGY((VISUAL_P - r.y) % VISUAL_P)}
            x2={toSVGX(r.x)} y2={toSVGY(r.y)}
            stroke={COLORS.accent}
            strokeWidth="1"
            strokeDasharray="600"
            opacity={0.5}
          />
          <circle className="highlight-dot" cx={toSVGX(r.x)} cy={toSVGY(r.y)} r={7} fill={COLORS.accent} />
          <text x={toSVGX(r.x) + 10} y={toSVGY(r.y) - 8} fill={COLORS.accent} fontSize="12" fontWeight="700">R</text>
        </>
      )}
    </g>
  )
}

function ScalarMulOverlay({ steps, g }: {
  readonly steps: ReadonlyArray<CurvePoint | null>
  readonly g: CurvePoint
}) {
  return (
    <g>
      {/* Generator point */}
      <circle className="highlight-dot" cx={toSVGX(g.x)} cy={toSVGY(g.y)} r={5} fill={COLORS.green} />
      <text x={toSVGX(g.x) + 8} y={toSVGY(g.y) - 6} fill={COLORS.green} fontSize="11" fontWeight="700">G</text>

      {/* Intermediate points and lines */}
      {steps.map((pt, i) => {
        if (!pt) return null
        const prev = i === 0 ? g : steps[i - 1]
        if (!prev) return null
        const progress = i / Math.max(steps.length - 1, 1)
        const color = i === steps.length - 1 ? COLORS.accent : COLORS.yellow
        const opacity = 0.3 + 0.7 * progress

        return (
          <g key={i}>
            <line
              className="anim-line"
              x1={toSVGX(prev.x)} y1={toSVGY(prev.y)}
              x2={toSVGX(pt.x)} y2={toSVGY(pt.y)}
              stroke={color}
              strokeWidth="0.8"
              strokeDasharray="600"
              opacity={opacity * 0.4}
            />
            <circle
              className="highlight-dot"
              cx={toSVGX(pt.x)} cy={toSVGY(pt.y)}
              r={i === steps.length - 1 ? 7 : 4}
              fill={color}
              opacity={opacity}
            />
            {i === steps.length - 1 && (
              <text
                x={toSVGX(pt.x) + 10} y={toSVGY(pt.y) - 8}
                fill={COLORS.accent} fontSize="12" fontWeight="700"
              >
                {steps.length}G
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

function ECDSAOverlay({ g }: { readonly g: CurvePoint }) {
  // Show generator and a random k*G point for illustration
  const kVal = 13
  const kG = scalarMul(kVal, g)

  return (
    <g>
      <circle className="highlight-dot" cx={toSVGX(g.x)} cy={toSVGY(g.y)} r={5} fill={COLORS.green} />
      <text x={toSVGX(g.x) + 8} y={toSVGY(g.y) - 6} fill={COLORS.green} fontSize="11" fontWeight="700">G</text>

      {kG && (
        <>
          <line
            className="anim-line"
            x1={toSVGX(g.x)} y1={toSVGY(g.y)}
            x2={toSVGX(kG.x)} y2={toSVGY(kG.y)}
            stroke={COLORS.orange}
            strokeWidth="1"
            strokeDasharray="600"
            opacity={0.5}
          />
          <circle className="highlight-dot" cx={toSVGX(kG.x)} cy={toSVGY(kG.y)} r={7} fill={COLORS.orange} />
          <text x={toSVGX(kG.x) + 10} y={toSVGY(kG.y) - 8} fill={COLORS.orange} fontSize="12" fontWeight="700">R=kG</text>
        </>
      )}
    </g>
  )
}

// ── Detail Panels ──

function PointAdditionPanel({ k1, k2, p, q, r, onK1Change, onK2Change }: {
  readonly k1: number
  readonly k2: number
  readonly p: CurvePoint | null
  readonly q: CurvePoint | null
  readonly r: CurvePoint | null
  readonly onK1Change: (v: number) => void
  readonly onK2Change: (v: number) => void
}) {
  const maxK = Math.min(VISUAL_ORDER - 1, 30)
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '12px' }}>
      <Label text="Point Addition: P + Q = R" />

      <div style={{ display: 'flex', gap: '16px' }}>
        <SliderInput
          label="P = k1 * G"
          value={k1}
          min={1}
          max={maxK}
          onChange={onK1Change}
          color={COLORS.green}
        />
        <SliderInput
          label="Q = k2 * G"
          value={k2}
          min={1}
          max={maxK}
          onChange={onK2Change}
          color={COLORS.cyan}
        />
      </div>

      <div className="viz-step" style={stepStyle()}>
        <StepHeader n={1} title="Point P" color={COLORS.green} />
        <div style={monoStyle()}>
          k1 = {k1}, P = {k1}*G = {p ? `(${p.x}, ${p.y})` : 'Infinity'}
        </div>
      </div>

      <Arrow label="Choose second point Q" />

      <div className="viz-step" style={stepStyle()}>
        <StepHeader n={2} title="Point Q" color={COLORS.cyan} />
        <div style={monoStyle()}>
          k2 = {k2}, Q = {k2}*G = {q ? `(${q.x}, ${q.y})` : 'Infinity'}
        </div>
      </div>

      <Arrow label="Draw line through P and Q, find third intersection, reflect" />

      <div className="viz-step" style={stepStyle()}>
        <StepHeader n={3} title="Result R = P + Q" color={COLORS.accent} />
        <div style={monoStyle()}>
          R = P + Q = {r ? `(${r.x}, ${r.y})` : 'Infinity (point at infinity)'}
        </div>
        {r && (
          <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: '6px' }}>
            This equals ({k1} + {k2}) * G = {k1 + k2} * G on the curve
          </div>
        )}
      </div>

      <InfoBox text="Elliptic curve point addition forms an abelian group. The 'line-and-reflect' rule gives a geometric intuition for the algebraic operation." />
    </div>
  )
}

function ScalarMulPanel({ k, steps, onKChange }: {
  readonly k: number
  readonly steps: ReadonlyArray<CurvePoint | null>
  readonly onKChange: (v: number) => void
}) {
  const maxK = Math.min(VISUAL_ORDER - 1, 30)
  const result = steps[steps.length - 1]

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '12px' }}>
      <Label text="Scalar Multiplication: k * G" />

      <SliderInput
        label="Scalar k"
        value={k}
        min={1}
        max={maxK}
        onChange={onKChange}
        color={COLORS.accent}
      />

      <div className="viz-step" style={stepStyle()}>
        <StepHeader n={1} title="Generator Point G" color={COLORS.green} />
        <div style={monoStyle()}>
          G = ({VISUAL_G.x}, {VISUAL_G.y})
        </div>
        <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: '4px' }}>
          Order of G = {VISUAL_ORDER}
        </div>
      </div>

      <Arrow label={`Compute k*G via double-and-add (k = ${k})`} />

      <div className="viz-step" style={stepStyle()}>
        <StepHeader n={2} title="Intermediate Steps" color={COLORS.yellow} />
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: '4px',
          maxHeight: '120px',
          overflow: 'auto',
        }}>
          {steps.map((pt, i) => (
            <div key={i} style={{
              fontSize: 11,
              fontFamily: 'var(--sl-font-system-mono, monospace)',
              color: i === steps.length - 1 ? COLORS.accent : COLORS.textDim,
              fontWeight: i === steps.length - 1 ? 700 : 400,
            }}>
              {i + 1}G = {pt ? `(${pt.x},${pt.y})` : 'Inf'}
            </div>
          ))}
        </div>
      </div>

      <Arrow label="Final result" />

      <div className="viz-step" style={stepStyle()}>
        <StepHeader n={3} title={`Result: ${k}*G`} color={COLORS.accent} />
        <div style={monoStyle()}>
          {k}*G = {result ? `(${result.x}, ${result.y})` : 'Infinity'}
        </div>
      </div>

      <InfoBox text={`Trapdoor: Computing ${k}*G takes O(log k) steps. But given the result point, finding k requires O(sqrt(n)) steps (Pollard rho). For secp256k1, n ~ 2^256, so this takes ~2^128 operations.`} />
    </div>
  )
}

function ECDSAPanel({ result, message, onMessageChange, onSign }: {
  readonly result: ECDSAResult | null
  readonly message: string
  readonly onMessageChange: (v: string) => void
  readonly onSign: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '12px' }}>
      <Label text="ECDSA Signing (real secp256k1)" />

      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={message}
          onChange={e => onMessageChange(e.target.value)}
          spellCheck={false}
          placeholder="Message to sign..."
          style={{
            flex: 1,
            padding: '8px 12px',
            background: COLORS.surfaceLight,
            border: `1px solid ${COLORS.borderLight}`,
            borderRadius: '8px',
            color: COLORS.text,
            fontFamily: 'var(--sl-font-system-mono, monospace)',
            fontSize: 12,
            outline: 'none',
            boxSizing: 'border-box' as const,
          }}
        />
        <button
          type="button"
          onClick={onSign}
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
          Sign (new key)
        </button>
      </div>

      {result && (
        <>
          <div className="viz-step" style={stepStyle()}>
            <StepHeader n={1} title="Private Key (random)" color={COLORS.red} />
            <HexValue value={result.privateKeyHex} />
            <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: '4px' }}>
              Random 256-bit integer in [1, n-1]
            </div>
          </div>

          <Arrow label="PK = sk * G (secp256k1 scalar multiplication)" />

          <div className="viz-step" style={stepStyle()}>
            <StepHeader n={2} title="Public Key" color={COLORS.green} />
            <HexValue value={result.publicKeyHex} truncate />
            <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: '4px' }}>
              Address: 0x{result.address}
            </div>
          </div>

          <Arrow label={`z = keccak256("${message.length > 20 ? message.slice(0, 20) + '...' : message}")`} />

          <div className="viz-step" style={stepStyle()}>
            <StepHeader n={3} title="Message Hash (z)" color={COLORS.yellow} />
            <HexValue value={result.messageHash} />
          </div>

          <Arrow label="ECDSA: k random, R=kG, r=R.x, s=k^{-1}(z+r*sk) mod n" />

          <div className="viz-step" style={stepStyle()}>
            <StepHeader n={4} title="Signature (r, s, v)" color={COLORS.accent} />
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '6px' }}>
              <HexRow label="r" value={result.r} />
              <HexRow label="s" value={result.s} />
              <HexRow label="v" value={String(result.v)} />
            </div>
            <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: '6px' }}>
              r = R.x mod n (32 bytes) | s = signature proof (32 bytes) | v = recovery id (0 or 1)
            </div>
          </div>

          <InfoBox text="r and s prove knowledge of the private key for this specific message hash, without revealing the key. v enables public key recovery (ECRECOVER) from the signature alone." />
        </>
      )}
    </div>
  )
}

// ── Shared Sub-components ──

function Label({ text }: { readonly text: string }) {
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

function Arrow({ label }: { readonly label: string }) {
  return (
    <div className="viz-arrow" style={{
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      padding: '4px 0',
      gap: '3px',
    }}>
      <div style={{ width: 2, height: 10, background: COLORS.borderLight }} />
      <div style={{
        fontSize: 11,
        color: COLORS.textDim,
        fontFamily: 'var(--sl-font-system-mono, monospace)',
        textAlign: 'center' as const,
        padding: '3px 10px',
        background: `${COLORS.accent}11`,
        borderRadius: '4px',
        border: `1px solid ${COLORS.accent}22`,
        maxWidth: '100%',
      }}>
        {label}
      </div>
      <div style={{
        width: 0,
        height: 0,
        borderLeft: '5px solid transparent',
        borderRight: '5px solid transparent',
        borderTop: `6px solid ${COLORS.borderLight}`,
      }} />
    </div>
  )
}

function StepHeader({ n, title, color }: {
  readonly n: number
  readonly title: string
  readonly color: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
      <span style={{
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: `${color}22`,
        color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 700,
        flexShrink: 0,
      }}>
        {n}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{title}</span>
    </div>
  )
}

function SliderInput({ label, value, min, max, onChange, color }: {
  readonly label: string
  readonly value: number
  readonly min: number
  readonly max: number
  readonly onChange: (v: number) => void
  readonly color: string
}) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{
        fontSize: 11,
        color,
        fontWeight: 600,
        fontFamily: 'var(--sl-font-system-mono, monospace)',
        marginBottom: '4px',
      }}>
        {label}: {value}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(parseInt(e.target.value, 10))}
        style={{
          width: '100%',
          accentColor: color,
        }}
      />
    </div>
  )
}

function HexValue({ value, truncate }: {
  readonly value: string
  readonly truncate?: boolean
}) {
  const display = truncate && value.length > 40
    ? value.slice(0, 20) + '...' + value.slice(-20)
    : value
  return (
    <code style={{
      display: 'block',
      fontFamily: 'var(--sl-font-system-mono, monospace)',
      fontSize: 12,
      lineHeight: 1.6,
      color: COLORS.text,
      wordBreak: 'break-all' as const,
    }}>
      {display}
    </code>
  )
}

function HexRow({ label, value }: {
  readonly label: string
  readonly value: string
}) {
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        color: COLORS.textDim,
        minWidth: 20,
        textAlign: 'right' as const,
        fontFamily: 'var(--sl-font-system-mono, monospace)',
      }}>
        {label}
      </span>
      <code style={{
        fontSize: 11,
        lineHeight: 1.6,
        color: COLORS.text,
        wordBreak: 'break-all' as const,
        fontFamily: 'var(--sl-font-system-mono, monospace)',
      }}>
        {value}
      </code>
    </div>
  )
}

function InfoBox({ text }: { readonly text: string }) {
  return (
    <div style={{
      padding: '10px 14px',
      background: `${COLORS.accent}11`,
      border: `1px solid ${COLORS.accent}22`,
      borderRadius: '8px',
      fontSize: 11,
      color: COLORS.textDim,
      lineHeight: 1.7,
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

// ── Style helpers ──
function stepStyle(): React.CSSProperties {
  return {
    padding: '14px',
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '10px',
  }
}

function monoStyle(): React.CSSProperties {
  return {
    fontFamily: 'var(--sl-font-system-mono, monospace)',
    fontSize: 13,
    lineHeight: 1.6,
    color: COLORS.text,
    wordBreak: 'break-all' as const,
  }
}
