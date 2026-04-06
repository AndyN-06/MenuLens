function MatchPill({ level }) {
  const config = {
    great: { label: 'Great match', cls: 'badge-green' },
    good:  { label: 'Good match',  cls: 'badge-teal'  },
    skip:  { label: 'Skip',        cls: 'badge-muted'  },
  }
  const { label, cls } = config[level] || config.skip
  return <span className={`badge ${cls}`}>{label}</span>
}

function ScoreDot({ score }) {
  const pct = Math.round((score ?? 0) * 100)
  const color = pct >= 75 ? 'var(--green)' : pct >= 50 ? 'var(--teal)' : 'var(--text-dim)'
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: '1rem', fontWeight: 700, color, lineHeight: 1 }}>{pct}%</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.1rem' }}>match</div>
    </div>
  )
}

function DishCard({ dish, ranked }) {
  const isGreat = dish.match_level === 'great'
  return (
    <div style={{
      backgroundColor: 'var(--surface)',
      borderRadius: 'var(--radius)',
      padding: '1rem',
      marginBottom: '0.625rem',
      boxShadow: 'var(--shadow-sm)',
      borderLeft: isGreat ? '3px solid var(--green)' : '3px solid transparent',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9375rem', lineHeight: 1.3 }}>
              {dish.dish_name}
            </span>
            {ranked && <MatchPill level={dish.match_level} />}
          </div>
          {dish.description && (
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 0 }}>
              {dish.description}
            </p>
          )}
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          {dish.price && (
            <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--text)', lineHeight: 1.3 }}>
              {dish.price}
            </div>
          )}
          {ranked && dish.score != null && (
            <ScoreDot score={dish.score} />
          )}
        </div>
      </div>
    </div>
  )
}

function SectionGroup({ title, dishes, ranked, accentColor }) {
  if (!dishes.length) return null
  return (
    <div style={{ marginBottom: '1.75rem' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '0.75rem',
        paddingBottom: '0.5rem',
        borderBottom: '1px solid var(--border)',
      }}>
        {accentColor && (
          <span style={{
            width: '8px', height: '8px',
            borderRadius: '50%',
            backgroundColor: accentColor,
            flexShrink: 0,
          }} />
        )}
        <span className="section-label" style={{ marginBottom: 0 }}>{title}</span>
        <span style={{
          marginLeft: 'auto',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--text-dim)',
        }}>
          {dishes.length}
        </span>
      </div>
      {dishes.map((dish, i) => (
        <DishCard key={dish.dish_name ? `${dish.dish_name}-${i}` : i} dish={dish} ranked={ranked} />
      ))}
    </div>
  )
}

function DishCards({ data }) {
  const { dishes = [], ranked, taste_summary, dish_count } = data

  if (!dishes.length) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          No dishes found. Try a clearer photo.
        </p>
      </div>
    )
  }

  const header = (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
        <h2 style={{ marginBottom: 0 }}>{ranked ? 'Your picks' : 'Menu items'}</h2>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 500 }}>
          {dish_count} dishes
        </span>
      </div>
      {ranked && taste_summary && (
        <p style={{
          fontSize: '0.8125rem',
          color: 'var(--text-muted)',
          borderLeft: '2px solid var(--green-tint)',
          paddingLeft: '0.75rem',
          marginTop: '0.5rem',
          marginBottom: 0,
        }}>
          {taste_summary}
        </p>
      )}
    </div>
  )

  if (ranked) {
    const sorted = [...dishes].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
    const great  = sorted.filter(d => d.match_level === 'great')
    const good   = sorted.filter(d => d.match_level === 'good')
    const skip   = sorted.filter(d => d.match_level === 'skip' || !d.match_level)
    return (
      <div>
        {header}
        <SectionGroup title="Great matches" dishes={great} ranked accentColor="var(--green)" />
        <SectionGroup title="Good matches"  dishes={good}  ranked accentColor="var(--teal)"  />
        <SectionGroup title="Others"        dishes={skip}  ranked />
      </div>
    )
  }

  // Unranked: group by section
  const sections = {}
  for (const dish of dishes) {
    const sec = dish.section || 'Menu'
    if (!sections[sec]) sections[sec] = []
    sections[sec].push(dish)
  }

  return (
    <div>
      {header}
      {Object.entries(sections).map(([sec, items]) => (
        <SectionGroup key={sec} title={sec} dishes={items} ranked={false} />
      ))}
    </div>
  )
}

export default DishCards
