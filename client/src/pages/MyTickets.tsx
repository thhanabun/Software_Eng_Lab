import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  getCategories,
  listTickets,
  type Category,
  type TicketListItem,
  type TicketListResult,
} from '../api'
import { useRequester } from '../requesterContext'
import { formatDate } from '../lib/format'

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
const STATUSES = ['NEW']

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'summary:asc', label: 'Summary A–Z' },
  { value: 'summary:desc', label: 'Summary Z–A' },
  { value: 'requestedPriority:asc', label: 'Priority low to high' },
  { value: 'requestedPriority:desc', label: 'Priority high to low' },
]

const PAGE_SIZES = [5, 10, 25]

function priorityBadge(priority: string): string {
  return `tg-badge tg-badge-${priority.toLowerCase()}`
}

export default function MyTickets() {
  const { requester } = useRequester()
  const [searchParams, setSearchParams] = useSearchParams()

  const search = searchParams.get('search') ?? ''
  const categoryId = searchParams.get('categoryId') ?? ''
  const statusFilter = searchParams.get('status') ?? ''
  const priority = searchParams.get('priority') ?? ''
  const sort = searchParams.get('sort') || 'createdAt:desc'
  const page = Number(searchParams.get('page')) || 1
  const pageSize = Number(searchParams.get('pageSize')) || 10

  const [searchInput, setSearchInput] = useState(search)
  const [categories, setCategories] = useState<Category[]>([])
  const [result, setResult] = useState<TicketListResult | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => setCategories([]))
  }, [])

  useEffect(() => {
    if (!requester) return
    let cancelled = false
    setLoadState('loading')
    listTickets({
      requesterId: requester.id,
      search: search || undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
      status: statusFilter || undefined,
      priority: priority || undefined,
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
  }, [requester, search, categoryId, statusFilter, priority, sort, page, pageSize, attempt])

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

  const hasActiveFilters = Boolean(search || categoryId || statusFilter || priority)
  const filtersDirty = useMemo(
    () => hasActiveFilters || sort !== 'createdAt:desc' || pageSize !== 10,
    [hasActiveFilters, sort, pageSize],
  )

  const resetFilters = () => {
    setSearchParams(new URLSearchParams())
  }

  return (
    <div className="tg-card" style={{ maxWidth: '960px', margin: '0 auto' }}>
      <div className="d-flex align-items-center justify-content-between gap-3 mb-3">
        <h1 className="h4 mb-0">My Tickets</h1>
        <Link to="/tickets/new" className="tg-btn tg-btn-primary">
          Create Ticket
        </Link>
      </div>

      <form
        className="row g-2 align-items-end mb-3"
        onSubmit={(event) => {
          event.preventDefault()
          applyFilters({ search: searchInput.trim() })
        }}
        aria-label="Ticket search and filters"
      >
        <div className="col-12 col-md-5">
          <label className="tg-label" htmlFor="ticket-search">
            Search
          </label>
          <input
            id="ticket-search"
            className="tg-field w-100"
            type="search"
            placeholder="Search summary or description…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <div className="col-6 col-md-3">
          <label className="tg-label" htmlFor="filter-category">
            Category
          </label>
          <select
            id="filter-category"
            className="tg-field w-100"
            value={categoryId}
            onChange={(event) => applyFilters({ categoryId: event.target.value })}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={String(category.id)}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-2">
          <label className="tg-label" htmlFor="filter-priority">
            Priority
          </label>
          <select
            id="filter-priority"
            className="tg-field w-100"
            value={priority}
            onChange={(event) => applyFilters({ priority: event.target.value })}
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
          <label className="tg-label" htmlFor="filter-status">
            Status
          </label>
          <select
            id="filter-status"
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
          <label className="tg-label" htmlFor="filter-sort">
            Sort by
          </label>
          <select
            id="filter-sort"
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
          <label className="tg-label" htmlFor="filter-page-size">
            Per page
          </label>
          <select
            id="filter-page-size"
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
          {filtersDirty && (
            <button type="button" className="tg-btn tg-btn-tertiary" onClick={resetFilters}>
              Clear filters
            </button>
          )}
        </div>
      </form>

      {loadState === 'loading' && (
        <p data-testid="loading-state" style={{ color: 'var(--tg-muted)' }}>
          Loading tickets…
        </p>
      )}

      {loadState === 'error' && (
        <div className="tg-error-banner" data-testid="error-state" role="alert">
          Unable to load your tickets right now.{' '}
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
            <>
              <p className="mb-2">You have not created any tickets yet.</p>
              <Link to="/tickets/new" className="tg-btn tg-btn-primary">
                Create your first ticket
              </Link>
            </>
          )}
        </div>
      )}

      {loadState === 'ready' && result && result.items.length > 0 && (
        <>
          <table className="table align-middle">
            <thead>
              <tr>
                <th scope="col">Ticket</th>
                <th scope="col">Created</th>
                <th scope="col">Summary</th>
                <th scope="col">Category</th>
                <th scope="col">Priority</th>
                <th scope="col">Status</th>
                <th scope="col" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {result.items.map((ticket: TicketListItem) => (
                <tr key={ticket.id} data-testid={`ticket-row-${ticket.id}`}>
                  <td data-testid="ticket-number" style={{ whiteSpace: 'nowrap' }}>
                    <Link to={`/tickets/${ticket.id}`}>{ticket.ticketNumber}</Link>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(ticket.createdAt)}</td>
                  <td>{ticket.summary}</td>
                  <td>{ticket.categoryName}</td>
                  <td>
                    <span className={priorityBadge(ticket.requestedPriority)}>
                      {ticket.requestedPriority}
                    </span>
                  </td>
                  <td>
                    <span className="tg-badge tg-badge-status-new">{ticket.currentStatus}</span>
                  </td>
                  <td>
                    <Link to={`/tickets/${ticket.id}`} className="tg-btn tg-btn-secondary">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

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
