import { useState } from 'react'
import { IconFriends, IconStar, IconPlus, IconMapPin } from '../components/icons'

// Static preview content — friends are not wired to the backend yet.
const FEED = [
  {
    who: 'Maya R.', initial: 'M', when: '2h ago',
    action: 'rated', dish: 'Spicy Rigatoni Vodka', restaurant: 'Carbone',
    rating: 9.4, note: 'Worth the hype. Ask for extra chili.',
  },
  {
    who: 'Dev P.', initial: 'D', when: '5h ago',
    action: 'scanned', restaurant: 'Ippudo', dishes: 63,
  },
  {
    who: 'Sam K.', initial: 'S', when: 'Yesterday',
    action: 'rated', dish: 'Crispy Rice Spicy Tuna', restaurant: 'Nobu',
    rating: 8.8, note: 'Better than the Malibu location.',
  },
  {
    who: 'Ana L.', initial: 'A', when: '2d ago',
    action: 'rated', dish: 'Birria Tacos', restaurant: 'La Esquina',
    rating: 9.0,
  },
  {
    who: 'Maya R.', initial: 'M', when: '3d ago',
    action: 'scanned', restaurant: 'Via Carota', dishes: 54,
  },
]

const SUGGESTIONS = [
  { who: 'Jordan T.', initial: 'J', overlap: '82% taste overlap', mutual: '4 mutual' },
  { who: 'Priya S.',  initial: 'P', overlap: '76% taste overlap', mutual: '2 mutual' },
  { who: 'Leo M.',    initial: 'L', overlap: '71% taste overlap', mutual: '6 mutual' },
]

function Avatar({ initial, size = 38 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'var(--green-tint)', color: 'var(--green)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.38,
    }}>
      {initial}
    </div>
  )
}

function FeedItem({ item }) {
  return (
    <div className="card" style={{ display: 'flex', gap: 14 }}>
      <Avatar initial={item.initial} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{item.who}</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {item.action === 'rated'
              ? <>rated a dish at <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{item.restaurant}</strong></>
              : <>scanned the menu at <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{item.restaurant}</strong></>}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginLeft: 'auto' }}>{item.when}</span>
        </div>

        {item.action === 'rated' ? (
          <div style={{
            marginTop: 10, padding: '10px 12px',
            background: 'var(--surface-2)', borderRadius: 'var(--radius)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{item.dish}</div>
              {item.note && (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>{item.note}</p>
              )}
            </div>
            <div style={{
              flexShrink: 0, background: 'var(--green-tint)', color: 'var(--green)',
              borderRadius: 8, padding: '5px 10px', textAlign: 'center',
            }}>
              <div className="tnum" style={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1 }}>{item.rating}</div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: 2 }}>/10</div>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconMapPin size={13} /> {item.dishes} dishes parsed
          </div>
        )}
      </div>
    </div>
  )
}

function FriendsPage() {
  const [invite, setInvite] = useState('')
  const [invited, setInvited] = useState([])
  const [added, setAdded] = useState([])

  const handleInvite = (e) => {
    e.preventDefault()
    const v = invite.trim()
    if (!v) return
    setInvited(prev => [...prev, v])
    setInvite('')
  }

  return (
    <div className="container">
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1>Friends</h1>
          <p>See what people you trust are ordering, and share your own picks.</p>
        </div>
        <span className="preview-tag">Preview — not connected yet</span>
      </div>

      <div className="layout-main">
        {/* Activity feed */}
        <section>
          <div className="panel-head">
            <h2>Activity</h2>
            <span className="text-sm text-dim">Last 7 days</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {FEED.map((item, i) => <FeedItem key={i} item={item} />)}
          </div>
          <div className="card empty-state" style={{ marginTop: 16, padding: '1.75rem' }}>
            <p className="text-sm">
              This feed is sample data. Once friends are connected, real ratings from people you
              follow will show up here.
            </p>
          </div>
        </section>

        {/* Rail */}
        <aside className="rail">
          <div className="card">
            <div className="section-label">Invite a friend</div>
            <form onSubmit={handleInvite}>
              <input
                value={invite}
                onChange={e => setInvite(e.target.value)}
                placeholder="Username or email"
                style={{ marginBottom: 10 }}
              />
              <button type="submit" className="primary block sm" disabled={!invite.trim()}>
                Send invite
              </button>
            </form>
            {invited.length > 0 && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 10 }}>
                Queued locally: {invited.join(', ')} — invites are not delivered yet.
              </p>
            )}
          </div>

          <div className="card">
            <div className="section-label">People you may know</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {SUGGESTIONS.map(s => {
                const isAdded = added.includes(s.who)
                return (
                  <div key={s.who} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <Avatar initial={s.initial} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{s.who}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {s.overlap} · {s.mutual}
                      </div>
                    </div>
                    <button
                      className="sm"
                      onClick={() => setAdded(a => isAdded ? a.filter(x => x !== s.who) : [...a, s.who])}
                      style={{ flexShrink: 0, padding: '0.35rem 0.6rem' }}
                    >
                      {isAdded ? 'Pending' : <IconPlus size={14} />}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <IconStar size={16} />
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Top rated this week</span>
            </div>
            {[
              ['Spicy Rigatoni', 'Carbone', 9.4],
              ['Birria Tacos', 'La Esquina', 9.0],
              ['Crispy Rice', 'Nobu', 8.8],
            ].map(([dish, spot, score], i) => (
              <div key={dish} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                borderBottom: i < 2 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{dish}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{spot}</div>
                </div>
                <span className="tnum badge badge-green">{score}</span>
              </div>
            ))}
          </div>

          <div className="card empty-state" style={{ padding: '1.5rem' }}>
            <div className="empty-state-glyph"><IconFriends size={20} /></div>
            <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Groups</div>
            <p className="text-sm">Shared lists for a trip or a friend group. Coming later.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default FriendsPage
