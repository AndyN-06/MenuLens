import { useState } from 'react'
import { apiFetch } from '../api'

const CUISINES = [
  { name: 'Thai',           flag: '🇹🇭' },
  { name: 'Japanese',       flag: '🇯🇵' },
  { name: 'Italian',        flag: '🇮🇹' },
  { name: 'Mexican',        flag: '🇲🇽' },
  { name: 'Indian',         flag: '🇮🇳' },
  { name: 'French',         flag: '🇫🇷' },
  { name: 'Korean',         flag: '🇰🇷' },
  { name: 'Mediterranean',  flag: '🫒' },
  { name: 'American',       flag: '🇺🇸' },
  { name: 'Chinese',        flag: '🇨🇳' },
  { name: 'Middle Eastern', flag: '🌙' },
  { name: 'Vietnamese',     flag: '🇻🇳' },
]

function ProgressBar({ step, total }) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>
          Step {step} of {total}
        </span>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--green)' }}>
          {Math.round((step / total) * 100)}%
        </span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${(step / total) * 100}%` }} />
      </div>
    </div>
  )
}

function Step1({ selected, onToggle }) {
  return (
    <div>
      <h2 style={{ marginBottom: '0.35rem' }}>Which cuisines do you enjoy?</h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        Select all that apply — this seeds your taste profile.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.625rem' }}>
        {CUISINES.map(({ name, flag }) => {
          const active = selected.has(name)
          return (
            <button
              key={name}
              onClick={() => onToggle(name)}
              style={{
                padding: '0.75rem 0.5rem',
                borderRadius: 'var(--radius)',
                border: `1.5px solid ${active ? 'var(--green)' : 'var(--border)'}`,
                backgroundColor: active ? 'var(--green-tint)' : 'var(--surface)',
                color: active ? 'var(--green)' : 'var(--text)',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.13s ease',
                fontSize: '0.8rem',
                fontWeight: active ? 600 : 400,
              }}
            >
              <div style={{ fontSize: '1.375rem', marginBottom: '0.25rem' }}>{flag}</div>
              {name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Step2({ dietary, onDietaryChange }) {
  return (
    <div>
      <h2 style={{ marginBottom: '0.35rem' }}>Any dietary restrictions?</h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        Optional — we'll filter recommendations accordingly.
      </p>
      <input
        type="text"
        placeholder="e.g. vegetarian, no shellfish, gluten-free"
        value={dietary}
        onChange={e => onDietaryChange(e.target.value)}
        autoFocus
      />
      <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>
        Separate multiple items with commas, or leave blank.
      </p>
    </div>
  )
}


function Onboarding({ userId, onComplete }) {
  const [step, setStep]                         = useState(1)
  const [stepKey, setStepKey]                   = useState(0)
  const [selectedCuisines, setSelectedCuisines] = useState(new Set())
  const [dietary, setDietary]                   = useState('')
  const [submitting, setSubmitting]             = useState(false)
  const [submitError, setSubmitError]           = useState(null)

  const goNext = () => { setStep(s => s + 1); setStepKey(k => k + 1) }
  const goBack = () => { setStep(s => s - 1); setStepKey(k => k + 1) }

  const toggleCuisine = (name) => {
    setSelectedCuisines(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      for (const cuisine of selectedCuisines) {
        await apiFetch(`/api/visits/${userId}`, {
          method: 'POST',
          body: JSON.stringify({ restaurant_name: `${cuisine} cuisine`, cuisine_type: cuisine, restaurant_rating: 7, source: 'survey' }),
        })
      }

      const restrictions = dietary ? dietary.split(',').map(s => s.trim()).filter(Boolean) : []
      if (restrictions.length > 0) {
        const res = await apiFetch(`/api/profile/${userId}`, {
          method: 'PATCH',
          body: JSON.stringify({ dietary_restrictions: restrictions }),
        })
        if (res.status === 404) {
          await apiFetch(`/api/profile/${userId}`, {
            method: 'POST',
            body: JSON.stringify({ dietary_restrictions: restrictions }),
          })
        }
      }

      onComplete()
    } catch (e) {
      setSubmitError(e.message)
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      height: '100%',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'var(--bg)',
      padding: '1.5rem',
    }}>
      <div style={{ width: '100%', maxWidth: '440px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ marginBottom: '0.2rem' }}>MenuLens</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Build your taste profile</p>
        </div>

        <div className="card" style={{ padding: '1.75rem' }}>
          <ProgressBar step={step} total={2} />

          <div key={stepKey} className="step-in">
            {step === 1 && <Step1 selected={selectedCuisines} onToggle={toggleCuisine} />}
            {step === 2 && <Step2 dietary={dietary} onDietaryChange={setDietary} />}
          </div>

          {submitError && (
            <p style={{ color: 'var(--red)', marginTop: '1rem', fontSize: '0.8rem' }}>
              {submitError}
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', gap: '0.75rem' }}>
            <div>
              {step > 1 && (
                <button onClick={goBack} disabled={submitting}
                  style={{ color: 'var(--text-muted)' }}>
                  ← Back
                </button>
              )}
            </div>
            <div>
              {step < 2 && (
                <button
                  className="primary"
                  onClick={goNext}
                  disabled={step === 1 && selectedCuisines.size === 0}
                >
                  Next →
                </button>
              )}
              {step === 2 && (
                <button
                  className="primary"
                  onClick={handleSubmit}
                  disabled={submitting}
                  style={{ minWidth: '160px' }}
                >
                  {submitting ? 'Saving…' : 'Start Exploring →'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Onboarding
