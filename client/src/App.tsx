import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import { RequireAuth } from './components/RequireAuth'
import SystemStatusCard from './components/SystemStatusCard'
import ChangePassword from './pages/ChangePassword'
import CreateTicket from './pages/CreateTicket'
import Login from './pages/Login'
import MyTickets from './pages/MyTickets'
import TicketDetail from './pages/TicketDetail'
import { AuthProvider, useAuth } from './authContext'

function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />
  // Staff/admin homes land in later issues; requesters start at My Tickets.
  return <Navigate to="/tickets" replace />
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
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
