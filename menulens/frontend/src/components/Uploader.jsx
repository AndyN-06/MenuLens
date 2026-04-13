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

  const isProcessing = stage === 'uploading'
  const isClickable  = !isProcessing

  return (
    <div>
      <div
        onClick={() => { if (isClickable) inputRef.current?.click() }}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragActive ? 'var(--green)' : isProcessing ? 'var(--border-hover)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-lg)',
          backgroundColor: dragActive ? 'var(--green-tint)' : 'var(--surface)',
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
          ) : (
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
              stroke="var(--text-dim)" strokeWidth="1.75"
              strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" ry="3" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          )}
        </div>

        {/* Label */}
        <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--text)', marginBottom: '0.25rem' }}>
          {isProcessing ? 'Analyzing menu…' : 'Upload menu photo'}
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          {isProcessing ? 'AI parsing in progress' : 'Tap to browse or drag & drop'}
        </div>
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
