import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useRequester } from '../requesterContext'

export default function AppShell() {
  const { requester, changeRequester } = useRequester()
  const navigate = useNavigate()

  const handleChangeRequester = () => {
    changeRequester()
    navigate('/select-requester')
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
            {requester && (
              <span className="tg-requester-chip" data-testid="current-requester">
                {requester.name}
              </span>
            )}
            <button
              type="button"
              className="tg-btn tg-btn-secondary"
              style={{ minHeight: '32px', padding: '4px 12px' }}
              onClick={handleChangeRequester}
            >
              Change Requester
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
