import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ApiRequestError,
  getTicketDetail,
  type TicketDetail as TicketDetailData,
} from '../api'
import AttachmentSection from '../components/AttachmentSection'
import { useRequester } from '../requesterContext'
import { formatDate } from '../lib/format'

type LoadState = 'loading' | 'ready' | 'not-found' | 'error'

function ReadOnlyField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="tg-readonly">
      <span className="tg-label">{label}</span>
      <div>{children}</div>
    </div>
  )
}

export default function TicketDetail() {
  const { id } = useParams()
  const ticketId = Number(id)
  const { requester } = useRequester()
  const [detail, setDetail] = useState<TicketDetailData | null>(null)
  const [state, setState] = useState<LoadState>('loading')

  useEffect(() => {
    if (!requester || !Number.isInteger(ticketId) || ticketId <= 0) return
    let cancelled = false
    setState('loading')
    getTicketDetail(ticketId, requester.id)
      .then((next) => {
        if (cancelled) return
        setDetail(next)
        setState('ready')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState(error instanceof ApiRequestError && error.status === 404 ? 'not-found' : 'error')
      })
    return () => {
      cancelled = true
    }
  }, [requester, ticketId])

  if (state === 'not-found' || (!Number.isInteger(ticketId) && ticketId !== undefined)) {
    return (
      <div className="tg-card" style={{ maxWidth: '720px', margin: '0 auto' }} data-testid="not-found-panel">
        <h1 className="h4">Ticket not found</h1>
        <p style={{ color: 'var(--tg-muted)' }}>
          This ticket does not exist or does not belong to the selected requester.
        </p>
        <Link to="/tickets" className="tg-btn tg-btn-primary">
          Back to My Tickets
        </Link>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="tg-card" style={{ maxWidth: '720px', margin: '0 auto' }} data-testid="error-state">
        <h1 className="h4">Unable to load ticket</h1>
        <p style={{ color: 'var(--tg-muted)' }}>Something went wrong on the server. Please try again.</p>
        <Link to="/tickets" className="tg-btn tg-btn-secondary">
          Back to My Tickets
        </Link>
      </div>
    )
  }

  if (state === 'loading' || !detail) {
    return (
      <div className="tg-card" style={{ maxWidth: '720px', margin: '0 auto' }}>
        <p data-testid="loading-state" style={{ color: 'var(--tg-muted)' }}>
          Loading ticket…
        </p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto' }}>
      <div className="tg-card">
        <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap mb-3">
          <h1 className="h4 mb-0" data-testid="detail-ticket-number">
            {detail.ticketNumber}
          </h1>
          <div className="d-flex gap-2">
            <span className="tg-badge tg-badge-status-new">{detail.currentStatus}</span>
            <span className={`tg-badge tg-badge-${detail.requestedPriority.toLowerCase()}`}>
              {detail.requestedPriority}
            </span>
          </div>
        </div>

        <div className="row g-3 mb-3">
          <div className="col-12 col-md-4">
            <ReadOnlyField label="Ticket Date">{formatDate(detail.createdAt)}</ReadOnlyField>
          </div>
          <div className="col-12 col-md-4">
            <ReadOnlyField label="Requester">{detail.requesterName}</ReadOnlyField>
          </div>
          <div className="col-12 col-md-4">
            <ReadOnlyField label="Last Updated">{formatDate(detail.updatedAt)}</ReadOnlyField>
          </div>
          <div className="col-12 col-md-6">
            <ReadOnlyField label="Category">{detail.categoryName}</ReadOnlyField>
          </div>
          <div className="col-12 col-md-6">
            <ReadOnlyField label="Related System">{detail.relatedSystemName}</ReadOnlyField>
          </div>
        </div>

        <div className="mb-3">
          <span className="tg-label">Summary</span>
          <p className="mb-0">{detail.summary}</p>
        </div>
        <div>
          <span className="tg-label">Description</span>
          <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>
            {detail.description}
          </p>
        </div>
      </div>

      <AttachmentSection ticketId={detail.id} />

      <div className="mt-3">
        <Link to="/tickets" className="tg-btn tg-btn-secondary">
          Back to My Tickets
        </Link>
      </div>
    </div>
  )
}
