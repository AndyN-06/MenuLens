/* Menulens — phone frame + screens
   Keeps things compact: one file, plain JSX, no babel-time deps.
   ──────────────────────────────────────────────────────────── */

const ML = {};

// ── Phone bezel ──────────────────────────────────────────────
ML.Phone = function Phone({ children, time = '9:41', dark = false }) {
  return (
    <div className="phone-bezel-shell" style={{
      width: 360, height: 740, borderRadius: 44,
      position: 'relative', overflow: 'hidden',
      background: '#000',
      padding: 8,
      boxShadow: '0 32px 64px rgba(40, 36, 26, 0.18), 0 8px 20px rgba(40,36,26,0.08), 0 0 0 1px rgba(0,0,0,0.4)',
    }}>
      {/* inner screen */}
      <div style={{
        width: '100%', height: '100%', borderRadius: 36,
        overflow: 'hidden', position: 'relative',
        background: dark ? '#000' : '#f7f6f4',
      }}>
        {/* status bar */}
        <div className="phone-statusbar" style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: 44, padding: '12px 24px 0', zIndex: 30,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontFamily: '-apple-system, "SF Pro", system-ui',
          color: dark ? '#fff' : '#000',
          pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{time}</span>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            {/* signal */}
            <svg width="16" height="10" viewBox="0 0 16 10">
              <rect x="0" y="6" width="2.6" height="4" rx="0.5" fill={dark ? '#fff' : '#000'}/>
              <rect x="3.8" y="4" width="2.6" height="6" rx="0.5" fill={dark ? '#fff' : '#000'}/>
              <rect x="7.6" y="2" width="2.6" height="8" rx="0.5" fill={dark ? '#fff' : '#000'}/>
              <rect x="11.4" y="0" width="2.6" height="10" rx="0.5" fill={dark ? '#fff' : '#000'}/>
            </svg>
            {/* wifi */}
            <svg width="14" height="10" viewBox="0 0 14 10">
              <path d="M7 2.6c1.9 0 3.6.7 4.9 1.9l.9-.9C11.3 2.2 9.2 1.2 7 1.2 4.8 1.2 2.7 2.2 1.2 3.6l.9.9C3.4 3.3 5.1 2.6 7 2.6Z" fill={dark ? '#fff' : '#000'}/>
              <path d="M7 5.5c1.1 0 2.1.4 2.9 1.1l.9-.9C9.7 4.7 8.4 4.1 7 4.1c-1.4 0-2.7.6-3.8 1.6l.9.9C4.9 5.9 5.9 5.5 7 5.5Z" fill={dark ? '#fff' : '#000'}/>
              <circle cx="7" cy="8.5" r="1.2" fill={dark ? '#fff' : '#000'}/>
            </svg>
            {/* battery */}
            <svg width="22" height="11" viewBox="0 0 22 11">
              <rect x="0.5" y="0.5" width="19" height="10" rx="2.5" stroke={dark ? '#fff' : '#000'} strokeOpacity="0.4" fill="none"/>
              <rect x="2" y="2" width="16" height="7" rx="1.5" fill={dark ? '#fff' : '#000'}/>
              <path d="M21 3.5v4c.6-.2 1-.8 1-1.5v-1c0-.7-.4-1.3-1-1.5Z" fill={dark ? '#fff' : '#000'} fillOpacity="0.5"/>
            </svg>
          </div>
        </div>

        {/* dynamic island */}
        <div className="phone-island" style={{
          position: 'absolute', top: 9, left: '50%', transform: 'translateX(-50%)',
          width: 110, height: 30, borderRadius: 20,
          background: '#000', zIndex: 40,
        }} />

        {/* content */}
        <div className="phone-content" style={{ width: '100%', height: '100%', paddingTop: 44, paddingBottom: 22 }}>
          {children}
        </div>

        {/* home indicator */}
        <div className="phone-home" style={{
          position: 'absolute', bottom: 6, left: 0, right: 0,
          display: 'flex', justifyContent: 'center', zIndex: 50,
          pointerEvents: 'none',
        }}>
          <div style={{
            width: 110, height: 4.5, borderRadius: 100,
            background: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.3)',
          }} />
        </div>
      </div>
    </div>
  );
};

// ── Icons ────────────────────────────────────────────────────
const I = {};
I.Scan = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);
I.List = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
    <rect x="9" y="3" width="6" height="4" rx="1"/>
    <line x1="9" y1="12" x2="15" y2="12"/>
    <line x1="9" y1="16" x2="13" y2="16"/>
  </svg>
);
I.Profile = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);
I.Friends = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
I.UserPlus = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="8.5" cy="7" r="4"/>
    <line x1="20" y1="8" x2="20" y2="14"/>
    <line x1="23" y1="11" x2="17" y2="11"/>
  </svg>
);
I.Check = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" {...p}>
    <polyline points="5 12 10 17 19 7"/>
  </svg>
);
I.X = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" {...p}>
    <line x1="6" y1="6" x2="18" y2="18"/>
    <line x1="18" y1="6" x2="6" y2="18"/>
  </svg>
);
I.Search = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" {...p}>
    <circle cx="11" cy="11" r="7"/>
    <path d="M21 21l-4.3-4.3"/>
  </svg>
);
I.Camera = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
);
I.Image = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="3" y="3" width="18" height="18" rx="3"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
);
I.Logo = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="12" cy="12" r="3"/>
    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
  </svg>
);
I.Chevron = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

ML.I = I;

// ── Bottom nav ───────────────────────────────────────────────
ML.BottomNav = function BottomNav({ active, pendingDot }) {
  return (
    <div className="bottom-nav">
      <button className={`nav-item${active === 'scan' ? ' active' : ''}`}>
        <I.Scan width="22" height="22"/>Scan
      </button>
      <button className={`nav-item${active === 'meals' ? ' active' : ''}`}>
        <I.List width="22" height="22"/>My List
        {pendingDot && <span className="dot"/>}
      </button>
      <button className={`nav-item${active === 'friends' ? ' active' : ''}`}>
        <I.Friends width="22" height="22"/>Friends
      </button>
      <button className={`nav-item${active === 'profile' ? ' active' : ''}`}>
        <I.Profile width="22" height="22"/>Profile
      </button>
    </div>
  );
};

window.ML = ML;
