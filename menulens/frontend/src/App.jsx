import { useState, useEffect } from 'react'
import { apiUrl, apiFetch } from './api'
import Uploader from './components/Uploader'
import DishCards from './components/DishCards'
import Onboarding from './components/Onboarding'
import Login from './components/Login'
import Register from './components/Register'
import MyMealsPanel from './components/MyMealsPanel'
import RestaurantSearch from './components/RestaurantSearch'
import NewRestaurantForm from './components/NewRestaurantForm'
import LogMealForm from './components/LogMealForm'
import PhoneFrame from './components/PhoneFrame'

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000

function loadPendingVisits(userId) {
  try {
    const raw = localStorage.getItem('menulens_pending_visits')
    if (!raw) return []
    const visits = JSON.parse(raw)
    const now = Date.now()
    return visits.filter(v => now - v.savedAt < SEVEN_DAYS && v.user_id === userId)
  } catch {
    return []
  }
}

function savePendingVisits(visits) {
  localStorage.setItem('menulens_pending_visits', JSON.stringify(visits))
}

// ── SVG Icons ──────────────────────────────────────────────────────────────────
function IconScan() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconList() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" ry="1" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  )
}

function IconFriends() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function IconProfile() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function BottomNav({ activeTab, onTabChange, pendingCount }) {
  return (
    <nav className="bottom-nav">
      <button
        className={`nav-item${activeTab === 'scan' ? ' active' : ''}`}
        onClick={() => onTabChange('scan')}
      >
        <IconScan />
        Scan
      </button>

      <button
        className={`nav-item${activeTab === 'meals' ? ' active' : ''}`}
        onClick={() => onTabChange('meals')}
        style={{ position: 'relative' }}
      >
        <IconList />
        My List
        {pendingCount > 0 && (
          <span style={{
            position: 'absolute', top: '6px', right: '10px',
            width: '8px', height: '8px', borderRadius: '50%',
            backgroundColor: 'var(--teal)',
          }} />
        )}
      </button>

      <button
        className={`nav-item${activeTab === 'friends' ? ' active' : ''}`}
        onClick={() => onTabChange('friends')}
      >
        <IconFriends />
        Friends
      </button>

      <button
        className={`nav-item${activeTab === 'profile' ? ' active' : ''}`}
        onClick={() => onTabChange('profile')}
      >
        <IconProfile />
        Profile
      </button>
    </nav>
  )
}

// ── Home screen recommendation components ──────────────────────────────────────
function RecSectionHead({ title, color, count }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      marginBottom: 10, paddingBottom: 6,
      borderBottom: '1px solid var(--border)', marginTop: 18,
    }}>
      {color && (
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      )}
      <span className="section-label" style={{ marginBottom: 0 }}>{title}</span>
      <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)' }}>
        {count}
      </span>
    </div>
  )
}

function RecThumb() {
  return (
    <div style={{
      flexShrink: 0, width: 52, height: 52, borderRadius: 8,
      overflow: 'hidden', background: 'var(--surface-2)',
      alignSelf: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 6px, rgba(163,162,159,0.08) 6px 7px)',
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
        style={{ color: 'var(--text-dim)' }}>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    </div>
  )
}

function RecRow({ dish, restaurant, cuisine, score, level, popular }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 10,
      padding: 12, marginBottom: 8,
      boxShadow: 'var(--shadow-sm)',
      borderLeft: level === 'great' ? '3px solid var(--green)' : '3px solid transparent',
      display: 'flex', gap: 10,
    }}>
      <RecThumb />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 3 }}>
              <span style={{ fontWeight: 600, fontSize: '0.875rem', lineHeight: 1.25 }}>{dish}</span>
              {level === 'great' && <span className="badge badge-green">Great match</span>}
              {level === 'good' && <span className="badge badge-teal">Good match</span>}
              {popular && <span className="badge badge-amber">Popular</span>}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{restaurant}</span>
              <span style={{ color: 'var(--text-dim)', margin: '0 5px' }}>·</span>
              <span>{cuisine}</span>
            </div>
          </div>
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <div style={{
              fontSize: '0.9rem', fontWeight: 700,
              color: score >= 85 ? 'var(--green)' : 'var(--teal)',
              lineHeight: 1, fontFeatureSettings: "'tnum'",
            }}>
              {score}%
            </div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: 2, letterSpacing: '0.04em' }}>
              predicted
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Collection detail ──────────────────────────────────────────────────────────
function CollectionDetail({ collection, onBack }) {
  return (
    <div className="screen fade-in">
      {/* Back */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingTop: 4 }}>
        <button
          onClick={onBack}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: 0, display: 'flex', alignItems: 'center',
            color: 'var(--text-muted)', fontSize: '1.125rem',
          }}
        >←</button>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Collections</span>
      </div>

      {/* Title */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{
            fontSize: '1.375rem', lineHeight: 1,
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--green-tint)', color: 'var(--green)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {collection.glyph}
          </span>
          <h2 style={{ fontSize: '1.2rem' }}>{collection.title}</h2>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
          {collection.desc}
        </p>
      </div>

      {/* Ranked list */}
      {collection.dishes.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', padding: '1rem 0' }}>
          No dishes yet — start rating your meals!
        </p>
      ) : (
        <div>
          {collection.dishes.map((d, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '11px 0', borderBottom: '1px solid var(--border)',
            }}>
              <span style={{
                flexShrink: 0, width: 22, textAlign: 'center',
                fontSize: '0.8rem', fontWeight: 700,
                color: i < 3 ? 'var(--green)' : 'var(--text-dim)',
                fontFeatureSettings: "'tnum'",
              }}>
                {i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.25,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {d.dish_name}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {d.restaurant}
                  {d.date && (
                    <>
                      <span style={{ color: 'var(--text-dim)', margin: '0 4px' }}>·</span>
                      {new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </>
                  )}
                </div>
              </div>
              <div style={{
                flexShrink: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', background: 'var(--green-tint)',
                borderRadius: 8, padding: '4px 9px', minWidth: 42,
              }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--green)', lineHeight: 1, fontFeatureSettings: "'tnum'" }}>
                  {typeof d.rating === 'number' && d.rating % 1 !== 0
                    ? d.rating % 1 >= 0.1 ? d.rating.toFixed(1) : d.rating
                    : d.rating}
                </span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: 1 }}>/10</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Profile tab ────────────────────────────────────────────────────────────────
function ProfileTab({ username, userId, onLogout }) {
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

  const top10 = [...allDishRatings]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 10)

  // Find dominant cuisine for a "Best X" collection
  const cuisineCount = {}
  for (const v of visits) {
    if (v.cuisine_type) cuisineCount[v.cuisine_type] = (cuisineCount[v.cuisine_type] || 0) + 1
  }
  const topCuisine = Object.keys(cuisineCount).sort((a, b) => cuisineCount[b] - cuisineCount[a])[0]
  const topCuisineDishes = topCuisine
    ? allDishRatings.filter(d => d.cuisine === topCuisine).sort((a, b) => b.rating - a.rating).slice(0, 10)
    : []

  const visitCount = visits.length
  const dishCount = allDishRatings.length

  const COLLECTIONS = [
    {
      title: 'Top 10 dishes',
      count: top10.length,
      glyph: '★',
      accent: 'green',
      desc: 'Your highest-rated dishes across every visit, ranked by score.',
      dishes: top10,
    },
    topCuisine
      ? {
          title: `Best ${topCuisine}`,
          count: topCuisineDishes.length,
          glyph: '🍽',
          accent: 'amber',
          desc: `Top-rated dishes from your ${topCuisine} visits.`,
          dishes: topCuisineDishes,
        }
      : {
          title: 'Favorite desserts',
          count: 0,
          glyph: '🍰',
          accent: 'amber',
          desc: 'Highest-rated sweet dishes across all visits.',
          dishes: [],
        },
    {
      title: 'Comfort food',
      count: 0,
      glyph: '◎',
      accent: 'green',
      desc: 'Your go-to comfort dishes.',
      dishes: [],
    },
    {
      title: 'Hidden gems',
      count: 0,
      glyph: '◆',
      accent: 'teal',
      desc: 'Underrated spots and dishes worth discovering.',
      dishes: [],
    },
  ]

  // Profile-derived data
  const cuisines = profile?.cuisine_affinities
    ? Object.keys(profile.cuisine_affinities).sort(
        (a, b) => (profile.cuisine_affinities[b] || 0) - (profile.cuisine_affinities[a] || 0)
      ).slice(0, 6)
    : []
  const dietary = profile?.dietary_restrictions || []

  if (loading) {
    return (
      <div className="screen">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
          <span className="spinner" />
        </div>
      </div>
    )
  }

  if (selectedCollection) {
    return (
      <CollectionDetail
        collection={selectedCollection}
        onBack={() => setSelectedCollection(null)}
      />
    )
  }

  return (
    <div className="screen fade-in">
      <div style={{ paddingTop: '0.75rem', marginBottom: '1rem' }}>
        <h1>Profile</h1>
      </div>

      {/* Avatar card */}
      <div className="card" style={{ marginBottom: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'var(--green-tint)', color: 'var(--green)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.25rem', fontWeight: 700, flexShrink: 0,
        }}>
          {username?.[0]?.toUpperCase()}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '1rem' }}>{username}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>MenuLens member</div>
        </div>
      </div>

      {/* Taste profile */}
      {(cuisines.length > 0 || dietary.length > 0) && (
        <div className="card" style={{ marginBottom: '0.875rem' }}>
          <div className="section-label">Taste profile</div>
          {cuisines.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {cuisines.map(c => (
                <span key={c} className="badge badge-green">{c}</span>
              ))}
            </div>
          )}
          {dietary.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Dietary</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {dietary.map(r => (
                  <span key={r} className="badge badge-muted">{r}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collections */}
      <div style={{ marginBottom: '0.875rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <p className="section-label" style={{ marginBottom: 0 }}>Collections</p>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 500 }}>auto-curated</span>
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
      </div>

      {/* Stats */}
      <div className="card" style={{ marginBottom: '0.875rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
          <span style={{ fontSize: '0.9rem' }}>Visits logged</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>{visitCount}</span>
        </div>
        <div style={{ height: 1, background: 'var(--border)', margin: '10px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
          <span style={{ fontSize: '0.9rem' }}>Dishes rated</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>{dishCount}</span>
        </div>
      </div>

      <button
        onClick={onLogout}
        style={{ width: '100%', color: 'var(--red)' }}
      >
        Log out
      </button>
    </div>
  )
}

// ── No-menu card ───────────────────────────────────────────────────────────────
function NoMenuCard({ restaurant, onScanMenu, onLogMeal, onChangeRestaurant }) {
  return (
    <div className="card fade-in" style={{ marginTop: '1.25rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.2rem' }}>
          {restaurant.name}
        </div>
        {(restaurant.cuisine_type || restaurant.city) && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {[restaurant.cuisine_type, restaurant.city].filter(Boolean).join(' · ')}
          </div>
        )}
        <div style={{
          marginTop: '0.75rem',
          padding: '0.6rem 0.75rem',
          background: 'var(--surface-2)',
          borderRadius: 'var(--radius)',
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
        }}>
          No menu scanned yet
        </div>
      </div>

      <button
        className="primary"
        onClick={onScanMenu}
        style={{ width: '100%', marginBottom: '0.625rem' }}
      >
        Scan menu
      </button>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button onClick={onLogMeal} style={{ flex: 1, fontSize: '0.85rem', padding: '0.55rem' }}>
          Log a meal
        </button>
        <button onClick={onChangeRestaurant} style={{ flex: 1, fontSize: '0.85rem', padding: '0.55rem' }}>
          Change restaurant
        </button>
      </div>
    </div>
  )
}

// ── Existing-menu card ─────────────────────────────────────────────────────────
function ExistingMenuCard({ restaurant, onUseExisting, onScanNew, onLogMeal, onChangeRestaurant }) {
  const scannedAt = restaurant.menu_scanned_at
    ? new Date(restaurant.menu_scanned_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="card fade-in" style={{ marginTop: '1.25rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.2rem' }}>
              {restaurant.name}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {[restaurant.cuisine_type, restaurant.city].filter(Boolean).join(' · ')}
            </div>
          </div>
          {restaurant.menu_verified && (
            <span className="badge badge-green">Verified</span>
          )}
        </div>

        <div style={{
          marginTop: '0.75rem',
          padding: '0.6rem 0.75rem',
          background: 'var(--surface-2)',
          borderRadius: 'var(--radius)',
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
          display: 'flex', gap: '1rem',
        }}>
          <span>{restaurant.menu_dish_count} dishes on file</span>
          {scannedAt && <span>Scanned {scannedAt}</span>}
        </div>
      </div>

      <button
        className="primary"
        onClick={onUseExisting}
        style={{ width: '100%', marginBottom: '0.625rem' }}
      >
        Get Recommendations
      </button>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <button onClick={onLogMeal} style={{ flex: 1, fontSize: '0.85rem', padding: '0.55rem' }}>
          Log a meal
        </button>
        <button onClick={onScanNew} style={{ flex: 1, fontSize: '0.85rem', padding: '0.55rem' }}>
          Scan new menu
        </button>
      </div>
      <button onClick={onChangeRestaurant} style={{ width: '100%', fontSize: '0.85rem', padding: '0.55rem' }}>
        Change restaurant
      </button>
    </div>
  )
}

// ── Ranking spinner ────────────────────────────────────────────────────────────
function RankingSpinner() {
  return (
    <div className="card fade-in" style={{
      marginTop: '1.5rem',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: '0.75rem',
      padding: '2.5rem 1.5rem',
      textAlign: 'center',
    }}>
      <div className="spinner" style={{ width: '1.75rem', height: '1.75rem' }} />
      <div style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        Getting your recommendations…
      </div>
    </div>
  )
}

// ── Main App ───────────────────────────────────────────────────────────────────
function App() {
  const [stage,      setStage]      = useState('loading')
  const [userId,     setUserId]     = useState(null)
  const [username,   setUsername]   = useState(null)
  const [activeTab,  setActiveTab]  = useState('scan')

  const [selectedRestaurant,  setSelectedRestaurant]  = useState(null)
  const [newRestaurantName,   setNewRestaurantName]   = useState('')
  const [creatingRestaurant,  setCreatingRestaurant]  = useState(false)

  const [result,        setResult]        = useState(null)
  const [error,         setError]         = useState(null)
  const [pendingVisits, setPendingVisits] = useState([])

  useEffect(() => {
    // Restore session from HTTP-only cookie
    apiFetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.user_id) {
          setUserId(data.user_id)
          setUsername(data.username)
          setPendingVisits(loadPendingVisits(data.user_id))
          setStage(data.has_profile ? 'idle' : 'onboarding')
        } else {
          setStage('login')
        }
      })
      .catch(() => setStage('login'))
  }, [])

  // ── Auth handlers ────────────────────────────────────────────────────────────
  const handleLogin = ({ user_id, username: name, has_profile }) => {
    // Clean up any legacy localStorage auth keys
    localStorage.removeItem('menulens_user_id')
    localStorage.removeItem('menulens_username')
    setUserId(user_id)
    setUsername(name)
    setPendingVisits(loadPendingVisits(user_id))
    setStage(has_profile ? 'idle' : 'onboarding')
  }

  const handleOnboardingComplete = () => setStage('idle')

  const handleLogout = async () => {
    try { await apiFetch('/api/logout', { method: 'POST' }) } catch { /* ignore */ }
    localStorage.removeItem('menulens_user_id')
    localStorage.removeItem('menulens_username')
    setUserId(null)
    setUsername(null)
    setPendingVisits([])
    _resetScan()
    setActiveTab('scan')
    setStage('login')
  }

  // ── Shared reset ─────────────────────────────────────────────────────────────
  const _resetScan = () => {
    setResult(null)
    setError(null)
    setSelectedRestaurant(null)
    setNewRestaurantName('')
  }

  const handleReset = () => {
    _resetScan()
    setStage('idle')
  }

  // ── Restaurant search handlers ────────────────────────────────────────────────
  const handleSelectRestaurant = (restaurant) => {
    setSelectedRestaurant(restaurant)
  }

  const handleInitNewRestaurant = (name) => {
    setNewRestaurantName(name)
    setStage('new_restaurant')
  }

  const handleCreateRestaurant = async ({ name, cuisine_type, city }, intent = 'scan') => {
    setCreatingRestaurant(true)
    try {
      const res = await apiFetch('/api/restaurants', {
        method: 'POST',
        body: JSON.stringify({ name, cuisine_type, city }),
      })
      if (!res.ok) throw new Error('Failed to create restaurant')
      const data = await res.json()
      setSelectedRestaurant({ id: data.id, name: data.name, cuisine_type, city, has_menu: false })
      setStage(intent === 'log' ? 'log_meal' : 'ready_to_scan')
    } catch (err) {
      setError(err.message)
      setStage('error')
    } finally {
      setCreatingRestaurant(false)
    }
  }

  // ── Use existing menu ─────────────────────────────────────────────────────────
  const handleUseExistingMenu = async () => {
    setStage('ranking')
    try {
      const menuRes = await apiFetch(`/api/restaurants/${selectedRestaurant.id}/menu`)
      if (!menuRes.ok) throw new Error('Could not load saved menu')
      const menuData = await menuRes.json()

      const rankRes = await apiFetch('/api/recommend/rank', {
        method: 'POST',
        body: JSON.stringify({
          dishes:          menuData.dishes,
          restaurant_name: selectedRestaurant.name,
          cuisine_type:    selectedRestaurant.cuisine_type || '',
          user_id:         userId,
        }),
      })
      if (!rankRes.ok) throw new Error('Ranking failed')
      const data = await rankRes.json()
      setResult(data)
      setStage('done')

      const visit = {
        id: Date.now().toString(),
        user_id:         userId,
        restaurant_name: selectedRestaurant.name,
        cuisine_type:    selectedRestaurant.cuisine_type || '',
        restaurant_id:   selectedRestaurant.id || null,
        savedAt: Date.now(),
      }
      const updated = [visit, ...pendingVisits].slice(0, 20)
      setPendingVisits(updated)
      savePendingVisits(updated)
    } catch (err) {
      setError(err.message)
      setStage('error')
    }
  }

  const handleScanNewMenu = () => setStage('ready_to_scan')

  // ── File upload + stream → auto-rank ─────────────────────────────────────────
  const handleFileUpload = async (file) => {
    setStage('uploading')
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      if (userId) formData.append('user_id', userId)
      if (selectedRestaurant?.id) formData.append('restaurant_id', selectedRestaurant.id)

      const response = await fetch(apiUrl('/api/recommend/stream'), {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.detail || `Request failed: ${response.statusText}`)
      }

      const reader  = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''
      let parsedData = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop()

        for (const part of parts) {
          const dataLine = part.split('\n').find(l => l.startsWith('data: '))
          if (!dataLine) continue
          let event
          try { event = JSON.parse(dataLine.slice(6)) } catch { continue }

          if (event.type === 'heartbeat' || event.type === 'log') continue
          if (event.type === 'parsed') parsedData = event.data
          else if (event.type === 'error') throw new Error(event.message)
        }
      }

      if (!parsedData) {
        throw new Error('Stream ended without parsed data — check backend logs')
      }

      setStage('ranking')
      const restaurantName = selectedRestaurant?.name    || parsedData.restaurant_name || ''
      const cuisineType    = selectedRestaurant?.cuisine_type || parsedData.cuisine_type    || ''

      const rankRes = await apiFetch('/api/recommend/rank', {
        method: 'POST',
        body: JSON.stringify({
          dishes:          parsedData.dishes,
          restaurant_name: restaurantName,
          cuisine_type:    cuisineType,
          user_id:         userId,
        }),
      })
      if (!rankRes.ok) throw new Error('Ranking failed')
      const data = await rankRes.json()
      setResult(data)
      setStage('done')

      const visit = {
        id: Date.now().toString(),
        user_id:         userId,
        restaurant_name: restaurantName,
        cuisine_type:    cuisineType,
        restaurant_id:   selectedRestaurant?.id || null,
        savedAt: Date.now(),
      }
      const updated = [visit, ...pendingVisits].slice(0, 20)
      setPendingVisits(updated)
      savePendingVisits(updated)
    } catch (err) {
      setError(err.message)
      setStage('error')
    }
  }

  // ── Visit handlers (My List tab) ──────────────────────────────────────────────
  const handleSaveVisit = async (visitData) => {
    try {
      const res = await apiFetch(`/api/visits/${userId}`, {
        method: 'POST',
        body: JSON.stringify(visitData),
      })
      const saved = await res.json()
      const updated = pendingVisits.filter(v => v.id !== visitData._pendingId)
      setPendingVisits(updated)
      savePendingVisits(updated)
      return saved
    } catch (err) {
      console.error('Failed to save visit:', err)
    }
  }

  const handleRemovePending = (id) => {
    const updated = pendingVisits.filter(v => v.id !== id)
    setPendingVisits(updated)
    savePendingVisits(updated)
  }

  // ── Global stage gates ────────────────────────────────────────────────────────
  if (stage === 'loading') return null
  if (stage === 'login')    return <PhoneFrame><Login onLogin={handleLogin} onRegister={() => setStage('register')} /></PhoneFrame>
  if (stage === 'register') return <PhoneFrame><Register onLogin={handleLogin} onBack={() => setStage('login')} /></PhoneFrame>
  if (stage === 'onboarding') {
    return <PhoneFrame><Onboarding userId={userId} onComplete={handleOnboardingComplete} /></PhoneFrame>
  }

  // My List tab
  if (activeTab === 'meals') {
    return (
      <PhoneFrame>
        <div className="app-shell">
          <MyMealsPanel
            inline
            userId={userId}
            pendingVisits={pendingVisits}
            onSaveVisit={handleSaveVisit}
            onRemovePending={handleRemovePending}
          />
          <BottomNav activeTab={activeTab} onTabChange={setActiveTab} pendingCount={pendingVisits.length} />
        </div>
      </PhoneFrame>
    )
  }

  // Friends tab
  if (activeTab === 'friends') {
    return (
      <PhoneFrame>
        <div className="app-shell">
          <div className="screen fade-in">
            <div style={{ paddingTop: '0.75rem', marginBottom: '1.5rem' }}>
              <h1 style={{ marginBottom: '0.25rem' }}>Friends</h1>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Share restaurant picks with friends
              </p>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>👥</div>
              <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Coming soon</div>
              <p style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>
                Connect with friends to see what they're ordering and share your top picks.
              </p>
            </div>
          </div>
          <BottomNav activeTab={activeTab} onTabChange={setActiveTab} pendingCount={pendingVisits.length} />
        </div>
      </PhoneFrame>
    )
  }

  // Profile tab
  if (activeTab === 'profile') {
    return (
      <PhoneFrame>
        <div className="app-shell">
          <ProfileTab username={username} userId={userId} onLogout={handleLogout} />
          <BottomNav activeTab={activeTab} onTabChange={setActiveTab} pendingCount={pendingVisits.length} />
        </div>
      </PhoneFrame>
    )
  }

  // ── Scan tab ──────────────────────────────────────────────────────────────────
  return (
    <PhoneFrame>
      <div className="app-shell">
        <div className="screen">
          {/* Header */}
          <div style={{ paddingTop: '0.75rem', marginBottom: '1rem' }}>
            <h1 style={{ marginBottom: '0.2rem' }}>MenuLens</h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Snap a menu, get your picks
            </p>
          </div>

          {/* ── Stage: idle — restaurant search ── */}
          {stage === 'idle' && (
            <div className="fade-in">
              <p style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Where are you eating?
              </p>
              <RestaurantSearch
                onSelect={handleSelectRestaurant}
                onCreateNew={handleInitNewRestaurant}
              />

              {/* Ambient recommendations — shown when no restaurant selected */}
              {!selectedRestaurant && (
                <div style={{ marginTop: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <h2 style={{ fontSize: '1.1rem' }}>Picked for you</h2>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 500 }}>nearby</span>
                  </div>
                  <p style={{
                    fontSize: '0.8rem', color: 'var(--text-muted)',
                    borderLeft: '2px solid var(--green-tint)',
                    paddingLeft: 10, marginTop: 6, lineHeight: 1.5,
                  }}>
                    Based on your love of bold beef dishes and recent 9+ ratings on sushi,
                    here are dishes you'd probably enjoy at restaurants near you.
                  </p>

                  <RecSectionHead title="Great matches" color="var(--green)" count={2} />
                  <RecRow
                    dish="Truffle Wagyu Smash Burger"
                    restaurant="Shake Shack"
                    cuisine="American"
                    score={94}
                    level="great"
                    popular
                  />
                  <RecRow
                    dish="Spicy Tuna Crispy Rice"
                    restaurant="Nobu"
                    cuisine="Japanese"
                    score={91}
                    level="great"
                  />

                  <RecSectionHead title="Good matches" color="var(--teal)" count={1} />
                  <RecRow
                    dish="Double Double Animal Style"
                    restaurant="In-N-Out"
                    cuisine="American"
                    score={78}
                    level="good"
                  />
                </div>
              )}

              {/* Restaurant without a scanned menu */}
              {selectedRestaurant && !selectedRestaurant.has_menu && (
                <NoMenuCard
                  restaurant={selectedRestaurant}
                  onScanMenu={() => setStage('ready_to_scan')}
                  onLogMeal={() => setStage('log_meal')}
                  onChangeRestaurant={() => setSelectedRestaurant(null)}
                />
              )}

              {/* Restaurant with existing menu */}
              {selectedRestaurant && selectedRestaurant.has_menu && (
                <ExistingMenuCard
                  restaurant={selectedRestaurant}
                  onUseExisting={handleUseExistingMenu}
                  onScanNew={handleScanNewMenu}
                  onLogMeal={() => setStage('log_meal')}
                  onChangeRestaurant={() => setSelectedRestaurant(null)}
                />
              )}
            </div>
          )}

          {/* ── Stage: new_restaurant — creation form ── */}
          {stage === 'new_restaurant' && (
            <NewRestaurantForm
              initialName={newRestaurantName}
              onSubmit={handleCreateRestaurant}
              onBack={() => setStage('idle')}
              loading={creatingRestaurant}
            />
          )}

          {/* ── Stage: log_meal — manual meal entry ── */}
          {stage === 'log_meal' && selectedRestaurant && (
            <LogMealForm
              restaurant={selectedRestaurant}
              userId={userId}
              onSaved={handleReset}
              onBack={handleReset}
            />
          )}

          {/* ── Stage: ready_to_scan / uploading ── */}
          {(stage === 'ready_to_scan' || stage === 'uploading') && (
            <div className="fade-in">
              {selectedRestaurant && (
                <div style={{
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '0.875rem',
                  padding: '0.6rem 0.875rem',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                      {selectedRestaurant.name}
                    </div>
                    {selectedRestaurant.cuisine_type && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {selectedRestaurant.cuisine_type}
                      </div>
                    )}
                  </div>
                  {stage === 'ready_to_scan' && (
                    <button
                      onClick={handleReset}
                      style={{
                        fontSize: '0.75rem', padding: '0.3rem 0.6rem',
                        border: 'none', background: 'none',
                        color: 'var(--text-dim)', cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}

              <Uploader
                onFileSelect={handleFileUpload}
                stage={stage === 'uploading' ? 'uploading' : 'idle'}
                onReset={handleReset}
              />
            </div>
          )}

          {/* ── Stage: ranking ── */}
          {stage === 'ranking' && <RankingSpinner />}

          {/* ── Error ── */}
          {(stage === 'error' || error) && error && (
            <div className="card fade-in" style={{
              marginTop: '1rem',
              backgroundColor: 'var(--red-tint)',
              boxShadow: 'none',
            }}>
              <div style={{ fontWeight: 600, color: 'var(--red)', marginBottom: '0.3rem', fontSize: '0.9rem' }}>
                Something went wrong
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                {error}
              </p>
              <button onClick={handleReset} style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
                Try Again
              </button>
            </div>
          )}

          {/* ── Stage: done — results ── */}
          {stage === 'done' && result && (
            <div className="slide-up" style={{ marginTop: '1rem' }}>
              <DishCards data={result} />
              <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                <button onClick={handleReset} style={{ fontSize: '0.875rem' }}>
                  Scan another restaurant
                </button>
              </div>
            </div>
          )}

        </div>
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} pendingCount={pendingVisits.length} />
      </div>
    </PhoneFrame>
  )
}

export default App
