export interface SystemStatus {
  status: 'ok' | 'error'
  service: string
}

export interface Category {
  id: number
  name: string
}

export interface RelatedSystem {
  id: number
  name: string
}

export interface AuthUser {
  id: number
  name: string
  email: string
  role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR'
  active: boolean
  mustChangePassword: boolean
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

export async function getRelatedSystems(): Promise<RelatedSystem[]> {
  const res = await fetch('/api/related-systems')
  if (!res.ok) throw new Error('Related systems load failed')
  return res.json()
}

// --- Authentication (cookie session; same-origin via Vite proxy) ---

export async function login(email: string, password: string): Promise<{ user: AuthUser }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw await apiError(res, 'Sign in failed')
  return res.json()
}

export async function logout(): Promise<void> {
  const res = await fetch('/api/auth/logout', { method: 'POST' })
  if (!res.ok) throw await apiError(res, 'Sign out failed')
}

export async function getMe(): Promise<{ user: AuthUser }> {
  const res = await fetch('/api/auth/me')
  if (!res.ok) throw await apiError(res, 'Session check failed')
  return res.json()
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): Promise<{ user: AuthUser }> {
  const res = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { details?: ApiFieldError[] }
    } | null
    throw new ApiRequestError('Password change failed', res.status, body?.error?.details)
  }
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

  const res = await fetch(`/api/tickets?${query.toString()}`)
  if (!res.ok) {
    throw new ApiRequestError('Ticket list failed', res.status)
  }
  return res.json()
}

export interface AttachmentMeta {
  id: number
  ticketId: number
  originalName: string
  mimeType: string
  sizeBytes: number
  uploadedAt: string
  removedAt: string | null
  removalReason: string | null
}

export interface TicketComment {
  id: number
  body: string
  authorName: string
  authorRole: string
  createdAt: string
}

export interface TicketDetail extends Ticket {
  categoryName: string
  relatedSystemName: string
  requesterName: string
  owner: { id: number; name: string; email: string } | null
  itPriority: string
  requesterResolved: boolean
  requesterResolvedAt: string | null
  attachments: AttachmentMeta[]
  comments: TicketComment[]
}

async function apiError(res: Response, fallback: string): Promise<ApiRequestError> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
  return new ApiRequestError(body?.error?.message || fallback, res.status)
}

export async function getTicketDetail(id: number): Promise<TicketDetail> {
  const res = await fetch(`/api/tickets/${id}`)
  if (!res.ok) throw await apiError(res, 'Ticket detail failed')
  return res.json()
}

export async function postComment(ticketId: number, body: string): Promise<TicketComment> {
  const res = await fetch(`/api/tickets/${ticketId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as {
      error?: { details?: ApiFieldError[] }
    } | null
    throw new ApiRequestError('Comment failed', res.status, errBody?.error?.details)
  }
  return res.json()
}

export async function indicateResolved(
  ticketId: number,
): Promise<{ requesterResolved: boolean; requesterResolvedAt: string | null }> {
  const res = await fetch(`/api/tickets/${ticketId}/resolved-indication`, { method: 'POST' })
  if (!res.ok) throw await apiError(res, 'Indication failed')
  return res.json()
}

export async function listAttachments(ticketId: number): Promise<AttachmentMeta[]> {
  const res = await fetch(`/api/tickets/${ticketId}/attachments`)
  if (!res.ok) throw new ApiRequestError('Attachment list failed', res.status)
  return res.json()
}

export async function uploadAttachment(ticketId: number, file: File): Promise<AttachmentMeta> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`/api/tickets/${ticketId}/attachments`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw await apiError(res, 'Attachment upload failed')
  return res.json()
}

export async function removeAttachment(attachmentId: number, reason: string): Promise<AttachmentMeta> {
  const res = await fetch(`/api/attachments/${attachmentId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })
  if (!res.ok) throw await apiError(res, 'Attachment removal failed')
  return res.json()
}

export async function downloadAttachment(attachmentId: number): Promise<Blob> {
  const res = await fetch(`/api/attachments/${attachmentId}/download`)
  if (!res.ok) throw await apiError(res, 'Attachment download failed')
  return res.blob()
}
