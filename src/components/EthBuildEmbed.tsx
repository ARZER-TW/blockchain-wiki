import { useState, useRef, useEffect, useCallback } from 'react'

interface EthBuildEmbedProps {
  /** sandbox.eth.build wof URL */
  src: string
  /** iframe title for accessibility */
  title: string
  /** height in pixels */
  height?: number
}

const ZOOM_MIN = 0.5
const ZOOM_MAX = 2.0
const ZOOM_STEP = 0.1

const btnBase: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #30363d',
  borderRadius: '4px',
  color: '#8b949e',
  cursor: 'pointer',
  padding: '0 8px',
  fontSize: '12px',
  height: '24px',
  lineHeight: '22px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  verticalAlign: 'middle',
  boxSizing: 'border-box' as const,
  whiteSpace: 'nowrap' as const,
}

export default function EthBuildEmbed({ src, title, height = 500 }: EthBuildEmbedProps) {
  const [loaded, setLoaded] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const containerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  const toggleFullscreen = () => {
    if (!isFullscreen && containerRef.current) {
      containerRef.current.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const zoomIn = useCallback(() => {
    setZoom(prev => Math.min(ZOOM_MAX, +(prev + ZOOM_STEP).toFixed(1)))
  }, [])

  const zoomOut = useCallback(() => {
    setZoom(prev => Math.max(ZOOM_MIN, +(prev - ZOOM_STEP).toFixed(1)))
  }, [])

  const zoomReset = useCallback(() => setZoom(1), [])

  // Keyboard shortcuts when container is focused/hovered
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomIn() }
      if (e.key === '-') { e.preventDefault(); zoomOut() }
      if (e.key === '0') { e.preventDefault(); zoomReset() }
    }
    el.addEventListener('keydown', handler)
    return () => el.removeEventListener('keydown', handler)
  }, [zoomIn, zoomOut, zoomReset])

  const iframeW = `${(1 / zoom) * 100}%`
  const iframeH = isFullscreen
    ? `calc(100vh - 36px)`
    : `${height}px`
  const scaledH = isFullscreen
    ? `calc((100vh - 36px) * ${zoom})`
    : `${height * zoom}px`

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      style={{
        position: 'relative',
        border: '1px solid #30363d',
        borderRadius: '8px',
        overflow: 'hidden',
        background: '#1a1a2e',
        marginTop: '24px',
        marginBottom: '24px',
        outline: 'none',
      }}
    >
      {/* Header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 14px',
        background: '#161b22',
        borderBottom: '1px solid #30363d',
        fontSize: '13px',
        color: '#8b949e',
        height: '36px',
        boxSizing: 'border-box' as const,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: loaded ? '#3fb950' : '#d29922',
          }} />
          <span style={{ fontWeight: 600, color: '#e6edf3' }}>eth.build</span>
          <span style={{ color: '#8b949e' }}>— {title}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* Zoom controls */}
          <button onClick={zoomOut} disabled={zoom <= ZOOM_MIN} style={{
            ...btnBase,
            opacity: zoom <= ZOOM_MIN ? 0.35 : 1,
            fontWeight: 700,
            padding: '0 6px',
          }} title="Zoom out (-)">
            -
          </button>
          <button onClick={zoomReset} style={{
            ...btnBase,
            minWidth: '44px',
            fontVariantNumeric: 'tabular-nums',
          }} title="Reset zoom (0)">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={zoomIn} disabled={zoom >= ZOOM_MAX} style={{
            ...btnBase,
            opacity: zoom >= ZOOM_MAX ? 0.35 : 1,
            fontWeight: 700,
            padding: '0 6px',
          }} title="Zoom in (+)">
            +
          </button>

          <span style={{ width: '6px' }} />

          <button onClick={toggleFullscreen} style={btnBase}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            {isFullscreen ? 'Exit' : 'Fullscreen'}
          </button>
          <a href={src} target="_blank" rel="noopener noreferrer"
            style={{ ...btnBase, textDecoration: 'none' }}>
            Open in eth.build
          </a>
        </div>
      </div>

      {/* Loading indicator */}
      {!loaded && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#8b949e',
          fontSize: '14px',
          zIndex: 1,
        }}>
          Loading eth.build...
        </div>
      )}

      {/* Zoomable viewport */}
      <div
        ref={viewportRef}
        style={{
          overflow: 'auto',
          height: isFullscreen ? 'calc(100vh - 36px)' : `${height}px`,
        }}
      >
        <div style={{
          width: iframeW,
          height: iframeH,
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
        }}>
          <iframe
            src={src}
            title={title}
            onLoad={() => setLoaded(true)}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: 'block',
              opacity: loaded ? 1 : 0,
              transition: 'opacity 0.3s',
            }}
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>
        {/* Invisible spacer to make scroll area match scaled size */}
        {zoom > 1 && (
          <div style={{
            width: `${zoom * 100}%`,
            height: 0,
            pointerEvents: 'none',
          }} />
        )}
      </div>
    </div>
  )
}
