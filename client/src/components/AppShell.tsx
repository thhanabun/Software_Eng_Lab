import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../authContext'

function roleBadge(role: string): string {
  return `tg-badge tg-badge-role-${role.toLowerCase().replace('_', '-')}`
}

export default function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    // Navigate first, then drop the session in the background: once the user
    // is null on a protected route, the guard would redirect to /login WITH a
    // stale returnTo that leaks into the next login. Leaving the protected
    // tree before setUser(null) avoids the guard firing at all.
    navigate('/login', { replace: true, state: null })
    void logout()
  }

  return (
    <div>
      <header className="tg-header">
        <div className="container d-flex flex-wrap align-items-center gap-3">
          <span className="tg-brand">TokTickIT</span>
          <nav aria-label="Main navigation" className="d-flex flex-wrap gap-1">
            <NavLink to="/tickets" className="tg-nav-link" end>
              My Tickets
            </NavLink>
            <NavLink to="/tickets/new" className="tg-nav-link">
              Create Ticket
            </NavLink>
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
      <main className="tg-main container">
        <Outlet />
      </main>
    </div>
  )
}
