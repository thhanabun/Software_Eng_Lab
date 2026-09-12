import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../authContext'

function roleBadge(role: string): string {
  return `tg-badge tg-badge-role-${role.toLowerCase().replace('_', '-')}`
}

export default function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [logoutError, setLogoutError] = useState<string | null>(null)

  const handleLogout = () => {
    // Navigate first (avoids a stale guard returnTo), then drop the session;
    // a failed sign-out still lands on /login but surfaces the failure.
    navigate('/login', { replace: true, state: null })
    void logout().catch(() => setLogoutError('Sign out failed on the server. Your session may still be active.'))
  }

  const isStaff = user?.role === 'IT_STAFF' || user?.role === 'ADMINISTRATOR'

  return (
    <div>
      <header className="tg-header">
        <div className="container d-flex flex-wrap align-items-center gap-3">
          <span className="tg-brand">TokTickIT</span>
          <nav aria-label="Main navigation" className="d-flex flex-wrap gap-1">
            {!isStaff && (
              <>
                <NavLink to="/tickets" className="tg-nav-link" end>
                  My Tickets
                </NavLink>
                <NavLink to="/tickets/new" className="tg-nav-link">
                  Create Ticket
                </NavLink>
              </>
            )}
            {isStaff && (
              <NavLink to="/staff/tickets" className="tg-nav-link" end>
                Ticket Queue
              </NavLink>
            )}
          </nav>
          <div className="ms-auto d-flex align-items-center gap-2 flex-wrap">
            {user && (
              <>
                <span className="tg-requester-chip" data-testid="current-user">
                  {user.name}
                </span>
                <span className={roleBadge(user.role)} data-testid="current-role">
                  {user.role}
                </span>
              </>
            )}
            <button
              type="button"
              className="tg-btn tg-btn-secondary"
              style={{ minHeight: '32px', padding: '4px 12px' }}
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      {logoutError && (
        <div className="container mt-2">
          <div className="tg-error-banner" role="alert">
            {logoutError}
          </div>
        </div>
      )}
      <main className="tg-main container">
        <Outlet />
      </main>
    </div>
  )
}
