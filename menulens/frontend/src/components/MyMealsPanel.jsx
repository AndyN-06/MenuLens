import { useState, useEffect, useRef } from 'react'
import { apiUrl } from '../api'

// ── Image compression helper ───────────────────────────────────────────────────

function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const MAX = 800
        let w = img.width, h = img.height
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX }
          else       { w = Math.round(w * MAX / h); h = MAX }
        }
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.72))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

function IconCamera() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ width: '0.9rem', height: '0.9rem', display: 'block' }}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function ratingColor(r) {
  if (r >= 8) return 'var(--green)'
  if (r >= 6) return 'var(--teal)'
  return 'var(--text-dim)'
}

function RatingBadge({ rating }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      background: 'var(--green-tint)',
      borderRadius: '8px',
      padding: '0.3rem 0.6rem',
      minWidth: '44px',
    }}>
      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: ratingColor(rating), lineHeight: 1 }}>
        {rating % 1 === 0 ? rating : rating.toFixed(2)}
      </span>
      <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>/10</span>
    </div>
  )
}

// ── Dish Picker ────────────────────────────────────────────────────────────────

function DishPicker({ menuDishes, ratedKeys, onAdd, onClose }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const available = menuDishes.filter(d => !ratedKeys.has(d.id))
  const filtered  = query.trim()
    ? available.filter(d => d.dish_name.toLowerCase().includes(query.toLowerCase()))
    : available

  const queryTrimmed = query.trim()
  const exactMatch   = filtered.some(d => d.dish_name.toLowerCase() === queryTrimmed.toLowerCase())

  // Group by section
  const sections = {}
  for (const d of filtered.slice(0, 20)) {
    const sec = d.section || 'Other'
    if (!sections[sec]) sections[sec] = []
    sections[sec].push(d)
  }

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      background: 'var(--surface)',
      overflow: 'hidden',
      marginTop: '0.5rem',
    }}>
      {/* Search input */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={available.length > 0 ? 'Filter dishes or type a name…' : 'Type a dish name…'}
          style={{ width: '100%', margin: 0 }}
        />
      </div>

      {/* Dish list */}
      <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
        {Object.entries(sections).map(([sec, dishes]) => (
          <div key={sec}>
            {Object.keys(sections).length > 1 && (
              <div style={{
                padding: '0.3rem 0.75rem',
                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.07em',
                color: 'var(--text-dim)', textTransform: 'uppercase',
                background: 'var(--surface-2)',
              }}>
                {sec}
              </div>
            )}
            {dishes.map(d => (
              <button
                key={d.id}
                onClick={() => onAdd({ dish_id: d.id, dish_name: d.dish_name })}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '0.55rem 0.875rem',
                  border: 'none', borderBottom: '1px solid var(--border)',
                  background: 'transparent', cursor: 'pointer',
                  fontSize: '0.875rem', color: 'var(--text)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <span>{d.dish_name}</span>
                {d.price && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', flexShrink: 0, marginLeft: '0.5rem' }}>
                    {d.price}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}

        {/* Add custom name */}
        {queryTrimmed && !exactMatch && (
          <button
            onClick={() => onAdd({ dish_id: null, dish_name: queryTrimmed })}
            style={{
              width: '100%', textAlign: 'left',
              padding: '0.6rem 0.875rem',
              border: 'none', background: 'transparent',
              cursor: 'pointer', color: 'var(--teal)',
              fontWeight: 500, fontSize: '0.875rem',
              display: 'flex', alignItems: 'center', gap: '0.4rem',
            }}
          >
            <span style={{ fontSize: '1rem' }}>+</span>
            Add "{queryTrimmed}"
          </button>
        )}

        {filtered.length === 0 && !queryTrimmed && (
          <div style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-dim)', textAlign: 'center' }}>
            Type a dish name above
          </div>
        )}
      </div>

      {/* Close */}
      <div style={{ padding: '0.4rem 0.75rem', borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <button
          onClick={onClose}
          style={{ fontSize: '0.8rem', color: 'var(--text-muted)', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Unrated visit card ─────────────────────────────────────────────────────────

function UnratedVisitCard({ visit, userId, onSave, onDiscard, onVisitSaved }) {
  const [menuDishes,    setMenuDishes]    = useState([])
  const [loadingDishes, setLoadingDishes] = useState(false)
  const [ratedDishes,   setRatedDishes]   = useState([])  // [{key, dish_id, dish_name, rating, photo}]
  const [restaurantRating, setRestaurantRating] = useState('')
  const [pickerOpen,    setPickerOpen]    = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState(null)
  const [pendingPhotoKey, setPendingPhotoKey] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!visit.restaurant_id) return
    setLoadingDishes(true)
    fetch(apiUrl(`/api/restaurants/${visit.restaurant_id}/menu`))
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.dishes) setMenuDishes(data.dishes) })
      .catch(() => {})
      .finally(() => setLoadingDishes(false))
  }, [visit.restaurant_id])

  const ratedKeys = new Set(ratedDishes.map(d => d.dish_id).filter(Boolean))

  const handleAdd = ({ dish_id, dish_name }) => {
    const key = dish_id || `name:${dish_name}`
    if (ratedDishes.some(d => d.key === key)) return
    setRatedDishes(prev => [...prev, { key, dish_id, dish_name, rating: '', photo: null }])
    setPickerOpen(false)
  }

  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !pendingPhotoKey) { setPendingPhotoKey(null); return }
    const compressed = await compressImage(file)
    setRatedDishes(prev => prev.map(d => d.key === pendingPhotoKey ? { ...d, photo: compressed } : d))
    setPendingPhotoKey(null)
    e.target.value = ''
  }

  const handleRemovePhoto = (key) => {
    setRatedDishes(prev => prev.map(d => d.key === key ? { ...d, photo: null } : d))
  }

  const handleRemove = (key) => {
    setRatedDishes(prev => prev.filter(d => d.key !== key))
  }

  const handleRatingChange = (key, value) => {
    // Allow empty string while typing; clamp on blur
    setRatedDishes(prev => prev.map(d => d.key === key ? { ...d, rating: value } : d))
  }

  const handleRatingBlur = (key, value) => {
    const num = parseFloat(value)
    if (!isNaN(num)) {
      const clamped = Math.min(10, Math.max(1, num)).toFixed(2).replace(/\.00$/, '')
      setRatedDishes(prev => prev.map(d => d.key === key ? { ...d, rating: clamped } : d))
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const saved = await onSave({
        _pendingId:        visit.id,
        restaurant_id:     visit.restaurant_id || null,
        restaurant_name:   visit.restaurant_name,
        cuisine_type:      visit.cuisine_type   || null,
        restaurant_rating: restaurantRating ? Math.round(parseFloat(restaurantRating)) : null,
        source: 'app',
      })

      if (!saved?.id) throw new Error('Visit could not be saved')

      const validRatings = ratedDishes.filter(d => d.rating !== '' && !isNaN(parseFloat(d.rating)))

      if (validRatings.length > 0) {
        const res = await fetch(apiUrl(`/api/visits/${userId}/${saved.id}/dishes`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurant_id: visit.restaurant_id || null,
            ratings: validRatings.map(d => ({
              dish_id:    d.dish_id || null,
              dish_name:  d.dish_id ? null : d.dish_name,
              rating:     parseFloat(d.rating),
              photo_data: d.photo || null,
            })),
          }),
        })
        if (!res.ok) throw new Error('Dish ratings could not be saved')
      }

      onVisitSaved(saved)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const canSave = ratedDishes.some(d => d.rating !== '') || restaurantRating !== ''

  return (
    <div style={{
      backgroundColor: 'var(--surface)',
      borderRadius: 'var(--radius)',
      border: '1px solid var(--border)',
      padding: '1rem',
      marginBottom: '0.75rem',
    }}>
      {/* Restaurant header */}
      <div style={{ marginBottom: '0.875rem' }}>
        <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{visit.restaurant_name}</div>
        {visit.cuisine_type && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
            {visit.cuisine_type}
          </div>
        )}
      </div>

      {/* Rated dishes */}
      {ratedDishes.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
            Dishes you tried
          </div>
          {ratedDishes.map(d => (
            <div
              key={d.key}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.45rem 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              {/* Photo thumbnail or camera button */}
              <div style={{ position: 'relative', flexShrink: 0, width: '1.75rem', height: '1.75rem' }}>
                {d.photo ? (
                  <>
                    <img
                      src={d.photo}
                      alt=""
                      onClick={() => { setPendingPhotoKey(d.key); fileInputRef.current?.click() }}
                      style={{
                        width: '1.75rem', height: '1.75rem',
                        objectFit: 'cover', borderRadius: '0.25rem',
                        cursor: 'pointer', display: 'block',
                      }}
                      title="Change photo"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(d.key)}
                      title="Remove photo"
                      style={{
                        position: 'absolute', top: '-0.35rem', right: '-0.35rem',
                        width: '0.9rem', height: '0.9rem',
                        borderRadius: '50%', border: 'none',
                        background: 'var(--text-dim)', color: 'white',
                        fontSize: '0.5rem', lineHeight: 1, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 0,
                      }}
                    >✕</button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setPendingPhotoKey(d.key); fileInputRef.current?.click() }}
                    title="Attach photo"
                    style={{
                      width: '1.75rem', height: '1.75rem',
                      border: '1px dashed var(--border)', borderRadius: '0.25rem',
                      background: 'none', cursor: 'pointer',
                      color: 'var(--text-dim)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: 0,
                    }}
                  >
                    <IconCamera />
                  </button>
                )}
              </div>

              <span style={{ flex: 1, fontSize: '0.875rem', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.dish_name}
              </span>

              <input
                type="number"
                min="1" max="10" step="0.01"
                value={d.rating}
                onChange={e => handleRatingChange(d.key, e.target.value)}
                onBlur={e => handleRatingBlur(d.key, e.target.value)}
                placeholder="—"
                style={{
                  width: '4.5rem', textAlign: 'center',
                  padding: '0.3rem 0.4rem',
                  fontSize: '0.875rem', fontWeight: 600,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', flexShrink: 0 }}>/10</span>

              <button
                onClick={() => handleRemove(d.key)}
                style={{
                  border: 'none', background: 'none', cursor: 'pointer',
                  color: 'var(--text-dim)', padding: '0.2rem', lineHeight: 1,
                  fontSize: '0.85rem', flexShrink: 0,
                }}
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add dish button / picker */}
      {!pickerOpen ? (
        <button
          onClick={() => setPickerOpen(true)}
          style={{
            width: '100%', textAlign: 'left',
            color: 'var(--teal)', borderStyle: 'dashed',
            fontSize: '0.85rem', padding: '0.5rem 0.75rem',
            marginBottom: '0.75rem',
            display: 'flex', alignItems: 'center', gap: '0.4rem',
          }}
        >
          {loadingDishes
            ? <><span className="spinner" style={{ width: '0.75rem', height: '0.75rem' }} /> Loading dishes…</>
            : <><span style={{ fontSize: '1rem' }}>+</span> Add a dish</>
          }
        </button>
      ) : (
        <div style={{ marginBottom: '0.75rem' }}>
          <DishPicker
            menuDishes={menuDishes}
            ratedKeys={ratedKeys}
            onAdd={handleAdd}
            onClose={() => setPickerOpen(false)}
          />
        </div>
      )}

      {/* Restaurant overall rating */}
      <div style={{ marginBottom: '0.875rem' }}>
        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>
          Restaurant rating <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional, 1–10)</span>
        </label>
        <input
          type="number"
          min="1" max="10" step="1"
          value={restaurantRating}
          onChange={e => setRestaurantRating(e.target.value)}
          placeholder="—"
          style={{ width: '5rem', textAlign: 'center', fontWeight: 600 }}
        />
      </div>

      {error && (
        <p style={{ fontSize: '0.8rem', color: 'var(--red)', marginBottom: '0.5rem' }}>{error}</p>
      )}

      {/* Actions */}
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
          disabled={saving || !canSave}
          style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem' }}
        >
          {saving ? 'Saving…' : 'Save visit'}
        </button>
      </div>

      {/* Hidden file input for photo capture */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoSelect}
        style={{ display: 'none' }}
      />
    </div>
  )
}

// ── History card ───────────────────────────────────────────────────────────────

function HistoryCard({ visit, onDelete }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const [expanded,   setExpanded]   = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    await onDelete(visit.id)
    setDeleting(false)
    setConfirming(false)
  }

  // Prefer new dish_ratings array; fall back to legacy favorite_dish field
  const dishRatings = visit.dish_ratings?.length
    ? visit.dish_ratings
    : visit.favorite_dish
      ? [{ dish_name: visit.favorite_dish, rating: visit.dish_rating }]
      : []

  return (
    <div style={{ padding: '0.875rem 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        {/* Left: restaurant info */}
        <button
          onClick={() => dishRatings.length > 0 && setExpanded(v => !v)}
          style={{
            flex: 1, minWidth: 0, textAlign: 'left',
            border: 'none', background: 'none',
            cursor: dishRatings.length > 0 ? 'pointer' : 'default',
            padding: 0,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{visit.restaurant_name}</div>
          {visit.cuisine_type && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
              {visit.cuisine_type}
            </div>
          )}
          {dishRatings.length > 0 && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
              {dishRatings.length} dish{dishRatings.length !== 1 ? 'es' : ''} rated {expanded ? '▲' : '▼'}
            </div>
          )}
        </button>

        {/* Right: restaurant rating + delete */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          {visit.restaurant_rating != null && (
            <RatingBadge rating={visit.restaurant_rating} />
          )}

          {confirming ? (
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  fontSize: '0.75rem', padding: '0.3rem 0.6rem',
                  backgroundColor: 'var(--red)', color: '#fff', borderColor: 'var(--red)',
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
              title="Delete"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Expanded dish ratings */}
      {expanded && dishRatings.length > 0 && (
        <div style={{ marginTop: '0.625rem', paddingLeft: '0.125rem' }}>
          {dishRatings.map((dr, i) => (
            <div
              key={dr.dish_rating_id || i}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.3rem 0',
                borderTop: i === 0 ? '1px solid var(--border)' : 'none',
              }}
            >
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                {dr.dish_name}
              </span>
              {dr.rating != null && (
                <span style={{
                  fontSize: '0.8rem', fontWeight: 700,
                  color: ratingColor(dr.rating),
                }}>
                  {typeof dr.rating === 'number' && dr.rating % 1 !== 0
                    ? dr.rating.toFixed(2)
                    : dr.rating}
                  <span style={{ fontWeight: 400, color: 'var(--text-dim)', fontSize: '0.7rem' }}>/10</span>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Panel shell ────────────────────────────────────────────────────────────────

function MyMealsPanel({ inline, isOpen, onClose, userId, pendingVisits, onSaveVisit, onRemovePending }) {
  const [history,        setHistory]        = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [importLoading,  setImportLoading]  = useState(false)
  const [importMsg,      setImportMsg]      = useState(null)

  const shouldLoad = inline ? true : isOpen

  useEffect(() => {
    if (shouldLoad && userId) {
      setLoadingHistory(true)
      fetch(apiUrl(`/api/visits/${userId}`))
        .then(r => r.json())
        .then(data => setHistory(Array.isArray(data) ? data : []))
        .catch(() => setHistory([]))
        .finally(() => setLoadingHistory(false))
    }
  }, [shouldLoad, userId])

  const handleDeleteVisit = async (visitId) => {
    await fetch(apiUrl(`/api/visits/${userId}/${visitId}`), { method: 'DELETE' })
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
      const res  = await fetch(apiUrl('/api/import/excel'), { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Import failed')
      setImportMsg(`Imported ${data.imported} visit${data.imported !== 1 ? 's' : ''}`)
      const updated = await fetch(apiUrl(`/api/visits/${userId}`)).then(r => r.json())
      setHistory(Array.isArray(updated) ? updated : [])
    } catch (err) {
      setImportMsg(`Error: ${err.message}`)
    } finally {
      setImportLoading(false)
      e.target.value = ''
    }
  }

  const sharedProps = {
    pendingVisits, history, loadingHistory,
    importLoading, importMsg, userId,
    onSaveVisit, onRemovePending,
    onDeleteVisit: handleDeleteVisit,
    onImport: handleImportExcel,
    onVisitSaved: handleVisitSaved,
  }

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

  return (
    <>
      {isOpen && (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 100 }} />
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
            fontSize: '0.8rem', fontWeight: 600,
            color: importLoading ? 'var(--text-dim)' : 'var(--green)',
            cursor: importLoading ? 'not-allowed' : 'pointer',
          }}>
            {importLoading ? 'Importing…' : 'Import Excel'}
            <input type="file" accept=".xlsx,.xls" onChange={onImport} disabled={importLoading} style={{ display: 'none' }} />
          </label>
        </div>

        {importMsg && (
          <p style={{ fontSize: '0.8rem', color: importMsg.startsWith('Error') ? 'var(--red)' : 'var(--green)', marginBottom: '0.75rem' }}>
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
