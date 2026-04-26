import { useState, useEffect, useRef } from 'react'

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

// ── Inline dish picker ─────────────────────────────────────────────────────────

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

// ── Main form ──────────────────────────────────────────────────────────────────

function LogMealForm({ restaurant, userId, onSaved, onBack }) {
  const [menuDishes,    setMenuDishes]    = useState([])
  const [loadingDishes, setLoadingDishes] = useState(false)
  const [ratedDishes,   setRatedDishes]   = useState([])
  const [restaurantRating, setRestaurantRating] = useState('')
  const [pickerOpen,    setPickerOpen]    = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState(null)
  const [pendingPhotoKey, setPendingPhotoKey] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!restaurant.id || !restaurant.has_menu) return
    setLoadingDishes(true)
    fetch(apiUrl(`/api/restaurants/${restaurant.id}/menu`))
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.dishes) setMenuDishes(data.dishes) })
      .catch(() => {})
      .finally(() => setLoadingDishes(false))
  }, [restaurant.id, restaurant.has_menu])

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
      const visitRes = await fetch(apiUrl(`/api/visits/${userId}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurant_id:     restaurant.id   || null,
          restaurant_name:   restaurant.name,
          cuisine_type:      restaurant.cuisine_type || null,
          restaurant_rating: restaurantRating ? Math.round(parseFloat(restaurantRating)) : null,
          source: 'manual',
        }),
      })
      if (!visitRes.ok) throw new Error('Could not save visit')
      const visit = await visitRes.json()

      const validRatings = ratedDishes.filter(d => d.rating !== '' && !isNaN(parseFloat(d.rating)))
      if (validRatings.length > 0) {
        const dishRes = await fetch(apiUrl(`/api/visits/${userId}/${visit.id}/dishes`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurant_id: restaurant.id || null,
            ratings: validRatings.map(d => ({
              dish_id:    d.dish_id || null,
              dish_name:  d.dish_id ? null : d.dish_name,
              rating:     parseFloat(d.rating),
              photo_data: d.photo || null,
            })),
          }),
        })
        if (!dishRes.ok) throw new Error('Could not save dish ratings')
      }

      onSaved(visit)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const canSave = ratedDishes.some(d => d.rating !== '') || restaurantRating !== ''

  return (
    <div className="fade-in">
      {/* Back + restaurant header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <button
          onClick={onBack}
          style={{
            border: 'none', background: 'none',
            color: 'var(--text-muted)', cursor: 'pointer',
            padding: 0, fontSize: '0.875rem',
            marginBottom: '0.75rem',
            display: 'flex', alignItems: 'center', gap: '0.3rem',
          }}
        >
          ← Back
        </button>
        <h2 style={{ marginBottom: '0.15rem' }}>{restaurant.name}</h2>
        {restaurant.cuisine_type && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{restaurant.cuisine_type}</div>
        )}
      </div>

      <div className="card">
        {/* Rated dishes list */}
        {ratedDishes.length > 0 && (
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{
              fontSize: '0.72rem', fontWeight: 600,
              color: 'var(--text-dim)', textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: '0.5rem',
            }}>
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

                <span style={{
                  flex: 1, fontSize: '0.875rem',
                  minWidth: 0, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
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
                    color: 'var(--text-dim)', padding: '0.2rem',
                    lineHeight: 1, fontSize: '0.85rem', flexShrink: 0,
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
          <label style={{
            display: 'block',
            fontSize: '0.72rem', fontWeight: 600,
            color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: '0.4rem',
          }}>
            Restaurant rating{' '}
            <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional, 1–10)</span>
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

        <button
          className="primary"
          onClick={handleSave}
          disabled={saving || !canSave}
          style={{ width: '100%' }}
        >
          {saving ? 'Saving…' : 'Save meal'}
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

export default LogMealForm
