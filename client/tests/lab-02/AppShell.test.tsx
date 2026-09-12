import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/App'
import AppShell from '../../src/components/AppShell'
import { AuthProvider } from '../../src/authContext'
import { TEST_USER } from '../test-user'

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}

function stubMe(user: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/auth/me') {
        if (user === null) {
          return { ok: false, status: 401, json: async () => ({ error: { code: 'UNAUTHENTICATED' } }) }
        }
        return ok({ user })
      }
      if (url === '/api/auth/logout') return ok({ ok: true })
      throw new Error(`unexpected ${url}`)
    }),
  )
}

function renderShell(initialPath = '/tickets') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>LOGIN STUB</div>} />
          <Route element={<AppShell />}>
            <Route path="/tickets" element={<div>TICKETS STUB</div>} />
            <Route path="/tickets/new" element={<div>CREATE STUB</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Application shell (UI-06, STYLE-01)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('UI-06: shows the authenticated user, role, and logs out', async () => {
    stubMe(TEST_USER)
    renderShell()

    expect(await screen.findByTestId('current-user')).toHaveTextContent('Alice Carter')
    expect(screen.getByTestId('current-role')).toHaveTextContent('REQUESTER')

    await userEvent.click(screen.getByRole('button', { name: 'Logout' }))
    expect(await screen.findByText('LOGIN STUB')).toBeInTheDocument()
  })

  it('UI-06: marks the active page in the navigation', async () => {
    stubMe(TEST_USER)
    renderShell('/tickets/new')

    const createLink = await screen.findByRole('link', { name: 'Create Ticket' })
    expect(createLink).toHaveClass('active')
    expect(createLink).toHaveAttribute('aria-current', 'page')
  })

  it('STYLE-01: header uses the Zen Green primary token class', async () => {
    stubMe(TEST_USER)
    renderShell()

    await screen.findByTestId('current-user')
    const header = screen.getByText('TokTickIT', { selector: '.tg-brand' }).closest('header')
    expect(header).not.toBeNull()
    expect(header).toHaveClass('tg-header')
  })

  it('shows role-specific navigation for staff (Ticket Queue, no requester links)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === '/api/auth/me') {
          return ok({ user: { ...TEST_USER, role: 'IT_STAFF', name: 'Mina Staff' } })
        }
        if (url === '/api/auth/logout') return ok({ ok: true })
        throw new Error(`unexpected ${url}`)
      }),
    )
    renderShell()

    expect(await screen.findByRole('link', { name: 'Ticket Queue' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'My Tickets' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Create Ticket' })).not.toBeInTheDocument()
  })
})

describe('Auth guard (AC-02 analogue)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('redirects ticket screens to Login when no session exists', async () => {
    stubMe(null)

    render(
      <MemoryRouter initialEntries={['/tickets']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/sign in with your email/i)).toBeInTheDocument()
  })

  it('forces pending-change users to the change-password screen', async () => {
    stubMe({ ...TEST_USER, mustChangePassword: true })

    render(
      <MemoryRouter initialEntries={['/tickets']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/choose a new password/i)).toBeInTheDocument()
  })
})
