import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ApiRequestError,
  getTicketDetail,
  indicateResolved,
  listTicketActions,
  postComment,
  type ActionTaken,
  type TicketComment,
  type TicketDetail as TicketDetailData,
} from '../api'
import AttachmentSection from '../components/AttachmentSection'
import { formatDate } from '../lib/format'

type LoadState = 'loading' | 'ready' | 'not-found' | 'error'

const COMMENT_MAX = 2000
const INDICATABLE_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER']

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
  const [detail, setDetail] = useState<TicketDetailData | null>(null)
  const [state, setState] = useState<LoadState>('loading')

  const [commentBody, setCommentBody] = useState('')
  const [commentError, setCommentError] = useState<string | null>(null)
  const [commentBusy, setCommentBusy] = useState(false)
  const [indicateBusy, setIndicateBusy] = useState(false)
  const [indicateError, setIndicateError] = useState<string | null>(null)
  const [actions, setActions] = useState<ActionTaken[]>([])

  const reload = (ticket: number) => {
    setState('loading')
    getTicketDetail(ticket)
      .then((next) => {
        setDetail(next)
        setState('ready')
      })
      .catch((error: unknown) => {
        setState(error instanceof ApiRequestError && error.status === 404 ? 'not-found' : 'error')
      })
  }

  useEffect(() => {
    if (!Number.isInteger(ticketId) || ticketId <= 0) return
    let cancelled = false
    setState('loading')
    Promise.all([getTicketDetail(ticketId), listTicketActions(ticketId).then((r) => r.items).catch(() => [])])
      .then(([next, actionItems]) => {
        if (cancelled) return
        setDetail(next)
        setActions(actionItems)
        setState('ready')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState(error instanceof ApiRequestError && error.status === 404 ? 'not-found' : 'error')
      })
    return () => {
      cancelled = true
    }
  }, [ticketId])

  const handleComment = async () => {
    const text = commentBody.trim()
    if (!text) {
      setCommentError('Comment must not be empty.')
      return
    }
    if (text.length > COMMENT_MAX) {
      setCommentError(`Comment must be ${COMMENT_MAX} characters or fewer.`)
      return
    }
    setCommentBusy(true)
    setCommentError(null)
    try {
      const created: TicketComment = await postComment(ticketId, text)
      setDetail((prev) =>
        prev ? { ...prev, comments: [created, ...(prev.comments ?? [])] } : prev,
      )
      setCommentBody('')
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Unable to post comment.')
    } finally {
      setCommentBusy(false)
    }
  }

  const handleIndicate = async () => {
    setIndicateBusy(true)
    setIndicateError(null)
    try {
      const result = await indicateResolved(ticketId)
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              requesterResolved: result.requesterResolved,
              requesterResolvedAt: result.requesterResolvedAt,
            }
          : prev,
      )
      reload(ticketId)
    } catch (error) {
      setIndicateError(error instanceof Error ? error.message : 'Unable to record indication.')
    } finally {
      setIndicateBusy(false)
    }
  }

  if (state === 'not-found' || (!Number.isInteger(ticketId) && ticketId !== undefined)) {
    return (
      <div className="tg-card" style={{ maxWidth: '720px', margin: '0 auto' }} data-testid="not-found-panel">
        <h1 className="h4">Ticket not found</h1>
        <p style={{ color: 'var(--tg-muted)' }}>
          This ticket does not exist or does not belong to your account.
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

  const comments = detail.comments ?? []
  const canIndicate = INDICATABLE_STATUSES.includes(detail.currentStatus) && !detail.requesterResolved

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

        {detail.requesterResolved && (
          <p className="mb-3" data-testid="resolved-indication-line" style={{ color: 'var(--tg-success)' }}>
            ✓ Requester confirms resolved
            {detail.requesterResolvedAt ? ` · ${formatDate(detail.requesterResolvedAt)}` : ''}
          </p>
        )}

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
          <div className="col-12 col-md-6">
            <ReadOnlyField label="Ticket Owner">{detail.owner ? detail.owner.name : 'Unassigned'}</ReadOnlyField>
          </div>
          <div className="col-12 col-md-6">
            <ReadOnlyField label="IT Priority">{detail.itPriority}</ReadOnlyField>
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

        {canIndicate && (
          <div className="mt-3">
            <button
              type="button"
              className="tg-btn tg-btn-secondary"
              disabled={indicateBusy}
              onClick={() => void handleIndicate()}
            >
              {indicateBusy ? 'Recording…' : 'Problem appears resolved'}
            </button>
            {indicateError && (
              <p className="tg-field-error" role="alert">
                {indicateError}
              </p>
            )}
          </div>
        )}
      </div>

      <section className="tg-card mt-3" aria-labelledby="comments-heading" data-testid="comments-section">
        <h2 id="comments-heading" className="h6 mb-3">
          Public Comments
        </h2>
        <div className="mb-3">
          <label className="tg-label" htmlFor="comment-body">
            Add a comment
          </label>
          <textarea
            id="comment-body"
            className="tg-field w-100"
            rows={3}
            value={commentBody}
            onChange={(event) => setCommentBody(event.target.value)}
            aria-describedby="comment-counter"
          />
          <p id="comment-counter" className="mb-0 small" style={{ color: 'var(--tg-muted)' }}>
            {commentBody.trim().length}/{COMMENT_MAX}
          </p>
          {commentError && (
            <p className="tg-field-error" role="alert">
              {commentError}
            </p>
          )}
          <button
            type="button"
            className="tg-btn tg-btn-primary mt-2"
            disabled={commentBusy}
            onClick={() => void handleComment()}
          >
            {commentBusy ? 'Posting…' : 'Post comment'}
          </button>
        </div>
        {comments.length === 0 ? (
          <p data-testid="comments-empty" style={{ color: 'var(--tg-muted)' }}>
            No comments yet.
          </p>
        ) : (
          <ul className="mb-0" style={{ listStyle: 'none', paddingLeft: 0 }}>
            {comments.map((comment) => (
              <li
                key={comment.id}
                data-testid={`comment-row-${comment.id}`}
                className="tg-comment-card mb-2"
              >
                <p className="mb-1" style={{ whiteSpace: 'pre-wrap' }}>
                  {comment.body}
                </p>
                <p className="mb-0 small" style={{ color: 'var(--tg-muted)' }}>
                  {comment.authorName} · {comment.authorRole} · {formatDate(comment.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tg-card mt-3" aria-labelledby="actions-heading" data-testid="actions-section">
        <h2 id="actions-heading" className="h6 mb-1">
          🛠️ Actions Taken
        </h2>
        <p className="small mb-3" style={{ color: 'var(--tg-muted)' }}>
          Work recorded by IT staff on this ticket.
        </p>
        {actions.length === 0 ? (
          <p data-testid="actions-empty" style={{ color: 'var(--tg-muted)' }}>
            No actions recorded yet.
          </p>
        ) : (
          <ul className="mb-0" style={{ listStyle: 'none', paddingLeft: 0 }}>
            {actions.map((action) => (
              <li key={action.id} data-testid={`action-row-${action.id}`} className="tg-comment-card mb-2">
                <p className="mb-1" style={{ whiteSpace: 'pre-wrap' }}>
                  {action.description}
                </p>
                <p className="mb-1 small">
                  <span className="tg-label">Result:</span> {action.result}
                </p>
                {action.followUpRequired && (
                  <p className="mb-1" data-testid={`action-followup-${action.id}`}>
                    <span className="tg-badge tg-badge-warning">Follow-up required</span>{' '}
                    <span className="small">{action.followUpNote}</span>
                  </p>
                )}
                {action.attachmentNotes && (
                  <p className="mb-1 small" style={{ color: 'var(--tg-muted)' }}>
                    Files: {action.attachmentNotes}
                  </p>
                )}
                <p className="mb-0 small" style={{ color: 'var(--tg-muted)' }}>
                  {action.performedBy.name} · {formatDate(action.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AttachmentSection ticketId={detail.id} />

      <div className="mt-3">
        <Link to="/tickets" className="tg-btn tg-btn-secondary">
          Back to My Tickets
        </Link>
      </div>
    </div>
  )
}
