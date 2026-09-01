import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ApiRequestError,
  createTicket,
  getCategories,
  getRelatedSystems,
  type Category,
  type RelatedSystem,
  type Ticket,
} from '../api'
import { useRequester } from '../requesterContext'

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
const SUMMARY_MAX = 120
const DESCRIPTION_MAX = 2000
const MAX_FILE_BYTES = 5 * 1024 * 1024
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'pdf']
const MAX_ACTIVE_ATTACHMENTS = 5

interface FieldErrors {
  categoryId?: string
  relatedSystemId?: string
  summary?: string
  description?: string
  requestedPriority?: string
}

function fileExtension(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx === -1 ? '' : name.slice(idx + 1).toLowerCase()
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

export default function CreateTicket() {
  const navigate = useNavigate()
  const { requester } = useRequester()

  const [categories, setCategories] = useState<Category[]>([])
  const [systems, setSystems] = useState<RelatedSystem[]>([])
  const [referenceError, setReferenceError] = useState<string | null>(null)

  const [categoryId, setCategoryId] = useState('')
  const [relatedSystemId, setRelatedSystemId] = useState('')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [requestedPriority, setRequestedPriority] = useState('')

  const [files, setFiles] = useState<File[]>([])
  const [fileErrors, setFileErrors] = useState<string[]>([])

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [created, setCreated] = useState<Ticket | null>(null)

  const loadReferenceData = useCallback(async () => {
    setReferenceError(null)
    try {
      const [cats, rels] = await Promise.all([getCategories(), getRelatedSystems()])
      setCategories(cats)
      setSystems(rels)
    } catch {
      setReferenceError('Unable to load reference data. Please retry.')
    }
  }, [])

  useEffect(() => {
    void loadReferenceData()
  }, [loadReferenceData])

  const handleFiles = (selected: FileList | null) => {
    if (!selected || selected.length === 0) return
    const errors: string[] = []
    const accepted: File[] = []
    for (const file of Array.from(selected)) {
      if (!ALLOWED_EXTENSIONS.includes(fileExtension(file.name))) {
        errors.push(`${file.name}: unsupported file type (allowed: JPG, PNG, WEBP, PDF)`)
        continue
      }
      if (file.size > MAX_FILE_BYTES) {
        errors.push(`${file.name}: exceeds the 5 MB limit`)
        continue
      }
      accepted.push(file)
    }
    const combined = [...files, ...accepted]
    if (combined.length > MAX_ACTIVE_ATTACHMENTS) {
      errors.push(`A ticket allows at most ${MAX_ACTIVE_ATTACHMENTS} attachments`)
    }
    setFiles(combined.slice(0, MAX_ACTIVE_ATTACHMENTS))
    setFileErrors(errors)
  }

  const removeFile = (index: number) => {
    setFiles((current) => current.filter((_, i) => i !== index))
  }

  const clearAttachments = () => {
    setFiles([])
    setFileErrors([])
  }

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {}
    if (!categoryId) errors.categoryId = 'Category is required'
    if (!relatedSystemId) errors.relatedSystemId = 'Related system is required'
    if (summary.trim().length === 0) errors.summary = 'Summary is required'
    else if (summary.trim().length > SUMMARY_MAX)
      errors.summary = `Summary must be ${SUMMARY_MAX} characters or fewer`
    if (description.trim().length === 0) errors.description = 'Description is required'
    else if (description.trim().length > DESCRIPTION_MAX)
      errors.description = `Description must be ${DESCRIPTION_MAX} characters or fewer`
    if (!requestedPriority) errors.requestedPriority = 'Requested priority is required'
    return errors
  }

  const resetForm = () => {
    setCategoryId('')
    setRelatedSystemId('')
    setSummary('')
    setDescription('')
    setRequestedPriority('')
    setFiles([])
    setFileErrors([])
    setFieldErrors({})
    setSubmitError(null)
  }

  const handleSubmit = async () => {
    if (submitting || !requester) return
    setSubmitError(null)
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSubmitting(true)
    try {
      const ticket = await createTicket({
        requesterId: requester.id,
        categoryId: Number(categoryId),
        relatedSystemId: Number(relatedSystemId),
        summary: summary.trim(),
        description: description.trim(),
        requestedPriority,
      })
      setCreated(ticket)
    } catch (err) {
      if (err instanceof ApiRequestError && err.details) {
        const mapped: FieldErrors = {}
        for (const detail of err.details) {
          mapped[detail.field as keyof FieldErrors] = detail.message
        }
        setFieldErrors(mapped)
        setSubmitError('The ticket could not be saved. Check the highlighted fields.')
      } else {
        setSubmitError('Unable to create ticket. Please check the API is running and try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (created) {
    return (
      <div className="tg-success-panel" role="status" style={{ maxWidth: '640px', margin: '0 auto' }}>
        <h1 className="h4 mb-2">Ticket created</h1>
        <p className="mb-1">Your official Ticket Number is</p>
        <p className="h3 mb-3" data-testid="generated-ticket-number" style={{ color: 'var(--tg-primary)' }}>
          {created.ticketNumber}
        </p>
        <div className="d-flex gap-2 flex-wrap">
          <button
            type="button"
            className="tg-btn tg-btn-primary"
            onClick={() => navigate(`/tickets/${created.id}`)}
          >
            View Ticket
          </button>
          <button
            type="button"
            className="tg-btn tg-btn-secondary"
            onClick={() => {
              setCreated(null)
              resetForm()
            }}
          >
            Create Another
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="tg-card" style={{ maxWidth: '840px', margin: '0 auto' }}>
      <h1 className="h4 mb-4">Create Ticket</h1>

      {referenceError && (
        <div className="tg-error-banner mb-3">
          {referenceError}
          <button type="button" className="tg-btn tg-btn-secondary ms-3" onClick={() => void loadReferenceData()}>
            Retry
          </button>
        </div>
      )}
      {submitError && (
        <div className="tg-error-banner mb-3" role="alert">
          {submitError}
        </div>
      )}

      <div className="row g-3 mb-4">
        <div className="col-12 col-md-4">
          <label className="tg-label" htmlFor="ticket-number">
            Ticket Number
          </label>
          <input id="ticket-number" className="tg-field" value="—" readOnly aria-readonly="true" />
        </div>
        <div className="col-12 col-md-4">
          <label className="tg-label" htmlFor="ticket-date">
            Ticket Date
          </label>
          <input id="ticket-date" className="tg-field" value="—" readOnly aria-readonly="true" />
        </div>
        <div className="col-12 col-md-4">
          <label className="tg-label" htmlFor="requester">
            Requester
          </label>
          <input id="requester" className="tg-field" value={requester?.name ?? ''} readOnly aria-readonly="true" />
        </div>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-12 col-md-4">
          <label className="tg-label" htmlFor="category">
            Category <span className="tg-required-mark">*</span>
          </label>
          <select
            id="category"
            className={`tg-field${fieldErrors.categoryId ? ' tg-field-invalid' : ''}`}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-invalid={Boolean(fieldErrors.categoryId)}
          >
            <option value="">Select a category…</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
          {fieldErrors.categoryId && <p className="tg-field-error">{fieldErrors.categoryId}</p>}
        </div>
        <div className="col-12 col-md-4">
          <label className="tg-label" htmlFor="related-system">
            Related System <span className="tg-required-mark">*</span>
          </label>
          <select
            id="related-system"
            className={`tg-field${fieldErrors.relatedSystemId ? ' tg-field-invalid' : ''}`}
            value={relatedSystemId}
            onChange={(e) => setRelatedSystemId(e.target.value)}
            aria-invalid={Boolean(fieldErrors.relatedSystemId)}
          >
            <option value="">Select a related system…</option>
            {systems.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
          {fieldErrors.relatedSystemId && (
            <p className="tg-field-error">{fieldErrors.relatedSystemId}</p>
          )}
        </div>
        <div className="col-12 col-md-4">
          <label className="tg-label" htmlFor="priority">
            Requested Priority <span className="tg-required-mark">*</span>
          </label>
          <select
            id="priority"
            className={`tg-field${fieldErrors.requestedPriority ? ' tg-field-invalid' : ''}`}
            value={requestedPriority}
            onChange={(e) => setRequestedPriority(e.target.value)}
            aria-invalid={Boolean(fieldErrors.requestedPriority)}
          >
            <option value="">Select a priority…</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {fieldErrors.requestedPriority && (
            <p className="tg-field-error">{fieldErrors.requestedPriority}</p>
          )}
        </div>
      </div>

      <div className="mb-3">
        <label className="tg-label" htmlFor="summary">
          Ticket Summary <span className="tg-required-mark">*</span>
        </label>
        <input
          id="summary"
          className={`tg-field${fieldErrors.summary ? ' tg-field-invalid' : ''}`}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          aria-invalid={Boolean(fieldErrors.summary)}
        />
        <p className="mb-0 small" style={{ color: 'var(--tg-muted)' }}>
          {summary.trim().length}/{SUMMARY_MAX}
        </p>
        {fieldErrors.summary && <p className="tg-field-error">{fieldErrors.summary}</p>}
      </div>

      <div className="mb-3">
        <label className="tg-label" htmlFor="description">
          Description <span className="tg-required-mark">*</span>
        </label>
        <textarea
          id="description"
          className={`tg-field${fieldErrors.description ? ' tg-field-invalid' : ''}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-invalid={Boolean(fieldErrors.description)}
        />
        <p className="mb-0 small" style={{ color: 'var(--tg-muted)' }}>
          {description.trim().length}/{DESCRIPTION_MAX}
        </p>
        {fieldErrors.description && <p className="tg-field-error">{fieldErrors.description}</p>}
      </div>

      <div className="mb-4">
        <label className="tg-label" htmlFor="attachments">
          Attachments
        </label>
        <p className="small mb-2" style={{ color: 'var(--tg-muted)' }}>
          JPG, PNG, WEBP or PDF · up to 5 MB · up to {MAX_ACTIVE_ATTACHMENTS} files
        </p>
        <input
          id="attachments"
          type="file"
          multiple
          className="tg-field"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
        {fileErrors.map((message) => (
          <p key={message} className="tg-field-error mb-0">
            {message}
          </p>
        ))}
        {(files.length > 0 || fileErrors.length > 0) && (
          <button
            type="button"
            className="tg-btn tg-btn-tertiary mt-2"
            style={{ minHeight: '28px', padding: '2px 8px' }}
            onClick={clearAttachments}
          >
            Clear attachments
          </button>
        )}
        {files.length > 0 && (
          <ul className="mt-2 mb-0" style={{ listStyle: 'none', paddingLeft: 0 }}>
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="d-flex align-items-center gap-2 mb-1">
                <span>{file.name}</span>
                <span className="small" style={{ color: 'var(--tg-muted)' }}>
                  ({formatSize(file.size)})
                </span>
                <button
                  type="button"
                  className="tg-btn-icon"
                  aria-label={`Remove attachment ${file.name}`}
                  title={`Remove ${file.name}`}
                  onClick={() => removeFile(index)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="d-flex gap-2 flex-wrap">
        <button
          type="button"
          className="tg-btn tg-btn-primary"
          disabled={submitting}
          onClick={() => void handleSubmit()}
        >
          {submitting ? 'Submitting…' : 'Submit Ticket'}
        </button>
        <button
          type="button"
          className="tg-btn tg-btn-secondary"
          onClick={() => navigate('/tickets')}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
