import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRequesterDashboard, type RequesterDashboard as RequesterDashboardData } from '../api'
import { formatDate } from '../lib/format'

type LoadState = 'loading' | 'ready' | 'error'

function MetricCard({ label, value, to, testId }: { label: string; value: number; to: string; testId: string }) {
  return (
    <div className="col-12 col-sm-6 col-lg-4">
      <div className="tg-card h-100" data-testid={testId}>
        <p className="tg-label mb-1">{label}</p>
        <p className="h3 mb-2" data-testid={`${testId}-value`}>
          {value}
        </p>
        <Link to={to} className="tg-btn tg-btn-tertiary" aria-label={`View ${label}`}>
          View
        </Link>
      </div>
    </div>
  )
}

export default function RequesterDashboard() {
  const [data, setData] = useState<RequesterDashboardData | null>(null)
  const [state, setState] = useState<LoadState>('loading')

  useEffect(() => {
    let cancelled = false
    getRequesterDashboard()
      .then((next) => {
        if (cancelled) return
        setData(next)
        setState('ready')
      })
      .catch(() => {
        if (cancelled) return
        setState('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (state === 'loading') {
    return (
      <div className="tg-card" style={{ maxWidth: '960px', margin: '0 auto' }}>
        <p data-testid="loading-state" style={{ color: 'var(--tg-muted)' }}>
          Loading dashboard…
        </p>
      </div>
    )
  }

  if (state === 'error' || !data) {
    return (
      <div className="tg-card" style={{ maxWidth: '960px', margin: '0 auto' }}>
        <div className="tg-error-banner" data-testid="error-state" role="alert">
          Unable to load the dashboard.
        </div>
        <button type="button" className="tg-btn tg-btn-secondary mt-2" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    )
  }

  const drill = (key: string, fallback: string) => {
    const d = data.metrics.drillDown?.[key]
    return d ? `${d.base}${d.query}` : fallback
  }

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }} data-testid="requester-dashboard">
      <h1 className="h4 mb-3">My Dashboard</h1>
      <div className="row g-3 mb-3">
        <MetricCard label="Open tickets" value={data.metrics.open} to={drill('open', '/tickets')} testId="metric-open" />
        <MetricCard
          label="Waiting for you"
          value={data.metrics.waitingForRequester}
          to={drill('waitingForRequester', '/tickets')}
          testId="metric-waiting"
        />
        <MetricCard
          label="Resolved (30 days)"
          value={data.metrics.resolved30d}
          to={drill('resolved30d', '/tickets')}
          testId="metric-resolved"
        />
      </div>

      {data.attention.length > 0 && (
        <section className="tg-card mb-3" aria-labelledby="attention-heading" data-testid="attention-section">
          <h2 id="attention-heading" className="h6 mb-2">
            Needs your attention
          </h2>
          <ul className="mb-0" style={{ listStyle: 'none', paddingLeft: 0 }}>
            {data.attention.map((t) => (
              <li key={t.id} data-testid={`attention-row-${t.id}`} className="py-2 border-bottom">
                <Link to={`${t.drillDown.base}${t.drillDown.query}`}>{t.ticketNumber}</Link>
                <span className="ms-2">{t.summary}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="tg-card mb-3" aria-labelledby="recent-heading" data-testid="recent-section">
        <h2 id="recent-heading" className="h6 mb-2">
          Recently updated
        </h2>
        {data.recentUpdated.length === 0 ? (
          <p data-testid="recent-empty" style={{ color: 'var(--tg-muted)' }}>
            No tickets yet.
          </p>
        ) : (
          <ul className="mb-0" style={{ listStyle: 'none', paddingLeft: 0 }}>
            {data.recentUpdated.map((t) => (
              <li key={t.id} data-testid={`recent-row-${t.id}`} className="py-2 border-bottom">
                <Link to={`${t.drillDown.base}${t.drillDown.query}`}>{t.ticketNumber}</Link>
                <span className="ms-2">{t.summary}</span>
                <span className="ms-2 small" style={{ color: 'var(--tg-muted)' }}>
                  {t.currentStatus} · {formatDate(t.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tg-card mb-3" aria-labelledby="resolved-heading" data-testid="resolved-section">
        <h2 id="resolved-heading" className="h6 mb-2">
          Recently resolved
        </h2>
        {data.recentResolved.length === 0 ? (
          <p data-testid="resolved-empty" style={{ color: 'var(--tg-muted)' }}>
            Nothing resolved yet.
          </p>
        ) : (
          <ul className="mb-0" style={{ listStyle: 'none', paddingLeft: 0 }}>
            {data.recentResolved.map((t) => (
              <li key={t.id} data-testid={`resolved-row-${t.id}`} className="py-2 border-bottom">
                <Link to={`${t.drillDown.base}${t.drillDown.query}`}>{t.ticketNumber}</Link>
                <span className="ms-2">{t.summary}</span>
                <span className="ms-2 small" style={{ color: 'var(--tg-muted)' }}>
                  {t.currentStatus} · {formatDate(t.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
