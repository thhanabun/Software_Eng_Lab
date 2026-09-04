import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRequesters, type Requester } from '../api'
import { useRequester } from '../requesterContext'

type SelectionState = 'loading' | 'ready' | 'empty' | 'error'

export default function RequesterSelection() {
  const navigate = useNavigate()
  const { selectRequester } = useRequester()
  const [state, setState] = useState<SelectionState>('loading')
  const [requesters, setRequesters] = useState<Requester[]>([])
  const [selectedId, setSelectedId] = useState<string>('')

  const load = useCallback(async () => {
    setState('loading')
    try {
      const data = await getRequesters()
      setRequesters(data)
      setState(data.length === 0 ? 'empty' : 'ready')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleContinue = () => {
    const selected = requesters.find((r) => String(r.id) === selectedId)
    if (!selected) return
    selectRequester(selected)
    navigate('/tickets')
  }

  return (
    <div className="container tg-main">
      <div className="tg-card" style={{ maxWidth: '480px', margin: '0 auto' }}>
        <h1 className="h4 mb-2">TokTickIT</h1>
        <p className="mb-3" style={{ color: 'var(--tg-muted)' }}>
          Select a Development Requester to test requester-specific ticket behavior. This is
          not a login screen. Authentication and role-based access will be introduced in Lab 3.
        </p>

        {state === 'loading' && (
          <p role="status" className="mb-0" style={{ color: 'var(--tg-muted)' }}>
            Loading requesters…
          </p>
        )}

        {state === 'error' && (
          <div>
            <div className="tg-error-banner mb-3">
              Unable to load Development Requesters. Please try again.
            </div>
            <button type="button" className="tg-btn tg-btn-secondary" onClick={() => void load()}>
              Retry
            </button>
          </div>
        )}

        {state === 'empty' && (
          <div className="tg-empty-state">
            No active Development Requesters exist. Run the seed script to create them.
          </div>
        )}

        {state === 'ready' && (
          <div>
            <label className="tg-label" htmlFor="requester-select">
              Development Requester <span className="tg-required-mark">*</span>
            </label>
            <select
              id="requester-select"
              className="tg-field mb-3"
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              <option value="">Select a requester…</option>
              {requesters.map((requester) => (
                <option key={requester.id} value={String(requester.id)}>
                  {requester.name} ({requester.email})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="tg-btn tg-btn-primary w-100 justify-content-center"
              disabled={selectedId === ''}
              onClick={handleContinue}
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
