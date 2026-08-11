import { useState } from 'react'

interface SystemStatus {
  status: 'ok' | 'error'
  service: string
}

function App() {
  const [loading, setLoading] = useState(false)
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const checkSystem = async () => {
    setLoading(true)
    setError(null)
    setSystemStatus(null)
    try {
      const res = await fetch('/api/health')
      if (!res.ok) throw new Error('API unavailable')
      const data: SystemStatus = await res.json()
      setSystemStatus(data)
    } catch {
      setError('Unable to connect to TokTickIT API')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: '640px' }}>
      <div className="card shadow-sm">
        <div className="card-body p-4">
          <h1 className="card-title text-center mb-4">TokTickIT IT Service Desk</h1>
          <div className="d-grid mb-4">
            <button type="button" className="btn btn-primary btn-lg" onClick={checkSystem}>
              Check System
            </button>
          </div>
          {loading && (
            <p className="text-center text-secondary mb-3" role="status">
              ⏳ loading…
            </p>
          )}
          {systemStatus && systemStatus.status === 'ok' && !loading && (
            <div className="alert alert-success mb-3">
              System Status: Online
            </div>
          )}
          {error && !loading && (
            <div className="alert alert-danger mb-3">
              System Status: Offline
              <div className="small mt-1">{error}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
