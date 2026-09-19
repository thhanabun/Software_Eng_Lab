import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ApiRequestError,
  assignTicket,
  claimTicket,
  getStaffTicketDetail,
  listStaffUsers,
  postNote,
  postStaffComment,
  setItPriority,
  setTicketStatus,
  staffDownloadAttachment,
  type StaffTicketDetail as StaffTicketDetailData,
  type StaffUser,
  type TicketComment,
} from '../api'
import { formatDate, formatSize } from '../lib/format'

type LoadState = 'loading' | 'ready' | 'not-found' | 'error'

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
const COMMENT_MAX = 2000

// Mirrors the server BR-17 matrix (server re-validates regardless).
const MATRIX: Record<string, string[]> = {
  NEW: ['OPEN', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'CANCELLED'],
  IN_PROGRESS: ['WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  WAITING_FOR_REQUESTER: ['IN_PROGRESS', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['IN_PROGRESS', 'CANCELLED'],
  CANCELLED: [],
}

function ReadOnlyField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="tg-readonly">
      <span className="tg-label">{label}</span>
      <div>{children}</div>
    </div>
  )
}

export default function StaffTicketDetail() {
  const { id } = useParams()
  const ticketId = Number(id)
  const [detail, setDetail] = useState<StaffTicketDetailData | null>(null)
  const [directory, setDirectory] = useState<StaffUser[]>([])
  const [state, setState] = useState<LoadState>('loading')

  const [assignId, setAssignId] = useState('')
  const [opsBusy, setOpsBusy] = useState(false)
  const [opsSaved, setOpsSaved] = useState<string | null>(null)
  const [opsError, setOpsError] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<null | { kind: 'status'; value: string } | { kind: 'unassign' }>(null)

  const [commentBody, setCommentBody] = useState('')
  const [commentError, setCommentError] = useState<string | null>(null)
  const [commentBusy, setCommentBusy] = useState(false)
  const [noteBody, setNoteBody] = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)
  const [noteBusy, setNoteBusy] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  useEffect(() => {
    if (!Number.isInteger(ticketId) || ticketId <= 0) return
    let cancelled = false
    setState('loading')
    Promise.all([getStaffTicketDetail(ticketId), listStaffUsers().catch(() => [])])
      .then(([next, users]) => {
        if (cancelled) return
        setDetail(next)
        setDirectory(users)
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

  const refresh = async () => {
    const next = await getStaffTicketDetail(ticketId)
    setDetail(next)
  }

  const runOp = async (label: string, fn: () => Promise<Partial<StaffTicketDetailData> | { owner: { id: number; name: string } | null; currentStatus: string }>) => {
    setOpsBusy(true)
    setOpsError(null)
    setOpsSaved(null)
    try {
      const patch = await fn()
      setDetail((prev) => (prev ? { ...prev, ...patch } : prev))
      setOpsSaved(`${label} saved.`)
    } catch (error) {
      setOpsError(error instanceof Error ? error.message : `${label} failed.`)
    } finally {
      setOpsBusy(false)
      setConfirmAction(null)
    }
  }

  const handleClaim = () => void runOp('Ownership', () => claimTicket(ticketId))

  const handleAssign = () => {
    if (assignId === '') return
    if (assignId === 'unassign') {
      setConfirmAction({ kind: 'unassign' })
      return
    }
    const ownerId = Number(assignId)
    void runOp('Ownership', () => assignTicket(ticketId, ownerId))
  }

  const handleConfirm = () => {
    if (!confirmAction) return
    if (confirmAction.kind === 'unassign') {
      void runOp('Ownership', () => assignTicket(ticketId, null))
    } else {
      const value = confirmAction.value
      void runOp('Status', () => setTicketStatus(ticketId, value))
    }
  }

  const handlePriority = (value: string) => {
    if (!value) return
    void runOp('IT Priority', () => setItPriority(ticketId, value))
  }

  const handleStatus = (value: string) => {
    if (!value) return
    if (value === 'CANCELLED') {
      setConfirmAction({ kind: 'status', value })
      return
    }
    void runOp('Status', () => setTicketStatus(ticketId, value))
  }

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
      const created: TicketComment = await postStaffComment(ticketId, text)
      setDetail((prev) => (prev ? { ...prev, comments: [created, ...(prev.comments ?? [])] } : prev))
      setCommentBody('')
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Unable to post comment.')
    } finally {
      setCommentBusy(false)
    }
  }

  const handleNote = async () => {
    const text = noteBody.trim()
    if (!text) {
      setNoteError('Note must not be empty.')
      return
    }
    if (text.length > COMMENT_MAX) {
      setNoteError(`Note must be ${COMMENT_MAX} characters or fewer.`)
      return
    }
    setNoteBusy(true)
    setNoteError(null)
    try {
      const created: TicketComment = await postNote(ticketId, text)
      setDetail((prev) => (prev ? { ...prev, notes: [created, ...(prev.notes ?? [])] } : prev))
      setNoteBody('')
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : 'Unable to post note.')
    } finally {
      setNoteBusy(false)
    }
  }

  const handleDownload = async (attachmentId: number, fileName: string) => {
    setDownloadError(null)
    try {
      const blob = await staffDownloadAttachment(attachmentId)
      if (typeof URL.createObjectURL !== 'function') return
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Attachment download failed.')
    }
  }

  if (state === 'not-found' || (!Number.isInteger(ticketId) && ticketId !== undefined)) {
    return (
      <div className="tg-card" style={{ maxWidth: '720px', margin: '0 auto' }} data-testid="not-found-panel">
        <h1 className="h4">Ticket not found</h1>
        <p style={{ color: 'var(--tg-muted)' }}>This ticket does not exist.</p>
        <Link to="/staff/tickets" className="tg-btn tg-btn-primary">
          Back to Queue
        </Link>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="tg-card" style={{ maxWidth: '720px', margin: '0 auto' }} data-testid="error-state">
        <h1 className="h4">Unable to load ticket</h1>
        <p style={{ color: 'var(--tg-muted)' }}>Something went wrong on the server. Please try again.</p>
        <Link to="/staff/tickets" className="tg-btn tg-btn-secondary">
          Back to Queue
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
  const notes = detail.notes ?? []
  const legalStatuses = MATRIX[detail.currentStatus] ?? []

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
      <div className="tg-card">
        <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap mb-3">
          <h1 className="h4 mb-0" data-testid="detail-ticket-number">
            {detail.ticketNumber}
          </h1>
          <div className="d-flex gap-2">
            <span className={`tg-badge tg-badge-status-${detail.currentStatus.toLowerCase()}`}>{detail.currentStatus}</span>
            <span className={`tg-badge tg-badge-${detail.requestedPriority.toLowerCase()}`}>
              {detail.requestedPriority}
            </span>
            <span className={`tg-badge tg-badge-${detail.itPriority.toLowerCase()}`}>
              IT {detail.itPriority}
            </span>
          </div>
        </div>

        {detail.requesterResolved && (
          <p className="mb-3" data-testid="resolved-indication-line" style={{ color: 'var(--tg-success)' }}>
            ✓ Requester confirms resolved
          </p>
        )}

        <div className="row g-3 mb-3">
          <div className="col-12 col-md-4">
            <ReadOnlyField label="Ticket Date">{formatDate(detail.createdAt)}</ReadOnlyField>
          </div>
          <div className="col-12 col-md-4">
            <ReadOnlyField label="Requester">
              {detail.requester.name} ({detail.requester.email})
            </ReadOnlyField>
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

      <section className="tg-card mt-3" aria-labelledby="ops-heading" data-testid="ops-panel">
        <h2 id="ops-heading" className="h6 mb-3">
          Ticket operations
        </h2>
        <div className="row g-3 align-items-end">
          <div className="col-12 col-md-4">
            <span className="tg-label">Owner</span>
            <p className="mb-2" data-testid="owner-line">
              {detail.owner ? detail.owner.name : 'Unassigned'}
            </p>
            <div className="d-flex gap-2 flex-wrap">
              <button
                type="button"
                className="tg-btn tg-btn-secondary"
                disabled={opsBusy}
                onClick={handleClaim}
              >
                Claim
              </button>
              <select
                className="tg-field"
                aria-label="Assign owner"
                value={assignId}
                disabled={opsBusy}
                onChange={(event) => setAssignId(event.target.value)}
              >
                <option value="">Assign…</option>
                {directory.map((user) => (
                  <option key={user.id} value={String(user.id)}>
                    {user.name} ({user.role})
                  </option>
                ))}
                <option value="unassign">Unassign (back to queue)</option>
              </select>
              <button
                type="button"
                className="tg-btn tg-btn-secondary"
                disabled={opsBusy || assignId === ''}
                onClick={handleAssign}
              >
                Apply
              </button>
            </div>
          </div>
          <div className="col-12 col-md-4">
            <label className="tg-label" htmlFor="it-priority">
              IT Priority
            </label>
            <select
              id="it-priority"
              className="tg-field w-100"
              value={detail.itPriority}
              disabled={opsBusy}
              onChange={(event) => handlePriority(event.target.value)}
            >
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="col-12 col-md-4">
            <label className="tg-label" htmlFor="ticket-status">
              Status
            </label>
            <select
              id="ticket-status"
              className="tg-field w-100"
              value={detail.currentStatus}
              disabled={opsBusy}
              onChange={(event) => handleStatus(event.target.value)}
            >
              <option value={detail.currentStatus}>{detail.currentStatus} (current)</option>
              {legalStatuses
                .filter((value) => value !== detail.currentStatus)
                .map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
            </select>
          </div>
        </div>
        {opsSaved && (
          <p className="mt-2 mb-0" role="status" data-testid="ops-saved" style={{ color: 'var(--tg-success)' }}>
            {opsSaved}
          </p>
        )}
        {opsError && (
          <p className="tg-field-error mt-2" role="alert" data-testid="ops-error">
            {opsError}
          </p>
        )}
      </section>

      {confirmAction && (
        <div
          className="tg-modal-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setConfirmAction(null)
          }}
        >
          <div className="tg-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-ops-title">
            <h3 id="confirm-ops-title" className="h6 mb-1">
              {confirmAction.kind === 'unassign'
                ? 'Return this ticket to the queue?'
                : `Move this ticket to ${confirmAction.value}?`}
            </h3>
            <p className="small mb-3" style={{ color: 'var(--tg-muted)' }}>
              {confirmAction.kind === 'unassign'
                ? 'Ownership is cleared; active work returns to NEW for triage.'
                : 'Cancelled tickets cannot receive further comments or notes.'}
            </p>
            <div className="d-flex justify-content-end gap-2 mt-2">
              <button type="button" className="tg-btn tg-btn-tertiary" onClick={() => setConfirmAction(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="tg-btn tg-btn-danger"
                disabled={opsBusy}
                data-testid="confirm-ops"
                onClick={handleConfirm}
              >
                {opsBusy ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="tg-card mt-3" aria-labelledby="comments-heading" data-testid="comments-section">
        <h2 id="comments-heading" className="h6 mb-3">
          Public Comments
        </h2>
        <div className="mb-3">
          <label className="tg-label" htmlFor="comment-body">
            Reply to requester
          </label>
          <textarea
            id="comment-body"
            className="tg-field w-100"
            rows={3}
            value={commentBody}
            onChange={(event) => setCommentBody(event.target.value)}
          />
          <p className="mb-0 small" style={{ color: 'var(--tg-muted)' }}>
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
              <li key={comment.id} data-testid={`comment-row-${comment.id}`} className="tg-comment-card mb-2">
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

      <section
        className="tg-card mt-3 tg-notes-panel"
        aria-labelledby="notes-heading"
        data-testid="notes-section"
      >
        <h2 id="notes-heading" className="h6 mb-1">
          🔒 Internal Notes <span className="small">— staff only</span>
        </h2>
        <p className="small mb-3" style={{ color: 'var(--tg-muted)' }}>
          Private operational notes. Never visible to the requester — post public replies above.
        </p>
        <div className="mb-3">
          <label className="tg-label" htmlFor="note-body">
            Add internal note
          </label>
          <textarea
            id="note-body"
            className="tg-field w-100"
            rows={3}
            value={noteBody}
            onChange={(event) => setNoteBody(event.target.value)}
          />
          <p className="mb-0 small" style={{ color: 'var(--tg-muted)' }}>
            {noteBody.trim().length}/{COMMENT_MAX}
          </p>
          {noteError && (
            <p className="tg-field-error" role="alert">
              {noteError}
            </p>
          )}
          <button
            type="button"
            className="tg-btn tg-btn-primary mt-2"
            disabled={noteBusy}
            onClick={() => void handleNote()}
          >
            {noteBusy ? 'Posting…' : 'Post note'}
          </button>
        </div>
        {notes.length === 0 ? (
          <p data-testid="notes-empty" style={{ color: 'var(--tg-muted)' }}>
            No internal notes yet.
          </p>
        ) : (
          <ul className="mb-0" style={{ listStyle: 'none', paddingLeft: 0 }}>
            {notes.map((note) => (
              <li key={note.id} data-testid={`note-row-${note.id}`} className="tg-comment-card mb-2">
                <p className="mb-1" style={{ whiteSpace: 'pre-wrap' }}>
                  {note.body}
                </p>
                <p className="mb-0 small" style={{ color: 'var(--tg-muted)' }}>
                  {note.authorName} · {note.authorRole} · {formatDate(note.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tg-card mt-3" aria-labelledby="staff-attachments-heading" data-testid="attachment-section">
        <h2 id="staff-attachments-heading" className="h6 mb-2">
          Attachments
        </h2>
        <p className="small mb-2" style={{ color: 'var(--tg-muted)' }}>
          Read-only evidence uploaded by the requester.
        </p>
        {downloadError && (
          <div className="tg-error-banner" role="alert" data-testid="attachment-error">
            {downloadError}
          </div>
        )}
        {detail.attachments.length === 0 ? (
          <p data-testid="attachments-empty" style={{ color: 'var(--tg-muted)' }}>
            No attachments.
          </p>
        ) : (
          <ul className="mb-0" style={{ listStyle: 'none', paddingLeft: 0 }}>
            {detail.attachments.map((item) => (
              <li
                key={item.id}
                data-testid={`attachment-row-${item.id}`}
                className="d-flex align-items-center justify-content-between gap-2 flex-wrap py-2 border-bottom"
              >
                <div>
                  <span className="me-2">{item.originalName}</span>
                  <span className="small me-2" style={{ color: 'var(--tg-muted)' }}>
                    {formatSize(item.sizeBytes)} · {formatDate(item.uploadedAt)}
                  </span>
                  {item.removedAt && (
                    <span className="tg-badge tg-badge-removed" data-testid="attachment-removed-badge">
                      Removed
                    </span>
                  )}
                </div>
                {!item.removedAt && (
                  <button
                    type="button"
                    className="tg-btn tg-btn-secondary"
                    aria-label={`Download ${item.originalName}`}
                    onClick={() => {
                      void handleDownload(item.id, item.originalName)
                    }}
                  >
                    Download
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-3">
        <Link to="/staff/tickets" className="tg-btn tg-btn-secondary">
          Back to Queue
        </Link>
      </div>
    </div>
  )
}
