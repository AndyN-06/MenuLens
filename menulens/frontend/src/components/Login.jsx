import { useState } from 'react'
import { apiUrl } from '../api'

function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const name = username.trim()
    if (!name) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(apiUrl('/api/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || 'Login failed')
      }
      const data = await res.json()
      onLogin(data)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'var(--bg)',
      padding: '1.5rem',
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        {/* Logo mark */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{
            width: '56px', height: '56px',
            borderRadius: '16px',
            backgroundColor: 'var(--green)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1rem',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
            </svg>
          </div>
          <h1 style={{ marginBottom: '0.3rem' }}>MenuLens</h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Personalized menu recommendations
          </p>
        </div>

        <div className="card" style={{ padding: '2rem' }}>
          <h2 style={{ marginBottom: '0.3rem' }}>Welcome</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            Enter a username to get started. New users will set up a quick taste profile.
          </p>

          <form onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Your username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              disabled={loading}
              style={{ marginBottom: error ? '0.5rem' : '1rem' }}
            />

            {error && (
              <p style={{ fontSize: '0.8rem', color: 'var(--red)', marginBottom: '1rem' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              className="primary"
              disabled={loading || !username.trim()}
              style={{ width: '100%' }}
            >
              {loading ? 'Loading…' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Login
