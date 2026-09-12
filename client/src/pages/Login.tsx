import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import type { Location } from 'react-router-dom'
import { ApiRequestError } from '../api'
import { homePath, useAuth } from '../authContext'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation() as Location & { state?: { returnTo?: string } }
  const { user, login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Already signed in (e.g. back-button to /login): leave the form.
  if (user && !user.mustChangePassword) {
    return <Navigate to={homePath(user.role)} replace />
  }
  if (user && user.mustChangePassword) {
    return <Navigate to="/change-password" replace />
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const errors: { email?: string; password?: string } = {}
    if (!email.trim()) errors.email = 'Email is required'
    if (!password) errors.password = 'Password is required'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setBusy(true)
    setFormError(null)
    try {
      const user = await login(email.trim(), password)
      if (user.mustChangePassword) {
        navigate('/change-password', { replace: true })
      } else if (user.role !== 'REQUESTER') {
        const returnTo = location.state?.returnTo
        navigate(returnTo?.startsWith('/staff') ? returnTo : homePath(user.role), { replace: true })
      } else {
        navigate(location.state?.returnTo ?? '/tickets', { replace: true })
      }
    } catch (err) {
      // Generic vs deactivated messages come from the server (BR-06/BR-07);
      // the client never distinguishes the cause beyond what it is told.
      if (err instanceof ApiRequestError) {
        setFormError(err.message)
      } else {
        setFormError('Unable to sign in. Please check the API is running and try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tg-card" style={{ maxWidth: '480px', margin: '0 auto' }}>
      <h1 className="h4 mb-1">TokTickIT</h1>
      <p className="mb-4" style={{ color: 'var(--tg-muted)' }}>
        Sign in with your email and password.
      </p>
      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="mb-3">
          <label className="tg-label" htmlFor="login-email">
            Email <span className="tg-required-mark">*</span>
          </label>
          <input
            id="login-email"
            className={`tg-field w-100${fieldErrors.email ? ' tg-field-invalid' : ''}`}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
          />
          {fieldErrors.email && <p className="tg-field-error">{fieldErrors.email}</p>}
        </div>
        <div className="mb-3">
          <label className="tg-label" htmlFor="login-password">
            Password <span className="tg-required-mark">*</span>
          </label>
          <input
            id="login-password"
            className={`tg-field w-100${fieldErrors.password ? ' tg-field-invalid' : ''}`}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
          />
          {fieldErrors.password && <p className="tg-field-error">{fieldErrors.password}</p>}
        </div>
        {formError && (
          <div className="tg-error-banner mb-3" role="alert" data-testid="login-error">
            {formError}
          </div>
        )}
        <button type="submit" className="tg-btn tg-btn-primary w-100" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
