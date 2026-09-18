import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiUrl } from '../api'
import { IconSearch, IconMapPin, IconStar, IconImage } from '../components/icons'

const CUISINES = ['All', 'American', 'Japanese', 'Italian', 'Mexican', 'Thai', 'Indian', 'Chinese', 'Mediterranean']
const PRICES   = ['Any', '$', '$$', '$$$', '$$$$']
const SORTS    = ['Best match', 'Most scanned', 'Newest']

// Sample cards shown before a search — the API has no browse endpoint yet.
const FEATURED = [
  { name: 'Shake Shack',   cuisine: 'American',      city: 'New York',     price: '$$',   match: 94, dishes: 42, note: 'Your burger ratings track closely with this menu.' },
  { name: 'Nobu',          cuisine: 'Japanese',      city: 'New York',     price: '$$$$', match: 91, dishes: 88, note: 'Strong overlap with your sushi and yellowtail picks.' },
  { name: 'Via Carota',    cuisine: 'Italian',       city: 'New York',     price: '$$$',  match: 86, dishes: 54, note: 'Simple pastas, which you consistently rate 8+.' },
  { name: 'In-N-Out',      cuisine: 'American',      city: 'Los Angeles',  price: '$',    match: 78, dishes: 18, note: 'Short menu, high hit rate for your profile.' },
  { name: 'Thai Diner',    cuisine: 'Thai',          city: 'New York',     price: '$$',   match: 74, dishes: 61, note: 'Bold, spicy plates in your preferred heat range.' },
  { name: 'Barcelona Bar', cuisine: 'Mediterranean', city: 'New Haven',    price: '$$',   match: 71, dishes: 37, note: 'Shareable tapas across several cuisines you like.' },
]

const TRENDING = [
  { dish: 'Birria Tacos',      restaurant: 'La Esquina',   cuisine: 'Mexican',  delta: '+38%' },
  { dish: 'Hot Honey Chicken', restaurant: 'Sweet Chick',  cuisine: 'American', delta: '+24%' },
  { dish: 'Burrata Toast',     restaurant: 'Via Carota',   cuisine: 'Italian',  delta: '+19%' },
  { dish: 'Spicy Miso Ramen',  restaurant: 'Ippudo',       cuisine: 'Japanese', delta: '+15%' },
  { dish: 'Lamb Vindaloo',     restaurant: 'Dhamaka',      cuisine: 'Indian',   delta: '+12%' },
  { dish: 'Crispy Rice',       restaurant: 'Nobu',         cuisine: 'Japanese', delta: '+9%'  },
]

function RestaurantCard({ r, onClick }) {
  return (
    <button
      className="collection-tile"
      onClick={onClick}
      style={{ padding: 18, gap: 0 }}
    >
      <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.01em' }}>{r.name}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
            <IconMapPin size={12} />
            {[r.cuisine, r.city].filter(Boolean).join(' · ')}
          </div>
        </div>
        {r.match != null && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div className="tnum" style={{
              fontWeight: 700, fontSize: '1rem', lineHeight: 1,
              color: r.match >= 85 ? 'var(--green)' : 'var(--teal)',
            }}>
              {r.match}%
            </div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginTop: 3 }}>match</div>
          </div>
        )}
      </div>

      {r.note && (
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.45 }}>
          {r.note}
        </p>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
        {r.price && <span className="badge badge-muted">{r.price}</span>}
        {r.dishes != null && <span className="badge badge-muted">{r.dishes} dishes</span>}
        {r.has_menu && <span className="badge badge-green">Menu saved</span>}
      </div>
    </button>
  )
}

function DiscoverPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [cuisine, setCuisine] = useState('All')
  const [price, setPrice] = useState('Any')
  const [sort, setSort] = useState('Best match')
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (query.trim().length < 2) {
      setResults(null)
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(apiUrl(`/api/restaurants/search?q=${encodeURIComponent(query.trim())}&limit=24`))
        const data = await res.json()
        setResults(Array.isArray(data) ? data : [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  const searching = query.trim().length >= 2

  const liveCards = (results || []).map(r => ({
    id: r.id,
    name: r.name,
    cuisine: r.cuisine_type,
    city: r.city,
    has_menu: r.has_menu,
    dishes: r.menu_dish_count,
  }))

  const featuredFiltered = FEATURED.filter(r =>
    (cuisine === 'All' || r.cuisine === cuisine) &&
    (price === 'Any' || r.price === price)
  )

  const trendingFiltered = TRENDING.filter(t => cuisine === 'All' || t.cuisine === cuisine)

  return (
    <div className="container">
      <div className="page-head">
        <h1>Discover</h1>
        <p>Find a restaurant, or browse dishes trending with people who rate like you.</p>
      </div>

      {/* Search + filters */}
      <div className="card card-pad" style={{ marginBottom: 24 }}>
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <span style={{
            position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-dim)', display: 'flex',
          }}>
            <IconSearch size={17} />
          </span>
          <input
            className="input-lg"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search restaurants by name…"
            style={{ paddingLeft: 44 }}
          />
          {loading && (
            <span className="spinner" style={{
              position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
              width: '1rem', height: '1rem',
            }} />
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div className="field-label">Cuisine</div>
            <div className="chip-row">
              {CUISINES.map(c => (
                <button key={c} className={`chip${cuisine === c ? ' active' : ''}`} onClick={() => setCuisine(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div className="field-label">Price</div>
              <div className="chip-row">
                {PRICES.map(p => (
                  <button key={p} className={`chip${price === p ? ' active' : ''}`} onClick={() => setPrice(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="field-label">Sort</div>
              <div className="chip-row">
                {SORTS.map(s => (
                  <button key={s} className={`chip${sort === s ? ' active' : ''}`} onClick={() => setSort(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      {searching ? (
        <section style={{ marginBottom: 40 }}>
          <div className="panel-head">
            <h2>Search results</h2>
            <span className="text-sm text-dim">{liveCards.length} found</span>
          </div>
          {loading && liveCards.length === 0 ? (
            <div className="empty-state"><span className="spinner" /></div>
          ) : liveCards.length === 0 ? (
            <div className="card empty-state">
              <div className="empty-state-glyph"><IconSearch size={20} /></div>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                No restaurants match "{query.trim()}"
              </div>
              <p className="text-sm">Add it from the home page and scan its menu.</p>
              <button className="primary" style={{ marginTop: 16 }} onClick={() => navigate('/')}>
                Go to Home
              </button>
            </div>
          ) : (
            <div className="grid grid-3">
              {liveCards.map(r => (
                <RestaurantCard key={r.id} r={r} onClick={() => navigate('/')} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section style={{ marginBottom: 40 }}>
          <div className="panel-head">
            <h2>Recommended for you</h2>
            <span className="preview-tag">Preview</span>
          </div>
          {featuredFiltered.length === 0 ? (
            <div className="card empty-state">
              <p className="text-sm">No sample restaurants match those filters.</p>
            </div>
          ) : (
            <div className="grid grid-3">
              {featuredFiltered.map(r => (
                <RestaurantCard key={r.name} r={r} onClick={() => navigate('/')} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Trending dishes */}
      <section>
        <div className="panel-head">
          <h2>Trending dishes</h2>
          <span className="preview-tag">Preview</span>
        </div>
        <div className="grid grid-2">
          {trendingFiltered.map(t => (
            <div key={t.dish} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 10, flexShrink: 0,
                background: 'var(--surface-2)', color: 'var(--text-dim)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <IconImage size={16} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{t.dish}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {t.restaurant} · {t.cuisine}
                </div>
              </div>
              <span className="badge badge-teal" style={{ flexShrink: 0 }}>{t.delta}</span>
            </div>
          ))}
          {trendingFiltered.length === 0 && (
            <div className="card empty-state" style={{ gridColumn: '1 / -1' }}>
              <p className="text-sm">Nothing trending in {cuisine} right now.</p>
            </div>
          )}
        </div>
      </section>

      {/* Collections strip */}
      <section style={{ marginTop: 40 }}>
        <div className="panel-head">
          <h2>Browse by mood</h2>
          <span className="preview-tag">Preview</span>
        </div>
        <div className="collections-grid">
          {[
            { title: 'Late night', glyph: '🌙', accent: 'teal',  count: 24 },
            { title: 'Date night', glyph: '🍷', accent: 'amber', count: 31 },
            { title: 'Quick lunch', glyph: '⏱', accent: 'green', count: 47 },
            { title: 'Big groups', glyph: '👥', accent: 'teal',  count: 18 },
          ].map(c => (
            <div key={c.title} className={`collection-tile collection-${c.accent}`} style={{ cursor: 'default' }}>
              <span className="collection-glyph">{c.glyph}</span>
              <span className="collection-title">{c.title}</span>
              <span className="collection-count">{c.count} spots</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default DiscoverPage
