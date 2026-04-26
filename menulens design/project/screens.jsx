/* Menulens — all screens (left side: app shell content)
   Each export is a single screen body that renders inside <Phone>.
   ──────────────────────────────────────────────────────────── */

const Screens = {};
const { I, BottomNav } = ML;

// 01 ── Login ─────────────────────────────────────────────────
Screens.Login = function Login() {
  return (
    <div className="app-screen" style={{
      justifyContent: 'center', alignItems: 'center', padding: '0 24px',
    }}>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: 'var(--green)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16,
        }}>
          <I.Logo width="28" height="28"/>
        </div>
        <h1 style={{ marginBottom: 4 }}>MenuLens</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 36 }}>
          Personalized menu recommendations
        </p>

        <div className="card" style={{ width: '100%', padding: '1.75rem 1.5rem' }}>
          <h2 style={{ marginBottom: 4 }}>Welcome</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.5 }}>
            Enter a username to get started. New users will set up a quick taste profile.
          </p>
          <input className="input" placeholder="Your username" defaultValue="alex" style={{ marginBottom: 14 }}/>
          <button className="btn primary block">Continue</button>
        </div>
      </div>
    </div>
  );
};

// 02 ── Onboarding step 1 ─────────────────────────────────────
const CUISINES = [
  { name: 'Thai', flag: '🇹🇭' }, { name: 'Japanese', flag: '🇯🇵' },
  { name: 'Italian', flag: '🇮🇹' }, { name: 'Mexican', flag: '🇲🇽' },
  { name: 'Indian', flag: '🇮🇳' }, { name: 'French', flag: '🇫🇷' },
  { name: 'Korean', flag: '🇰🇷' }, { name: 'Mediterranean', flag: '🫒' },
  { name: 'American', flag: '🇺🇸' }, { name: 'Chinese', flag: '🇨🇳' },
  { name: 'Middle Eastern', flag: '🌙' }, { name: 'Vietnamese', flag: '🇻🇳' },
];

Screens.Onboarding1 = function Onboarding1() {
  const selected = new Set(['Thai', 'Japanese', 'Italian', 'Korean']);
  return (
    <div className="app-screen">
      <div className="screen-body" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '12px 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, marginBottom: 2 }}>MenuLens</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Build your taste profile</p>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Step 1 of 2</span>
              <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>50%</span>
            </div>
            <div className="progress-track"><div className="progress-fill" style={{ width: '50%' }}/></div>
          </div>

          <h2 style={{ fontSize: 18, marginBottom: 4 }}>Which cuisines do you enjoy?</h2>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
            Select all that apply — this seeds your taste profile.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {CUISINES.map(({ name, flag }) => {
              const active = selected.has(name);
              return (
                <div key={name} style={{
                  padding: '10px 4px', textAlign: 'center',
                  borderRadius: 10,
                  border: `1.5px solid ${active ? 'var(--green)' : 'var(--border)'}`,
                  background: active ? 'var(--green-tint)' : 'var(--surface)',
                  color: active ? 'var(--green)' : 'var(--text)',
                  fontSize: 11, fontWeight: active ? 600 : 400,
                }}>
                  <div style={{ fontSize: 18, marginBottom: 2 }}>{flag}</div>
                  {name}
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn primary">Next →</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// 03 ── Onboarding step 2 ─────────────────────────────────────
Screens.Onboarding2 = function Onboarding2() {
  return (
    <div className="app-screen">
      <div className="screen-body" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '12px 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, marginBottom: 2 }}>MenuLens</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Build your taste profile</p>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Step 2 of 2</span>
              <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>100%</span>
            </div>
            <div className="progress-track"><div className="progress-fill" style={{ width: '100%' }}/></div>
          </div>

          <h2 style={{ fontSize: 18, marginBottom: 4 }}>Any dietary restrictions?</h2>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
            Optional — we'll filter recommendations accordingly.
          </p>

          <input className="input focused" defaultValue="no shellfish, gluten-free"/>
          <p style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 6 }}>
            Separate multiple items with commas, or leave blank.
          </p>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
            <button className="btn ghost" style={{ padding: 0 }}>← Back</button>
            <button className="btn primary">Get started →</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// 05 ── Scan idle (search + recs) ─────────────────────────────
Screens.ScanIdle = function ScanIdle() {
  const Pill = ({ cls, label }) => <span className={`badge ${cls}`}>{label}</span>;

  const Thumb = ({ has }) => (
    <div className="rec-thumb" data-has-img={has ? 'true' : 'false'}>
      {has ? (
        <div className="rec-thumb-photo"/>
      ) : (
        <div className="rec-thumb-empty" aria-hidden="true">
          <I.Image width="14" height="14"/>
        </div>
      )}
    </div>
  );

  const RecRow = ({ dish, restaurant, cuisine, score, level, popular, img }) => (
    <div style={{
      background: 'var(--surface)', borderRadius: 10,
      padding: 12, marginBottom: 8,
      boxShadow: 'var(--shadow-sm)',
      borderLeft: level === 'great' ? '3px solid var(--green)' : '3px solid transparent',
      display: 'flex', gap: 10,
    }}>
      <Thumb has={img}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 3 }}>
              <span style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.25 }}>{dish}</span>
              {level === 'great' && <Pill cls="badge-green" label="Great match"/>}
              {level === 'good'  && <Pill cls="badge-teal"  label="Good match"/>}
              {popular && <Pill cls="badge-amber" label="Popular"/>}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{restaurant}</span>
              <span style={{ color: 'var(--text-dim)', margin: '0 5px' }}>·</span>
              <span>{cuisine}</span>
            </div>
          </div>
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <div style={{
              fontSize: 14, fontWeight: 700,
              color: score >= 85 ? 'var(--green)' : 'var(--teal)',
              lineHeight: 1, fontFeatureSettings: "'tnum'",
            }}>
              {score}%
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2, letterSpacing: '0.04em' }}>
              predicted
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const SectionHead = ({ title, color, count }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      marginBottom: 10, paddingBottom: 6,
      borderBottom: '1px solid var(--border)', marginTop: 18,
    }}>
      {color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }}/>}
      <span className="section-label" style={{ marginBottom: 0 }}>{title}</span>
      <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>{count}</span>
    </div>
  );

  return (
    <div className="app-screen">
      <div className="screen-body">
        <div style={{ paddingTop: 6, marginBottom: 16 }}>
          <h1 style={{ marginBottom: 2 }}>MenuLens</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Snap a menu, get your picks</p>
        </div>
        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 8 }}>
          Where are you eating?
        </p>
        <div style={{ position: 'relative' }}>
          <input className="input" placeholder="Search for a restaurant…" style={{ paddingLeft: 38 }}/>
          <I.Search style={{ position: 'absolute', left: 12, top: 13, color: 'var(--text-dim)' }} width="16" height="16"/>
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={{ fontSize: 17 }}>Picked for you</h2>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 500 }}>nearby</span>
          </div>
          <p style={{
            fontSize: 12.5, color: 'var(--text-muted)',
            borderLeft: '2px solid var(--green-tint)',
            paddingLeft: 10, marginTop: 6, lineHeight: 1.5,
          }}>
            Based on your love of bold beef dishes and recent 9+ ratings on sushi,
            here are dishes you'd probably enjoy at restaurants near you.
          </p>

          <SectionHead title="Great matches" color="var(--green)" count="2"/>
          <RecRow
            dish="Truffle Wagyu Smash Burger"
            restaurant="Shake Shack"
            cuisine="American"
            score={94}
            level="great"
            popular
            img
          />
          <RecRow
            dish="Spicy Tuna Crispy Rice"
            restaurant="Nobu"
            cuisine="Japanese"
            score={91}
            level="great"
            img
          />

          <SectionHead title="Good matches" color="var(--teal)" count="1"/>
          <RecRow
            dish="Double Double Animal Style"
            restaurant="In-N-Out"
            cuisine="American"
            score={78}
            level="good"
            img={false}
          />
        </div>
      </div>
      <BottomNav active="scan"/>
    </div>
  );
};

// 06 ── Existing-menu card ────────────────────────────────────
Screens.ExistingMenu = function ExistingMenu() {
  return (
    <div className="app-screen">
      <div className="screen-body">
        <div style={{ paddingTop: 6, marginBottom: 18 }}>
          <h1 style={{ marginBottom: 2 }}>MenuLens</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Snap a menu, get your picks</p>
        </div>
        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 8 }}>
          Where are you eating?
        </p>
        <div className="input focused" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <I.Search width="16" height="16" style={{ color: 'var(--green)' }}/>
          <span>Sakura Garden</span>
        </div>

        <div className="card" style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>Sakura Garden</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                Japanese · San Francisco
              </div>
            </div>
            <span className="badge badge-green">Verified</span>
          </div>

          <div style={{
            marginTop: 12, padding: '10px 12px',
            background: 'var(--surface-2)', borderRadius: 10,
            fontSize: 12.5, color: 'var(--text-muted)',
            display: 'flex', gap: 16,
          }}>
            <span>34 dishes on file</span>
            <span>Scanned Apr 18, 2026</span>
          </div>

          <button className="btn primary block" style={{ marginTop: 16, marginBottom: 8 }}>
            Get Recommendations
          </button>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button className="btn sm" style={{ flex: 1 }}>Log a meal</button>
            <button className="btn sm" style={{ flex: 1 }}>Scan new menu</button>
          </div>
          <button className="btn sm block">Change restaurant</button>
        </div>
      </div>
      <BottomNav active="scan"/>
    </div>
  );
};

// 07 ── Ready to scan / Uploader ──────────────────────────────
Screens.Uploader = function Uploader({ processing = false }) {
  return (
    <div className="app-screen">
      <div className="screen-body">
        <div style={{ paddingTop: 6, marginBottom: 14 }}>
          <h1 style={{ marginBottom: 2 }}>MenuLens</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Snap a menu, get your picks</p>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px', marginBottom: 14,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10,
        }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 13.5 }}>Sakura Garden</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Japanese</div>
          </div>
          {!processing && <span style={{ color: 'var(--text-dim)' }}>✕</span>}
        </div>

        <div style={{
          border: `2px dashed var(--border)`,
          borderRadius: 16,
          background: 'var(--surface)',
          padding: '40px 20px', textAlign: 'center',
        }}>
          <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}>
            {processing ? (
              <div className="spinner" style={{ width: 32, height: 32 }}/>
            ) : (
              <I.Image width="36" height="36" style={{ color: 'var(--text-dim)' }}/>
            )}
          </div>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>
            {processing ? 'Analyzing menu…' : 'Upload menu photo or PDF'}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {processing ? 'AI parsing in progress' : 'Tap to browse or drag & drop'}
            <br/>
            {processing ? '' : 'JPEG, PNG, PDF'}
          </div>
        </div>

        {processing && (
          <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-dim)', marginTop: 10 }}>
            This may take 30–90 seconds depending on menu size
          </p>
        )}
      </div>
      <BottomNav active="scan"/>
    </div>
  );
};

// 08 ── Results / Ranked dishes ──────────────────────────────
Screens.Results = function Results() {
  const Pill = ({ cls, label }) => <span className={`badge ${cls}`}>{label}</span>;
  const DishRow = ({ name, desc, price, score, level, popular }) => (
    <div style={{
      background: 'var(--surface)', borderRadius: 10,
      padding: 14, marginBottom: 8,
      boxShadow: 'var(--shadow-sm)',
      borderLeft: level === 'great' ? '3px solid var(--green)' : '3px solid transparent',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{name}</span>
            {level === 'great' && <Pill cls="badge-green" label="Great match"/>}
            {level === 'good'  && <Pill cls="badge-teal"  label="Good match"/>}
            {popular && <Pill cls="badge-amber" label="Popular here"/>}
          </div>
          {desc && <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>{desc}</p>}
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{price}</div>
          <div style={{
            fontSize: 14, fontWeight: 700,
            color: score >= 75 ? 'var(--green)' : 'var(--teal)',
            marginTop: 2, lineHeight: 1,
          }}>
            {score}%
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>match</div>
        </div>
      </div>
    </div>
  );

  const SectionHead = ({ title, color, count }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      marginBottom: 10, paddingBottom: 6,
      borderBottom: '1px solid var(--border)', marginTop: 18,
    }}>
      {color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }}/>}
      <span className="section-label" style={{ marginBottom: 0 }}>{title}</span>
      <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>{count}</span>
    </div>
  );

  return (
    <div className="app-screen">
      <div className="screen-body">
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <h2 style={{ fontSize: 20 }}>Your picks</h2>
            <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 500 }}>34 dishes</span>
          </div>
          <p style={{
            fontSize: 12.5, color: 'var(--text-muted)',
            borderLeft: '2px solid var(--green-tint)',
            paddingLeft: 10, marginTop: 6, lineHeight: 1.5,
          }}>
            Based on your love of Thai noodles and aversion to shellfish, we've prioritized lighter,
            noodle-forward dishes with bold sauces.
          </p>
        </div>

        <SectionHead title="Great matches" color="var(--green)" count="2"/>
        <DishRow
          name="Miso Black Cod"
          desc="3-day marinated, broiled with sweet miso glaze."
          price="$32"
          score={94}
          level="great"
          popular
        />
        <DishRow
          name="Tonkotsu Ramen"
          desc="18-hour pork bone broth, chashu, soft egg, scallion."
          price="$18"
          score={88}
          level="great"
        />

        <SectionHead title="Good matches" color="var(--teal)" count="1"/>
        <DishRow
          name="Vegetable Tempura"
          desc="Lightly battered seasonal vegetables, dashi-soy."
          price="$14"
          score={71}
          level="good"
        />

        <SectionHead title="Others" count="1"/>
        <DishRow
          name="Uni Risotto"
          desc="Sea urchin, parmigiano, brown butter."
          price="$36"
          score={42}
        />
      </div>
      <BottomNav active="scan"/>
    </div>
  );
};

// 09 ── My List / Meals ──────────────────────────────────────
Screens.MyList = function MyList() {
  const Rating = ({ r }) => (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      background: 'var(--green-tint)', borderRadius: 8,
      padding: '4px 10px', minWidth: 44,
    }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', lineHeight: 1 }}>{r}</span>
      <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>/10</span>
    </div>
  );
  const HistoryItem = ({ name, cuisine, rating, dishes }) => (
    <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{name}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>{cuisine}</div>
          {dishes && (
            <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 4 }}>
              {dishes} dishes rated ▼
            </div>
          )}
        </div>
        <Rating r={rating}/>
      </div>
    </div>
  );

  return (
    <div className="app-screen">
      <div className="screen-body">
        <div style={{ paddingTop: 6, marginBottom: 18 }}>
          <h1 style={{ marginBottom: 2 }}>My List</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Your restaurant visits & ratings</p>
        </div>

        <div className="section-label">Rate recent visits</div>
        <div className="card" style={{
          padding: 14, marginBottom: 18, border: '1px solid var(--border)',
          boxShadow: 'none',
        }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Sakura Garden</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, marginBottom: 12 }}>Japanese</div>

          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Dishes you tried
          </div>

          {['Miso Black Cod', 'Tonkotsu Ramen'].map((d, i) => (
            <div key={d} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 0', borderBottom: '1px solid var(--border)',
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: 4,
                border: '1px dashed var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-dim)',
              }}>
                <I.Camera width="14" height="14"/>
              </div>
              <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d}</span>
              <input className="input" defaultValue={i === 0 ? '9' : '8'} style={{
                width: 56, textAlign: 'center', padding: '4px 6px',
                fontSize: 13, fontWeight: 600,
              }}/>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>/10</span>
            </div>
          ))}

          <button className="btn dashed sm block" style={{ marginTop: 12, justifyContent: 'flex-start' }}>
            + Add a dish
          </button>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button className="btn sm">Discard</button>
            <button className="btn primary sm">Save visit</button>
          </div>
        </div>

        <div className="section-label">Meal history</div>
        <HistoryItem name="Lupa Trattoria"     cuisine="Italian"  rating={9} dishes={2}/>
        <HistoryItem name="Tartine Manufactory" cuisine="American" rating={8} dishes={3}/>
        <HistoryItem name="Burma Superstar"    cuisine="Burmese"  rating={7} dishes={1}/>
        <HistoryItem name="Loló"               cuisine="Mexican"  rating={9} dishes={2}/>
      </div>
      <BottomNav active="meals" pendingDot/>
    </div>
  );
};

// 10 ── Profile ──────────────────────────────────────────────
Screens.Profile = function Profile() {
  // Six curated collections derived from the user's ratings.
  // Each one has a count, a flavor, and a soft-tinted accent.
  const collections = [
    { title: 'Top 10 dishes',     count: 10, glyph: '★',  accent: 'green'  },
    { title: 'Best Italian',      count: 8,  glyph: '🍝', accent: 'amber'  },
    { title: 'Favorite desserts', count: 6,  glyph: '🍰', accent: 'amber'  },
    { title: 'Most unique',       count: 5,  glyph: '✦',  accent: 'teal'   },
    { title: 'Comfort food',      count: 12, glyph: '◎',  accent: 'green'  },
    { title: 'Hidden gems',       count: 4,  glyph: '◆',  accent: 'teal'   },
  ];
  return (
    <div className="app-screen">
      <div className="screen-body">
        <div style={{ paddingTop: 6, marginBottom: 18 }}>
          <h1>Profile</h1>
        </div>

        <div className="card" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--green-tint)', color: 'var(--green)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 700,
          }}>A</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>alex</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>MenuLens member</div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <div className="section-label">Taste profile</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['Thai', 'Japanese', 'Italian', 'Korean'].map(c => (
              <span key={c} className="badge badge-green">{c}</span>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Dietary</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span className="badge badge-muted">No shellfish</span>
              <span className="badge badge-muted">Gluten-free</span>
            </div>
          </div>
        </div>

        {/* ── Collections ─────────────────────────────────────── */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <p className="section-label" style={{ marginBottom: 0 }}>Collections</p>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 500, whiteSpace: 'nowrap' }}>
              auto-curated
            </span>
          </div>
          <div className="collections-grid">
            {collections.map(c => (
              <button key={c.title} className={`collection-tile collection-${c.accent}`}>
                <span className="collection-glyph">{c.glyph}</span>
                <span className="collection-title">{c.title}</span>
                <span className="collection-count">{c.count} dishes</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
            <span style={{ fontSize: 14 }}>Visits logged</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>27</span>
          </div>
          <div style={{ height: 1, background: 'var(--border)', margin: '10px 0' }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
            <span style={{ fontSize: 14 }}>Dishes rated</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>64</span>
          </div>
        </div>

        <button className="btn block" style={{ color: 'var(--red)' }}>Log out</button>
      </div>
      <BottomNav active="profile"/>
    </div>
  );
};

// 11 ── Collection detail ────────────────────────────────────
Screens.CollectionDetail = function CollectionDetail() {
  const dishes = [
    { rank: 1,  name: 'Truffle Tagliatelle',     restaurant: 'Osteria Mozza',      date: 'Mar 14',  rating: 9.6 },
    { rank: 2,  name: 'Cacio e Pepe',            restaurant: 'Felix Trattoria',     date: 'Feb 02',  rating: 9.5 },
    { rank: 3,  name: 'Lobster Ravioli',         restaurant: "Carbone",             date: 'Jan 28',  rating: 9.4 },
    { rank: 4,  name: 'Tonkotsu Ramen',          restaurant: 'Ippudo',              date: 'Jan 11',  rating: 9.3 },
    { rank: 5,  name: 'Miso Black Cod',          restaurant: 'Nobu',                date: 'Dec 22',  rating: 9.2 },
    { rank: 6,  name: 'Pad See Ew',              restaurant: 'Night + Market',      date: 'Dec 14',  rating: 9.1 },
    { rank: 7,  name: 'Spicy Tuna Crispy Rice',  restaurant: 'Katsuya',             date: 'Nov 30',  rating: 9.1 },
    { rank: 8,  name: 'Bistecca Fiorentina',     restaurant: 'Don Angie',           date: 'Nov 18',  rating: 9.0 },
    { rank: 9,  name: 'Margherita Pizza',        restaurant: 'Una Pizza Napoletana', date: 'Oct 27', rating: 9.0 },
    { rank: 10, name: 'Bibimbap',                restaurant: 'Jeju Noodle Bar',     date: 'Oct 12',  rating: 8.9 },
  ];
  return (
    <div className="app-screen">
      <div className="screen-body">
        {/* Header with back */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingTop: 4 }}>
          <button style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: 0, display: 'flex', alignItems: 'center',
            color: 'var(--text-muted)', fontSize: 18,
          }} aria-label="Back">←</button>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>Collections</span>
        </div>

        {/* Title block */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{
              fontSize: 22, lineHeight: 1,
              width: 36, height: 36, borderRadius: 10,
              background: 'var(--green-tint)', color: 'var(--green)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>★</span>
            <h2 style={{ fontSize: 19 }}>Top 10 dishes</h2>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>
            Your highest-rated dishes across every visit, ranked by score.
          </p>
        </div>

        {/* Ranked list */}
        <div>
          {dishes.map(d => (
            <div key={d.rank} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '11px 0', borderBottom: '1px solid var(--border)',
            }}>
              <span style={{
                flex: '0 0 22px', textAlign: 'center',
                fontSize: 12.5, fontWeight: 700,
                color: d.rank <= 3 ? 'var(--green)' : 'var(--text-dim)',
                fontFeatureSettings: "'tnum'",
              }}>
                {d.rank}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13.5, fontWeight: 600, lineHeight: 1.25,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{d.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                  {d.restaurant} <span style={{ color: 'var(--text-dim)', margin: '0 4px' }}>·</span> {d.date}
                </div>
              </div>
              <div style={{
                flex: '0 0 auto', display: 'flex', flexDirection: 'column',
                alignItems: 'center', background: 'var(--green-tint)',
                borderRadius: 8, padding: '4px 9px', minWidth: 42,
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', lineHeight: 1, fontFeatureSettings: "'tnum'" }}>
                  {d.rating}
                </span>
                <span style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 1 }}>/10</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <BottomNav active="profile"/>
    </div>
  );
};

window.Screens = Screens;
