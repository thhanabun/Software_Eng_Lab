import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TicketDetail from '../../src/pages/TicketDetail'
import { mockUseAuth } from '../test-user'

vi.mock('../../src/authContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/authContext')>()
  return { ...actual, useAuth: () => mockUseAuth() }
})

const detail = {
  id: 5,
  ticketNumber: 'TKT-20260825-0005',
  requesterId: 1,
  categoryId: 2,
  relatedSystemId: 7,
  summary: 'Battery drains within an hour',
  description: 'Dies quickly when unplugged.',
  requestedPriority: 'HIGH',
  currentStatus: 'OPEN',
  categoryName: 'Hardware',
  relatedSystemName: 'Corporate Laptop',
  requesterName: 'Alice Carter',
  owner: null,
  itPriority: 'HIGH',
  requesterResolved: false,
  requesterResolvedAt: null,
  createdAt: '2026-08-25T08:00:00.000Z',
  updatedAt: '2026-08-25T09:30:00.000Z',
  attachments: [],
  comments: [
    {
      id: 9,
      body: 'Tried rebooting twice.',
      authorName: 'Alice Carter',
      authorRole: 'REQUESTER',
      createdAt: '2026-08-25T10:00:00.000Z',
    },
  ],
}

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}

function renderPage(entry = '/tickets/5') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/tickets" element={<div>LIST STUB</div>} />
        <Route path="/tickets/:id" element={<TicketDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Requester Ticket Detail', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('UI-18: renders all header fields read-only with badges', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === '/api/tickets/5') return ok(detail)
        if (url.startsWith('/api/tickets/5/attachments')) return ok([])
        throw new Error(`unexpected ${url}`)
      }),
    )
    renderPage()

    expect(await screen.findByTestId('detail-ticket-number')).toHaveTextContent('TKT-20260825-0005')
    expect(screen.getByText('Battery drains within an hour')).toBeInTheDocument()
    expect(screen.getByText('Dies quickly when unplugged.')).toBeInTheDocument()
    expect(screen.getByText('Corporate Laptop')).toBeInTheDocument()
    expect(screen.getByText('Hardware')).toBeInTheDocument()
    expect(screen.getByText('Alice Carter')).toBeInTheDocument()
    expect(screen.getAllByText('HIGH')).toHaveLength(2) // requested badge + IT Priority row
    expect(screen.getByText('OPEN')).toBeInTheDocument()
    expect(screen.getByText('Ticket Date')).toBeInTheDocument()
    expect(screen.getByText('Related System')).toBeInTheDocument()
    expect(screen.getByText('Unassigned')).toBeInTheDocument()
  })

  it('UI-19: missing or non-owned ticket shows the safe 404 panel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Ticket not found' } }),
      })),
    )
    renderPage('/tickets/404')

    const panel = await screen.findByTestId('not-found-panel')
    expect(panel).toHaveTextContent('Ticket not found')
    expect(screen.getByRole('link', { name: /back to my tickets/i })).toBeInTheDocument()
    expect(screen.queryByText(/TKT-/)).not.toBeInTheDocument()
  })

  it('RREG: renders public comments and posts a new one', async () => {
    const posted = {
      id: 10,
      body: 'Still happening after reboot.',
      authorName: 'Alice Carter',
      authorRole: 'REQUESTER',
      createdAt: '2026-08-25T11:00:00.000Z',
    }
    let postedBody = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === '/api/tickets/5') return ok(detail)
        if (url.startsWith('/api/tickets/5/attachments')) return ok([])
        if (url === '/api/tickets/5/comments' && init?.method === 'POST') {
          postedBody = String((JSON.parse(String(init.body)) as { body: string }).body)
          return { ok: true, status: 201, json: async () => posted }
        }
        throw new Error(`unexpected ${url}`)
      }),
    )
    renderPage()

    expect(await screen.findByTestId('comment-row-9')).toHaveTextContent('Tried rebooting twice.')

    await userEvent.type(screen.getByLabelText(/add a comment/i), 'Still happening after reboot.')
    await userEvent.click(screen.getByRole('button', { name: /post comment/i }))

    expect(await screen.findByTestId('comment-row-10')).toBeInTheDocument()
    expect(postedBody).toBe('Still happening after reboot.')
  })

  it('RREG: empty validation blocks posting; indication records without status change', async () => {
    let indicated = false
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/tickets/5') {
        return ok(indicated ? { ...detail, requesterResolved: true, requesterResolvedAt: '2026-08-25T12:00:00.000Z' } : detail)
      }
      if (url.startsWith('/api/tickets/5/attachments')) return ok([])
      if (url === '/api/tickets/5/resolved-indication' && init?.method === 'POST') {
        indicated = true
        return ok({ requesterResolved: true, requesterResolvedAt: '2026-08-25T12:00:00.000Z' })
      }
      throw new Error(`unexpected ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    await screen.findByTestId('detail-ticket-number')
    await userEvent.click(screen.getByRole('button', { name: /post comment/i }))
    expect(await screen.findByText(/must not be empty/i)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/tickets/5/comments',
      expect.objectContaining({ method: 'POST' }),
    )

    await userEvent.click(screen.getByRole('button', { name: /problem appears resolved/i }))
    expect(await screen.findByTestId('resolved-indication-line')).toHaveTextContent(/confirms resolved/i)
  })
})
