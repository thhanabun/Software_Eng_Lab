import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Dashboard from '../../src/pages/Dashboard'

vi.mock('../../src/authContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/authContext')>()
  return {
    ...actual,
    useAuth: () => ({
      user: { id: 6, name: 'Mina Staff', email: 'm@example.test', role: 'IT_STAFF', active: true, mustChangePassword: false },
      loading: false,
      login: async () => null,
      logout: async () => {},
      refresh: async () => {},
    }),
  }
})

const staffPayload = {
  metrics: {
    unassigned: 4,
    ownedByMe: 2,
    byStatus: { NEW: 3, OPEN: 2, IN_PROGRESS: 0, WAITING_FOR_REQUESTER: 0, RESOLVED: 0, CLOSED: 0, REOPENED: 0, CANCELLED: 0 },
    byItPriority: { LOW: 1, MEDIUM: 1, HIGH: 1, URGENT: 1 },
    drillDown: {
      unassigned: { base: '/staff/tickets', query: '?owner=unassigned' },
      ownedByMe: { base: '/staff/tickets', query: '?owner=mine' },
      byStatus: { NEW: { base: '/staff/tickets', query: '?status=NEW' } },
      byItPriority: { URGENT: { base: '/staff/tickets', query: '?itPriority=URGENT' } },
    },
  },
  recentUpdated: [],
  urgentUnassigned: [
    { id: 11, ticketNumber: 'TKT-9', summary: 'Server down', currentStatus: 'NEW', updatedAt: '2026-09-10T10:00:00.000Z', drillDown: { base: '/staff/tickets/11', query: '' } },
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

describe('Staff Dashboard (DUI-03)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('DUI-03: staff sees operational cards, breakdowns, and urgent list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === '/api/dashboard/staff') return ok(staffPayload)
        throw new Error(`unexpected ${input}`)
      }),
    )
    renderDashboard()

    expect(await screen.findByTestId('staff-dashboard')).toBeInTheDocument()
    expect(screen.getByTestId('metric-unassigned-value')).toHaveTextContent('4')
    expect(screen.getByTestId('metric-owned-value')).toHaveTextContent('2')
    expect(screen.getByTestId('status-count-NEW')).toHaveTextContent('3')
    expect(screen.getByTestId('priority-count-URGENT')).toHaveTextContent('1')
    expect(screen.getByTestId('urgent-row-11')).toHaveTextContent('Server down')
    expect(screen.queryByTestId('users-section')).not.toBeInTheDocument()
  })

  it('DUI-03: admin payload shows the user-counts section', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === '/api/dashboard/staff')
          return ok({ ...staffPayload, userCounts: { requesters: 5, staff: 3, admins: 1, inactive: 2 } })
        throw new Error(`unexpected ${input}`)
      }),
    )
    renderDashboard()

    expect(await screen.findByTestId('users-section')).toBeInTheDocument()
    expect(screen.getByTestId('users-counts')).toHaveTextContent(/5 requesters/)
  })
})
