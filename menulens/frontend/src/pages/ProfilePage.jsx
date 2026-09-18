import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api'
import { useApp } from '../AppContext'
import { IconArrowLeft, IconStar, IconSettings } from '../components/icons'

function CollectionDetail({ collection, onBack }) {
  return (
    <div className="container-narrow fade-in">
      <button className="ghost sm" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
        <IconArrowLeft size={15} /> Collections
      </button>

      <div className="page-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{
            fontSize: '1.375rem', lineHeight: 1,
            width: 42, height: 42, borderRadius: 12,
            background: 'var(--green-tint)', color: 'var(--green)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {collection.glyph}
          </span>
          <h1>{collection.title}</h1>
        </div>
        <p>{collection.desc}</p>
      </div>

      <div className="card card-pad">
        {collection.dishes.length === 0 ? (
          <p className="text-sm text-muted">No dishes yet — start rating your meals.</p>
        ) : (
          collection.dishes.map((d, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '13px 0',
              borderBottom: i < collection.dishes.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <span className="tnum" style={{
                flexShrink: 0, width: 24, textAlign: 'center',
                fontSize: '0.85rem', fontWeight: 700,
                color: i < 3 ? 'var(--green)' : 'var(--text-dim)',
              }}>
                {i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.25 }}>
                  {d.dish_name}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {d.restaurant}
                  {d.date && (
                    <>
                      <span style={{ color: 'var(--text-dim)', margin: '0 5px' }}>·</span>
                      {new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </>
                  )}
                </div>
              </div>
              <div style={{
                flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
                background: 'var(--green-tint)', borderRadius: 8, padding: '5px 11px', minWidth: 48,
              }}>
                <span className="tnum" style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--green)', lineHeight: 1 }}>
                  {typeof d.rating === 'number' && d.rating % 1 !== 0 ? d.rating.toFixed(1) : d.rating}
                </span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: 2 }}>/10</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function ProfilePage() {
  const { userId, username } = useApp()
  const [profile, setProfile] = useState(null)
  const [visits, setVisits] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCollection, setSelectedCollection] = useState(null)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    Promise.all([
      apiFetch(`/api/profile/${userId}`).then(r => r.ok ? r.json() : null).catch(() => null),
      apiFetch(`/api/visits/${userId}`).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([profileData, visitsData]) => {
      setProfile(profileData)
      setVisits(Array.isArray(visitsData) ? visitsData : [])
      setLoading(false)
    })
  }, [userId])

  if (loading) {
    return <div className="container"><div className="empty-state"><span className="spinner" /></div></div>
  }

  // Derive collections from visit data
  const allDishRatings = visits.flatMap(v =>
    (v.dish_ratings || [])
      .filter(dr => dr.rating != null)
      .map(dr => ({
        dish_name: dr.dish_name,
        rating: dr.rating,
        restaurant: v.restaurant_name,
        cuisine: v.cuisine_type,
        date: v.visited_at,
      }))
  )

  const top10 = [...allDishRatings].sort((a, b) => b.rating - a.rating).slice(0, 10)

  const cuisineCount = {}
  for (const v of visits) {
    if (v.cuisine_type) cuisineCount[v.cuisine_type] = (cuisineCount[v.cuisine_type] || 0) + 1
  }
  const topCuisine = Object.keys(cuisineCount).sort((a, b) => cuisineCount[b] - cuisineCount[a])[0]
  const topCuisineDishes = topCuisine
    ? allDishRatings.filter(d => d.cuisine === topCuisine).sort((a, b) => b.rating - a.rating).slice(0, 10)
    : []

  const COLLECTIONS = [
    {
      title: 'Top 10 dishes', count: top10.length, glyph: '★', accent: 'green',
      desc: 'Your highest-rated dishes across every visit, ranked by score.',
      dishes: top10,
    },
    topCuisine
      ? {
          title: `Best ${topCuisine}`, count: topCuisineDishes.length, glyph: '🍽', accent: 'amber',
          desc: `Top-rated dishes from your ${topCuisine} visits.`,
          dishes: topCuisineDishes,
        }
      : {
          title: 'Favorite desserts', count: 0, glyph: '🍰', accent: 'amber',
          desc: 'Highest-rated sweet dishes across all visits.',
          dishes: [],
        },
    {
      title: 'Comfort food', count: 0, glyph: '◎', accent: 'green',
      desc: 'Your go-to comfort dishes.',
      dishes: [],
    },
    {
      title: 'Hidden gems', count: 0, glyph: '◆', accent: 'teal',
      desc: 'Underrated spots and dishes worth discovering.',
      dishes: [],
    },
  ]

  if (selectedCollection) {
    return <CollectionDetail collection={selectedCollection} onBack={() => setSelectedCollection(null)} />
  }

  const cuisines = profile?.cuisine_affinities
    ? Object.keys(profile.cuisine_affinities)
        .sort((a, b) => (profile.cuisine_affinities[b] || 0) - (profile.cuisine_affinities[a] || 0))
        .slice(0, 8)
    : []
  const dietary = profile?.dietary_restrictions || []
  const liked = profile?.liked_ingredients || []
  const disliked = profile?.disliked_ingredients || []

  return (
    <div className="container fade-in">
      {/* Header card */}
      <div className="card card-pad" style={{
        display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24, flexWrap: 'wrap',
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'var(--green-tint)', color: 'var(--green)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.75rem', fontWeight: 700, flexShrink: 0,
        }}>
          {username?.[0]?.toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ marginBottom: 2 }}>{username}</h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            MenuLens member · {visits.length} visit{visits.length === 1 ? '' : 's'} · {allDishRatings.length} dish{allDishRatings.length === 1 ? '' : 'es'} rated
          </p>
        </div>
        <Link to="/settings">
          <button style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconSettings size={15} /> Settings
          </button>
        </Link>
      </div>

      <div className="layout-main">
        <div>
          {/* Collections */}
          <section style={{ marginBottom: 28 }}>
            <div className="panel-head">
              <h2>Collections</h2>
              <span className="text-xs text-dim">auto-curated</span>
            </div>
            <div className="collections-grid">
              {COLLECTIONS.map(c => (
                <button
                  key={c.title}
                  className={`collection-tile collection-${c.accent}`}
                  onClick={() => setSelectedCollection(c)}
                >
                  <span className="collection-glyph">{c.glyph}</span>
                  <span className="collection-title">{c.title}</span>
                  <span className="collection-count">{c.count} dishes</span>
                </button>
              ))}
            </div>
          </section>

          {/* Recent activity */}
          <section>
            <div className="panel-head">
              <h2>Recent activity</h2>
              <Link to="/list" className="text-sm text-green fw-600">View all</Link>
            </div>
            {visits.length === 0 ? (
              <div className="card empty-state">
                <div className="empty-state-glyph"><IconStar size={20} /></div>
                <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Nothing logged yet</div>
                <p className="text-sm" style={{ marginBottom: 16 }}>
                  Scan a menu or log a meal to start building your profile.
                </p>
                <Link to="/"><button className="primary">Scan a menu</button></Link>
              </div>
            ) : (
              <div className="card card-pad">
                {visits.slice(0, 6).map((v, i) => {
                  const rated = (v.dish_ratings || []).filter(d => d.rating != null)
                  const avg = rated.length
                    ? (rated.reduce((s, d) => s + d.rating, 0) / rated.length).toFixed(1)
                    : null
                  return (
                    <div key={v.id || i} style={{
                      display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0',
                      borderBottom: i < Math.min(6, visits.length) - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{v.restaurant_name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {[v.cuisine_type, v.visited_at && new Date(v.visited_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })]
                            .filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <span className="badge badge-muted">{rated.length} rated</span>
                      {avg && <span className="badge badge-green tnum">{avg}</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        {/* Rail */}
        <aside className="rail">
          <div className="card">
            <div className="section-label">Taste profile</div>
            {cuisines.length === 0 && dietary.length === 0 ? (
              <p className="text-sm text-muted">
                Your profile fills in as you rate dishes.
              </p>
            ) : (
              <>
                {cuisines.length > 0 && (
                  <div className="chip-row">
                    {cuisines.map(c => <span key={c} className="badge badge-green">{c}</span>)}
                  </div>
                )}
                {dietary.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div className="field-label">Dietary</div>
                    <div className="chip-row">
                      {dietary.map(r => <span key={r} className="badge badge-muted">{r}</span>)}
                    </div>
                  </div>
                )}
              </>
            )}
            <Link to="/settings">
              <button className="block sm" style={{ marginTop: 16 }}>Edit preferences</button>
            </Link>
          </div>

          {liked.length > 0 && (
            <div className="card">
              <div className="section-label">Ingredients you like</div>
              <div className="chip-row">
                {liked.slice(0, 12).map(x => <span key={x} className="badge badge-teal">{x}</span>)}
              </div>
            </div>
          )}

          {disliked.length > 0 && (
            <div className="card">
              <div className="section-label">Ingredients you avoid</div>
              <div className="chip-row">
                {disliked.slice(0, 12).map(x => <span key={x} className="badge badge-muted">{x}</span>)}
              </div>
            </div>
          )}

          <div className="card">
            <div className="section-label">Your numbers</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div className="stat-value" style={{ fontSize: '1.5rem' }}>{visits.length}</div>
                <div className="stat-label">Visits</div>
              </div>
              <div style={{ width: 1, background: 'var(--border)' }} />
              <div style={{ flex: 1 }}>
                <div className="stat-value" style={{ fontSize: '1.5rem' }}>{allDishRatings.length}</div>
                <div className="stat-label">Dishes rated</div>
              </div>
            </div>
            <Link to="/stats">
              <button className="block sm" style={{ marginTop: 14 }}>Full stats</button>
            </Link>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default ProfilePage
