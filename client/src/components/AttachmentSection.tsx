import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  downloadAttachment,
  listAttachments,
  removeAttachment,
  uploadAttachment,
  type AttachmentMeta,
} from '../api'
import { useRequester } from '../requesterContext'
import { formatDate, formatSize } from '../lib/format'

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'pdf']
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_FILE_BYTES = 5 * 1024 * 1024
const REASON_MAX = 200

function extensionOf(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx === -1 ? '' : name.slice(idx + 1).toLowerCase()
}

export default function AttachmentSection({ ticketId }: { ticketId: number }) {
  const { requester } = useRequester()
  const [items, setItems] = useState<AttachmentMeta[]>([])
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState<AttachmentMeta | null>(null)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [removeBusy, setRemoveBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(() => {
    if (!requester) return
    listAttachments(ticketId, requester.id)
      .then((next) => {
        setItems(next)
        setLoadError('')
      })
      .catch(() => setLoadError('Unable to load attachments.'))
  }, [requester, ticketId])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    if (!removing) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRemoving(null)
        setReason('')
        setReasonError('')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [removing])

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !requester) return

    if (!ALLOWED_EXTENSIONS.includes(extensionOf(file.name)) || !ALLOWED_MIME.includes(file.type)) {
      setActionError(`"${file.name}" is not an allowed file type. Use JPG, PNG, WEBP or PDF.`)
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setActionError(`"${file.name}" exceeds the 5 MB size limit.`)
      return
    }

    setUploading(true)
    setActionError('')
    try {
      const created = await uploadAttachment(ticketId, requester.id, file)
      setItems((prev) => [created, ...prev])
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Attachment upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = async (item: AttachmentMeta) => {
    if (!requester) return
    setActionError('')
    try {
      const blob = await downloadAttachment(item.id, requester.id)
      if (typeof URL.createObjectURL !== 'function') return
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = item.originalName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Attachment download failed.')
    }
  }

  const closeRemove = () => {
    setRemoving(null)
    setReason('')
    setReasonError('')
  }

  const confirmRemove = async () => {
    const trimmed = reason.trim()
    if (!trimmed) {
      setReasonError('A removal reason is required.')
      return
    }
    if (trimmed.length > REASON_MAX || !removing || !requester) {
      setReasonError(`Removal reason must be ${REASON_MAX} characters or fewer.`)
      return
    }

    setRemoveBusy(true)
    try {
      const updated = await removeAttachment(removing.id, requester.id, trimmed)
      setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      closeRemove()
    } catch (error) {
      setReasonError(error instanceof Error ? error.message : 'Unable to remove attachment.')
    } finally {
      setRemoveBusy(false)
    }
  }

  return (
    <section className="tg-card mt-3" aria-labelledby="attachments-heading" data-testid="attachment-section">
      <div className="d-flex align-items-center justify-content-between gap-3 mb-2">
        <h2 id="attachments-heading" className="h6 mb-0">
          Attachments
        </h2>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            className="d-none"
            aria-label="Choose attachment file"
            onChange={handleFiles}
          />
          <button
            type="button"
            className="tg-btn tg-btn-secondary"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? 'Uploading…' : 'Upload file'}
          </button>
        </div>
      </div>
      <p className="small mb-2" style={{ color: 'var(--tg-muted)' }}>
        JPG, PNG, WEBP or PDF · up to 5 MB · up to 5 active files per ticket
      </p>

      {loadError && (
        <div className="tg-error-banner" role="alert">
          {loadError}{' '}
          <button type="button" className="tg-btn tg-btn-secondary" onClick={reload}>
            Retry
          </button>
        </div>
      )}
      {actionError && (
        <div className="tg-error-banner" role="alert" data-testid="attachment-error">
          {actionError}
        </div>
      )}

      {items.length === 0 && !loadError && (
        <p data-testid="attachments-empty" style={{ color: 'var(--tg-muted)' }}>
          No attachments yet.
        </p>
      )}

      {items.length > 0 && (
        <ul className="mb-0" style={{ listStyle: 'none', paddingLeft: 0 }}>
          {items.map((item) => (
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
                {item.removedAt ? (
                  <span className="tg-badge tg-badge-removed" data-testid="attachment-removed-badge">
                    Removed
                  </span>
                ) : (
                  <span className="tg-badge">Active</span>
                )}
                {item.removedAt && (
                  <div className="small" data-testid="attachment-removal-reason" style={{ color: 'var(--tg-muted)' }}>
                    Removed on {formatDate(item.removedAt)} · Reason: {item.removalReason}
                  </div>
                )}
              </div>
              {!item.removedAt && (
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="tg-btn tg-btn-secondary"
                    aria-label={`Download ${item.originalName}`}
                    onClick={() => {
                      void handleDownload(item)
                    }}
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    className="tg-btn tg-btn-danger"
                    aria-label={`Remove ${item.originalName}`}
                    onClick={() => {
                      setRemoving(item)
                      setActionError('')
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {removing && (
        <div
          className="tg-modal-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeRemove()
          }}
        >
          <div className="tg-modal" role="dialog" aria-modal="true" aria-labelledby="remove-attachment-title">
            <h3 id="remove-attachment-title" className="h6 mb-1">
              Remove "{removing.originalName}"?
            </h3>
            <p className="small mb-3" style={{ color: 'var(--tg-muted)' }}>
              A removed file can no longer be downloaded, but its metadata stays visible on this ticket.
            </p>
            <label className="tg-label" htmlFor="removal-reason">
              Removal reason <span className="tg-required-mark">*</span>
            </label>
            <textarea
              id="removal-reason"
              className={`tg-field w-100${reasonError ? ' tg-field-invalid' : ''}`}
              rows={3}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value)
                setReasonError('')
              }}
            />
            {reasonError && <p className="tg-field-error">{reasonError}</p>}
            <div className="d-flex justify-content-end gap-2 mt-2">
              <button type="button" className="tg-btn tg-btn-tertiary" onClick={closeRemove}>
                Cancel
              </button>
              <button
                type="button"
                className="tg-btn tg-btn-danger"
                disabled={removeBusy}
                data-testid="confirm-remove"
                onClick={() => {
                  void confirmRemove()
                }}
              >
                {removeBusy ? 'Removing…' : 'Confirm remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
