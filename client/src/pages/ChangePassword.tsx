import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiRequestError, changePassword } from '../api'
import { homePath, useAuth } from '../authContext'

export default function ChangePassword() {
  const navigate = useNavigate()
  const { user, refresh } = useAuth()

  const forced = user?.mustChangePassword ?? false

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ currentPassword?: string; newPassword?: string; confirmPassword?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const errors: { currentPassword?: string; newPassword?: string; confirmPassword?: string } = {}
    if (!currentPassword) errors.currentPassword = 'Current password is required'
    if (!newPassword) errors.newPassword = 'New password is required'
    else if (newPassword.length < 8) errors.newPassword = 'Use at least 8 characters with a letter and a digit'
    if (confirmPassword !== newPassword) errors.confirmPassword = 'Passwords do not match'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setBusy(true)
    setFormError(null)
    try {
      const { user: updated } = await changePassword(currentPassword, newPassword, confirmPassword)
      await refresh()
      navigate(homePath(updated.role), { replace: true })
    } catch (err) {
      if (err instanceof ApiRequestError && err.details) {
        const mapped: { currentPassword?: string; newPassword?: string; confirmPassword?: string } = {}
        for (const detail of err.details) {
          if (detail.field in mapped || ['currentPassword', 'newPassword', 'confirmPassword'].includes(detail.field)) {
            mapped[detail.field as keyof typeof mapped] = detail.message
          }
        }
        setFieldErrors(mapped)
        setFormError('The password could not be saved. Check the highlighted fields.')
      } else if (err instanceof ApiRequestError) {
        setFormError(err.message)
      } else {
        setFormError('Unable to save the password. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tg-card" style={{ maxWidth: '480px', margin: '0 auto' }}>
      <h1 className="h4 mb-1">Choose a new password</h1>
      <p className="mb-4" style={{ color: 'var(--tg-muted)' }}>
        {forced
          ? `Welcome, ${user?.name ?? ''}. Your account uses an initial password — choose a new one to continue.`
          : 'Update your password below.'}
      </p>
      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="mb-3">
          <label className="tg-label" htmlFor="current-password">
            Current password <span className="tg-required-mark">*</span>
          </label>
          <input
            id="current-password"
            className={`tg-field w-100${fieldErrors.currentPassword ? ' tg-field-invalid' : ''}`}
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            aria-invalid={Boolean(fieldErrors.currentPassword)}
          />
          {fieldErrors.currentPassword && <p className="tg-field-error">{fieldErrors.currentPassword}</p>}
        </div>
        <div className="mb-3">
          <label className="tg-label" htmlFor="new-password">
            New password <span className="tg-required-mark">*</span>
          </label>
          <input
            id="new-password"
            className={`tg-field w-100${fieldErrors.newPassword ? ' tg-field-invalid' : ''}`}
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            aria-invalid={Boolean(fieldErrors.newPassword)}
            aria-describedby="new-password-hint"
          />
          <p id="new-password-hint" className="mb-0 small" style={{ color: 'var(--tg-muted)' }}>
            8–72 characters, at least one letter and one digit, different from the current password.
          </p>
          {fieldErrors.newPassword && <p className="tg-field-error">{fieldErrors.newPassword}</p>}
        </div>
        <div className="mb-3">
          <label className="tg-label" htmlFor="confirm-password">
            Confirm new password <span className="tg-required-mark">*</span>
          </label>
          <input
            id="confirm-password"
            className={`tg-field w-100${fieldErrors.confirmPassword ? ' tg-field-invalid' : ''}`}
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            aria-invalid={Boolean(fieldErrors.confirmPassword)}
          />
          {fieldErrors.confirmPassword && <p className="tg-field-error">{fieldErrors.confirmPassword}</p>}
        </div>
        {formError && (
          <div className="tg-error-banner mb-3" role="alert" data-testid="change-password-error">
            {formError}
          </div>
        )}
        <button type="submit" className="tg-btn tg-btn-primary w-100" disabled={busy}>
          {busy ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </div>
  )
}
