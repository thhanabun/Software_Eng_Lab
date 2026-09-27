import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiRequestError, getStaffDashboard, type StaffDashboard as StaffDashboardData } from '../api'
import { formatDate } from '../lib/format'

type LoadState = 'loading' | 'ready' | 'forbidden' | 'error'

function MetricCard({ label, value, to, testId }: { label: string; value: number; to: string; testId: string }) {
  return (
    <div className="col-12 col-sm-6 col-lg-4">
      <div className="tg-card h-100" data-testid={testId}>
        <p className="tg-label mb-1">{label}</p>
        <p className="h3 mb-2" data-testid={`${testId}-value`}>
          {value}
        </p>
        <Link to={to} className="tg-btn tg-btn-tertiary">
          View
        </Link>
      </div>
    </div>
  )
}

export default function StaffDashboard() {
  const [data, setData] = useState<StaffDashboardData | null>(null)
  const [state, setState] = useState<LoadState>('loading')

  useEffect(() => {
    let cancelled = false
    getStaffDashboard()
      .then((next) => {
        if (cancelled) return
        setData(next)
        setState('ready')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState(error instanceof ApiRequestError && error.status === 403 ? 'forbidden' : 'error')
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

  if (state === 'forbidden') {
    return (
      <div className="tg-card" style={{ maxWidth: '960px', margin: '0 auto' }} data-testid="forbidden-panel">
        <h1 className="h4">Access denied</h1>
        <p style={{ color: 'var(--tg-muted)' }}>This dashboard is for IT staff and administrators.</p>
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

  const dd = data.metrics.drillDown
  const statusEntries = Object.entries(data.metrics.byStatus)
  const priorityEntries = Object.entries(data.metrics.byItPriority)
  const statusLink = (status: string) =>
    dd.byStatus[status] ?? { base: '/staff/tickets', query: '' }
  const priorityLink = (priority: string) =>
    dd.byItPriority[priority] ?? { base: '/staff/tickets', query: '' }

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }} data-testid="staff-dashboard">
      <h1 className="h4 mb-3">Operations Dashboard</h1>
      <div className="row g-3 mb-3">
        <MetricCard
          label="Unassigned tickets"
          value={data.metrics.unassigned}
          to={`${dd.unassigned.base}${dd.unassigned.query}`}
          testId="metric-unassigned"
        />
        <MetricCard
          label="Owned by me"
          value={data.metrics.ownedByMe}
          to={`${dd.ownedByMe.base}${dd.ownedByMe.query}`}
          testId="metric-owned"
        />
      </div>

      <section className="tg-card mb-3" aria-labelledby="status-heading" data-testid="status-breakdown">
        <h2 id="status-heading" className="h6 mb-2">
          By status
        </h2>
        <ul className="mb-0" style={{ listStyle: 'none', paddingLeft: 0 }}>
          {statusEntries.map(([status, count]) => (
            <li key={status} data-testid={`status-row-${status}`} className="py-1 border-bottom">
              <Link to={`${statusLink(status).base}${statusLink(status).query}`}>{status}</Link>
              <span className="ms-2" data-testid={`status-count-${status}`}>
                {count}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="tg-card mb-3" aria-labelledby="priority-heading" data-testid="priority-breakdown">
        <h2 id="priority-heading" className="h6 mb-2">
          By IT priority
        </h2>
        <ul className="mb-0" style={{ listStyle: 'none', paddingLeft: 0 }}>
          {priorityEntries.map(([priority, count]) => (
            <li key={priority} data-testid={`priority-row-${priority}`} className="py-1 border-bottom">
              <Link to={`${priorityLink(priority).base}${priorityLink(priority).query}`}>{priority}</Link>
              <span className="ms-2" data-testid={`priority-count-${priority}`}>
                {count}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="tg-card mb-3" aria-labelledby="urgent-heading" data-testid="urgent-section">
        <h2 id="urgent-heading" className="h6 mb-2">
          Urgent unassigned
        </h2>
        {data.urgentUnassigned.length === 0 ? (
          <p data-testid="urgent-empty" style={{ color: 'var(--tg-muted)' }}>
            No urgent unassigned tickets.
          </p>
        ) : (
          <ul className="mb-0" style={{ listStyle: 'none', paddingLeft: 0 }}>
            {data.urgentUnassigned.map((t) => (
              <li key={t.id} data-testid={`urgent-row-${t.id}`} className="py-2 border-bottom">
                <Link to={`${t.drillDown.base}${t.drillDown.query}`}>{t.ticketNumber}</Link>
                <span className="ms-2">{t.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.userCounts && (
        <section className="tg-card mb-3" aria-labelledby="users-heading" data-testid="users-section">
          <h2 id="users-heading" className="h6 mb-2">
            User accounts
          </h2>
          <p className="mb-0" data-testid="users-counts">
            {data.userCounts.requesters} requesters · {data.userCounts.staff} staff · {data.userCounts.admins} admins ·{' '}
            {data.userCounts.inactive} inactive
          </p>
        </section>
      )}
    </div>
  )
}
