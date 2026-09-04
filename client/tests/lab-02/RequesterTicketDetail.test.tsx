import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TicketDetail from '../../src/pages/TicketDetail'
import { RequesterProvider } from '../../src/requesterContext'
import { REQUESTER_STORAGE_KEY } from '../../src/requesterStorage'

const requester = { id: 1, name: 'Alice Carter', email: 'alice.carter@student.example' }

const detail = {
  id: 5,
  ticketNumber: 'TKT-20260825-0005',
  requesterId: 1,
  categoryId: 2,
  relatedSystemId: 7,
  summary: 'Battery drains within an hour',
  description: 'Dies quickly when unplugged.',
  requestedPriority: 'HIGH',
  currentStatus: 'NEW',
  categoryName: 'Hardware',
  relatedSystemName: 'Corporate Laptop',
  requesterName: 'Alice Carter',
  createdAt: '2026-08-25T08:00:00.000Z',
  updatedAt: '2026-08-25T09:30:00.000Z',
  attachments: [],
}

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}

function renderPage(entry = '/tickets/5') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <RequesterProvider>
        <Routes>
          <Route path="/tickets" element={<div>LIST STUB</div>} />
          <Route path="/tickets/:id" element={<TicketDetail />} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>,
  )
}

describe('Requester Ticket Detail', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(requester))
  })

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
    expect(screen.getByText('HIGH')).toBeInTheDocument()
    expect(screen.getByText('NEW')).toBeInTheDocument()
    expect(screen.getByText('Ticket Date')).toBeInTheDocument()
    expect(screen.getByText('Related System')).toBeInTheDocument()
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
})
