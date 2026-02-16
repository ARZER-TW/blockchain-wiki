import { useEffect, useRef, useState } from 'react'
import cytoscape from 'cytoscape'
import graphData from '../data/graph.json'

interface Props {
  /** If set, highlight this node and its neighbors */
  currentPage?: string
  /** Show mini graph (sidebar) vs full graph (homepage) */
  mini?: boolean
}

const CATEGORY_COLORS: Record<string, string> = {
  cryptography: '#a78bfa',
  'data-structures': '#22d3ee',
  accounts: '#fbbf24',
  'transaction-lifecycle': '#34d399',
  consensus: '#f87171',
  advanced: '#f472b6',
}

const CATEGORY_LABELS: Record<string, string> = {
  cryptography: '密碼學',
  'data-structures': '資料結構',
  accounts: '帳戶與交易',
  'transaction-lifecycle': '交易流程',
  consensus: '共識',
  advanced: '進階',
}

export default function KnowledgeGraph({ currentPage, mini = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    let elements: cytoscape.ElementDefinition[]

    if (mini && currentPage) {
      // Mini graph: only show current node + neighbors
      const neighborIds = new Set<string>()
      neighborIds.add(currentPage)
      for (const edge of graphData.edges) {
        if (edge.source === currentPage) neighborIds.add(edge.target)
        if (edge.target === currentPage) neighborIds.add(edge.source)
      }
      elements = [
        ...graphData.nodes
          .filter(n => neighborIds.has(n.id))
          .map(n => ({
            data: {
              id: n.id,
              label: n.label,
              category: n.category,
              color: n.color,
              isCurrent: n.id === currentPage,
            },
          })),
        ...graphData.edges
          .filter(e => neighborIds.has(e.source) && neighborIds.has(e.target))
          .map(e => ({
            data: { source: e.source, target: e.target },
          })),
      ]
    } else {
      // Full graph
      elements = [
        ...graphData.nodes.map(n => ({
          data: {
            id: n.id,
            label: n.label,
            category: n.category,
            color: n.color,
            isCurrent: n.id === currentPage,
          },
        })),
        ...graphData.edges.map(e => ({
          data: { source: e.source, target: e.target },
        })),
      ]
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            label: 'data(label)',
            color: '#e2e8f0',
            'font-size': mini ? '10px' : '11px',
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'text-outline-color': '#0d1117',
            'text-outline-width': 2,
            width: mini ? 16 : 22,
            height: mini ? 16 : 22,
            'border-width': 0,
            'overlay-padding': 4,
            'transition-property': 'background-color, width, height, border-width',
            'transition-duration': 150,
          } as any,
        },
        {
          selector: 'node[?isCurrent]',
          style: {
            'border-width': 3,
            'border-color': '#fff',
            width: mini ? 24 : 32,
            height: mini ? 24 : 32,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1,
            'line-color': '#334155',
            'curve-style': 'bezier',
            opacity: 0.5,
          },
        },
        {
          selector: 'node.hover',
          style: {
            'border-width': 2,
            'border-color': '#fff',
            width: mini ? 22 : 30,
            height: mini ? 22 : 30,
          },
        },
        {
          selector: 'node.faded',
          style: {
            opacity: 0.15,
          },
        },
        {
          selector: 'edge.faded',
          style: {
            opacity: 0.05,
          },
        },
        {
          selector: 'node.highlighted',
          style: {
            opacity: 1,
          },
        },
        {
          selector: 'edge.highlighted',
          style: {
            opacity: 0.8,
            width: 2,
            'line-color': '#64748b',
          },
        },
      ],
      layout: {
        name: 'cose',
        animate: false,
        nodeOverlap: 20,
        idealEdgeLength: () => mini ? 60 : 100,
        nodeRepulsion: () => mini ? 8000 : 20000,
        gravity: mini ? 0.8 : 0.3,
        numIter: 500,
        padding: mini ? 10 : 30,
      } as any,
      userZoomingEnabled: !mini,
      userPanningEnabled: !mini,
      boxSelectionEnabled: false,
      minZoom: 0.3,
      maxZoom: 3,
    })

    // Click node -> navigate
    cy.on('tap', 'node', (evt) => {
      const nodeId = evt.target.id()
      window.location.href = nodeId
    })

    // Hover effects
    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target
      node.addClass('hover')
      containerRef.current!.style.cursor = 'pointer'
    })

    cy.on('mouseout', 'node', (evt) => {
      evt.target.removeClass('hover')
      containerRef.current!.style.cursor = 'default'
    })

    cyRef.current = cy

    return () => {
      cy.destroy()
    }
  }, [currentPage, mini])

  // Category filter
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    if (activeCategory) {
      cy.elements().addClass('faded')
      const matchingNodes = cy.nodes().filter(n => n.data('category') === activeCategory)
      matchingNodes.addClass('highlighted').removeClass('faded')
      matchingNodes.connectedEdges().addClass('highlighted').removeClass('faded')
      matchingNodes.connectedEdges().connectedNodes().addClass('highlighted').removeClass('faded')
    } else {
      cy.elements().removeClass('faded').removeClass('highlighted')
    }
  }, [activeCategory])

  const height = mini ? '300px' : '500px'

  return (
    <div style={{ position: 'relative' }}>
      {!mini && (
        <div style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          marginBottom: '12px',
        }}>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveCategory(activeCategory === key ? null : key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                fontSize: '12px',
                background: activeCategory === key ? CATEGORY_COLORS[key] + '33' : 'transparent',
                border: `1px solid ${CATEGORY_COLORS[key]}`,
                borderRadius: '999px',
                color: CATEGORY_COLORS[key],
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: CATEGORY_COLORS[key],
                display: 'inline-block',
              }} />
              {label}
            </button>
          ))}
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height,
          background: '#0d1117',
          borderRadius: '8px',
          border: '1px solid #21262d',
        }}
      />
      {!mini && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '8px',
          fontSize: '12px',
          color: '#64748b',
        }}>
          <span>{graphData.nodes.length} notes</span>
          <span>{graphData.edges.length} connections</span>
        </div>
      )}
    </div>
  )
}
