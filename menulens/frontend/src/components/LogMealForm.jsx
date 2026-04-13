import { useState, useEffect, useRef } from 'react'

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

  useEffect(() => {
    if (!restaurant.id || !restaurant.has_menu) return
    setLoadingDishes(true)
    fetch(`/api/restaurants/${restaurant.id}/menu`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.dishes) setMenuDishes(data.dishes) })
      .catch(() => {})
      .finally(() => setLoadingDishes(false))
  }, [restaurant.id, restaurant.has_menu])

  const ratedKeys = new Set(ratedDishes.map(d => d.dish_id).filter(Boolean))

  const handleAdd = ({ dish_id, dish_name }) => {
    const key = dish_id || `name:${dish_name}`
    if (ratedDishes.some(d => d.key === key)) return
    setRatedDishes(prev => [...prev, { key, dish_id, dish_name, rating: '' }])
    setPickerOpen(false)
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
      const visitRes = await fetch(`/api/visits/${userId}`, {
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
        const dishRes = await fetch(`/api/visits/${userId}/${visit.id}/dishes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurant_id: restaurant.id || null,
            ratings: validRatings.map(d => ({
              dish_id:   d.dish_id || null,
              dish_name: d.dish_id ? null : d.dish_name,
              rating:    parseFloat(d.rating),
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
    </div>
  )
}

export default LogMealForm
