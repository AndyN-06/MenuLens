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
          setStage(data.has_profile ? 'app' : 'onboarding')
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
    setStage(has_profile ? 'app' : 'onboarding')
  }

  const handleLogout = async () => {
    try { await apiFetch('/api/logout', { method: 'POST' }) } catch { /* ignore */ }
    localStorage.removeItem('menulens_user_id')
    localStorage.removeItem('menulens_username')
    setUserId(null)
    setUsername(null)
    setPendingVisits([])
    setStage('login')
  }

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
    return <Login onLogin={handleLogin} onRegister={() => setStage('register')} />
  }

  if (stage === 'register') {
    return <Register onLogin={handleLogin} onBack={() => setStage('login')} />
  }

  if (stage === 'onboarding') {
    return <Onboarding userId={userId} onComplete={() => setStage('app')} />
  }

  const ctx = {
    userId,
    username,
    pendingVisits,
    addPendingVisit,
    saveVisit: handleSaveVisit,
    removePending: handleRemovePending,
    logout: handleLogout,
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
