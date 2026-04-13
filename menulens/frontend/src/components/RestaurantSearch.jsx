import { useState, useEffect, useRef } from 'react'

function RestaurantSearch({ onSelect, onCreateNew, disabled }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen]       = useState(false)
  const debounceRef  = useRef(null)
  const containerRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      setOpen(false)
      setLoading(false)
      clearTimeout(debounceRef.current)
      return
    }
    setLoading(true)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/restaurants/search?q=${encodeURIComponent(query)}&limit=8`)
        const data = await res.json()
        setResults(data)
        setOpen(true)
      } catch {
        setResults([])
        setOpen(true) // still open so user can see "Add new"
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  const handleSelect = (r) => {
    setQuery(r.name)
    setOpen(false)
    onSelect(r)
  }

  const handleCreateNew = () => {
    setOpen(false)
    onCreateNew(query.trim())
  }

  const showAddNew = query.trim().length >= 2

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Search input */}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(false) }}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          placeholder="Search for a restaurant…"
          disabled={disabled}
          autoComplete="off"
          style={{
            width: '100%',
            paddingRight: loading ? '2.5rem' : undefined,
          }}
        />
        {loading && (
          <div style={{
            position: 'absolute', right: '0.75rem',
            top: '50%', transform: 'translateY(-50%)',
          }}>
            <span className="spinner" style={{ width: '0.85rem', height: '0.85rem' }} />
          </div>
        )}
      </div>

      {/* Dropdown */}
      {open && (results.length > 0 || showAddNew) && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0, right: 0,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.10)',
          zIndex: 200,
          overflow: 'hidden',
          maxHeight: '320px',
          overflowY: 'auto',
        }}>
          {results.map((r, i) => (
            <button
              key={r.id}
              onClick={() => handleSelect(r)}
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '0.15rem',
                padding: '0.7rem 0.875rem',
                border: 'none',
                borderBottom: i < results.length - 1 || showAddNew ? '1px solid var(--border)' : 'none',
                background: 'transparent',
                cursor: 'pointer',
                borderRadius: 0,
                textAlign: 'left',
              }}
            >
              <div style={{
                display: 'flex', width: '100%',
                justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{r.name}</span>
                {r.has_menu && (
                  <span style={{
                    fontSize: '0.65rem',
                    background: 'var(--green-tint)',
                    color: 'var(--green)',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '99px',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    marginLeft: '0.5rem',
                  }}>
                    Menu saved
                  </span>
                )}
              </div>
              {(r.cuisine_type || r.city) && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {[r.cuisine_type, r.city].filter(Boolean).join(' · ')}
                </div>
              )}
            </button>
          ))}

          {/* Add new — always shown at bottom of dropdown */}
          {showAddNew && (
            <button
              onClick={handleCreateNew}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.7rem 0.875rem',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                borderRadius: 0,
                color: 'var(--teal)',
                fontWeight: 500,
                fontSize: '0.875rem',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>+</span>
              Add "{query.trim()}" as new restaurant
            </button>
          )}
        </div>
      )}

      {/* No-results fallback — shown below input when dropdown is closed */}
      {!open && !loading && query.length >= 2 && results.length === 0 && (
        <button
          onClick={handleCreateNew}
          style={{
            marginTop: '0.5rem',
            width: '100%',
            color: 'var(--teal)',
            borderStyle: 'dashed',
            fontSize: '0.875rem',
          }}
        >
          + Add "{query.trim()}" as new restaurant
        </button>
      )}
    </div>
  )
}

export default RestaurantSearch
