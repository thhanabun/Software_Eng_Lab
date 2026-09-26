import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ApiRequestError,
  assignTicket,
  claimTicket,
  createAction,
  getStaffTicketDetail,
  listStaffActions,
  listStaffUsers,
  postNote,
  postStaffComment,
  setItPriority,
  setTicketStatus,
  staffDownloadAttachment,
  updateAction,
  type ActionTaken,
  type StaffTicketDetail as StaffTicketDetailData,
  type StaffUser,
  type TicketComment,
} from '../api'
import { formatDate, formatSize } from '../lib/format'

type LoadState = 'loading' | 'ready' | 'not-found' | 'error'

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
const COMMENT_MAX = 2000
const ACTION_DESC_MAX = 2000
const ACTION_RESULT_MAX = 2000
const FOLLOWUP_NOTE_MAX = 1000
const ATTACH_NOTES_MAX = 500

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

  const [actions, setActions] = useState<ActionTaken[]>([])
  const [actionDesc, setActionDesc] = useState('')
  const [actionResult, setActionResult] = useState('')
  const [actionFollowUp, setActionFollowUp] = useState(false)
  const [actionFollowNote, setActionFollowNote] = useState('')
  const [actionAttachNotes, setActionAttachNotes] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionConflict, setActionConflict] = useState<string | null>(null)
  const [editingActionId, setEditingActionId] = useState<number | null>(null)

  useEffect(() => {
    if (!Number.isInteger(ticketId) || ticketId <= 0) return
    let cancelled = false
    setState('loading')
    Promise.all([
      getStaffTicketDetail(ticketId),
      listStaffUsers().catch(() => []),
      listStaffActions(ticketId)
        .then((r) => r.items)
        .catch(() => []),
    ])
      .then(([next, users, actionItems]) => {
        if (cancelled) return
        setDetail(next)
        setDirectory(users)
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

  const refresh = async () => {
    const next = await getStaffTicketDetail(ticketId)
    setDetail(next)
  }

  const runOp = async (label: string, fn: () => Promise<Partial<StaffTicketDetailData> | { owner: { id: number; name: string } | null; currentStatus: string; updatedAt?: string }>) => {
    setOpsBusy(true)
    setOpsError(null)
    setOpsSaved(null)
    try {
      const patch = await fn()
      setDetail((prev) => (prev ? { ...prev, ...patch } : prev))
      setOpsSaved(`${label} saved.`)
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        await refresh()
        setOpsError('Ticket was updated by another user. Reloaded the latest state — please retry.')
      } else {
        setOpsError(error instanceof Error ? error.message : `${label} failed.`)
      }
    } finally {
      setOpsBusy(false)
      setConfirmAction(null)
    }
  }

  const stamp = () => detail?.updatedAt

  const handleClaim = () => void runOp('Ownership', () => claimTicket(ticketId))

  const handleAssign = () => {
    if (assignId === '') return
    if (assignId === 'unassign') {
      setConfirmAction({ kind: 'unassign' })
      return
    }
    const ownerId = Number(assignId)
    void runOp('Ownership', () => assignTicket(ticketId, ownerId, stamp()))
  }

  const handleConfirm = () => {
    if (!confirmAction) return
    if (confirmAction.kind === 'unassign') {
      void runOp('Ownership', () => assignTicket(ticketId, null, stamp()))
    } else {
      const value = confirmAction.value
      void runOp('Status', () => setTicketStatus(ticketId, value, stamp()))
    }
  }

  const handlePriority = (value: string) => {
    if (!value) return
    void runOp('IT Priority', () => setItPriority(ticketId, value, stamp()))
  }

  const handleStatus = (value: string) => {
    if (!value) return
    if (value === 'CANCELLED') {
      setConfirmAction({ kind: 'status', value })
      return
    }
    void runOp('Status', () => setTicketStatus(ticketId, value, stamp()))
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

  const resetActionForm = () => {
    setActionDesc('')
    setActionResult('')
    setActionFollowUp(false)
    setActionFollowNote('')
    setActionAttachNotes('')
    setActionError(null)
    setActionConflict(null)
    setEditingActionId(null)
  }

  const validateActionForm = (): string | null => {
    if (!actionDesc.trim()) return 'Description must not be empty.'
    if (actionDesc.trim().length > ACTION_DESC_MAX)
      return `Description must be ${ACTION_DESC_MAX} characters or fewer.`
    if (!actionResult.trim()) return 'Result must not be empty.'
    if (actionResult.trim().length > ACTION_RESULT_MAX)
      return `Result must be ${ACTION_RESULT_MAX} characters or fewer.`
    if (actionFollowUp && !actionFollowNote.trim()) return 'Follow-up note is required when follow-up is needed.'
    if (actionFollowNote.trim().length > FOLLOWUP_NOTE_MAX)
      return `Follow-up note must be ${FOLLOWUP_NOTE_MAX} characters or fewer.`
    if (!actionFollowUp && actionFollowNote.trim())
      return 'Follow-up note must be blank when follow-up is not needed.'
    if (actionAttachNotes.trim().length > ATTACH_NOTES_MAX)
      return `Attachment notes must be ${ATTACH_NOTES_MAX} characters or fewer.`
    return null
  }

  const actionPayload = () => ({
    description: actionDesc.trim(),
    result: actionResult.trim(),
    followUpRequired: actionFollowUp,
    followUpNote: actionFollowUp ? actionFollowNote.trim() : null,
    attachmentNotes: actionAttachNotes.trim() || null,
  })

  const handleActionSave = async () => {
    const problem = validateActionForm()
    if (problem) {
      setActionError(problem)
      return
    }
    setActionBusy(true)
    setActionError(null)
    setActionConflict(null)
    try {
      const created = await createAction(ticketId, actionPayload())
      setActions((prev) => [created, ...prev])
      resetActionForm()
      await refresh()
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        setActionConflict('Ticket was updated by another user. Reload to get the latest state.')
      } else {
        setActionError(error instanceof Error ? error.message : 'Unable to save action.')
      }
    } finally {
      setActionBusy(false)
    }
  }

  const handleActionEdit = (action: ActionTaken) => {
    setEditingActionId(action.id)
    setActionDesc(action.description)
    setActionResult(action.result)
    setActionFollowUp(action.followUpRequired)
    setActionFollowNote(action.followUpNote ?? '')
    setActionAttachNotes(action.attachmentNotes ?? '')
    setActionError(null)
    setActionConflict(null)
  }

  const handleActionUpdate = async () => {
    if (editingActionId === null || !detail) return
    const problem = validateActionForm()
    if (problem) {
      setActionError(problem)
      return
    }
    setActionBusy(true)
    setActionError(null)
    setActionConflict(null)
    try {
      const updated = await updateAction(ticketId, editingActionId, {
        ...actionPayload(),
        expectedUpdatedAt: detail.updatedAt,
      })
      setActions((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
      resetActionForm()
      await refresh()
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        setActionConflict('Ticket was updated by another user. Reload to get the latest state.')
      } else {
        setActionError(error instanceof Error ? error.message : 'Unable to save action.')
      }
    } finally {
      setActionBusy(false)
    }
  }

  const handleActionConflictReload = async () => {
    setActionConflict(null)
    const [nextActions] = await Promise.all([
      listStaffActions(ticketId)
        .then((r) => r.items)
        .catch(() => null),
      refresh(),
    ])
    if (nextActions !== null) setActions(nextActions)
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

      <section className="tg-card mt-3" aria-labelledby="actions-heading" data-testid="actions-section">
        <h2 id="actions-heading" className="h6 mb-1">
          🛠️ Actions Taken
        </h2>
        <p className="small mb-3" style={{ color: 'var(--tg-muted)' }}>
          Work records for this ticket. The performer and timestamp are recorded automatically.
        </p>
        <div className="mb-3">
          <label className="tg-label" htmlFor="action-description">
            Action description
          </label>
          <textarea
            id="action-description"
            className="tg-field w-100"
            rows={3}
            value={actionDesc}
            onChange={(event) => setActionDesc(event.target.value)}
            aria-describedby="action-description-counter"
          />
          <p id="action-description-counter" className="mb-0 small" style={{ color: 'var(--tg-muted)' }}>
            {actionDesc.trim().length}/{ACTION_DESC_MAX}
          </p>
          <label className="tg-label mt-2" htmlFor="action-result">
            Result
          </label>
          <textarea
            id="action-result"
            className="tg-field w-100"
            rows={2}
            value={actionResult}
            onChange={(event) => setActionResult(event.target.value)}
            aria-describedby="action-result-counter"
          />
          <p id="action-result-counter" className="mb-0 small" style={{ color: 'var(--tg-muted)' }}>
            {actionResult.trim().length}/{ACTION_RESULT_MAX}
          </p>
          <div className="form-check mt-2">
            <input
              id="action-followup"
              className="form-check-input"
              type="checkbox"
              checked={actionFollowUp}
              onChange={(event) => setActionFollowUp(event.target.checked)}
            />
            <label className="form-check-label" htmlFor="action-followup">
              Follow-up required?
            </label>
          </div>
          {actionFollowUp && (
            <div className="mt-2">
              <label className="tg-label" htmlFor="action-followup-note">
                Follow-up note
              </label>
              <textarea
                id="action-followup-note"
                className="tg-field w-100"
                rows={2}
                value={actionFollowNote}
                onChange={(event) => setActionFollowNote(event.target.value)}
                aria-describedby="action-followup-note-counter"
              />
              <p id="action-followup-note-counter" className="mb-0 small" style={{ color: 'var(--tg-muted)' }}>
                {actionFollowNote.trim().length}/{FOLLOWUP_NOTE_MAX}
              </p>
            </div>
          )}
          <label className="tg-label mt-2" htmlFor="action-attachment-notes">
            Attachment notes
          </label>
          <input
            id="action-attachment-notes"
            className="tg-field w-100"
            type="text"
            placeholder="Which file to look at (optional)"
            value={actionAttachNotes}
            onChange={(event) => setActionAttachNotes(event.target.value)}
          />
          {actionError && (
            <p className="tg-field-error" role="alert" data-testid="action-error">
              {actionError}
            </p>
          )}
          {actionConflict && (
            <div className="tg-error-banner mt-2" role="alert" data-testid="action-conflict">
              {actionConflict}{' '}
              <button
                type="button"
                className="tg-btn tg-btn-secondary mt-2"
                onClick={() => void handleActionConflictReload()}
              >
                Reload ticket
              </button>
            </div>
          )}
          <div className="d-flex gap-2 mt-2">
            {editingActionId === null ? (
              <button
                type="button"
                className="tg-btn tg-btn-primary"
                disabled={actionBusy}
                data-testid="action-save"
                onClick={() => void handleActionSave()}
              >
                {actionBusy ? 'Saving…' : 'Post action'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="tg-btn tg-btn-primary"
                  disabled={actionBusy}
                  data-testid="action-save"
                  onClick={() => void handleActionUpdate()}
                >
                  {actionBusy ? 'Saving…' : 'Save changes'}
                </button>
                <button
                  type="button"
                  className="tg-btn tg-btn-tertiary"
                  disabled={actionBusy}
                  onClick={resetActionForm}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
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
                <p className="mb-1 small" style={{ color: 'var(--tg-muted)' }}>
                  {action.performedBy.name} · {formatDate(action.createdAt)}
                </p>
                <button
                  type="button"
                  className="tg-btn tg-btn-tertiary"
                  aria-label={`Edit action ${action.id}`}
                  data-testid={`action-edit-${action.id}`}
                  onClick={() => handleActionEdit(action)}
                >
                  Edit
                </button>
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
