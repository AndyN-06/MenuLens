import { useState, useEffect } from 'react'
import Uploader from './components/Uploader'
import DishCards from './components/DishCards'
import Onboarding from './components/Onboarding'
import Login from './components/Login'
import MyMealsPanel from './components/MyMealsPanel'
import RestaurantSearch from './components/RestaurantSearch'
import NewRestaurantForm from './components/NewRestaurantForm'
import LogMealForm from './components/LogMealForm'
import PhoneFrame from './components/PhoneFrame'

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000

function loadPendingVisits() {
  try {
    const raw = localStorage.getItem('menulens_pending_visits')
    if (!raw) return []
    const visits = JSON.parse(raw)
    const now = Date.now()
    return visits.filter(v => now - v.savedAt < SEVEN_DAYS)
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
        className={`nav-item${activeTab === 'profile' ? ' active' : ''}`}
        onClick={() => onTabChange('profile')}
      >
        <IconProfile />
        Profile
      </button>
    </nav>
  )
}

// ── Profile tab ────────────────────────────────────────────────────────────────
function ProfileTab({ username, onLogout }) {
  return (
    <div className="screen fade-in">
      <div style={{ paddingTop: '1rem', marginBottom: '2rem' }}>
        <h1 style={{ marginBottom: '0.25rem' }}>Profile</h1>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '50%',
            backgroundColor: 'var(--green-tint)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.25rem', fontWeight: 700, color: 'var(--green)',
          }}>
            {username?.[0]?.toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '1rem' }}>{username}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>MenuLens member</div>
          </div>
        </div>
      </div>

      <button
        onClick={onLogout}
        style={{ width: '100%', color: 'var(--red)', borderColor: 'var(--border)' }}
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
        <button
          onClick={onLogMeal}
          style={{ flex: 1, fontSize: '0.85rem', padding: '0.55rem' }}
        >
          Log a meal
        </button>
        <button
          onClick={onChangeRestaurant}
          style={{ flex: 1, fontSize: '0.85rem', padding: '0.55rem' }}
        >
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
      {/* Restaurant info */}
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
            <span style={{
              fontSize: '0.65rem', fontWeight: 600,
              background: 'var(--green-tint)', color: 'var(--green)',
              padding: '0.2rem 0.55rem', borderRadius: '99px',
            }}>
              Verified
            </span>
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

      {/* Primary CTA */}
      <button
        className="primary"
        onClick={onUseExisting}
        style={{ width: '100%', marginBottom: '0.625rem' }}
      >
        Get Recommendations
      </button>

      {/* Secondary actions */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <button
          onClick={onLogMeal}
          style={{ flex: 1, fontSize: '0.85rem', padding: '0.55rem' }}
        >
          Log a meal
        </button>
        <button
          onClick={onScanNew}
          style={{ flex: 1, fontSize: '0.85rem', padding: '0.55rem' }}
        >
          Scan new menu
        </button>
      </div>
      <button
        onClick={onChangeRestaurant}
        style={{ width: '100%', fontSize: '0.85rem', padding: '0.55rem' }}
      >
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
  // stages: loading | login | onboarding | idle | new_restaurant |
  //         log_meal | ready_to_scan | uploading | ranking | done | error
  const [stage,      setStage]      = useState('loading')
  const [userId,     setUserId]     = useState(null)
  const [username,   setUsername]   = useState(null)
  const [activeTab,  setActiveTab]  = useState('scan')

  // Restaurant selection
  const [selectedRestaurant,  setSelectedRestaurant]  = useState(null)
  const [newRestaurantName,   setNewRestaurantName]   = useState('')
  const [creatingRestaurant,  setCreatingRestaurant]  = useState(false)

  // Results
  const [result,       setResult]       = useState(null)
  const [error,        setError]        = useState(null)
  const [pendingVisits, setPendingVisits] = useState([])

  useEffect(() => {
    const storedId   = localStorage.getItem('menulens_user_id')
    const storedName = localStorage.getItem('menulens_username')
    if (storedId && storedName) {
      setUserId(storedId)
      setUsername(storedName)
      setStage('idle')
    } else {
      setStage('login')
    }
    setPendingVisits(loadPendingVisits())
  }, [])

  // ── Auth handlers ────────────────────────────────────────────────────────────
  const handleLogin = ({ user_id, username: name, has_profile }) => {
    localStorage.setItem('menulens_user_id', user_id)
    localStorage.setItem('menulens_username', name)
    setUserId(user_id)
    setUsername(name)
    setStage(has_profile ? 'idle' : 'onboarding')
  }

  const handleOnboardingComplete = () => setStage('idle')

  const handleLogout = () => {
    localStorage.removeItem('menulens_user_id')
    localStorage.removeItem('menulens_username')
    setUserId(null)
    setUsername(null)
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
    // Always stay on idle — NoMenuCard or ExistingMenuCard renders based on has_menu
  }

  const handleInitNewRestaurant = (name) => {
    setNewRestaurantName(name)
    setStage('new_restaurant')
  }

  const handleCreateRestaurant = async ({ name, cuisine_type, city }, intent = 'scan') => {
    setCreatingRestaurant(true)
    try {
      const res = await fetch('/api/restaurants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const menuRes = await fetch(`/api/restaurants/${selectedRestaurant.id}/menu`)
      if (!menuRes.ok) throw new Error('Could not load saved menu')
      const menuData = await menuRes.json()

      const rankRes = await fetch('/api/recommend/rank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      // Record visit locally
      const visit = {
        id: Date.now().toString(),
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

  const handleScanNewMenu = () => {
    setStage('ready_to_scan')
  }

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

      const response = await fetch('/api/recommend/stream', {
        method: 'POST',
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

      // Rank immediately using the already-confirmed restaurant name/cuisine
      setStage('ranking')
      const restaurantName = selectedRestaurant?.name    || parsedData.restaurant_name || ''
      const cuisineType    = selectedRestaurant?.cuisine_type || parsedData.cuisine_type    || ''

      const rankRes = await fetch('/api/recommend/rank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  // ── Visit handlers (My Meals tab) ─────────────────────────────────────────────
  const handleSaveVisit = async (visitData) => {
    try {
      const res = await fetch(`/api/visits/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
  if (stage === 'login')   return <PhoneFrame><Login onLogin={handleLogin} /></PhoneFrame>
  if (stage === 'onboarding') {
    return <PhoneFrame><Onboarding userId={userId} onComplete={handleOnboardingComplete} /></PhoneFrame>
  }

  // My Meals tab
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

  // Profile tab
  if (activeTab === 'profile') {
    return (
      <PhoneFrame>
        <div className="app-shell">
          <ProfileTab username={username} onLogout={handleLogout} />
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
          <div style={{ paddingTop: '0.75rem', marginBottom: '1.5rem' }}>
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

              {/* Recommendations — shown when no restaurant selected */}
              {!selectedRestaurant && (
                <div style={{ marginTop: '1.5rem' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                    Recommended for you
                  </p>
                  {[
                    { dish: 'Truffle Wagyu Smash Burger', restaurant: 'Shake Shack', score: 9.4 },
                    { dish: 'Spicy Tuna Crispy Rice', restaurant: 'Nobu', score: 9.1 },
                    { dish: 'Double Double Animal Style', restaurant: 'In-N-Out Burger', score: 8.8 },
                  ].map(({ dish, restaurant, score }) => (
                    <div key={dish} className="card" style={{ marginBottom: '0.625rem', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dish}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{restaurant}</div>
                      </div>
                      <div style={{ flexShrink: 0, fontWeight: 700, fontSize: '1rem', color: 'var(--green)' }}>{score}</div>
                    </div>
                  ))}
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

          {/* ── Stage: ready_to_scan / uploading — file picker ── */}
          {(stage === 'ready_to_scan' || stage === 'uploading') && (
            <div className="fade-in">
              {/* Restaurant context banner */}
              {selectedRestaurant && (
                <div style={{
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '1rem',
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

          {/* ── Stage: ranking — fetching existing menu recs ── */}
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
