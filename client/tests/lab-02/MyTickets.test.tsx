import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MyTickets from '../../src/pages/MyTickets'
import { RequesterProvider } from '../../src/requesterContext'
import { REQUESTER_STORAGE_KEY } from '../../src/requesterStorage'

const requester = { id: 1, name: 'Alice Carter', email: 'alice.carter@student.example' }
const categories = [
  { id: 1, name: 'Account and Access' },
  { id: 2, name: 'Hardware' },
]

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}

function ticketItem(id: number) {
  return {
    id,
    ticketNumber: `TKT-20260825-${String(id).padStart(4, '0')}`,
    summary: `Ticket ${id}`,
    requestedPriority: 'MEDIUM',
    currentStatus: 'NEW',
    categoryId: 2,
    categoryName: 'Hardware',
    createdAt: '2026-08-25T08:00:00.000Z',
    updatedAt: '2026-08-25T08:00:00.000Z',
  }
}

function listBody(page = 1, overrides = {}) {
  return {
    items: [ticketItem(11), ticketItem(12)],
    page,
    pageSize: 10,
    totalItems: 12,
    totalPages: 2,
    ...overrides,
  }
}

let listUrls: string[] = []

function stubList(overrides: { empty?: boolean; failFirstCall?: boolean } = {}) {
  let calls = 0
  listUrls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/api/categories')) return ok(categories)
      if (url.startsWith('/api/tickets')) {
        calls += 1
        listUrls.push(url)
        if (overrides.failFirstCall && calls === 1) {
          throw new TypeError('Failed to fetch')
        }
        const page = url.includes('page=2') ? 2 : 1
        return ok(
          overrides.empty
            ? { items: [], page: 1, pageSize: 10, totalItems: 0, totalPages: 0 }
            : listBody(page),
        )
      }
      throw new Error(`unexpected ${url}`)
    }),
  )
}

function renderPage(entry = '/tickets') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <RequesterProvider>
        <Routes>
          <Route path="/tickets" element={<MyTickets />} />
          <Route path="/tickets/new" element={<div>NEW STUB</div>} />
          <Route path="/tickets/:id" element={<div>DETAIL STUB</div>} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>,
  )
}

describe('My Tickets screen', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(requester))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('UI-15: rows render and pagination/filters update the request', async () => {
    stubList()
    renderPage()

    expect(await screen.findByTestId('ticket-row-11')).toBeInTheDocument()
    expect(screen.getByTestId('ticket-row-12')).toBeInTheDocument()
    expect(screen.getAllByTestId('ticket-number')[0]).toHaveTextContent('TKT-20260825-0011')
    expect(screen.getByTestId('pagination-info')).toHaveTextContent('Page 1 of 2')
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => {
      expect(listUrls.some((url) => url.includes('page=2'))).toBe(true)
    })

    await userEvent.selectOptions(screen.getByLabelText(/Category/i), '2')
    await waitFor(() => {
      const latest = listUrls.at(-1) ?? ''
      expect(latest).toContain('categoryId=2')
      expect(latest).not.toContain('page=2')
    })

    await userEvent.selectOptions(screen.getByLabelText(/Per page/i), '5')
    await waitFor(() => {
      expect(listUrls.at(-1)).toContain('pageSize=5')
    })

    await userEvent.selectOptions(screen.getByLabelText(/Sort by/i), 'requestedPriority:asc')
    await waitFor(() => {
      expect(listUrls.at(-1)).toContain('sort=requestedPriority%3Aasc')
    })
  })

  it('UI-16a: active filters with no matches show the no-results state', async () => {
    stubList({ empty: true })
    renderPage('/tickets?search=laptop')

    expect(await screen.findByTestId('no-results-state')).toBeInTheDocument()
    expect(screen.getByText(/no tickets match/i)).toBeInTheDocument()
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    await waitFor(() => {
      const latest = listUrls.at(-1) ?? ''
      expect(latest).not.toContain('search=laptop')
    })
  })

  it('UI-16b: requester without tickets sees the empty state with a create CTA', async () => {
    stubList({ empty: true })
    renderPage()

    expect(await screen.findByTestId('empty-state')).toBeInTheDocument()
    expect(screen.getByText(/not created any tickets/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /create your first ticket/i })).toBeInTheDocument()
  })

  it('UI-17: list failure shows a safe error and Retry reloads the list', async () => {
    stubList({ failFirstCall: true })
    renderPage()

    expect(await screen.findByTestId('error-state')).toBeInTheDocument()
    expect(screen.queryByTestId('ticket-row-11')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByTestId('ticket-row-11')).toBeInTheDocument()
  })

  it('UI-16c: submitting the search box sends the search parameter', async () => {
    stubList()
    renderPage()
    await screen.findByTestId('ticket-row-11')

    await userEvent.type(screen.getByLabelText(/^Search$/i), 'cooling alarm')
    await userEvent.click(screen.getByRole('button', { name: /apply search/i }))

    await waitFor(() => {
      expect(listUrls.at(-1)).toContain('search=cooling+alarm')
    })
  })
})
