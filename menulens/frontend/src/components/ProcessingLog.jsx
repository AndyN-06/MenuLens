import { useEffect, useRef, useState } from 'react'

const PREFIXES = [
  { match: /^\[OCR\]/,       color: 'var(--teal)'       },
  { match: /^\[LLM\]/,       color: 'var(--green)'      },
  { match: /^\[profile\]/,   color: '#7c3aed'            },
  { match: /^\[done\]/,      color: 'var(--green)'      },
  { match: /^\s+\[[\d.]+\]/, color: 'var(--text-dim)'   },
]

function lineColor(msg) {
  for (const { match, color } of PREFIXES) {
    if (match.test(msg)) return color
  }
  return 'var(--text-muted)'
}

function ProcessingLog({ logs, running }) {
  const bottomRef = useRef(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div style={{
      borderRadius: 'var(--radius)',
      border: '1px solid var(--border)',
      overflow: 'hidden',
      backgroundColor: 'var(--surface)',
    }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.6rem 0.875rem',
          border: 'none',
          borderBottom: expanded ? '1px solid var(--border)' : 'none',
          backgroundColor: 'transparent',
          cursor: 'pointer',
          fontWeight: 400,
          color: 'var(--text-muted)',
          borderRadius: 0,
        }}
      >
        {running && <span className="spinner" style={{ width: '0.7rem', height: '0.7rem' }} />}
        <span style={{ fontSize: '0.78rem' }}>
          {running ? 'Processing…' : 'Processing complete'}
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginLeft: 'auto' }}>
          {logs.length} lines {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* Log body */}
      {expanded && (
        <div style={{
          maxHeight: '280px',
          overflowY: 'auto',
          padding: '0.625rem 0.875rem',
          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
          fontSize: '0.72rem',
          lineHeight: 1.7,
          backgroundColor: '#fafaf9',
        }}>
          {logs.map((msg, i) => (
            <div key={i} style={{ color: lineColor(msg), whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {msg}
            </div>
          ))}
          {running && <span style={{ color: 'var(--green)' }}>█</span>}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}

export default ProcessingLog
