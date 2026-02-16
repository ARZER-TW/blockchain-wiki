import { useState, useEffect } from 'react'
import paths from '../data/learning-paths.json'

const STORAGE_KEY = 'blockchain-wiki-progress'

interface Props {
  currentPage: string
}

interface Progress {
  [pathId: string]: string[]
}

function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveProgress(progress: Progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
}

export default function PageProgress({ currentPage }: Props) {
  const [progress, setProgress] = useState<Progress>({})

  useEffect(() => {
    setProgress(loadProgress())
  }, [])

  // Find which paths contain this page
  const relevantPaths = paths.filter(p =>
    p.steps.some(s => s.href === currentPage)
  )

  if (relevantPaths.length === 0) return null

  const toggleComplete = (pathId: string) => {
    setProgress(prev => {
      const completed = prev[pathId] || []
      const next = completed.includes(currentPage)
        ? completed.filter(h => h !== currentPage)
        : [...completed, currentPage]
      const updated = { ...prev, [pathId]: next }
      saveProgress(updated)
      return updated
    })
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      marginBottom: '24px',
      padding: '12px 16px',
      background: '#161b22',
      borderRadius: '8px',
      border: '1px solid #21262d',
    }}>
      {relevantPaths.map(path => {
        const stepIndex = path.steps.findIndex(s => s.href === currentPage)
        const isCompleted = (progress[path.id] || []).includes(currentPage)
        const prevStep = stepIndex > 0 ? path.steps[stepIndex - 1] : null
        const nextStep = stepIndex < path.steps.length - 1 ? path.steps[stepIndex + 1] : null

        return (
          <div key={path.id}>
            {/* Path badge + step counter */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: path.color + '22',
                  color: path.color,
                  border: `1px solid ${path.color}44`,
                  fontWeight: 600,
                }}>
                  {path.title}
                </span>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  Step {stepIndex + 1}/{path.steps.length}
                </span>
              </div>

              <button
                onClick={() => toggleComplete(path.id)}
                style={{
                  fontSize: '12px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${isCompleted ? path.color : '#334155'}`,
                  background: isCompleted ? path.color + '22' : 'transparent',
                  color: isCompleted ? path.color : '#94a3b8',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {isCompleted ? 'Completed' : 'Mark as read'}
              </button>
            </div>

            {/* Mini progress bar */}
            <div style={{
              display: 'flex',
              gap: '3px',
              marginBottom: '8px',
            }}>
              {path.steps.map((step, i) => {
                const done = (progress[path.id] || []).includes(step.href)
                const isCurrent = i === stepIndex
                return (
                  <div
                    key={step.href}
                    style={{
                      flex: 1,
                      height: '3px',
                      borderRadius: '2px',
                      background: done ? path.color : isCurrent ? path.color + '66' : '#1e293b',
                      transition: 'background 0.2s',
                    }}
                  />
                )
              })}
            </div>

            {/* Prev/Next navigation */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '12px',
            }}>
              {prevStep ? (
                <a href={prevStep.href} style={{ color: '#64748b', textDecoration: 'none' }}>
                  &larr; {prevStep.title}
                </a>
              ) : <span />}
              {nextStep ? (
                <a href={nextStep.href} style={{ color: path.color, textDecoration: 'none', fontWeight: 500 }}>
                  {nextStep.title} &rarr;
                </a>
              ) : (
                <span style={{ color: path.color, fontSize: '12px' }}>
                  Path complete!
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
