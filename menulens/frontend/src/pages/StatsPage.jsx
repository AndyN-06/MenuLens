import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api'
import { useApp } from '../AppContext'
import { IconChart, IconTrend, IconStar, IconMapPin } from '../components/icons'

const MONTH_FMT = { month: 'short' }

function StatTile({ value, label, accent }) {
  return (
    <div className="stat">
      <div className="stat-value" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

function BarRow({ label, value, max, suffix, color = 'var(--green)' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: '0.85rem' }}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        <span className="tnum" style={{ color: 'var(--text-muted)' }}>{value}{suffix}</span>
      </div>
      <div className="meter">
        <div className="meter-fill" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function ColumnChart({ data, color = 'var(--green)' }) {
  const max = Math.max(1, ...data.map(d => d.value))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 160, paddingTop: 8 }}>
      {data.map(d => (
        <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%' }}>
          <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
            <div
              title={`${d.label}: ${d.value}`}
              style={{
                width: '100%',
                height: `${(d.value / max) * 100}%`,
                minHeight: d.value > 0 ? 4 : 2,
                background: d.value > 0 ? color : 'var(--surface-2)',
                borderRadius: '6px 6px 2px 2px',
                transition: 'height 0.4s ease',
              }}
            />
          </div>
          <span className="tnum" style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{d.label}</span>
        </div>
      ))}
    </div>
  )
}

function StatsPage() {
  const { userId } = useApp()
  const [visits, setVisits] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    Promise.all([
      apiFetch(`/api/visits/${userId}`).then(r => r.ok ? r.json() : []).catch(() => []),
      apiFetch(`/api/profile/${userId}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([v, p]) => {
      setVisits(Array.isArray(v) ? v : [])
      setProfile(p)
      setLoading(false)
    })
  }, [userId])

  if (loading) {
    return (
      <div className="container">
        <div className="empty-state"><span className="spinner" /></div>
      </div>
    )
  }

  const ratings = visits.flatMap(v =>
    (v.dish_ratings || [])
      .filter(d => d.rating != null)
      .map(d => ({
        dish_name: d.dish_name,
        rating: d.rating,
        restaurant: v.restaurant_name,
        cuisine: v.cuisine_type,
        date: v.visited_at,
      }))
  )

  const avg = ratings.length
    ? (ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1)
    : '—'

  const restaurants = new Set(visits.map(v => v.restaurant_name).filter(Boolean))

  // Cuisine breakdown
  const cuisineCount = {}
  for (const v of visits) {
    if (v.cuisine_type) cuisineCount[v.cuisine_type] = (cuisineCount[v.cuisine_type] || 0) + 1
  }
  const cuisineRows = Object.entries(cuisineCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
  const cuisineMax = cuisineRows.length ? cuisineRows[0][1] : 0

  // Rating distribution (buckets 1–10)
  const buckets = Array.from({ length: 10 }, (_, i) => ({ label: String(i + 1), value: 0 }))
  for (const r of ratings) {
    const idx = Math.min(9, Math.max(0, Math.ceil(r.rating) - 1))
    buckets[idx].value += 1
  }

  // Visits over the last 6 months
  const now = new Date()
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString(undefined, MONTH_FMT), value: 0 }
  })
  for (const v of visits) {
    if (!v.visited_at) continue
    const d = new Date(v.visited_at)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const m = months.find(x => x.key === key)
    if (m) m.value += 1
  }

  // Most visited restaurants
  const restaurantCount = {}
  for (const v of visits) {
    if (v.restaurant_name) restaurantCount[v.restaurant_name] = (restaurantCount[v.restaurant_name] || 0) + 1
  }
  const topRestaurants = Object.entries(restaurantCount).sort((a, b) => b[1] - a[1]).slice(0, 5)

  const topDishes = [...ratings].sort((a, b) => b.rating - a.rating).slice(0, 8)

  const flavors = profile?.flavor_preferences && typeof profile.flavor_preferences === 'object'
    ? Object.entries(profile.flavor_preferences).slice(0, 6)
    : []

  const hasData = visits.length > 0

  return (
    <div className="container">
      <div className="page-head">
        <h1>Stats</h1>
        <p>What your ratings say about how you eat.</p>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-4" style={{ marginBottom: 32 }}>
        <StatTile value={visits.length} label="Visits logged" />
        <StatTile value={ratings.length} label="Dishes rated" />
        <StatTile value={avg} label="Average rating" accent="var(--green)" />
        <StatTile value={restaurants.size} label="Restaurants" />
      </div>

      {!hasData && (
        <div className="card empty-state" style={{ marginBottom: 32 }}>
          <div className="empty-state-glyph"><IconChart size={20} /></div>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>No data yet</div>
          <p className="text-sm" style={{ marginBottom: 16 }}>
            Log a visit and rate a few dishes — these charts fill in from your own history.
          </p>
          <Link to="/"><button className="primary">Scan a menu</button></Link>
        </div>
      )}

      <div className="grid grid-2" style={{ marginBottom: 24 }}>
        {/* Visits over time */}
        <div className="card card-pad">
          <div className="panel-head">
            <h2 style={{ fontSize: '1.05rem' }}>Visits over time</h2>
            <span className="text-xs text-dim">Last 6 months</span>
          </div>
          <ColumnChart data={months} />
        </div>

        {/* Rating distribution */}
        <div className="card card-pad">
          <div className="panel-head">
            <h2 style={{ fontSize: '1.05rem' }}>Rating distribution</h2>
            <span className="text-xs text-dim">1–10</span>
          </div>
          <ColumnChart data={buckets} color="var(--teal)" />
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 24 }}>
        {/* Cuisine breakdown */}
        <div className="card card-pad">
          <div className="panel-head">
            <h2 style={{ fontSize: '1.05rem' }}>Cuisines you visit</h2>
            <IconTrend size={16} />
          </div>
          {cuisineRows.length === 0 ? (
            <p className="text-sm text-muted">No cuisine data yet.</p>
          ) : (
            cuisineRows.map(([c, n]) => (
              <BarRow key={c} label={c} value={n} max={cuisineMax} suffix=" visits" />
            ))
          )}
        </div>

        {/* Most visited */}
        <div className="card card-pad">
          <div className="panel-head">
            <h2 style={{ fontSize: '1.05rem' }}>Most visited</h2>
            <IconMapPin size={16} />
          </div>
          {topRestaurants.length === 0 ? (
            <p className="text-sm text-muted">No visits logged yet.</p>
          ) : (
            topRestaurants.map(([name, n], i) => (
              <div key={name} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0',
                borderBottom: i < topRestaurants.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <span className="tnum" style={{
                  width: 20, textAlign: 'center', fontWeight: 700, fontSize: '0.8rem',
                  color: i === 0 ? 'var(--green)' : 'var(--text-dim)',
                }}>
                  {i + 1}
                </span>
                <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 500 }}>{name}</span>
                <span className="badge badge-muted tnum">{n} visit{n === 1 ? '' : 's'}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Top dishes */}
      <div className="card card-pad" style={{ marginBottom: 24 }}>
        <div className="panel-head">
          <h2 style={{ fontSize: '1.05rem' }}>Your highest-rated dishes</h2>
          <IconStar size={16} />
        </div>
        {topDishes.length === 0 ? (
          <p className="text-sm text-muted">Rate some dishes to build this list.</p>
        ) : (
          <div className="grid grid-2" style={{ gap: 10 }}>
            {topDishes.map((d, i) => (
              <div key={`${d.dish_name}-${i}`} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 'var(--radius)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '0.875rem', fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {d.dish_name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{d.restaurant}</div>
                </div>
                <span className="badge badge-green tnum" style={{ flexShrink: 0 }}>{d.rating}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Flavor profile */}
      <div className="grid grid-2">
        <div className="card card-pad">
          <div className="panel-head">
            <h2 style={{ fontSize: '1.05rem' }}>Flavor profile</h2>
            <span className="text-xs text-dim">From your ratings</span>
          </div>
          {flavors.length === 0 ? (
            <p className="text-sm text-muted">
              Your flavor profile builds up as you rate dishes across cuisines.
            </p>
          ) : (
            flavors.map(([k, v]) => (
              <BarRow
                key={k}
                label={k.replace(/_/g, ' ')}
                value={typeof v === 'number' ? Math.round(v * 100) / 100 : 0}
                max={Math.max(...flavors.map(f => (typeof f[1] === 'number' ? f[1] : 0)), 1)}
                suffix=""
                color="var(--teal)"
              />
            ))
          )}
        </div>

        <div className="card card-pad">
          <div className="panel-head">
            <h2 style={{ fontSize: '1.05rem' }}>Spending</h2>
            <span className="preview-tag">Preview</span>
          </div>
          <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
            Price data is not captured on visits yet. Once it is, your spend by month and by
            cuisine shows up here.
          </p>
          <ColumnChart
            data={months.map((m, i) => ({ label: m.label, value: [0, 0, 0, 0, 0, 0][i] }))}
            color="var(--amber)"
          />
        </div>
      </div>
    </div>
  )
}

export default StatsPage
