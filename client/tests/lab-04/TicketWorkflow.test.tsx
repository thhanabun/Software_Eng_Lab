import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StaffTicketDetail from '../../src/pages/StaffTicketDetail'
import { AuthProvider } from '../../src/authContext'

const STAFF = {
  id: 6,
  name: 'Mina Staff',
  email: 'mina.staff@example.test',
  role: 'IT_STAFF',
  active: true,
  mustChangePassword: false,
}

const detail = {
  id: 7,
  ticketNumber: 'TKT-20260910-0103',
  requesterId: 3,
  categoryId: 4,
  relatedSystemId: 2,
  summary: 'Dormitory Wi-Fi drops every hour',
  description: 'Connection drops roughly hourly.',
  requestedPriority: 'HIGH',
  itPriority: 'URGENT',
  currentStatus: 'IN_PROGRESS',
  requesterResolved: false,
  requesterResolvedAt: null,
  categoryName: 'Network',
  relatedSystemName: 'Campus Wi-Fi',
  requester: { id: 3, name: 'Carlos Reyes', email: 'carlos.reyes@student.example' },
  owner: { id: 6, name: 'Mina Staff' },
  createdAt: '2026-09-10T08:00:00.000Z',
  updatedAt: '2026-09-10T09:00:00.000Z',
  comments: [],
  notes: [],
  attachments: [],
}

function ok(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

function err(status: number, code: string) {
  return { ok: false, status, json: async () => ({ error: { code, message: code } }) }
}

let posted: { url: string; body: string }[]

function stubDetail(statusHandler: (body: Record<string, unknown>) => unknown) {
  posted = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/auth/me') return ok({ user: STAFF })
      if (url === '/api/staff/tickets/7') return ok(detail)
      if (url === '/api/staff/users') return ok([])
      if (url === '/api/staff/tickets/7/actions') return ok({ items: [] })
      if (url === '/api/staff/tickets/7/status' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>
        posted.push({ url, body: String(init.body) })
        return statusHandler(body)
      }
      throw new Error(`unexpected ${url}`)
    }),
  )
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/staff/tickets/7']}>
      <AuthProvider>
        <Routes>
          <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Ticket Workflow (DUI-02)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('DUI-02: status select lists only matrix-legal targets and carries the stamp', async () => {
    stubDetail((body) => ok({ id: 7, currentStatus: body.status, updatedAt: '2026-09-10T10:00:00.000Z' }))
    renderPage()
    await screen.findByTestId('ops-panel')

    const select = screen.getByLabelText(/^status/i) as HTMLSelectElement
    const options = Array.from(select.options).map((o) => o.value)
    expect(options).toContain('WAITING_FOR_REQUESTER')
    expect(options).toContain('RESOLVED')
    expect(options).not.toContain('CLOSED')
    expect(options).not.toContain('NEW')

    await userEvent.selectOptions(select, 'WAITING_FOR_REQUESTER')
    expect(await screen.findByTestId('ops-saved')).toHaveTextContent(/status saved/i)
    expect(JSON.parse(posted[0].body)).toMatchObject({
      status: 'WAITING_FOR_REQUESTER',
      expectedUpdatedAt: '2026-09-10T09:00:00.000Z',
    })
  })

  it('DUI-02: stale status save shows the reload error', async () => {
    stubDetail(() => err(409, 'CONFLICT'))
    renderPage()
    await screen.findByTestId('ops-panel')

    await userEvent.selectOptions(screen.getByLabelText(/^status/i), 'WAITING_FOR_REQUESTER')
    expect(await screen.findByTestId('ops-error')).toHaveTextContent(/updated by another user/i)
  })

  it('DUI-02: gate rejection surfaces the server message', async () => {
    stubDetail(() => err(400, 'VALIDATION_ERROR'))
    renderPage()
    await screen.findByTestId('ops-panel')

    await userEvent.selectOptions(screen.getByLabelText(/^status/i), 'RESOLVED')
    expect(await screen.findByTestId('ops-error')).toBeInTheDocument()
  })
})
