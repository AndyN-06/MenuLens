import { useState, useEffect } from 'react'
import { apiFetch } from '../api'
import { useApp } from '../AppContext'
import { IconLogout } from '../components/icons'

const CUISINE_OPTIONS = [
  'Thai', 'Japanese', 'Italian', 'Mexican', 'Indian', 'French',
  'Korean', 'Mediterranean', 'American', 'Chinese', 'Middle Eastern', 'Vietnamese',
]

function Switch({ on, onChange }) {
  return (
    <button
      className={`switch${on ? ' on' : ''}`}
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
    />
  )
}

function SettingRow({ title, desc, children }) {
  return (
    <div className="setting-row">
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{title}</div>
        {desc && <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>{desc}</p>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  )
}

function SettingsPage() {
  const { userId, displayName, logout, isGuest, upgrade } = useApp()

  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dietary, setDietary] = useState('')
  const [cuisines, setCuisines] = useState(new Set())
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(null)
  const [recomputing, setRecomputing] = useState(false)

  // Local-only preferences — no backend fields for these yet.
  const [prefs, setPrefs] = useState(() => {
    try {
      return { ...{
        emailDigest: true,
        newMenuAlerts: false,
        friendActivity: true,
        hideSkips: false,
        compactCards: false,
      }, ...JSON.parse(localStorage.getItem('menulens_prefs') || '{}') }
    } catch {
      return { emailDigest: true, newMenuAlerts: false, friendActivity: true, hideSkips: false, compactCards: false }
    }
  })

  const setPref = (key, value) => {
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    try { localStorage.setItem('menulens_prefs', JSON.stringify(next)) } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    apiFetch(`/api/profile/${userId}`)
      .then(r => r.ok ? r.json() : null)
      .catch(() => null)
      .then(p => {
        setProfile(p)
        setDietary((p?.dietary_restrictions || []).join(', '))
        setCuisines(new Set(Object.keys(p?.cuisine_affinities || {})))
        setLoading(false)
      })
  }, [userId])

  const toggleCuisine = (name) => {
    setCuisines(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    setSavedMsg(null)
    try {
      const restrictions = dietary.split(',').map(s => s.trim()).filter(Boolean)

      // Merge semantics on the backend: send every known cuisine so deselecting
      // one zeroes its affinity rather than leaving the old value behind.
      const affinities = {}
      const known = new Set([...CUISINE_OPTIONS, ...Object.keys(profile?.cuisine_affinities || {})])
      for (const c of known) {
        affinities[c] = cuisines.has(c)
          ? (profile?.cuisine_affinities?.[c] ?? 0.7)
          : 0
      }

      const res = await apiFetch(`/api/profile/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ dietary_restrictions: restrictions, cuisine_affinities: affinities }),
      })
      if (!res.ok) throw new Error('Could not save preferences')
      const updated = await res.json()
      setProfile(updated)
      setSavedMsg('Preferences saved.')
    } catch (err) {
      setSavedMsg(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleRecompute = async () => {
    setRecomputing(true)
    setSavedMsg(null)
    try {
      const res = await apiFetch(`/api/profile/${userId}/recompute`, { method: 'POST' })
      if (!res.ok) throw new Error('Recompute failed')
      const updated = await res.json()
      setProfile(updated)
      setDietary((updated?.dietary_restrictions || []).join(', '))
      setCuisines(new Set(Object.keys(updated?.cuisine_affinities || {}).filter(
        k => (updated.cuisine_affinities[k] || 0) > 0
      )))
      setSavedMsg('Profile recomputed from your visit history.')
    } catch (err) {
      setSavedMsg(err.message)
    } finally {
      setRecomputing(false)
    }
  }

  if (loading) {
    return <div className="container-narrow"><div className="empty-state"><span className="spinner" /></div></div>
  }

  return (
    <div className="container-narrow fade-in">
      <div className="page-head">
        <h1>Settings</h1>
        <p>Account, taste preferences, and how MenuLens behaves.</p>
      </div>

      {isGuest && (
        <div className="card card-pad" style={{ marginBottom: 20, borderLeft: '3px solid var(--amber)' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>This is a guest account</div>
          <p className="text-sm text-muted" style={{ marginBottom: 14 }}>
            Changes here apply to a throwaway account that is deleted after 7 days. Create a free
            account to keep your preferences and history.
          </p>
          <button className="primary sm" onClick={upgrade}>Create an account</button>
        </div>
      )}

      {/* Account */}
      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div className="section-label">Account</div>
        <SettingRow
          title="Username"
          desc={isGuest ? 'Guests are assigned a temporary name.' : 'How you appear across MenuLens.'}
        >
          <span style={{ fontWeight: 600 }}>{displayName}</span>
        </SettingRow>
        <SettingRow title="Password" desc="Change it from your account provider.">
          <button className="sm" disabled>Change</button>
        </SettingRow>
      </div>

      {/* Taste preferences — wired to the profile API */}
      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <div className="section-label" style={{ marginBottom: 0 }}>Taste preferences</div>
          <span className="text-xs text-dim">Saved to your profile</span>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div className="field-label">Cuisines you enjoy</div>
          <div className="chip-row">
            {CUISINE_OPTIONS.map(c => (
              <button
                key={c}
                className={`chip${cuisines.has(c) ? ' active' : ''}`}
                onClick={() => toggleCuisine(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div className="field-label">Dietary restrictions</div>
          <input
            value={dietary}
            onChange={e => setDietary(e.target.value)}
            placeholder="e.g. vegetarian, no shellfish, gluten-free"
          />
          <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 6 }}>
            Separate multiple items with commas.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save preferences'}
          </button>
          <button onClick={handleRecompute} disabled={recomputing}>
            {recomputing ? 'Recomputing…' : 'Recompute from history'}
          </button>
          {savedMsg && (
            <span style={{ fontSize: '0.85rem', color: 'var(--green)' }}>{savedMsg}</span>
          )}
        </div>
      </div>

      {/* Notifications — local only */}
      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <div className="section-label" style={{ marginBottom: 0 }}>Notifications</div>
          <span className="preview-tag">Not delivered yet</span>
        </div>
        <SettingRow title="Weekly digest" desc="A summary of what you rated and what to try next.">
          <Switch on={prefs.emailDigest} onChange={v => setPref('emailDigest', v)} />
        </SettingRow>
        <SettingRow title="New menu alerts" desc="When a restaurant you follow uploads a new menu.">
          <Switch on={prefs.newMenuAlerts} onChange={v => setPref('newMenuAlerts', v)} />
        </SettingRow>
        <SettingRow title="Friend activity" desc="When someone you follow rates a dish.">
          <Switch on={prefs.friendActivity} onChange={v => setPref('friendActivity', v)} />
        </SettingRow>
      </div>

      {/* Appearance — local only */}
      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <div className="section-label" style={{ marginBottom: 0 }}>Display</div>
          <span className="preview-tag">Preview</span>
        </div>
        <SettingRow title="Hide low matches" desc="Collapse the Others section on results by default.">
          <Switch on={prefs.hideSkips} onChange={v => setPref('hideSkips', v)} />
        </SettingRow>
        <SettingRow title="Compact dish cards" desc="Tighter spacing on long menus.">
          <Switch on={prefs.compactCards} onChange={v => setPref('compactCards', v)} />
        </SettingRow>
      </div>

      {/* Data */}
      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div className="section-label">Your data</div>
        <SettingRow title="Export visit history" desc="Download every visit and rating as JSON.">
          <button className="sm" disabled>Export</button>
        </SettingRow>
        {isGuest ? (
          <SettingRow title="Guest data" desc="This account and its sample data are removed automatically after 7 days.">
            <span className="badge badge-muted">Auto-deleted</span>
          </SettingRow>
        ) : (
          <SettingRow title="Delete account" desc="Permanently remove your profile and history.">
            <button className="sm" disabled style={{ color: 'var(--red)' }}>Delete</button>
          </SettingRow>
        )}
      </div>

      <button
        onClick={logout}
        className="block"
        style={{ color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        <IconLogout size={16} /> {isGuest ? 'End guest session' : 'Log out'}
      </button>
    </div>
  )
}

export default SettingsPage
