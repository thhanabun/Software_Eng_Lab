import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RequireAuth, RequireRole } from '../../src/components/RequireAuth'
import { AuthProvider } from '../../src/authContext'
import { TEST_USER } from '../test-user'

function stubMe(user: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/auth/me') {
        if (user === null) {
          return { ok: false, status: 401, json: async () => ({ error: { code: 'UNAUTHENTICATED' } }) }
        }
        return { ok: true, status: 200, json: async () => ({ user }) }
      }
      throw new Error(`unexpected ${url}`)
    }),
  )
}

function renderGuards(entry = '/tickets') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>LOGIN STUB</div>} />
          <Route path="/change-password" element={<div>CHANGE STUB</div>} />
          <Route
            path="/tickets"
            element={
              <RequireAuth>
                <div>PROTECTED STUB</div>
              </RequireAuth>
            }
          />
          <Route
            path="/staff"
            element={
              <RequireAuth>
                <RequireRole roles={['IT_STAFF', 'ADMINISTRATOR']}>
                  <div>STAFF STUB</div>
                </RequireRole>
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Route guards (UI-35)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('UI-35: anonymous users redirect to login', async () => {
    stubMe(null)
    renderGuards()

    expect(await screen.findByText('LOGIN STUB')).toBeInTheDocument()
  })

  it('UI-35: pending-change users are forced to change-password', async () => {
    stubMe({ ...TEST_USER, mustChangePassword: true })
    renderGuards()

    expect(await screen.findByText('CHANGE STUB')).toBeInTheDocument()
  })

  it('UI-35: fresh sessions render protected content', async () => {
    stubMe(TEST_USER)
    renderGuards()

    expect(await screen.findByText('PROTECTED STUB')).toBeInTheDocument()
  })

  it('UI-35: wrong role renders the forbidden panel, not a redirect loop', async () => {
    stubMe(TEST_USER)
    renderGuards('/staff')

    expect(await screen.findByTestId('forbidden-panel')).toHaveTextContent(/role/i)
    expect(screen.queryByText('LOGIN STUB')).not.toBeInTheDocument()
  })

  it('UI-35: permitted roles pass the role gate', async () => {
    stubMe({ ...TEST_USER, role: 'IT_STAFF' })
    renderGuards('/staff')

    expect(await screen.findByText('STAFF STUB')).toBeInTheDocument()
  })
})
