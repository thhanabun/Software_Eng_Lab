export interface SystemStatus {
  status: 'ok' | 'error'
  service: string
}

export interface Category {
  id: number
  name: string
}

export async function getHealth(): Promise<SystemStatus> {
  const res = await fetch('/api/health')
  if (!res.ok) throw new Error('Health check failed')
  return res.json()
}

export async function getCategories(): Promise<Category[]> {
  const res = await fetch('/api/categories')
  if (!res.ok) throw new Error('Category load failed')
  return res.json()
}
