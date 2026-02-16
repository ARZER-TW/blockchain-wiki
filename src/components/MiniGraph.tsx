import { useMemo } from 'react'
import KnowledgeGraph from './KnowledgeGraph'
import graphData from '../data/graph.json'

interface Props {
  currentPage: string
}

export default function MiniGraph({ currentPage }: Props) {
  const neighborCount = useMemo(() => {
    let count = 0
    for (const edge of graphData.edges) {
      if (edge.source === currentPage || edge.target === currentPage) count++
    }
    return count
  }, [currentPage])

  if (neighborCount === 0) return null

  return (
    <div style={{ marginTop: '1rem' }}>
      <h3 style={{
        fontSize: '0.85rem',
        fontWeight: 600,
        color: '#94a3b8',
        marginBottom: '8px',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        Related Notes ({neighborCount})
      </h3>
      <KnowledgeGraph currentPage={currentPage} mini />
    </div>
  )
}
