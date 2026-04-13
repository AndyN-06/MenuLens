import { useState } from 'react'

function NewRestaurantForm({ initialName, onSubmit, onBack, loading }) {
  const [name,    setName]    = useState(initialName || '')
  const [cuisine, setCuisine] = useState('')
  const [city,    setCity]    = useState('')

  const handleSubmit = (intent) => {
    if (!name.trim()) return
    onSubmit(
      { name: name.trim(), cuisine_type: cuisine.trim() || null, city: city.trim() || null },
      intent,
    )
  }

  return (
    <div className="card fade-in">
      <button
        onClick={onBack}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.35rem',
          marginBottom: '1.25rem', padding: 0,
          border: 'none', background: 'none',
          color: 'var(--text-muted)', cursor: 'pointer',
          fontSize: '0.85rem',
        }}
      >
        ← Back
      </button>

      <h3 style={{ marginBottom: '0.25rem' }}>Add new restaurant</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
        Fill in the details, then choose what to do next.
      </p>

      <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
            Restaurant name <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Sakura Garden"
            required
            autoFocus
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
            Cuisine type
          </label>
          <input
            type="text"
            value={cuisine}
            onChange={e => setCuisine(e.target.value)}
            placeholder="e.g. Japanese, Italian, Mexican…"
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
            City <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            type="text"
            value={city}
            onChange={e => setCity(e.target.value)}
            placeholder="e.g. San Francisco"
          />
        </div>

        <button
          type="button"
          className="primary"
          disabled={!name.trim() || loading}
          onClick={() => handleSubmit('scan')}
          style={{ marginTop: '0.25rem' }}
        >
          {loading ? 'Creating…' : 'Scan menu →'}
        </button>
        <button
          type="button"
          disabled={!name.trim() || loading}
          onClick={() => handleSubmit('log')}
        >
          Log a meal entry
        </button>
      </form>
    </div>
  )
}

export default NewRestaurantForm
