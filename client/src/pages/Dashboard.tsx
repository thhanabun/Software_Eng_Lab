import { Navigate } from 'react-router-dom'
import { useAuth } from '../authContext'
import RequesterDashboard from './RequesterDashboard'
import StaffDashboard from './StaffDashboard'

export default function Dashboard() {
  const { user, loading } = useAuth()
  if (loading)
    return (
      <div className="tg-card" style={{ maxWidth: '960px', margin: '0 auto' }}>
        <p data-testid="loading-state" style={{ color: 'var(--tg-muted)' }}>
          Loading dashboard…
        </p>
      </div>
    )
  if (!user) return <Navigate to="/login" replace />
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />
  if (user.role === 'REQUESTER') return <RequesterDashboard />
  return <StaffDashboard />
}
