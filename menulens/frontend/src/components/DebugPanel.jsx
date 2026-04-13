// Not Used

function DebugPanel({ ocrText, llmInput, recommendation }) {
  if (!ocrText && !llmInput && !recommendation) return null

  return (
    <div style={{
      marginTop: '1.5rem',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
      background: 'var(--surface)',
    }}>
      <div style={{
        padding: '0.5rem 0.75rem',
        background: 'var(--surface-2)',
        borderBottom: '1px solid var(--border)',
        fontSize: '0.7rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
      }}>
        Debug View
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 0,
        minHeight: '200px',
        maxHeight: '400px',
      }}>
        <DebugColumn label="Raw OCR Output" text={ocrText} />
        <DebugColumn label="First LLM Input" text={llmInput} divider />
        <DebugColumn label="Final Recommendation" text={recommendation} divider />
      </div>
    </div>
  )
}

function DebugColumn({ label, text, divider }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      borderLeft: divider ? '1px solid var(--border)' : 'none',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '0.4rem 0.6rem',
        background: 'var(--surface-2)',
        borderBottom: '1px solid var(--border)',
        fontSize: '0.7rem',
        fontWeight: 600,
        color: 'var(--text-muted)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        flexShrink: 0,
      }}>
        {label}
      </div>
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '0.5rem 0.6rem',
      }}>
        {text ? (
          <pre style={{
            fontSize: '0.65rem',
            lineHeight: 1.5,
            color: 'var(--text)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'monospace',
            margin: 0,
          }}>
            {text}
          </pre>
        ) : (
          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>—</span>
        )}
      </div>
    </div>
  )
}

export default DebugPanel
