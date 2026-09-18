import { useState, useEffect, useRef } from 'react'
import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom'
import {
  IconScan, IconCompass, IconList, IconFriends, IconChart,
  IconProfile, IconSettings, IconLogout, IconChevronDown,
} from './icons'

const NAV_ITEMS = [
  { to: '/',         label: 'Home',     Icon: IconScan,    end: true },
  { to: '/discover', label: 'Discover', Icon: IconCompass },
  { to: '/list',     label: 'My List',  Icon: IconList, badge: true },
  { to: '/friends',  label: 'Friends',  Icon: IconFriends },
  { to: '/stats',    label: 'Stats',    Icon: IconChart },
]

function AvatarMenu({ username, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const go = (path) => { setOpen(false); navigate(path) }

  return (
    <div className="avatar-wrap" ref={ref}>
      <button className="avatar-btn" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className="avatar">{username?.[0]?.toUpperCase() || '?'}</span>
        <span className="avatar-name">{username}</span>
        <IconChevronDown size={14} />
      </button>

      {open && (
        <div className="menu-popover" role="menu">
          <div className="menu-header">
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{username}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>MenuLens member</div>
          </div>
          <button className="menu-item" onClick={() => go('/profile')}>
            <IconProfile /> Profile
          </button>
          <button className="menu-item" onClick={() => go('/settings')}>
            <IconSettings /> Settings
          </button>
          <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
          <button className="menu-item danger" onClick={() => { setOpen(false); onLogout() }}>
            <IconLogout /> Log out
          </button>
        </div>
      )}
    </div>
  )
}

function AppLayout({ username, onLogout, pendingCount = 0 }) {
  return (
    <>
      <header className="site-header">
        <div className="container site-header-inner">
          <Link to="/" className="brand">
            <span className="brand-mark"><IconScan /></span>
            MenuLens
          </Link>

          <nav className="main-nav">
            {NAV_ITEMS.map(({ to, label, Icon, end, badge }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              >
                <Icon />
                {label}
                {badge && pendingCount > 0 && <span className="nav-dot" />}
              </NavLink>
            ))}
          </nav>

          <AvatarMenu username={username} onLogout={onLogout} />
        </div>
      </header>

      <main className="page">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container site-footer-inner">
          <span>MenuLens — personalized menu recommendations</span>
          <span style={{ display: 'flex', gap: 18 }}>
            <Link to="/discover">Discover</Link>
            <Link to="/stats">Stats</Link>
            <Link to="/settings">Settings</Link>
          </span>
        </div>
      </footer>
    </>
  )
}

export default AppLayout
