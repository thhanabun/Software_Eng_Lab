import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../authContext'

export function ForbiddenPanel({ message }: { message?: string }) {
  return (
    <div className="tg-card" style={{ maxWidth: '640px', margin: '0 auto' }} data-testid="forbidden-panel">
      <h1 className="h4">Access denied</h1>
      <p style={{ color: 'var(--tg-muted)' }}>
        {message ?? 'Your role does not permit this screen.'}
      </p>
    </div>
  )
}

// Identity gate: loading spinner, redirect to /login without a session,
// force pending-change users to /change-password (BR-02).
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="tg-card" style={{ maxWidth: '640px', margin: '0 auto' }}>
        <p data-testid="auth-loading" style={{ color: 'var(--tg-muted)' }}>
          Checking your session…
        </p>
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ returnTo: location.pathname }} />
  }
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }
  return <>{children}</>
}

// Role gate: assumes RequireAuth ran first (reads context, like the server
// chain reuses req.user). Wrong role renders a safe panel, never a redirect loop.
export function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="tg-card" style={{ maxWidth: '640px', margin: '0 auto' }}>
        <p data-testid="auth-loading" style={{ color: 'var(--tg-muted)' }}>
          Checking your session…
        </p>
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }
  if (!roles.includes(user.role)) {
    return <ForbiddenPanel />
  }
  return <>{children}</>
}
