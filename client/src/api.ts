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

export interface TicketListItem {
  id: number
  ticketNumber: string
  summary: string
  requestedPriority: string
  currentStatus: string
  categoryId: number
  categoryName: string
  createdAt: string
  updatedAt: string
}

export interface TicketListResult {
  items: TicketListItem[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export interface TicketListParams {
  requesterId: number
  search?: string
  categoryId?: number | ''
  status?: string
  priority?: string
  sort?: string
  page?: number
  pageSize?: number
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

export async function listTickets(params: TicketListParams): Promise<TicketListResult> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.categoryId) query.set('categoryId', String(params.categoryId))
  if (params.status) query.set('status', params.status)
  if (params.priority) query.set('priority', params.priority)
  if (params.sort) query.set('sort', params.sort)
  if (params.page && params.page > 1) query.set('page', String(params.page))
  if (params.pageSize && params.pageSize !== 10) query.set('pageSize', String(params.pageSize))

  const res = await fetch(`/api/tickets?${query.toString()}`, {
    headers: { 'X-Requester-Id': String(params.requesterId) },
  })
  if (!res.ok) {
    throw new ApiRequestError('Ticket list failed', res.status)
  }
  return res.json()
}
