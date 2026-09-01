export interface SystemStatus {
  status: 'ok' | 'error'
  service: string
}

export interface Category {
  id: number
  name: string
}

export interface Requester {
  id: number
  name: string
  email: string
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

export async function getRequesters(): Promise<Requester[]> {
  const res = await fetch('/api/requesters')
  if (!res.ok) throw new Error('Requester load failed')
  return res.json()
}
