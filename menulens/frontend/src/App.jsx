import { useState, useEffect, useRef } from 'react'
import Uploader from './components/Uploader'
import DishCards from './components/DishCards'
import Onboarding from './components/Onboarding'
import ProcessingLog from './components/ProcessingLog'
import Login from './components/Login'
import MyMealsPanel from './components/MyMealsPanel'
import DebugPanel from './components/DebugPanel'

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
            position: 'absolute',
            top: '6px',
            right: '10px',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
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

// ── Main App ───────────────────────────────────────────────────────────────────
function App() {
  // stages: loading | login | onboarding | idle | uploading | confirming | done | error
  const [stage, setStage] = useState('loading')
  const [userId, setUserId] = useState(null)
  const [username, setUsername] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [logs, setLogs] = useState([])
  const [pendingVisits, setPendingVisits] = useState([])
  const [activeTab, setActiveTab] = useState('scan')

  const parsedRef = useRef(null)
  const [confirmedName, setConfirmedName] = useState('')
  const [confirmedCuisine, setConfirmedCuisine] = useState('')
  const [ranking, setRanking] = useState(false)

  const [debugOcr, setDebugOcr] = useState('')
  const [debugLlmInput, setDebugLlmInput] = useState('')
  const [debugRecommendation, setDebugRecommendation] = useState('')

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
    setResult(null)
    setError(null)
    setLogs([])
    setActiveTab('scan')
    setStage('login')
  }

  const handleFileUpload = async (file) => {
    setStage('uploading')
    setError(null)
    setResult(null)
    setLogs([])
    parsedRef.current = null
    setDebugOcr('')
    setDebugLlmInput('')
    setDebugRecommendation('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      if (userId) formData.append('user_id', userId)

      const response = await fetch('/api/recommend/stream', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.detail || `Request failed: ${response.statusText}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let gotParsed = false

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

          if (event.type === 'heartbeat') continue
          if (event.type === 'log') {
            setLogs(prev => [...prev, event.message])
          } else if (event.type === 'debug_ocr') {
            setDebugOcr(event.text)
          } else if (event.type === 'debug_llm_input') {
            setDebugLlmInput(event.text)
          } else if (event.type === 'parsed') {
            gotParsed = true
            parsedRef.current = event.data
            setConfirmedName(event.data.restaurant_name || '')
            setConfirmedCuisine(event.data.cuisine_type || '')
            setStage('confirming')
          } else if (event.type === 'error') {
            throw new Error(event.message)
          }
        }
      }

      if (!gotParsed) {
        throw new Error('Stream ended without parsed data — check backend logs')
      }
    } catch (err) {
      setError(err.message)
      setStage('error')
    }
  }

  const handleConfirmRestaurant = async () => {
    if (!parsedRef.current) return
    setRanking(true)

    try {
      const res = await fetch('/api/recommend/rank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dishes: parsedRef.current.dishes,
          restaurant_name: confirmedName,
          cuisine_type: confirmedCuisine,
          user_id: userId,
        }),
      })
      if (!res.ok) throw new Error('Ranking failed')
      const data = await res.json()
      setResult(data)
      setDebugRecommendation(JSON.stringify(data, null, 2))
      setStage('done')

      const visit = {
        id: Date.now().toString(),
        restaurant_name: confirmedName,
        cuisine_type: confirmedCuisine,
        savedAt: Date.now(),
      }
      const updated = [visit, ...pendingVisits].slice(0, 20)
      setPendingVisits(updated)
      savePendingVisits(updated)
    } catch (err) {
      setError(err.message)
      setStage('error')
    } finally {
      setRanking(false)
    }
  }

  const handleReset = () => {
    setStage('idle')
    setResult(null)
    setError(null)
    setLogs([])
    parsedRef.current = null
    setDebugOcr('')
    setDebugLlmInput('')
    setDebugRecommendation('')
  }

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

  if (stage === 'loading') return null

  if (stage === 'login') return <Login onLogin={handleLogin} />

  if (stage === 'onboarding') {
    return <Onboarding userId={userId} onComplete={handleOnboardingComplete} />
  }

  const isProcessing = stage === 'uploading'

  // My Meals tab
  if (activeTab === 'meals') {
    return (
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
    )
  }

  // Profile tab
  if (activeTab === 'profile') {
    return (
      <div className="app-shell">
        <ProfileTab username={username} onLogout={handleLogout} />
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} pendingCount={pendingVisits.length} />
      </div>
    )
  }

  // Scan tab (main flow)
  return (
    <div className="app-shell">
      <div className="screen">
        {/* Header */}
        <div style={{ paddingTop: '0.75rem', marginBottom: '1.5rem' }}>
          <h1 style={{ marginBottom: '0.2rem' }}>MenuLens</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Snap a menu, get your picks
          </p>
        </div>

        {/* Upload zone */}
        <Uploader onFileSelect={handleFileUpload} stage={stage} onReset={handleReset} />

        {/* Error */}
        {error && (
          <div className="card fade-in" style={{
            marginTop: '1rem',
            backgroundColor: 'var(--red-tint)',
            boxShadow: 'none',
          }}>
            <div style={{ fontWeight: 600, color: 'var(--red)', marginBottom: '0.3rem', fontSize: '0.9rem' }}>
              Something went wrong
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>{error}</p>
            <button onClick={handleReset} style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
              Try Again
            </button>
          </div>
        )}

        {/* Processing log */}
        {(isProcessing || (stage !== 'idle' && stage !== 'error' && logs.length > 0)) && (
          <div className="fade-in" style={{ marginTop: '1rem' }}>
            <ProcessingLog logs={logs} running={isProcessing} />
          </div>
        )}

        {/* Confirm restaurant details */}
        {stage === 'confirming' && parsedRef.current && (
          <div className="card fade-in" style={{ marginTop: '1rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>Confirm details</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  Restaurant name
                </label>
                <input
                  type="text"
                  value={confirmedName}
                  onChange={e => setConfirmedName(e.target.value)}
                  placeholder="e.g. Sakura Garden"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  Cuisine type
                </label>
                <input
                  type="text"
                  value={confirmedCuisine}
                  onChange={e => setConfirmedCuisine(e.target.value)}
                  placeholder="e.g. Japanese"
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                {parsedRef.current.dish_count} dishes found
              </span>
              <button
                className="primary"
                onClick={handleConfirmRestaurant}
                disabled={ranking}
                style={{ minWidth: '160px' }}
              >
                {ranking ? 'Scoring…' : 'Get Recommendations'}
              </button>
            </div>
          </div>
        )}

        {/* Results */}
        {stage === 'done' && result && (
          <div className="slide-up" style={{ marginTop: '1rem' }}>
            <DishCards data={result} />
          </div>
        )}

        {/* Debug panel — persists until next upload */}
        <DebugPanel
          ocrText={debugOcr}
          llmInput={debugLlmInput}
          recommendation={debugRecommendation}
        />
      </div>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} pendingCount={pendingVisits.length} />
    </div>
  )
}

export default App
