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

// --- IT Staff queue ---

export interface StaffQueueItem {
  id: number
  ticketNumber: string
  summary: string
  categoryName: string
  requestedPriority: string
  itPriority: string
  currentStatus: string
  owner: string | null
  requesterName: string
  createdAt: string
  updatedAt: string
}

export interface StaffQueueResult {
  items: StaffQueueItem[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export interface StaffQueueParams {
  search?: string
  status?: string
  categoryId?: number | ''
  requestedPriority?: string
  itPriority?: string
  ownerId?: number | 'unassigned' | ''
  sort?: string
  page?: number
  pageSize?: number
}

export async function listStaffTickets(params: StaffQueueParams): Promise<StaffQueueResult> {  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.status) query.set('status', params.status)
  if (params.categoryId) query.set('categoryId', String(params.categoryId))
  if (params.requestedPriority) query.set('requestedPriority', params.requestedPriority)
  if (params.itPriority) query.set('itPriority', params.itPriority)
  if (params.ownerId) query.set('ownerId', String(params.ownerId))
  if (params.sort) query.set('sort', params.sort)
  if (params.page && params.page > 1) query.set('page', String(params.page))
  if (params.pageSize && params.pageSize !== 10) query.set('pageSize', String(params.pageSize))

  const res = await fetch(`/api/staff/tickets?${query.toString()}`)
  if (!res.ok) {
    throw new ApiRequestError('Ticket queue failed', res.status)
  }
  return res.json()
}

// --- IT Staff ticket operations ---

export interface StaffTicketDetail extends Ticket {
  categoryName: string
  relatedSystemName: string
  requester: { id: number; name: string; email: string }
  owner: { id: number; name: string } | null
  itPriority: string
  requesterResolved: boolean
  requesterResolvedAt: string | null
  comments: TicketComment[]
  notes: TicketComment[]
  attachments: AttachmentMeta[]
}

export interface StaffUser {
  id: number
  name: string
  role: string
}

export async function getStaffTicketDetail(id: number): Promise<StaffTicketDetail> {
  const res = await fetch(`/api/staff/tickets/${id}`)
  if (!res.ok) throw await apiError(res, 'Staff ticket detail failed')
  return res.json()
}

export async function claimTicket(
  id: number,
): Promise<{ owner: { id: number; name: string } | null; currentStatus: string }> {
  const res = await fetch(`/api/staff/tickets/${id}/claim`, { method: 'POST' })
  if (!res.ok) throw await apiError(res, 'Claim failed')
  return res.json()
}

export async function assignTicket(
  id: number,
  ownerId: number | null,
): Promise<{ owner: { id: number; name: string } | null; currentStatus: string }> {
  const res = await fetch(`/api/staff/tickets/${id}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerId }),
  })
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as {
      error?: { details?: ApiFieldError[] }
    } | null
    throw new ApiRequestError('Assign failed', res.status, errBody?.error?.details)
  }
  return res.json()
}

export async function setItPriority(id: number, itPriority: string): Promise<{ itPriority: string }> {
  const res = await fetch(`/api/staff/tickets/${id}/priority`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itPriority }),
  })
  if (!res.ok) throw await apiError(res, 'Priority update failed')
  return res.json()
}

export async function setTicketStatus(
  id: number,
  status: string,
): Promise<{ currentStatus: string }> {
  const res = await fetch(`/api/staff/tickets/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as {
      error?: { details?: ApiFieldError[] }
    } | null
    throw new ApiRequestError('Status update failed', res.status, errBody?.error?.details)
  }
  return res.json()
}

export async function postNote(ticketId: number, body: string): Promise<TicketComment> {  const res = await fetch(`/api/staff/tickets/${ticketId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as {
      error?: { details?: ApiFieldError[] }
    } | null
    throw new ApiRequestError('Note failed', res.status, errBody?.error?.details)
  }
  return res.json()
}

export async function postStaffComment(ticketId: number, body: string): Promise<TicketComment> {
  const res = await fetch(`/api/staff/tickets/${ticketId}/comments`, {
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

export interface ActionTaken {
  id: number
  description: string
  result: string
  performedBy: { id: number; name: string }
  followUpRequired: boolean
  followUpNote: string | null
  attachmentNotes: string | null
  createdAt: string
  updatedAt: string
}

export interface ActionInput {
  description: string
  result: string
  followUpRequired: boolean
  followUpNote?: string | null
  attachmentNotes?: string | null
  expectedUpdatedAt?: string
}

async function actionResult(res: Response, label: string): Promise<ActionTaken> {
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as {
      error?: { details?: ApiFieldError[] }
    } | null
    throw new ApiRequestError(label, res.status, errBody?.error?.details)
  }
  return res.json()
}

export async function listStaffActions(ticketId: number): Promise<{ items: ActionTaken[] }> {
  const res = await fetch(`/api/staff/tickets/${ticketId}/actions`)
  if (!res.ok) throw await apiError(res, 'Actions failed')
  return res.json()
}

export async function listTicketActions(ticketId: number): Promise<{ items: ActionTaken[] }> {
  const res = await fetch(`/api/tickets/${ticketId}/actions`)
  if (!res.ok) throw await apiError(res, 'Actions failed')
  return res.json()
}

export async function createAction(ticketId: number, input: ActionInput): Promise<ActionTaken> {
  const res = await fetch(`/api/staff/tickets/${ticketId}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return actionResult(res, 'Action failed')
}

export async function updateAction(
  ticketId: number,
  actionId: number,
  input: ActionInput,
): Promise<ActionTaken> {
  const res = await fetch(`/api/staff/tickets/${ticketId}/actions/${actionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return actionResult(res, 'Action update failed')
}

export async function listStaffUsers(): Promise<StaffUser[]> {
  const res = await fetch('/api/staff/users')
  if (!res.ok) throw await apiError(res, 'User directory failed')
  return res.json()
}

export async function staffDownloadAttachment(attachmentId: number): Promise<Blob> {
  const res = await fetch(`/api/staff/attachments/${attachmentId}/download`)
  if (!res.ok) throw await apiError(res, 'Attachment download failed')
  return res.blob()
}

// --- Administrator user management ---

export interface AdminUser {
  id: number
  name: string
  email: string
  role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR'
  active: boolean
  mustChangePassword: boolean
  createdAt: string
}

export async function listAdminUsers(params: { search?: string; role?: string } = {}): Promise<{
  items: AdminUser[]
}> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.role) query.set('role', params.role)
  const res = await fetch(`/api/admin/users?${query.toString()}`)
  if (!res.ok) throw await apiError(res, 'User list failed')
  return res.json()
}

export async function createAdminUser(input: {
  name: string
  email: string
  role: string
  active: boolean
  initialPassword: string
}): Promise<AdminUser> {
  const res = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as {
      error?: { details?: ApiFieldError[] }
    } | null
    throw new ApiRequestError('User creation failed', res.status, errBody?.error?.details)
  }
  return res.json()
}

export async function updateAdminUser(
  id: number,
  input: { name?: string; email?: string; role?: string; active?: boolean },
): Promise<AdminUser> {
  const res = await fetch(`/api/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as {
      error?: { details?: ApiFieldError[] }
    } | null
    throw new ApiRequestError('User update failed', res.status, errBody?.error?.details)
  }
  return res.json()
}

export async function resetAdminPassword(id: number, newPassword: string): Promise<void> {
  const res = await fetch(`/api/admin/users/${id}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword, confirmPassword: newPassword }),
  })
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as {
      error?: { details?: ApiFieldError[] }
    } | null
    throw new ApiRequestError('Password reset failed', res.status, errBody?.error?.details)
  }
}
