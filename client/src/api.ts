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

export interface RelatedSystem {
  id: number
  name: string
}

export interface Ticket {
  id: number
  ticketNumber: string
  requesterId: number
  categoryId: number
  relatedSystemId: number
  summary: string
  description: string
  requestedPriority: string
  currentStatus: string
  createdAt: string
  updatedAt: string
}

export interface ApiFieldError {
  field: string
  message: string
}

export class ApiRequestError extends Error {
  status: number | undefined
  details: ApiFieldError[] | undefined

  constructor(message: string, status?: number, details?: ApiFieldError[]) {
    super(message)
    this.status = status
    this.details = details
  }
}

export interface CreateTicketPayload {
  requesterId: number
  categoryId: number
  relatedSystemId: number
  summary: string
  description: string
  requestedPriority: string
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

export async function getRelatedSystems(): Promise<RelatedSystem[]> {
  const res = await fetch('/api/related-systems')
  if (!res.ok) throw new Error('Related systems load failed')
  return res.json()
}

export async function createTicket(payload: CreateTicketPayload): Promise<Ticket> {
  const res = await fetch('/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { details?: ApiFieldError[] }
    } | null
    throw new ApiRequestError(
      'Ticket creation failed',
      res.status,
      body?.error?.details,
    )
  }
  return res.json()
}
