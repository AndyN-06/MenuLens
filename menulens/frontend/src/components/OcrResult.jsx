import { useState } from 'react'

function OcrResult({ data }) {
  const [view, setView] = useState('lines') // 'lines' | 'raw'

  const lines = (data.text || '').split('\n').filter(l => l.trim())

  return (
    <div className="card">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
        <div>
          <h3 style={{ marginBottom: '0.25rem' }}>OCR Extraction</h3>
          <p className="text-muted" style={{ fontSize: '0.875rem', margin: 0 }}>{data.filename}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="badge success" style={{ marginBottom: '0.5rem', display: 'block' }}>
            {lines.length} lines · {data.char_count} chars
          </div>
        </div>
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {['lines', 'raw'].map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              padding: '0.3rem 0.9rem',
              fontSize: '0.8rem',
              borderColor: view === v ? 'var(--accent)' : 'var(--border)',
              color: view === v ? 'var(--accent)' : 'var(--text-muted)',
              backgroundColor: view === v ? 'var(--accent-dim)' : 'var(--surface)',
            }}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Lines view: each extracted line as a row with index */}
      {view === 'lines' && (
        <div style={{
          maxHeight: '500px',
          overflowY: 'auto',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}>
          {lines.length === 0 && (
            <p className="text-muted" style={{ padding: '1.5rem', textAlign: 'center', margin: 0 }}>
              No text detected. Try a clearer or higher-contrast photo.
            </p>
          )}
          {lines.map((line, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '1rem',
                padding: '0.45rem 1rem',
                borderBottom: i < lines.length - 1 ? '1px solid var(--border)' : 'none',
                backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
              }}
            >
              <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: '2rem', textAlign: 'right', flexShrink: 0 }}>
                {i + 1}
              </span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text)', wordBreak: 'break-word' }}>
                {line}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Raw view: plain pre block */}
      {view === 'raw' && (
        <div style={{
          backgroundColor: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '1.25rem',
          maxHeight: '500px',
          overflowY: 'auto',
        }}>
          <pre style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.875rem',
            lineHeight: 1.8,
            color: 'var(--text-dim)',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            margin: 0,
          }}>
            {data.text || 'No text extracted'}
          </pre>
        </div>
      )}
    </div>
  )
}

export default OcrResult
