import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import RequireRequester from './components/RequireRequester'
import SystemStatusCard from './components/SystemStatusCard'
import CreateTicketPlaceholder from './pages/CreateTicketPlaceholder'
import MyTicketsPlaceholder from './pages/MyTicketsPlaceholder'
import RequesterSelection from './pages/RequesterSelection'
import TicketDetailPlaceholder from './pages/TicketDetailPlaceholder'
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
          <Route path="/tickets" element={<MyTicketsPlaceholder />} />
          <Route path="/tickets/new" element={<CreateTicketPlaceholder />} />
          <Route path="/tickets/:id" element={<TicketDetailPlaceholder />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </RequesterProvider>
  )
}

export default App
