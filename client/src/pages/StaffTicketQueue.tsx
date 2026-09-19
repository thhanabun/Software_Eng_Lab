import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  getCategories,
  listStaffTickets,
  type Category,
  type StaffQueueResult,
} from '../api'
import { useAuth } from '../authContext'
import { formatDate } from '../lib/format'

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
const STATUSES = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'CANCELLED',
]

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'requestedPriority:desc', label: 'Requested priority' },
  { value: 'itPriority:desc', label: 'IT priority' },
  { value: 'ticketNumber:asc', label: 'Ticket number' },
]

const PAGE_SIZES = [5, 10, 25]

function priorityBadge(priority: string): string {
  return `tg-badge tg-badge-${priority.toLowerCase()}`
}

export default function StaffTicketQueue() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const search = searchParams.get('search') ?? ''
  const statusFilter = searchParams.get('status') ?? ''
  const categoryId = searchParams.get('categoryId') ?? ''
  const requestedPriority = searchParams.get('requestedPriority') ?? ''
  const itPriority = searchParams.get('itPriority') ?? ''
  const ownerFilter = searchParams.get('owner') ?? ''
  const sort = searchParams.get('sort') || 'createdAt:asc'
  const page = Number(searchParams.get('page')) || 1
  const pageSize = Number(searchParams.get('pageSize')) || 10

  const [searchInput, setSearchInput] = useState(search)
  const [categories, setCategories] = useState<Category[]>([])
  const [result, setResult] = useState<StaffQueueResult | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => setCategories([]))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoadState('loading')
    // Owner filter resolves against the session user: "mine" needs no directory.
    const ownerId =
      ownerFilter === 'unassigned' ? 'unassigned' : ownerFilter === 'mine' && user ? user.id : undefined
    listStaffTickets({
      search: search || undefined,
      status: statusFilter || undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
      requestedPriority: requestedPriority || undefined,
      itPriority: itPriority || undefined,
      ownerId,
      sort,
      page,
      pageSize,
    })
      .then((next) => {
        if (!cancelled) {
          setResult(next)
          setLoadState('ready')
        }
      })
      .catch(() => {
        if (!cancelled) setLoadState('error')
      })
    return () => {
      cancelled = true
    }
  }, [search, statusFilter, categoryId, requestedPriority, itPriority, ownerFilter, user, sort, page, pageSize, attempt])

  const applyFilters = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(searchParams)
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      if (!('page' in patch)) next.delete('page')
      setSearchParams(next)
    },
    [searchParams, setSearchParams],
  )

  const hasActiveFilters = Boolean(
    search || statusFilter || categoryId || requestedPriority || itPriority || ownerFilter,
  )
  const resetFilters = () => {
    setSearchParams(new URLSearchParams())
  }

  return (
    <div className="tg-card" style={{ maxWidth: '1080px', margin: '0 auto' }}>
      <div className="d-flex align-items-center justify-content-between gap-3 mb-1 flex-wrap">
        <h1 className="h4 mb-0">Ticket Queue</h1>
        {loadState === 'ready' && result && (
          <span data-testid="queue-count" style={{ color: 'var(--tg-muted)' }}>
            {result.totalItems} tickets
          </span>
        )}
      </div>

      <form
        className="row g-2 align-items-end mb-3"
        onSubmit={(event) => {
          event.preventDefault()
          applyFilters({ search: searchInput.trim() })
        }}
        aria-label="Queue search and filters"
      >
        <div className="col-12 col-md-4">
          <label className="tg-label" htmlFor="queue-search">
            Search
          </label>
          <input
            id="queue-search"
            className="tg-field w-100"
            type="search"
            placeholder="Number, summary or description…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <div className="col-6 col-md-2">
          <label className="tg-label" htmlFor="queue-status">
            Status
          </label>
          <select
            id="queue-status"
            className="tg-field w-100"
            value={statusFilter}
            onChange={(event) => applyFilters({ status: event.target.value })}
          >
            <option value="">All</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-2">
          <label className="tg-label" htmlFor="queue-category">
            Category
          </label>
          <select
            id="queue-category"
            className="tg-field w-100"
            value={categoryId}
            onChange={(event) => applyFilters({ categoryId: event.target.value })}
          >
            <option value="">All</option>
            {categories.map((category) => (
              <option key={category.id} value={String(category.id)}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-2">
          <label className="tg-label" htmlFor="queue-req-priority">
            Req. priority
          </label>
          <select
            id="queue-req-priority"
            className="tg-field w-100"
            value={requestedPriority}
            onChange={(event) => applyFilters({ requestedPriority: event.target.value })}
          >
            <option value="">All</option>
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-2">
          <label className="tg-label" htmlFor="queue-it-priority">
            IT priority
          </label>
          <select
            id="queue-it-priority"
            className="tg-field w-100"
            value={itPriority}
            onChange={(event) => applyFilters({ itPriority: event.target.value })}
          >
            <option value="">All</option>
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-2">
          <label className="tg-label" htmlFor="queue-owner">
            Owner
          </label>
          <select
            id="queue-owner"
            className="tg-field w-100"
            value={ownerFilter}
            onChange={(event) => applyFilters({ owner: event.target.value })}
          >
            <option value="">Anyone</option>
            <option value="unassigned">Unassigned</option>
            <option value="mine">Assigned to me</option>
          </select>
        </div>
        <div className="col-6 col-md-2">
          <label className="tg-label" htmlFor="queue-sort">
            Sort by
          </label>
          <select
            id="queue-sort"
            className="tg-field w-100"
            value={sort}
            onChange={(event) => applyFilters({ sort: event.target.value })}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-2">
          <label className="tg-label" htmlFor="queue-page-size">
            Per page
          </label>
          <select
            id="queue-page-size"
            className="tg-field w-100"
            value={String(pageSize)}
            onChange={(event) => applyFilters({ pageSize: event.target.value })}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={String(size)}>
                {size}
              </option>
            ))}
          </select>
        </div>
        <div className="col-12 col-md-6 d-flex gap-2">
          <button type="submit" className="tg-btn tg-btn-secondary">
            Apply search
          </button>
          {hasActiveFilters && (
            <button type="button" className="tg-btn tg-btn-tertiary" onClick={resetFilters}>
              Clear filters
            </button>
          )}
        </div>
      </form>

      {loadState === 'loading' && (
        <div data-testid="loading-state" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="d-flex gap-3 mb-2 align-items-center">
              <div className="tg-skeleton" style={{ width: 100, height: 18 }} />
              <div className="tg-skeleton flex-grow-1" style={{ height: 18 }} />
              <div className="tg-skeleton" style={{ width: 80, height: 18 }} />
              <div className="tg-skeleton" style={{ width: 60, height: 18 }} />
              <div className="tg-skeleton" style={{ width: 50, height: 24, borderRadius: 999 }} />
            </div>
          ))}
        </div>
      )}

      {loadState === 'error' && (
        <div className="tg-error-banner" data-testid="error-state" role="alert">
          Unable to load the queue right now.{' '}
          <button
            type="button"
            className="tg-btn tg-btn-secondary"
            style={{ minHeight: '32px', padding: '2px 12px' }}
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      )}

      {loadState === 'ready' && result && result.totalItems === 0 && (
        <div className="tg-empty-state" data-testid={hasActiveFilters ? 'no-results-state' : 'empty-state'}>
          {hasActiveFilters ? (
            <>
              <p className="mb-2">No tickets match your search.</p>
              <button type="button" className="tg-btn tg-btn-secondary" onClick={resetFilters}>
                Reset filters
              </button>
            </>
          ) : (
            <p className="mb-0">No tickets in the system.</p>
          )}
        </div>
      )}

      {loadState === 'ready' && result && result.items.length > 0 && (
        <>
          <div className="table-responsive d-none d-md-block">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th scope="col">Ticket</th>
                  <th scope="col">Summary</th>
                  <th scope="col">Category</th>
                  <th scope="col">Req</th>
                  <th scope="col">IT</th>
                  <th scope="col">Status</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Updated</th>
                  <th scope="col" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {result.items.map((ticket) => (
                  <tr key={ticket.id} data-testid={`queue-row-${ticket.id}`}>
                    <td data-testid="queue-ticket-number" style={{ whiteSpace: 'nowrap' }}>
                      <Link to={`/staff/tickets/${ticket.id}`}>{ticket.ticketNumber}</Link>
                    </td>
                    <td>{ticket.summary}</td>
                    <td>{ticket.categoryName}</td>
                    <td>
                      <span className={priorityBadge(ticket.requestedPriority)}>
                        {ticket.requestedPriority}
                      </span>
                    </td>
                    <td>
                      <span className={priorityBadge(ticket.itPriority)} data-testid="queue-it-priority">
                        IT {ticket.itPriority}
                      </span>
                    </td>
                    <td>
                      <span className={`tg-badge tg-badge-status-${ticket.currentStatus.toLowerCase()}`}>{ticket.currentStatus}</span>
                    </td>
                    <td>{ticket.owner ? <span className="tg-owner-chip-filled">{ticket.owner}</span> : <span className="tg-owner-chip">Unassigned</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(ticket.updatedAt)}</td>
                    <td>
                      <Link to={`/staff/tickets/${ticket.id}`} className="tg-btn tg-btn-secondary">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="d-md-none">
            {result.items.map((ticket) => (
              <div key={ticket.id} className="tg-card mb-2" data-testid={`queue-card-${ticket.id}`}>
                <div className="d-flex justify-content-between gap-2 mb-1">
                  <Link to={`/staff/tickets/${ticket.id}`}>{ticket.ticketNumber}</Link>
                  <span className={`tg-badge tg-badge-status-${ticket.currentStatus.toLowerCase()}`}>{ticket.currentStatus}</span>
                </div>
                <p className="mb-1">{ticket.summary}</p>
                <div className="d-flex gap-2 flex-wrap align-items-center">
                  <span className={priorityBadge(ticket.requestedPriority)}>{ticket.requestedPriority}</span>
                  <span className={priorityBadge(ticket.itPriority)}>IT {ticket.itPriority}</span>
                  <span className="small" style={{ color: 'var(--tg-muted)' }}>
                    {ticket.owner ?? 'Unassigned'} · {formatDate(ticket.updatedAt)}
                  </span>
                </div>
                <Link to={`/staff/tickets/${ticket.id}`} className="tg-btn tg-btn-secondary mt-2">
                  Open
                </Link>
              </div>
            ))}
          </div>

          <div
            className="d-flex align-items-center justify-content-between gap-3 flex-wrap"
            data-testid="pagination-info"
          >
            <span style={{ color: 'var(--tg-muted)' }}>
              Page {result.page} of {Math.max(result.totalPages, 1)} · {result.totalItems} tickets
            </span>
            <div className="d-flex gap-2">
              <button
                type="button"
                className="tg-btn tg-btn-secondary"
                disabled={result.page <= 1}
                onClick={() => applyFilters({ page: String(result.page - 1) })}
              >
                Previous
              </button>
              <button
                type="button"
                className="tg-btn tg-btn-secondary"
                disabled={result.page >= Math.max(result.totalPages, 1)}
                onClick={() => applyFilters({ page: String(result.page + 1) })}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
