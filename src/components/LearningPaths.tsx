import { useState, useEffect, useCallback } from 'react'
import paths from '../data/learning-paths.json'

const STORAGE_KEY = 'blockchain-wiki-progress'

interface Progress {
  [pathId: string]: string[]  // completed hrefs
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

export default function LearningPaths() {
  const [progress, setProgress] = useState<Progress>({})
  const [expandedPath, setExpandedPath] = useState<string | null>(null)

  useEffect(() => {
    setProgress(loadProgress())
  }, [])

  const toggleStep = useCallback((pathId: string, href: string) => {
    setProgress(prev => {
      const completed = prev[pathId] || []
      const next = completed.includes(href)
        ? completed.filter(h => h !== href)
        : [...completed, href]
      const updated = { ...prev, [pathId]: next }
      saveProgress(updated)
      return updated
    })
  }, [])

  const getPathProgress = useCallback((pathId: string, totalSteps: number) => {
    const completed = progress[pathId]?.length || 0
    return Math.round((completed / totalSteps) * 100)
  }, [progress])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {paths.map(path => {
        const pct = getPathProgress(path.id, path.steps.length)
        const isExpanded = expandedPath === path.id
        const completedSet = new Set(progress[path.id] || [])

        return (
          <div
            key={path.id}
            style={{
              border: `1px solid ${path.color}33`,
              borderRadius: '12px',
              background: '#0d1117',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <button
              onClick={() => setExpandedPath(isExpanded ? null : path.id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#e2e8f0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: path.color,
                  flexShrink: 0,
                }} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, fontSize: '15px' }}>{path.title}</div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    {path.description}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                <span style={{ fontSize: '13px', color: path.color, fontWeight: 600 }}>
                  {pct}%
                </span>
                <svg
                  width="16" height="16" viewBox="0 0 16 16" fill="none"
                  style={{
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                  }}
                >
                  <path d="M4 6L8 10L12 6" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
            </button>

            {/* Progress bar */}
            <div style={{ height: '2px', background: '#1e293b', margin: '0 20px' }}>
              <div style={{
                height: '100%',
                width: `${pct}%`,
                background: path.color,
                transition: 'width 0.3s ease',
                borderRadius: '1px',
              }} />
            </div>

            {/* Expanded: stepper */}
            {isExpanded && (
              <div style={{ padding: '16px 20px' }}>
                {path.steps.map((step, i) => {
                  const isDone = completedSet.has(step.href)
                  const isLast = i === path.steps.length - 1

                  return (
                    <div key={step.href} style={{ display: 'flex', gap: '12px' }}>
                      {/* Vertical line + circle */}
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        width: '24px',
                        flexShrink: 0,
                      }}>
                        <button
                          onClick={() => toggleStep(path.id, step.href)}
                          title={isDone ? 'Mark incomplete' : 'Mark complete'}
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            border: `2px solid ${isDone ? path.color : '#334155'}`,
                            background: isDone ? path.color : 'transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            flexShrink: 0,
                            transition: 'all 0.15s',
                          }}
                        >
                          {isDone && (
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5L4.5 7.5L8 3" stroke="#0d1117" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                        {!isLast && (
                          <div style={{
                            width: '2px',
                            flex: 1,
                            minHeight: '20px',
                            background: isDone ? path.color + '66' : '#1e293b',
                          }} />
                        )}
                      </div>

                      {/* Step content */}
                      <div style={{ paddingBottom: isLast ? 0 : '12px', flex: 1 }}>
                        <a
                          href={step.href}
                          style={{
                            fontSize: '14px',
                            color: isDone ? '#64748b' : '#e2e8f0',
                            textDecoration: isDone ? 'line-through' : 'none',
                            transition: 'color 0.15s',
                          }}
                        >
                          <span style={{ color: '#475569', marginRight: '6px', fontSize: '12px' }}>
                            {i + 1}.
                          </span>
                          {step.title}
                        </a>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
