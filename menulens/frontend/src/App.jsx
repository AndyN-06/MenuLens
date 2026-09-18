import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { apiFetch } from './api'
import { AppContext } from './AppContext'
import AppLayout from './components/AppLayout'
import Login from './components/Login'
import Register from './components/Register'
import Onboarding from './components/Onboarding'
import HomePage from './pages/HomePage'
import DiscoverPage from './pages/DiscoverPage'
import ListPage from './pages/ListPage'
import FriendsPage from './pages/FriendsPage'
import StatsPage from './pages/StatsPage'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'

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

function App() {
  const [stage,    setStage]    = useState('loading')
  const [userId,   setUserId]   = useState(null)
  const [username, setUsername] = useState(null)
  const [isGuest,  setIsGuest]  = useState(false)
  const [guestScans, setGuestScans] = useState({ used: 0, limit: 0 })
  const [pendingVisits, setPendingVisits] = useState([])

  useEffect(() => {
    // Restore session from HTTP-only cookie
    apiFetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.user_id) {
          setUserId(data.user_id)
          setUsername(data.username)
          setIsGuest(!!data.is_guest)
          setGuestScans({ used: data.scans_used ?? 0, limit: data.scan_limit ?? 0 })
          setPendingVisits(loadPendingVisits(data.user_id))
          setStage(data.has_profile ? 'app' : 'onboarding')
        } else {
          setStage('login')
        }
      })
      .catch(() => setStage('login'))
  }, [])

  // ── Auth handlers ────────────────────────────────────────────────────────────
  const handleLogin = ({ user_id, username: name, has_profile, is_guest, scans_used, scan_limit }) => {
    // Clean up any legacy localStorage auth keys
    localStorage.removeItem('menulens_user_id')
    localStorage.removeItem('menulens_username')
    setUserId(user_id)
    setUsername(name)
    setIsGuest(!!is_guest)
    setGuestScans({ used: scans_used ?? 0, limit: scan_limit ?? 0 })
    setPendingVisits(loadPendingVisits(user_id))
    setStage(has_profile ? 'app' : 'onboarding')
  }

  const handleGuestSignIn = async () => {
    const res = await apiFetch('/api/guest', { method: 'POST' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || 'Could not start a guest session')
    }
    handleLogin(await res.json())
  }

  // A guest's pending visits are tied to a throwaway account — drop them so the
  // next visitor on this browser doesn't inherit them.
  const clearSession = (nextStage) => {
    localStorage.removeItem('menulens_user_id')
    localStorage.removeItem('menulens_username')
    if (isGuest) localStorage.removeItem('menulens_pending_visits')
    setUserId(null)
    setUsername(null)
    setIsGuest(false)
    setGuestScans({ used: 0, limit: 0 })
    setPendingVisits([])
    setStage(nextStage)
  }

  const handleLogout = async () => {
    try { await apiFetch('/api/logout', { method: 'POST' }) } catch { /* ignore */ }
    clearSession('login')
  }

  // Guest → sign-up: end the throwaway session and land on the register form.
  const handleUpgrade = async () => {
    try { await apiFetch('/api/logout', { method: 'POST' }) } catch { /* ignore */ }
    clearSession('register')
  }

  const recordScan = () => setGuestScans(s => ({ ...s, used: s.used + 1 }))

  // ── Pending visit handlers ───────────────────────────────────────────────────
  const addPendingVisit = (visit) => {
    setPendingVisits(prev => {
      const updated = [visit, ...prev].slice(0, 20)
      savePendingVisits(updated)
      return updated
    })
  }

  const handleSaveVisit = async (visitData) => {
    try {
      const res = await apiFetch(`/api/visits/${userId}`, {
        method: 'POST',
        body: JSON.stringify(visitData),
      })
      const saved = await res.json()
      setPendingVisits(prev => {
        const updated = prev.filter(v => v.id !== visitData._pendingId)
        savePendingVisits(updated)
        return updated
      })
      return saved
    } catch (err) {
      console.error('Failed to save visit:', err)
    }
  }

  const handleRemovePending = (id) => {
    setPendingVisits(prev => {
      const updated = prev.filter(v => v.id !== id)
      savePendingVisits(updated)
      return updated
    })
  }

  // ── Stage gates ──────────────────────────────────────────────────────────────
  if (stage === 'loading') {
    return (
      <div className="centered-screen">
        <span className="spinner" style={{ width: '1.75rem', height: '1.75rem' }} />
      </div>
    )
  }

  if (stage === 'login') {
    return (
      <Login
        onLogin={handleLogin}
        onRegister={() => setStage('register')}
        onGuest={handleGuestSignIn}
      />
    )
  }

  if (stage === 'register') {
    return (
      <Register
        onLogin={handleLogin}
        onBack={() => setStage('login')}
        onGuest={handleGuestSignIn}
      />
    )
  }

  if (stage === 'onboarding') {
    return <Onboarding userId={userId} onComplete={() => setStage('app')} />
  }

  const ctx = {
    userId,
    username,
    // Guest usernames are internal ids (guest_ab12cd34) — never show them.
    displayName: isGuest ? 'Guest' : username,
    isGuest,
    guestScans,
    recordScan,
    pendingVisits,
    addPendingVisit,
    saveVisit: handleSaveVisit,
    removePending: handleRemovePending,
    logout: handleLogout,
    upgrade: handleUpgrade,
  }

  return (
    <AppContext.Provider value={ctx}>
      <BrowserRouter>
        <Routes>
          <Route
            element={
              <AppLayout
                username={username}
                onLogout={handleLogout}
                pendingCount={pendingVisits.length}
                isGuest={isGuest}
                onUpgrade={handleUpgrade}
              />
            }
          >
            <Route index element={<HomePage />} />
            <Route path="/discover" element={<DiscoverPage />} />
            <Route path="/list"     element={<ListPage />} />
            <Route path="/friends"  element={<FriendsPage />} />
            <Route path="/stats"    element={<StatsPage />} />
            <Route path="/profile"  element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*"         element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppContext.Provider>
  )
}

export default App
