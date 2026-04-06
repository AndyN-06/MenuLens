import { useState, useRef } from 'react'

function Uploader({ onFileSelect, stage, onReset }) {
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef(null)

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0])
  }

  const handleChange = (e) => {
    if (e.target.files?.[0]) handleFile(e.target.files[0])
  }

  const handleFile = (file) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (JPEG, PNG, etc.)')
      return
    }
    onFileSelect(file)
  }

  const handleClick = () => {
    if (isClickable) inputRef.current?.click()
  }

  const isProcessing = stage === 'uploading'
  const isClickable  = stage === 'idle' || stage === 'error'
  const isDone       = stage === 'done' || stage === 'confirming'

  return (
    <div>
      <div
        onClick={handleClick}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragActive ? 'var(--green)' : isProcessing ? 'var(--border-hover)' : isDone ? 'var(--green)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-lg)',
          backgroundColor: dragActive ? 'var(--green-tint)' : isDone ? 'var(--green-tint)' : 'var(--surface)',
          padding: '2.5rem 1.5rem',
          textAlign: 'center',
          cursor: isClickable ? 'pointer' : 'default',
          transition: 'all 0.18s ease',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleChange}
          style={{ display: 'none' }}
          disabled={isProcessing}
        />

        {/* Icon */}
        <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'center' }}>
          {isProcessing ? (
            <div className="spinner" style={{ width: '2rem', height: '2rem' }} />
          ) : isDone ? (
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={isClickable ? 'var(--text-dim)' : 'var(--text-dim)'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" ry="3" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          )}
        </div>

        {/* Label */}
        <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: isDone ? 'var(--green)' : 'var(--text)', marginBottom: '0.25rem' }}>
          {isProcessing ? 'Analyzing menu…' :
           isDone       ? (stage === 'confirming' ? 'Menu scanned' : 'Done!') :
           stage === 'error' ? 'Upload failed' :
           'Upload menu photo'}
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          {isProcessing ? 'OCR + AI parsing in progress' :
           stage === 'confirming' ? 'Confirm details below' :
           isDone ? 'Tap to scan another menu' :
           stage === 'error' ? 'Try a different image' :
           'Tap to browse or drag & drop'}
        </div>

        {isDone && (
          <div style={{ marginTop: '1rem' }}>
            <button
              className="primary"
              onClick={e => { e.stopPropagation(); onReset() }}
              style={{ fontSize: '0.875rem', padding: '0.5rem 1.25rem' }}
            >
              Scan Another
            </button>
          </div>
        )}
      </div>

      {isProcessing && (
        <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.6rem' }}>
          This may take 30–90 seconds depending on menu size
        </p>
      )}
    </div>
  )
}

export default Uploader
