import { useState } from 'react'
import { getCategories, getHealth, type Category, type SystemStatus } from '../api'

export default function SystemStatusCard() {
  const [loading, setLoading] = useState(false)
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const checkSystem = async () => {
    setLoading(true)
    setError(null)
    setSystemStatus(null)
    setCategories(null)
    try {
      const [health, cats] = await Promise.all([getHealth(), getCategories()])
      setSystemStatus(health)
      setCategories(cats)
    } catch {
      setError('Unable to connect to TokTickIT API')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="tg-card" style={{ maxWidth: '640px', margin: '0 auto' }}>
      <h1 className="h4 text-center mb-4">TokTickIT IT Service Desk</h1>
      <div className="d-grid mb-4">
        <button type="button" className="tg-btn tg-btn-primary justify-content-center" onClick={checkSystem}>
          Check System
        </button>
      </div>
      {loading && (
        <p className="text-center mb-3" style={{ color: 'var(--tg-muted)' }} role="status">
          ⏳ loading…
        </p>
      )}
      {systemStatus && systemStatus.status === 'ok' && !loading && (
        <div className="tg-success-panel mb-3">System Status: Online</div>
      )}
      {error && !loading && (
        <div className="tg-error-banner mb-3">
          System Status: Offline
          <div className="small mt-1">{error}</div>
        </div>
      )}
      {categories && !loading && (
        <div>
          <h2 className="h5 mb-2">Supported Request Categories</h2>
          <ol className="mb-0">
            {categories.map((category) => (
              <li key={category.id}>{category.name}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
