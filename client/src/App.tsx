import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import RequireRequester from './components/RequireRequester'
import SystemStatusCard from './components/SystemStatusCard'
import CreateTicket from './pages/CreateTicket'
import MyTickets from './pages/MyTickets'
import RequesterSelection from './pages/RequesterSelection'
import TicketDetail from './pages/TicketDetail'
import { RequesterProvider, useRequester } from './requesterContext'

function RootRedirect() {
  const { requester } = useRequester()
  return <Navigate to={requester ? '/tickets' : '/select-requester'} replace />
}

function App() {
  return (
    <RequesterProvider>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/select-requester" element={<RequesterSelection />} />
        <Route path="/system" element={<SystemStatusCard />} />
        <Route
          element={
            <RequireRequester>
              <AppShell />
            </RequireRequester>
          }
        >
          <Route path="/tickets" element={<MyTickets />} />
          <Route path="/tickets/new" element={<CreateTicket />} />
          <Route path="/tickets/:id" element={<TicketDetail />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </RequesterProvider>
  )
}

export default App
