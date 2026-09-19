import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StaffTicketQueue from '../../src/pages/StaffTicketQueue'
import { AuthProvider } from '../../src/authContext'

const STAFF = {
  id: 6,
  name: 'Mina Staff',
  email: 'mina.staff@example.test',
  role: 'IT_STAFF',
  active: true,
  mustChangePassword: false,
}

const categories = [{ id: 2, name: 'Hardware' }]

function queueItem(id: number, overrides = {}) {
  return {
    id,
    ticketNumber: `TKT-20260910-${String(id).padStart(4, '0')}`,
    summary: `Queue ticket ${id}`,
    categoryName: 'Hardware',
    requestedPriority: 'MEDIUM',
    itPriority: 'HIGH',
    currentStatus: 'OPEN',
    owner: null,
    requesterName: 'Alice Carter',
    createdAt: '2026-09-10T08:00:00.000Z',
    updatedAt: '2026-09-10T09:00:00.000Z',
    ...overrides,
  }
}

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}

let queueUrls: string[] = []
let failQueue = false

function stubQueue(overrides: { empty?: boolean } = {}) {
  queueUrls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/auth/me') return ok({ user: STAFF })
      if (url.startsWith('/api/categories')) return ok(categories)
      if (url.startsWith('/api/staff/tickets')) {
        queueUrls.push(url)
        if (failQueue) {
          throw new TypeError('Failed to fetch')
        }
        return ok(
          overrides.empty
            ? { items: [], page: 1, pageSize: 10, totalItems: 0, totalPages: 0 }
            : {
                items: [queueItem(101), queueItem(102, { owner: 'Mina Staff' })],
                page: url.includes('page=2') ? 2 : 1,
                pageSize: 10,
                totalItems: 12,
                totalPages: 2,
              },
        )
      }
      throw new Error(`unexpected ${url}`)
    }),
  )
}

function renderPage(entry = '/staff/tickets') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <Routes>
          <Route path="/staff/tickets" element={<StaffTicketQueue />} />
          <Route path="/staff/tickets/:id" element={<div>DETAIL STUB</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Staff Ticket Queue (UI-32)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    failQueue = false
  })

  it('UI-32: rows, count, badges, and pagination/filter query params', async () => {
    stubQueue()
    renderPage()

    expect(await screen.findByTestId('queue-row-101')).toBeInTheDocument()
    expect(screen.getByTestId('queue-card-101')).toBeInTheDocument()
    expect(screen.getByTestId('queue-count')).toHaveTextContent('12 tickets')
    expect(screen.getAllByTestId('queue-it-priority')[0]).toHaveTextContent('IT HIGH')
    expect(screen.getByTestId('queue-row-102')).toHaveTextContent('Mina Staff')

    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => {
      expect(queueUrls.some((url) => url.includes('page=2'))).toBe(true)
    })

    await userEvent.selectOptions(screen.getByLabelText(/status/i), 'OPEN')
    await waitFor(() => {
      const latest = queueUrls.at(-1) ?? ''
      expect(latest).toContain('status=OPEN')
      expect(latest).not.toContain('page=2')
    })

    await userEvent.selectOptions(screen.getByLabelText(/owner/i), 'unassigned')
    await waitFor(() => {
      expect(queueUrls.at(-1)).toContain('ownerId=unassigned')
    })

    await userEvent.selectOptions(screen.getByLabelText(/sort by/i), 'itPriority:desc')
    await waitFor(() => {
      expect(queueUrls.at(-1)).toContain('sort=itPriority%3Adesc')
    })
  })

  it('UI-32: empty vs no-results vs failure states', async () => {
    stubQueue({ empty: true })
    renderPage('/staff/tickets?search=nothing')

    expect(await screen.findByTestId('no-results-state')).toBeInTheDocument()
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument()
  })

  it('UI-32: failure shows retry', async () => {
    stubQueue()
    failQueue = true
    try {
      renderPage()

      expect(await screen.findByTestId('error-state')).toBeInTheDocument()
      failQueue = false
      await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
      expect(await screen.findByTestId('queue-row-101')).toBeInTheDocument()
    } finally {
      failQueue = false
    }
  })
})
