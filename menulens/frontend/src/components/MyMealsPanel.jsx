import { useState, useEffect } from 'react'

function RatingSlider({ label, value, onChange, max = 10 }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-muted)' }}>{label}</label>
        {value > 0 && (
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--green)' }}>{value}/{max}</span>
        )}
      </div>
      <input
        type="range"
        min="0"
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
      />
    </div>
  )
}

function UnratedVisitCard({ visit, userId, onSave, onDiscard, onVisitSaved }) {
  const [name, setName]                       = useState(visit.restaurant_name || '')
  const [cuisine, setCuisine]                 = useState(visit.cuisine_type || '')
  const [restaurantRating, setRestaurantRating] = useState(0)
  const [favDish, setFavDish]                 = useState('')
  const [dishRating, setDishRating]           = useState(0)
  const [saving, setSaving]                   = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    const saved = await onSave({
      _pendingId: visit.id,
      restaurant_name: name.trim(),
      cuisine_type: cuisine.trim() || null,
      restaurant_rating: restaurantRating > 0 ? restaurantRating : null,
      favorite_dish: favDish.trim() || null,
      dish_rating: dishRating > 0 ? dishRating : null,
      source: 'manual',
    })
    if (saved?.id) onVisitSaved(saved)
    setSaving(false)
  }

  return (
    <div style={{
      backgroundColor: 'var(--surface)',
      borderRadius: 'var(--radius)',
      border: '1px solid var(--border)',
      padding: '1rem',
      marginBottom: '0.75rem',
    }}>
      {/* Restaurant + Cuisine */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
            Restaurant
          </label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            style={{ fontSize: '0.875rem', padding: '0.5rem 0.75rem' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
            Cuisine
          </label>
          <input type="text" value={cuisine} onChange={e => setCuisine(e.target.value)}
            placeholder="e.g. Japanese"
            style={{ fontSize: '0.875rem', padding: '0.5rem 0.75rem' }} />
        </div>
      </div>

      <div style={{ marginBottom: '0.75rem' }}>
        <RatingSlider label="Restaurant rating" value={restaurantRating} onChange={setRestaurantRating} />
      </div>

      <div style={{ marginBottom: '0.75rem' }}>
        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
          Favorite dish (optional)
        </label>
        <input type="text" value={favDish} onChange={e => setFavDish(e.target.value)}
          placeholder="e.g. Tonkotsu Ramen"
          style={{ fontSize: '0.875rem', padding: '0.5rem 0.75rem' }} />
      </div>

      {favDish.trim() && (
        <div style={{ marginBottom: '0.75rem' }}>
          <RatingSlider label="Dish rating" value={dishRating} onChange={setDishRating} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button
          onClick={() => onDiscard(visit.id)}
          style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem', color: 'var(--text-muted)' }}
        >
          Discard
        </button>
        <button
          className="primary"
          onClick={handleSave}
          disabled={saving || !name.trim()}
          style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function HistoryCard({ visit, onDelete }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting]     = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    await onDelete(visit.id)
    setDeleting(false)
    setConfirming(false)
  }

  return (
    <div style={{
      padding: '0.875rem 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{visit.restaurant_name}</div>
          {visit.cuisine_type && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
              {visit.cuisine_type}
            </div>
          )}
          {visit.favorite_dish && (
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>
              {visit.favorite_dish}
              {visit.dish_rating && (
                <span style={{ marginLeft: '0.4rem', color: 'var(--teal)', fontWeight: 600, fontSize: '0.8rem' }}>
                  {visit.dish_rating}/10
                </span>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          {visit.restaurant_rating && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              backgroundColor: 'var(--green-tint)',
              borderRadius: '8px',
              padding: '0.3rem 0.6rem',
              minWidth: '40px',
            }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--green)', lineHeight: 1 }}>
                {visit.restaurant_rating}
              </span>
              <span style={{ fontSize: '0.65rem', color: 'var(--green)', opacity: 0.7 }}>/10</span>
            </div>
          )}

          {confirming ? (
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  fontSize: '0.75rem', padding: '0.3rem 0.6rem',
                  backgroundColor: 'var(--red)', color: '#fff',
                  borderColor: 'var(--red)',
                }}
              >
                {deleting ? '…' : 'Delete'}
              </button>
              <button
                onClick={() => setConfirming(false)}
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="ghost"
              style={{ padding: '0.25rem', lineHeight: 1 }}
              title="Delete entry"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function MyMealsPanel({ inline, isOpen, onClose, userId, pendingVisits, onSaveVisit, onRemovePending }) {
  const [history, setHistory]               = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [importLoading, setImportLoading]   = useState(false)
  const [importMsg, setImportMsg]           = useState(null)

  const shouldLoad = inline ? true : isOpen

  useEffect(() => {
    if (shouldLoad && userId) {
      setLoadingHistory(true)
      fetch(`/api/visits/${userId}`)
        .then(r => r.json())
        .then(data => setHistory(Array.isArray(data) ? data : []))
        .catch(() => setHistory([]))
        .finally(() => setLoadingHistory(false))
    }
  }, [shouldLoad, userId])

  const handleDeleteVisit = async (visitId) => {
    await fetch(`/api/visits/${userId}/${visitId}`, { method: 'DELETE' })
    setHistory(prev => prev.filter(v => v.id !== visitId))
  }

  const handleVisitSaved = (visit) => {
    setHistory(prev => [visit, ...prev])
  }

  const handleImportExcel = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImportLoading(true)
    setImportMsg(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('user_id', userId)
      const res  = await fetch('/api/import/excel', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Import failed')
      setImportMsg(`Imported ${data.imported} visit${data.imported !== 1 ? 's' : ''}`)
      const updated = await fetch(`/api/visits/${userId}`).then(r => r.json())
      setHistory(Array.isArray(updated) ? updated : [])
    } catch (err) {
      setImportMsg(`Error: ${err.message}`)
    } finally {
      setImportLoading(false)
      e.target.value = ''
    }
  }

  const sharedProps = {
    pendingVisits,
    history,
    loadingHistory,
    importLoading,
    importMsg,
    userId,
    onSaveVisit,
    onRemovePending,
    onDeleteVisit: handleDeleteVisit,
    onImport: handleImportExcel,
    onVisitSaved: handleVisitSaved,
  }

  // Inline mode: rendered inside the app shell as a screen
  if (inline) {
    return (
      <div className="screen fade-in">
        <div style={{ paddingTop: '1rem', marginBottom: '1.5rem' }}>
          <h1 style={{ marginBottom: '0.25rem' }}>My List</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Your restaurant visits & ratings</p>
        </div>
        <PanelContent {...sharedProps} />
      </div>
    )
  }

  // Slide-over mode (legacy, kept for compatibility)
  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 100 }}
        />
      )}
      <div className={`my-meals-panel${isOpen ? ' open' : ''}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ marginBottom: 0 }}>My List</h2>
          <button onClick={onClose} className="ghost" style={{ padding: '0.3rem 0.5rem', fontSize: '1rem' }}>✕</button>
        </div>
        <PanelContent {...sharedProps} />
      </div>
    </>
  )
}

function PanelContent({ pendingVisits, history, loadingHistory, importLoading, importMsg, userId, onSaveVisit, onRemovePending, onDeleteVisit, onImport, onVisitSaved }) {
  return (
    <>
      {pendingVisits.length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <div className="section-label">Rate recent visits</div>
          {pendingVisits.map(visit => (
            <UnratedVisitCard
              key={visit.id}
              visit={visit}
              userId={userId}
              onSave={onSaveVisit}
              onDiscard={onRemovePending}
              onVisitSaved={onVisitSaved}
            />
          ))}
        </section>
      )}

      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div className="section-label" style={{ marginBottom: 0 }}>Meal history</div>
          <label style={{
            fontSize: '0.8rem',
            fontWeight: 600,
            color: importLoading ? 'var(--text-dim)' : 'var(--green)',
            cursor: importLoading ? 'not-allowed' : 'pointer',
          }}>
            {importLoading ? 'Importing…' : 'Import Excel'}
            <input type="file" accept=".xlsx,.xls" onChange={onImport} disabled={importLoading} style={{ display: 'none' }} />
          </label>
        </div>

        {importMsg && (
          <p style={{
            fontSize: '0.8rem',
            color: importMsg.startsWith('Error') ? 'var(--red)' : 'var(--green)',
            marginBottom: '0.75rem',
          }}>
            {importMsg}
          </p>
        )}

        {loadingHistory ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1rem 0' }}>
            <span className="spinner" />
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Loading…</span>
          </div>
        ) : history.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', padding: '1rem 0' }}>
            No saved meals yet. Rate a visit above or import from Excel.
          </p>
        ) : (
          history.map(v => <HistoryCard key={v.id} visit={v} onDelete={onDeleteVisit} />)
        )}
      </section>
    </>
  )
}

export default MyMealsPanel
