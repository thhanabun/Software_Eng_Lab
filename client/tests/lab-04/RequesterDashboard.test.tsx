import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Dashboard from '../../src/pages/Dashboard'

let role = 'REQUESTER'

vi.mock('../../src/authContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/authContext')>()
  return {
    ...actual,
    useAuth: () => ({
      user:
        role === 'REQUESTER'
          ? { id: 1, name: 'Alice Carter', email: 'a@example.test', role: 'REQUESTER', active: true, mustChangePassword: false }
          : { id: 6, name: 'Mina Staff', email: 'm@example.test', role: 'IT_STAFF', active: true, mustChangePassword: false },
      loading: false,
      login: async () => null,
      logout: async () => {},
      refresh: async () => {},
    }),
  }
})

const requesterPayload = {
  metrics: {
    open: 2,
    waitingForRequester: 1,
    resolved30d: 1,
    drillDown: {
      open: { base: '/tickets', query: '' },
      waitingForRequester: { base: '/tickets', query: '?status=WAITING_FOR_REQUESTER' },
      resolved30d: { base: '/tickets', query: '?status=RESOLVED' },
    },
  },
  recentUpdated: [
    { id: 7, ticketNumber: 'TKT-1', summary: 'Wi-Fi down', currentStatus: 'OPEN', updatedAt: '2026-09-10T10:00:00.000Z', drillDown: { base: '/tickets/7', query: '' } },
  ],
  recentResolved: [],
  attention: [
    { id: 9, ticketNumber: 'TKT-2', summary: 'Mailbox locked', reason: 'WAITING_FOR_REQUESTER', drillDown: { base: '/tickets/9', query: '' } },
  ],
}

function ok(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Dashboards (DUI-03)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('DUI-03: requester sees owned metric cards, attention, and recents with drill-downs', async () => {
    role = 'REQUESTER'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === '/api/dashboard/requester') return ok(requesterPayload)
        throw new Error(`unexpected ${input}`)
      }),
    )
    renderDashboard()

    expect(await screen.findByTestId('requester-dashboard')).toBeInTheDocument()
    expect(screen.getByTestId('metric-open-value')).toHaveTextContent('2')
    expect(screen.getByTestId('metric-waiting-value')).toHaveTextContent('1')
    expect(screen.getByTestId('metric-resolved-value')).toHaveTextContent('1')
    expect(screen.getByTestId('attention-row-9')).toHaveTextContent('Mailbox locked')
    expect(screen.getByTestId('recent-row-7')).toHaveTextContent('Wi-Fi down')
    const viewLinks = screen.getAllByRole('link', { name: 'View' })
    expect(viewLinks[0].getAttribute('href')).toBe('/tickets')
  })

  it('DUI-03: requester empty dashboard renders zero cards without lists', async () => {
    role = 'REQUESTER'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ok({ metrics: { open: 0, waitingForRequester: 0, resolved30d: 0, drillDown: {} }, recentUpdated: [], recentResolved: [], attention: [] }),
      ),
    )
    renderDashboard()

    expect(await screen.findByTestId('requester-dashboard')).toBeInTheDocument()
    expect(screen.getByTestId('metric-open-value')).toHaveTextContent('0')
    expect(screen.queryByTestId('attention-section')).not.toBeInTheDocument()
    expect(screen.getByTestId('recent-empty')).toBeInTheDocument()
  })

  it('DUI-03: dashboard failure renders the safe error state', async () => {
    role = 'REQUESTER'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: { code: 'INTERNAL_ERROR' } }) })),
    )
    renderDashboard()
    expect(await screen.findByTestId('error-state')).toBeInTheDocument()
  })
})
