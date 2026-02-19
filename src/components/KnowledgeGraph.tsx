import { useEffect, useRef, useState, useCallback } from 'react'
import {
  forceSimulation,
  forceCenter,
  forceManyBody,
  forceLink,
  forceCollide,
} from 'd3-force'
import type { Simulation } from 'd3-force'
import graphData from '../data/graph.json'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface GraphNode {
  id: string
  label: string
  category: string
  color: string
  radius: number
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
}

interface GraphLink {
  source: GraphNode | string
  target: GraphNode | string
}

interface Transform {
  x: number
  y: number
  k: number
}

interface Props {
  currentPage?: string
  mini?: boolean
}

// ---------------------------------------------------------------------------
// Pre-computed data (module scope, computed once)
// ---------------------------------------------------------------------------
const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  graphData.categories.map((c: any) => [c.key, c.label])
)

const degreeMap: Record<string, number> = {}
for (const e of graphData.edges) {
  degreeMap[e.source] = (degreeMap[e.source] || 0) + 1
  degreeMap[e.target] = (degreeMap[e.target] || 0) + 1
}

const neighborMap: Record<string, Set<string>> = {}
for (const e of graphData.edges) {
  if (!neighborMap[e.source]) neighborMap[e.source] = new Set()
  if (!neighborMap[e.target]) neighborMap[e.target] = new Set()
  neighborMap[e.source].add(e.target)
  neighborMap[e.target].add(e.source)
}

// ---------------------------------------------------------------------------
// Visual constants (Obsidian dark theme)
// ---------------------------------------------------------------------------
const BG_COLOR = '#202020'
const LABEL_COLOR = '#dcddde'
const FOCUSED_RING_COLOR = '#ffd700'

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function KnowledgeGraph({ currentPage, mini = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<Simulation<GraphNode, GraphLink> | null>(null)
  const nodesRef = useRef<GraphNode[]>([])
  const linksRef = useRef<GraphLink[]>([])
  const transformRef = useRef<Transform>({ x: 0, y: 0, k: 1 })
  const hoveredRef = useRef<GraphNode | null>(null)
  const dragRef = useRef<{
    node: GraphNode
    startScreenX: number
    startScreenY: number
    hasMoved: boolean
  } | null>(null)
  const panRef = useRef<{
    startX: number
    startY: number
    startTx: number
    startTy: number
  } | null>(null)
  const activeCatRef = useRef<string | null>(null)
  const sizeRef = useRef({ w: 0, h: 0 })
  const drawScheduled = useRef(false)

  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  // Sync React state → ref
  useEffect(() => {
    activeCatRef.current = activeCategory
    scheduleDraw()
  }, [activeCategory])

  // --------------------------------------------------
  // Schedule a single draw on next animation frame
  // --------------------------------------------------
  const scheduleDraw = useCallback(() => {
    if (drawScheduled.current) return
    drawScheduled.current = true
    requestAnimationFrame(() => {
      drawScheduled.current = false
      draw()
    })
  }, [])

  // --------------------------------------------------
  // Draw (the core rendering function)
  // --------------------------------------------------
  function draw() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { w, h } = sizeRef.current
    if (w === 0 || h === 0) return

    const dpr = window.devicePixelRatio || 1
    const t = transformRef.current
    const hovered = hoveredRef.current
    const activeCat = activeCatRef.current
    const hovNeighbors = hovered ? neighborMap[hovered.id] || new Set<string>() : null

    const nodes = nodesRef.current
    const links = linksRef.current

    // Reset transform to DPR base, clear
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = BG_COLOR
    ctx.fillRect(0, 0, w, h)

    // Apply camera
    ctx.translate(t.x, t.y)
    ctx.scale(t.k, t.k)

    // ---- Edges ----
    for (const link of links) {
      const s = link.source as GraphNode
      const tgt = link.target as GraphNode
      if (s.x == null || s.y == null || tgt.x == null || tgt.y == null) continue

      let alpha = 0.08
      let lw = 0.5

      if (hovered) {
        const connected = s.id === hovered.id || tgt.id === hovered.id
        if (connected) {
          alpha = 0.45
          lw = 1.2
        } else {
          alpha = 0.015
        }
      }

      if (activeCat) {
        const sm = s.category === activeCat
        const tm = tgt.category === activeCat
        if (sm && tm) { alpha = 0.3; lw = 1 }
        else if (sm || tm) { alpha = 0.06 }
        else { alpha = 0.01 }
      }

      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(tgt.x, tgt.y)
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`
      ctx.lineWidth = lw / t.k
      ctx.stroke()
    }

    // ---- Nodes (glow + solid circle) ----
    for (const node of nodes) {
      if (node.x == null || node.y == null) continue

      let nodeAlpha = 1
      let glowMul = 0.3

      if (hovered) {
        if (node.id === hovered.id) {
          glowMul = 0.7
        } else if (hovNeighbors!.has(node.id)) {
          glowMul = 0.45
        } else {
          nodeAlpha = 0.08
          glowMul = 0
        }
      }

      if (activeCat) {
        if (node.category === activeCat) {
          glowMul = 0.55
        } else {
          nodeAlpha = 0.12
          glowMul = 0
        }
      }

      ctx.globalAlpha = nodeAlpha
      const [cr, cg, cb] = hexToRgb(node.color)
      const r = node.radius

      // Glow
      if (glowMul > 0) {
        const glowR = r * 3.5
        const grad = ctx.createRadialGradient(node.x, node.y, r * 0.3, node.x, node.y, glowR)
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},${glowMul * 0.55})`)
        grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
        ctx.beginPath()
        ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2)
        ctx.fillStyle = grad
        ctx.fill()
      }

      // Solid circle
      ctx.beginPath()
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
      ctx.fillStyle = node.color
      ctx.fill()

      // Current-page ring
      if (currentPage && node.id === currentPage) {
        ctx.beginPath()
        ctx.arc(node.x, node.y, r + 3, 0, Math.PI * 2)
        ctx.strokeStyle = FOCUSED_RING_COLOR
        ctx.lineWidth = 2.5 / t.k
        ctx.stroke()
      }

      ctx.globalAlpha = 1
    }

    // ---- Labels (zoom-dependent fade) ----
    const labelBase = mini ? 0 : Math.min(1, Math.max(0, (t.k - 0.35) / 0.65))
    if (labelBase > 0 || hovered) {
      const fontSize = Math.max(10, 11 / t.k)
      ctx.font = `${fontSize}px "Noto Sans TC", system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'

      for (const node of nodes) {
        if (node.x == null || node.y == null) continue

        let tAlpha = labelBase
        if (hovered) {
          if (node.id === hovered.id) tAlpha = 1
          else if (hovNeighbors!.has(node.id)) tAlpha = 0.85
          else tAlpha = 0
        }
        if (activeCat && node.category !== activeCat) tAlpha = 0

        if (tAlpha <= 0.01) continue

        ctx.globalAlpha = tAlpha
        const ty = node.y + node.radius + 4

        // Text outline (readability)
        ctx.strokeStyle = BG_COLOR
        ctx.lineWidth = 3 / t.k
        ctx.lineJoin = 'round'
        ctx.strokeText(node.label, node.x, ty)

        // Text fill
        ctx.fillStyle = LABEL_COLOR
        ctx.fillText(node.label, node.x, ty)
      }
      ctx.globalAlpha = 1
    }

    // Reset transform (clean state for next frame)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }

  // --------------------------------------------------
  // Hit test
  // --------------------------------------------------
  function nodeAt(sx: number, sy: number): GraphNode | null {
    const t = transformRef.current
    const wx = (sx - t.x) / t.k
    const wy = (sy - t.y) / t.k
    const nodes = nodesRef.current
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i]
      if (n.x == null || n.y == null) continue
      const dx = wx - n.x
      const dy = wy - n.y
      const hr = Math.max(n.radius + 4, 10)
      if (dx * dx + dy * dy < hr * hr) return n
    }
    return null
  }

  function canvasPos(e: MouseEvent | React.MouseEvent): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  // --------------------------------------------------
  // Pointer handlers
  // --------------------------------------------------
  const onPointerMove = useCallback((e: MouseEvent) => {
    const pos = canvasPos(e)

    // Dragging a node
    if (dragRef.current) {
      dragRef.current.hasMoved = true
      const t = transformRef.current
      dragRef.current.node.fx = (pos.x - t.x) / t.k
      dragRef.current.node.fy = (pos.y - t.y) / t.k
      simRef.current?.alpha(0.3).restart()
      return
    }

    // Panning
    if (panRef.current) {
      transformRef.current = {
        ...transformRef.current,
        x: panRef.current.startTx + (pos.x - panRef.current.startX),
        y: panRef.current.startTy + (pos.y - panRef.current.startY),
      }
      scheduleDraw()
      return
    }

    // Hover detection
    const node = nodeAt(pos.x, pos.y)
    if (node !== hoveredRef.current) {
      hoveredRef.current = node
      canvasRef.current!.style.cursor = node ? 'pointer' : 'grab'
      scheduleDraw()
    }
  }, [scheduleDraw])

  const onPointerDown = useCallback((e: MouseEvent) => {
    if (e.button !== 0) return
    const pos = canvasPos(e)
    const node = nodeAt(pos.x, pos.y)

    if (node) {
      dragRef.current = { node, startScreenX: pos.x, startScreenY: pos.y, hasMoved: false }
      node.fx = node.x
      node.fy = node.y
      canvasRef.current!.style.cursor = 'grabbing'
    } else {
      panRef.current = {
        startX: pos.x,
        startY: pos.y,
        startTx: transformRef.current.x,
        startTy: transformRef.current.y,
      }
      canvasRef.current!.style.cursor = 'grabbing'
    }
  }, [])

  const onPointerUp = useCallback((e: MouseEvent) => {
    if (dragRef.current) {
      const d = dragRef.current
      d.node.fx = null
      d.node.fy = null
      // Click if barely moved
      if (!d.hasMoved) {
        window.location.href = d.node.id
      }
      dragRef.current = null
      canvasRef.current!.style.cursor = hoveredRef.current ? 'pointer' : 'grab'
      return
    }
    if (panRef.current) {
      panRef.current = null
      canvasRef.current!.style.cursor = hoveredRef.current ? 'pointer' : 'grab'
    }
  }, [])

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const pos = canvasPos(e)
    const t = transformRef.current
    const factor = 1 - e.deltaY * 0.001
    const newK = Math.max(0.1, Math.min(5, t.k * factor))
    const ratio = newK / t.k
    transformRef.current = {
      x: pos.x - (pos.x - t.x) * ratio,
      y: pos.y - (pos.y - t.y) * ratio,
      k: newK,
    }
    scheduleDraw()
  }, [scheduleDraw])

  const onMouseLeave = useCallback(() => {
    hoveredRef.current = null
    if (dragRef.current) {
      dragRef.current.node.fx = null
      dragRef.current.node.fy = null
      dragRef.current = null
    }
    panRef.current = null
    scheduleDraw()
  }, [scheduleDraw])

  // --------------------------------------------------
  // Simulation setup
  // --------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const w = container.clientWidth
    const h = mini ? 300 : 700
    sizeRef.current = { w, h }

    const dpr = window.devicePixelRatio || 1
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    canvas.style.cursor = 'grab'

    // Prepare nodes
    let nodeData: GraphNode[]
    let linkData: any[]

    if (mini && currentPage) {
      const keep = new Set<string>([currentPage])
      for (const e of graphData.edges) {
        if (e.source === currentPage) keep.add(e.target)
        if (e.target === currentPage) keep.add(e.source)
      }
      nodeData = graphData.nodes
        .filter(n => keep.has(n.id))
        .map(n => ({
          id: n.id, label: n.label, category: n.category, color: n.color,
          radius: 4 + Math.sqrt(degreeMap[n.id] || 0) * 1.5,
          x: w / 2 + (Math.random() - 0.5) * 30,
          y: h / 2 + (Math.random() - 0.5) * 30,
        }))
      linkData = graphData.edges
        .filter(e => keep.has(e.source) && keep.has(e.target))
        .map(e => ({ source: e.source, target: e.target }))
    } else {
      nodeData = graphData.nodes.map(n => ({
        id: n.id, label: n.label, category: n.category, color: n.color,
        radius: 4 + Math.sqrt(degreeMap[n.id] || 0) * 1.5,
        x: w / 2 + (Math.random() - 0.5) * 60,
        y: h / 2 + (Math.random() - 0.5) * 60,
      }))
      linkData = graphData.edges.map(e => ({ source: e.source, target: e.target }))
    }

    nodesRef.current = nodeData
    linksRef.current = linkData

    // Center the default camera
    transformRef.current = { x: 0, y: 0, k: 1 }

    // Force simulation (Obsidian-style parameters)
    const sim = forceSimulation<GraphNode>(nodeData)
      .force('center', forceCenter(w / 2, h / 2).strength(0.05))
      .force('charge', forceManyBody<GraphNode>().strength(mini ? -80 : -350).distanceMax(600))
      .force(
        'link',
        forceLink<GraphNode, any>(linkData)
          .id((d: any) => d.id)
          .distance(mini ? 50 : 200)
          .strength(0.25),
      )
      .force('collide', forceCollide<GraphNode>().radius((d: any) => (d as GraphNode).radius + 6))
      .alphaDecay(0.006)
      .velocityDecay(0.25)

    sim.on('tick', draw)
    simRef.current = sim

    // Event listeners (non-passive wheel for preventDefault)
    canvas.addEventListener('mousemove', onPointerMove)
    canvas.addEventListener('mousedown', onPointerDown)
    canvas.addEventListener('mouseup', onPointerUp)
    canvas.addEventListener('mouseleave', onMouseLeave)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      sim.stop()
      canvas.removeEventListener('mousemove', onPointerMove)
      canvas.removeEventListener('mousedown', onPointerDown)
      canvas.removeEventListener('mouseup', onPointerUp)
      canvas.removeEventListener('mouseleave', onMouseLeave)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [currentPage, mini, onPointerMove, onPointerDown, onPointerUp, onWheel, onMouseLeave])

  // --------------------------------------------------
  // Resize observer
  // --------------------------------------------------
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width
        const h = mini ? 300 : 700
        if (w === sizeRef.current.w) continue
        sizeRef.current = { w, h }
        const dpr = window.devicePixelRatio || 1
        canvas.width = w * dpr
        canvas.height = h * dpr
        canvas.style.width = `${w}px`
        canvas.style.height = `${h}px`

        // Reposition center force
        const center = simRef.current?.force('center') as any
        if (center) center.x(w / 2).y(h / 2)
        simRef.current?.alpha(0.1).restart()
      }
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [mini])

  // --------------------------------------------------
  // Category toggle
  // --------------------------------------------------
  const handleCategoryClick = useCallback((key: string) => {
    setActiveCategory(prev => (prev === key ? null : key))
  }, [])

  // --------------------------------------------------
  // Render
  // --------------------------------------------------
  const height = mini ? '300px' : '700px'

  return (
    <div style={{ position: 'relative' }}>
      {!mini && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {graphData.categories.map((cat: any) => (
            <button
              key={cat.key}
              onClick={() => handleCategoryClick(cat.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 14px',
                fontSize: '12px',
                minWidth: '80px',
                justifyContent: 'center',
                background: activeCategory === cat.key ? cat.color + '22' : 'transparent',
                border: `1px solid ${activeCategory === cat.key ? cat.color : cat.color + '55'}`,
                borderRadius: '999px',
                color: activeCategory === cat.key ? cat.color : cat.color + 'bb',
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontWeight: activeCategory === cat.key ? 600 : 400,
              }}
            >
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: cat.color, display: 'inline-block',
              }} />
              {cat.label}
            </button>
          ))}
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height,
          background: BG_COLOR,
          borderRadius: '10px',
          border: '1px solid #333',
          overflow: 'hidden',
        }}
      >
        <canvas ref={canvasRef} />
      </div>
      {!mini && (
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          marginTop: '8px', fontSize: '12px', color: '#555',
        }}>
          <span>{graphData.nodes.length} 篇筆記</span>
          <span>{graphData.edges.length} 個連結</span>
        </div>
      )}
    </div>
  )
}
