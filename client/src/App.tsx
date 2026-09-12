import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import { RequireAuth, RequireRole } from './components/RequireAuth'
import SystemStatusCard from './components/SystemStatusCard'
import ChangePassword from './pages/ChangePassword'
import CreateTicket from './pages/CreateTicket'
import Login from './pages/Login'
import MyTickets from './pages/MyTickets'
import StaffTicketQueue from './pages/StaffTicketQueue'
import StaffTicketDetail from './pages/StaffTicketDetail'
import UserManagement from './pages/UserManagement'
import TicketDetail from './pages/TicketDetail'
import { AuthProvider, homePath, useAuth } from './authContext'

function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />
  return <Navigate to={homePath(user.role)} replace />
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/change-password"
          element={
            <RequireAuth>
              <ChangePassword />
            </RequireAuth>
          }
        />
        <Route path="/system" element={<SystemStatusCard />} />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/tickets" element={<MyTickets />} />
          <Route path="/tickets/new" element={<CreateTicket />} />
          <Route path="/tickets/:id" element={<TicketDetail />} />
          <Route
            path="/staff/tickets"
            element={
              <RequireRole roles={['IT_STAFF', 'ADMINISTRATOR']}>
                <StaffTicketQueue />
              </RequireRole>
            }
          />
          <Route
            path="/staff/tickets/:id"
            element={
              <RequireRole roles={['IT_STAFF', 'ADMINISTRATOR']}>
                <StaffTicketDetail />
              </RequireRole>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RequireRole roles={['ADMINISTRATOR']}>
                <UserManagement />
              </RequireRole>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
