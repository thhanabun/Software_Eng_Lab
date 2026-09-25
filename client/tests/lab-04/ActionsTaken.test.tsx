import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StaffTicketDetail from '../../src/pages/StaffTicketDetail'
import TicketDetail from '../../src/pages/TicketDetail'
import { AuthProvider } from '../../src/authContext'
import { mockUseAuth } from '../test-user'

vi.mock('../../src/authContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/authContext')>()
  return { ...actual, useAuth: () => mockUseAuth() }
})

const STAFF = {
  id: 6,
  name: 'Mina Staff',
  email: 'mina.staff@example.test',
  role: 'IT_STAFF',
  active: true,
  mustChangePassword: false,
}

const staffDetail = {
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

const requesterDetail = {
  id: 5,
  ticketNumber: 'TKT-20260910-0102',
  requesterId: 1,
  categoryId: 2,
  relatedSystemId: 7,
  summary: 'LEB2 upload stalls',
  description: 'Stalls near completion.',
  requestedPriority: 'MEDIUM',
  currentStatus: 'OPEN',
  categoryName: 'Software',
  relatedSystemName: 'LEB2 App',
  requesterName: 'Alice Carter',
  owner: { id: 6, name: 'Mina Staff' },
  itPriority: 'MEDIUM',
  requesterResolved: false,
  requesterResolvedAt: null,
  createdAt: '2026-09-10T08:00:00.000Z',
  updatedAt: '2026-09-10T09:00:00.000Z',
  attachments: [],
  comments: [],
}

const actionItem = {
  id: 31,
  description: 'Swapped the access point.',
  result: 'Flaps stopped.',
  performedBy: { id: 6, name: 'Mina Staff' },
  followUpRequired: true,
  followUpNote: 'Recheck tomorrow.',
  attachmentNotes: null,
  createdAt: '2026-09-10T10:00:00.000Z',
  updatedAt: '2026-09-10T10:00:00.000Z',
}

function ok(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

function err(status: number, code: string) {
  return { ok: false, status, json: async () => ({ error: { code, message: code } }) }
}

let posted: { url: string; method?: string; body: string }[]

function stubStaff(actionItems: unknown[] = [actionItem]) {
  posted = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/auth/me') return ok({ user: STAFF })
      if (url === '/api/staff/tickets/7') return ok(staffDetail)
      if (url === '/api/staff/users') return ok([])
      if (url === '/api/staff/tickets/7/actions' && (!init?.method || init.method === 'GET'))
        return ok({ items: actionItems })
      if (url === '/api/staff/tickets/7/actions' && init?.method === 'POST') {
        posted.push({ url, method: 'POST', body: String(init.body) })
        return ok(
          {
            id: 32,
            description: 'Restarted the spooler.',
            result: 'Queue drains.',
            performedBy: { id: 6, name: 'Mina Staff' },
            followUpRequired: false,
            followUpNote: null,
            attachmentNotes: null,
            createdAt: '2026-09-10T11:00:00.000Z',
            updatedAt: '2026-09-10T11:00:00.000Z',
          },
          201,
        )
      }
      if (url === '/api/staff/tickets/7/actions/31' && init?.method === 'PATCH') {
        posted.push({ url, method: 'PATCH', body: String(init.body) })
        const body = JSON.parse(String(init.body)) as { expectedUpdatedAt?: string }
        if (body.expectedUpdatedAt === 'stale-stamp') return err(409, 'CONFLICT')
        return ok({ ...actionItem, result: 'Flaps stopped for good.' })
      }
      throw new Error(`unexpected ${url}`)
    }),
  )
}

function stubRequester(actionItems: unknown[] = [actionItem]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/tickets/5') return ok(requesterDetail)
      if (url === '/api/tickets/5/actions') return ok({ items: actionItems })
      if (url.startsWith('/api/tickets/5/attachments')) return ok([])
      throw new Error(`unexpected ${url}`)
    }),
  )
}

function renderStaff() {
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

function renderRequester() {
  return render(
    <MemoryRouter initialEntries={['/tickets/5']}>
      <Routes>
        <Route path="/tickets/:id" element={<TicketDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Actions Taken (DUI-01)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('DUI-01: staff sees the actions section with list, form, and follow-up badge', async () => {
    stubStaff()
    renderStaff()

    expect(await screen.findByTestId('actions-section')).toBeInTheDocument()
    expect(screen.getByTestId('action-row-31')).toHaveTextContent('Swapped the access point.')
    expect(screen.getByTestId('action-followup-31')).toHaveTextContent('Recheck tomorrow.')
    expect(screen.getByLabelText(/action description/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^result/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/follow-up required/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/follow-up note/i)).not.toBeInTheDocument()
  })

  it('DUI-01: follow-up checkbox reveals the note field; empty submit is blocked client-side', async () => {
    stubStaff()
    renderStaff()
    await screen.findByTestId('actions-section')

    await userEvent.click(screen.getByLabelText(/follow-up required/i))
    expect(screen.getByLabelText(/follow-up note/i)).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('action-save'))
    expect(await screen.findByTestId('action-error')).toHaveTextContent(/must not be empty|required/i)
    expect(posted.length).toBe(0)
  })

  it('DUI-01: valid create posts the staff endpoint and prepends the row', async () => {
    stubStaff()
    renderStaff()
    await screen.findByTestId('actions-section')

    await userEvent.type(screen.getByLabelText(/action description/i), 'Restarted the spooler.')
    await userEvent.type(screen.getByLabelText(/^result/i), 'Queue drains.')
    await userEvent.click(screen.getByTestId('action-save'))

    expect(await screen.findByTestId('action-row-32')).toBeInTheDocument()
    const create = posted.find((p) => p.method === 'POST')
    expect(create).toBeDefined()
    expect(JSON.parse(create!.body)).toMatchObject({
      description: 'Restarted the spooler.',
      followUpRequired: false,
    })
  })

  it('DUI-01: edit prefills the form and PATCH carries the freshness stamp', async () => {
    stubStaff()
    renderStaff()
    await screen.findByTestId('actions-section')

    await userEvent.click(screen.getByTestId('action-edit-31'))
    expect(screen.getByLabelText(/action description/i)).toHaveValue('Swapped the access point.')

    await userEvent.clear(screen.getByLabelText(/^result/i))
    await userEvent.type(screen.getByLabelText(/^result/i), 'Flaps stopped for good.')
    await userEvent.click(screen.getByTestId('action-save'))
    const patch = posted.find((p) => p.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(JSON.parse(patch!.body)).toMatchObject({ expectedUpdatedAt: staffDetail.updatedAt })
  })

  it('DUI-01: stale save shows the 409 reload banner', async () => {
    posted = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === '/api/auth/me') return ok({ user: STAFF })
        if (url === '/api/staff/tickets/7') return ok(staffDetail)
        if (url === '/api/staff/users') return ok([])
        if (url === '/api/staff/tickets/7/actions' && (!init?.method || init.method === 'GET'))
          return ok({ items: [actionItem] })
        if (url === '/api/staff/tickets/7/actions/31' && init?.method === 'PATCH')
          return err(409, 'CONFLICT')
        throw new Error(`unexpected ${url}`)
      }),
    )
    renderStaff()
    await screen.findByTestId('actions-section')

    await userEvent.click(screen.getByTestId('action-edit-31'))
    await userEvent.click(screen.getByTestId('action-save'))
    expect(await screen.findByTestId('action-conflict')).toHaveTextContent(/updated by another user/i)
  })

  it('DUI-01: requester sees actions read-only with no form or edit buttons', async () => {
    stubRequester()
    renderRequester()

    expect(await screen.findByTestId('actions-section')).toBeInTheDocument()
    expect(screen.getByTestId('action-row-31')).toHaveTextContent('Swapped the access point.')
    expect(screen.queryByTestId('action-save')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/action description/i)).not.toBeInTheDocument()
  })

  it('DUI-01: empty actions render the empty state', async () => {
    stubRequester([])
    renderRequester()
    expect(await screen.findByTestId('actions-empty')).toBeInTheDocument()
  })
})
