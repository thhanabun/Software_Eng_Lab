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
  comments: [
    {
      id: 21,
      body: 'Still dropping.',
      authorName: 'Carlos Reyes',
      authorRole: 'REQUESTER',
      createdAt: '2026-09-10T10:00:00.000Z',
    },
  ],
  notes: [
    {
      id: 22,
      body: 'Spare AP reserved.',
      authorName: 'Mina Staff',
      authorRole: 'IT_STAFF',
      createdAt: '2026-09-10T10:30:00.000Z',
    },
  ],
  attachments: [],
}

const directory = [{ id: 6, name: 'Mina Staff', role: 'IT_STAFF' }]

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}

let posted: { url: string; body: string }[]

function stubDetail(overrides: { detailBody?: unknown } = {}) {
  posted = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/auth/me') return ok({ user: STAFF })
      if (url === '/api/staff/tickets/7') return ok(overrides.detailBody ?? detail)
      if (url === '/api/staff/users') return ok(directory)
      if (url === '/api/staff/tickets/7/claim' && init?.method === 'POST') {
        return ok({ owner: { id: 6, name: 'Mina Staff' }, currentStatus: 'IN_PROGRESS' })
      }
      if (url === '/api/staff/tickets/7/assign' && init?.method === 'POST') {
        posted.push({ url, body: String(init.body) })
        return ok({ owner: null, currentStatus: 'NEW' })
      }
      if (url === '/api/staff/tickets/7/priority' && init?.method === 'PATCH') {
        posted.push({ url, body: String(init.body) })
        return ok({ id: 7, itPriority: 'HIGH' })
      }
      if (url === '/api/staff/tickets/7/status' && init?.method === 'PATCH') {
        posted.push({ url, body: String(init.body) })
        return ok({ id: 7, currentStatus: 'RESOLVED' })
      }
      if (url === '/api/staff/tickets/7/comments' && init?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: 23,
            body: 'On it.',
            authorName: 'Mina Staff',
            authorRole: 'IT_STAFF',
            createdAt: '2026-09-10T11:00:00.000Z',
          }),
        }
      }
      if (url === '/api/staff/tickets/7/notes' && init?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: 24,
            body: 'Logged for audit.',
            authorName: 'Mina Staff',
            authorRole: 'IT_STAFF',
            createdAt: '2026-09-10T11:05:00.000Z',
          }),
        }
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
          <Route path="/staff/tickets" element={<div>QUEUE STUB</div>} />
          <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Staff Ticket Detail (UI-33)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('UI-33: renders ops controls, both channels, and read-only evidence', async () => {
    stubDetail()
    renderPage()

    expect(await screen.findByTestId('detail-ticket-number')).toHaveTextContent('TKT-20260910-0103')
    expect(screen.getByTestId('ops-panel')).toBeInTheDocument()
    expect(screen.getByTestId('owner-line')).toHaveTextContent('Mina Staff')
    expect(screen.getByRole('button', { name: 'Claim' })).toBeInTheDocument()
    expect(screen.getByLabelText(/assign owner/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/it priority/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^status/i)).toBeInTheDocument()

    expect(screen.getByTestId('comments-section')).toBeInTheDocument()
    expect(screen.getByTestId('comment-row-21')).toHaveTextContent('Still dropping.')
    expect(screen.getByTestId('notes-section')).toBeInTheDocument()
    expect(screen.getByTestId('note-row-22')).toHaveTextContent('Spare AP reserved.')
    expect(screen.getByTestId('attachment-section')).toBeInTheDocument()
    expect(screen.getByTestId('attachments-empty')).toBeInTheDocument()
  })

  it('UI-33: claim + priority + status posts hit the right endpoints', async () => {
    stubDetail()
    renderPage()
    await screen.findByTestId('ops-panel')

    await userEvent.click(screen.getByRole('button', { name: 'Claim' }))
    expect(await screen.findByTestId('ops-saved')).toHaveTextContent(/ownership saved/i)

    await userEvent.selectOptions(screen.getByLabelText(/it priority/i), 'HIGH')
    await screen.findByTestId('ops-saved')
    expect(posted.some((p) => p.url.endsWith('/priority') && p.body.includes('HIGH'))).toBe(true)

    await userEvent.selectOptions(screen.getByLabelText(/^status/i), 'RESOLVED')
    await screen.findByTestId('ops-saved')
    expect(posted.some((p) => p.url.endsWith('/status') && p.body.includes('RESOLVED'))).toBe(true)
  })

  it('UI-33: unassign and CANCELLED require the confirm modal', async () => {
    stubDetail()
    renderPage()
    await screen.findByTestId('ops-panel')

    await userEvent.selectOptions(screen.getByLabelText(/assign owner/i), 'unassign')
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent(/return this ticket to the queue/i)
    await userEvent.click(screen.getByTestId('confirm-ops'))
    expect(await screen.findByTestId('ops-saved')).toHaveTextContent(/ownership saved/i)
    expect(posted.some((p) => p.url.endsWith('/assign') && p.body.includes('null'))).toBe(true)

    await userEvent.selectOptions(screen.getByLabelText(/^status/i), 'CANCELLED')
    expect(await screen.findByRole('dialog')).toHaveTextContent(/cancelled tickets cannot/i)
  })

  it('UI-33: comment and note posts appear in their own panels', async () => {
    stubDetail()
    renderPage()
    await screen.findByTestId('ops-panel')

    await userEvent.type(screen.getByLabelText(/reply to requester/i), 'On it.')
    await userEvent.click(screen.getByRole('button', { name: /post comment/i }))
    expect(await screen.findByTestId('comment-row-23')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/add internal note/i), 'Logged for audit.')
    await userEvent.click(screen.getByRole('button', { name: /post note/i }))
    expect(await screen.findByTestId('note-row-24')).toBeInTheDocument()
  })
})
