import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiUrl, apiFetch } from '../api'
import { useApp } from '../AppContext'
import Uploader from '../components/Uploader'
import DishCards from '../components/DishCards'
import RestaurantSearch from '../components/RestaurantSearch'
import NewRestaurantForm from '../components/NewRestaurantForm'
import LogMealForm from '../components/LogMealForm'
import { IconImage, IconStar, IconClock, IconTrend } from '../components/icons'

// ── Picked-for-you preview rows (static until the recommender runs off-menu) ──
const PICKS = [
  { dish: 'Truffle Wagyu Smash Burger', restaurant: 'Shake Shack', cuisine: 'American', score: 94, level: 'great', popular: true },
  { dish: 'Spicy Tuna Crispy Rice',     restaurant: 'Nobu',        cuisine: 'Japanese', score: 91, level: 'great' },
  { dish: 'Double Double Animal Style', restaurant: 'In-N-Out',    cuisine: 'American', score: 78, level: 'good'  },
  { dish: 'Cacio e Pepe',               restaurant: 'Via Carota',  cuisine: 'Italian',  score: 74, level: 'good'  },
]

function RecThumb() {
  return (
    <div style={{
      flexShrink: 0, width: 56, height: 56, borderRadius: 10,
      overflow: 'hidden', background: 'var(--surface-2)',
      alignSelf: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--text-dim)',
      backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 6px, rgba(163,162,159,0.08) 6px 7px)',
    }}>
      <IconImage size={16} />
    </div>
  )
}

function RecRow({ dish, restaurant, cuisine, score, level, popular }) {
  return (
    <div className="card" style={{
      padding: 14,
      borderLeft: level === 'great' ? '3px solid var(--green)' : '3px solid transparent',
      display: 'flex', gap: 12, alignItems: 'center',
    }}>
      <RecThumb />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontWeight: 600, fontSize: '0.9375rem', lineHeight: 1.25 }}>{dish}</span>
          {level === 'great' && <span className="badge badge-green">Great match</span>}
          {level === 'good'  && <span className="badge badge-teal">Good match</span>}
          {popular && <span className="badge badge-amber">Popular</span>}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>{restaurant}</span>
          <span style={{ color: 'var(--text-dim)', margin: '0 6px' }}>·</span>
          <span>{cuisine}</span>
        </div>
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        <div className="tnum" style={{
          fontSize: '1.05rem', fontWeight: 700,
          color: score >= 85 ? 'var(--green)' : 'var(--teal)', lineHeight: 1,
        }}>
          {score}%
        </div>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: 3, letterSpacing: '0.04em' }}>
          predicted
        </div>
      </div>
    </div>
  )
}

// ── Selected-restaurant cards ────────────────────────────────────────────────
function RestaurantHeader({ restaurant, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: '1.125rem', marginBottom: 2 }}>{restaurant.name}</div>
        {(restaurant.cuisine_type || restaurant.city) && (
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {[restaurant.cuisine_type, restaurant.city].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
      {right}
    </div>
  )
}

function NoMenuCard({ restaurant, onScanMenu, onLogMeal, onChangeRestaurant }) {
  return (
    <div className="card card-pad fade-in">
      <RestaurantHeader restaurant={restaurant} />
      <div style={{
        marginTop: 16, padding: '12px 14px',
        background: 'var(--surface-2)', borderRadius: 'var(--radius)',
        fontSize: '0.85rem', color: 'var(--text-muted)',
      }}>
        No menu scanned yet — upload one to get ranked picks.
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        <button className="primary" onClick={onScanMenu}>Scan menu</button>
        <button onClick={onLogMeal}>Log a meal</button>
        <button className="ghost" onClick={onChangeRestaurant}>Change restaurant</button>
      </div>
    </div>
  )
}

function ExistingMenuCard({ restaurant, onUseExisting, onScanNew, onLogMeal, onChangeRestaurant }) {
  const scannedAt = restaurant.menu_scanned_at
    ? new Date(restaurant.menu_scanned_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="card card-pad fade-in">
      <RestaurantHeader
        restaurant={restaurant}
        right={restaurant.menu_verified ? <span className="badge badge-green">Verified</span> : null}
      />
      <div style={{
        marginTop: 16, padding: '12px 14px',
        background: 'var(--surface-2)', borderRadius: 'var(--radius)',
        fontSize: '0.85rem', color: 'var(--text-muted)',
        display: 'flex', gap: 20, flexWrap: 'wrap',
      }}>
        <span>{restaurant.menu_dish_count} dishes on file</span>
        {scannedAt && <span>Scanned {scannedAt}</span>}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        <button className="primary" onClick={onUseExisting}>Get recommendations</button>
        <button onClick={onLogMeal}>Log a meal</button>
        <button onClick={onScanNew}>Scan new menu</button>
        <button className="ghost" onClick={onChangeRestaurant}>Change restaurant</button>
      </div>
    </div>
  )
}

function RankingCard() {
  return (
    <div className="card fade-in" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 12, padding: '3rem 1.5rem', textAlign: 'center',
    }}>
      <div className="spinner" style={{ width: '1.75rem', height: '1.75rem' }} />
      <div style={{ fontWeight: 500, color: 'var(--text-muted)' }}>
        Scoring dishes against your taste profile…
      </div>
    </div>
  )
}

// ── Sidebar rail ─────────────────────────────────────────────────────────────
function SideRail({ pendingCount }) {
  const { userId } = useApp()
  const [visits, setVisits] = useState([])
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    if (!userId) return
    apiFetch(`/api/visits/${userId}`).then(r => r.ok ? r.json() : []).catch(() => [])
      .then(d => setVisits(Array.isArray(d) ? d : []))
    apiFetch(`/api/profile/${userId}`).then(r => r.ok ? r.json() : null).catch(() => null)
      .then(setProfile)
  }, [userId])

  const dishCount = visits.reduce(
    (n, v) => n + (v.dish_ratings || []).filter(d => d.rating != null).length, 0
  )
  const cuisines = profile?.cuisine_affinities
    ? Object.keys(profile.cuisine_affinities)
        .sort((a, b) => (profile.cuisine_affinities[b] || 0) - (profile.cuisine_affinities[a] || 0))
        .slice(0, 5)
    : []

  return (
    <aside className="rail">
      <div className="card">
        <div className="section-label">Your activity</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div className="stat-value" style={{ fontSize: '1.5rem' }}>{visits.length}</div>
            <div className="stat-label">Visits</div>
          </div>
          <div style={{ width: 1, background: 'var(--border)' }} />
          <div style={{ flex: 1 }}>
            <div className="stat-value" style={{ fontSize: '1.5rem' }}>{dishCount}</div>
            <div className="stat-label">Dishes rated</div>
          </div>
        </div>
        <Link to="/stats">
          <button className="block sm" style={{ marginTop: 14 }}>View stats</button>
        </Link>
      </div>

      {pendingCount > 0 && (
        <div className="card" style={{ borderLeft: '3px solid var(--teal)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, color: 'var(--teal)' }}>
            <IconClock size={16} />
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
              {pendingCount} visit{pendingCount === 1 ? '' : 's'} to rate
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
            Rating what you ordered sharpens future recommendations.
          </p>
          <Link to="/list"><button className="block sm">Rate them</button></Link>
        </div>
      )}

      {cuisines.length > 0 && (
        <div className="card">
          <div className="section-label">Your taste profile</div>
          <div className="chip-row">
            {cuisines.map(c => <span key={c} className="badge badge-green">{c}</span>)}
          </div>
          <Link to="/profile">
            <button className="block sm" style={{ marginTop: 14 }}>Edit profile</button>
          </Link>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <IconTrend size={16} />
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Trending near you</span>
          <span className="preview-tag" style={{ marginLeft: 'auto' }}>Preview</span>
        </div>
        {['Birria Tacos', 'Hot Honey Chicken', 'Burrata Toast'].map((d, i) => (
          <div key={d} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 0',
            borderBottom: i < 2 ? '1px solid var(--border)' : 'none',
          }}>
            <span className="tnum" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-dim)', width: 14 }}>
              {i + 1}
            </span>
            <span style={{ fontSize: '0.875rem', flex: 1 }}>{d}</span>
            <IconStar size={13} />
          </div>
        ))}
      </div>
    </aside>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
function HomePage() {
  const { userId, username, pendingVisits, addPendingVisit } = useApp()

  const [stage, setStage] = useState('idle')
  const [selectedRestaurant, setSelectedRestaurant] = useState(null)
  const [newRestaurantName, setNewRestaurantName] = useState('')
  const [creatingRestaurant, setCreatingRestaurant] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const resetScan = () => {
    setResult(null)
    setError(null)
    setSelectedRestaurant(null)
    setNewRestaurantName('')
  }

  const handleReset = () => {
    resetScan()
    setStage('idle')
  }

  const recordVisit = (restaurantName, cuisineType, restaurantId) => {
    addPendingVisit({
      id: Date.now().toString(),
      user_id: userId,
      restaurant_name: restaurantName,
      cuisine_type: cuisineType || '',
      restaurant_id: restaurantId || null,
      savedAt: Date.now(),
    })
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
      recordVisit(selectedRestaurant.name, selectedRestaurant.cuisine_type, selectedRestaurant.id)
    } catch (err) {
      setError(err.message)
      setStage('error')
    }
  }

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
      const restaurantName = selectedRestaurant?.name         || parsedData.restaurant_name || ''
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
      recordVisit(restaurantName, cuisineType, selectedRestaurant?.id)
    } catch (err) {
      setError(err.message)
      setStage('error')
    }
  }

  // Results take the full width — no rail competing with the dish list.
  const isResults = stage === 'done' && result

  const mainColumn = (
    <div>
      {/* Search / entry point */}
      {stage === 'idle' && (
        <div className="fade-in">
          <div className="card card-pad" style={{ marginBottom: 24 }}>
            <h2 style={{ marginBottom: 4 }}>Where are you eating?</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 16 }}>
              Find the restaurant, then scan its menu or use one already on file.
            </p>
            <RestaurantSearch
              onSelect={setSelectedRestaurant}
              onCreateNew={handleInitNewRestaurant}
              size="lg"
            />
          </div>

          {selectedRestaurant && !selectedRestaurant.has_menu && (
            <NoMenuCard
              restaurant={selectedRestaurant}
              onScanMenu={() => setStage('ready_to_scan')}
              onLogMeal={() => setStage('log_meal')}
              onChangeRestaurant={() => setSelectedRestaurant(null)}
            />
          )}

          {selectedRestaurant && selectedRestaurant.has_menu && (
            <ExistingMenuCard
              restaurant={selectedRestaurant}
              onUseExisting={handleUseExistingMenu}
              onScanNew={() => setStage('ready_to_scan')}
              onLogMeal={() => setStage('log_meal')}
              onChangeRestaurant={() => setSelectedRestaurant(null)}
            />
          )}

          {!selectedRestaurant && (
            <div>
              <div className="panel-head">
                <h2>Picked for you</h2>
                <span className="preview-tag">Preview</span>
              </div>
              <p style={{
                fontSize: '0.875rem', color: 'var(--text-muted)',
                borderLeft: '2px solid var(--green-tint)', paddingLeft: 12, marginBottom: 16,
              }}>
                Based on your bold beef dishes and recent 9+ ratings on sushi, here are dishes
                you would probably enjoy at restaurants near you.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {PICKS.map(p => <RecRow key={p.dish} {...p} />)}
              </div>
              <Link to="/discover">
                <button className="block" style={{ marginTop: 16 }}>Browse more in Discover</button>
              </Link>
            </div>
          )}
        </div>
      )}

      {stage === 'new_restaurant' && (
        <div className="card card-pad">
          <NewRestaurantForm
            initialName={newRestaurantName}
            onSubmit={handleCreateRestaurant}
            onBack={() => setStage('idle')}
            loading={creatingRestaurant}
          />
        </div>
      )}

      {stage === 'log_meal' && selectedRestaurant && (
        <div className="card card-pad">
          <LogMealForm
            restaurant={selectedRestaurant}
            userId={userId}
            onSaved={handleReset}
            onBack={handleReset}
          />
        </div>
      )}

      {(stage === 'ready_to_scan' || stage === 'uploading') && (
        <div className="fade-in">
          {selectedRestaurant && (
            <div className="card-flat" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, padding: '12px 16px', marginBottom: 16,
            }}>
              <div>
                <div style={{ fontWeight: 600 }}>{selectedRestaurant.name}</div>
                {selectedRestaurant.cuisine_type && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {selectedRestaurant.cuisine_type}
                  </div>
                )}
              </div>
              {stage === 'ready_to_scan' && (
                <button className="ghost sm" onClick={handleReset}>Change</button>
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

      {stage === 'ranking' && <RankingCard />}

      {(stage === 'error' || error) && error && (
        <div className="card fade-in" style={{ backgroundColor: 'var(--red-tint)', boxShadow: 'none', marginTop: 16 }}>
          <div style={{ fontWeight: 600, color: 'var(--red)', marginBottom: 4 }}>Something went wrong</div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 14 }}>{error}</p>
          <button onClick={handleReset}>Try again</button>
        </div>
      )}

      {isResults && (
        <div className="slide-up">
          <DishCards data={result} />
          <div style={{ marginTop: 28, textAlign: 'center' }}>
            <button onClick={handleReset}>Scan another restaurant</button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="container">
      <div className="page-head">
        <h1>
          {username ? `Welcome back, ${username}` : 'MenuLens'}
        </h1>
        <p>Snap a menu, get dishes ranked against your taste profile.</p>
      </div>

      {isResults ? (
        mainColumn
      ) : (
        <div className="layout-main">
          {mainColumn}
          <SideRail pendingCount={pendingVisits.length} />
        </div>
      )}
    </div>
  )
}

export default HomePage
