import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Login from '../../src/pages/Login'
import { AuthProvider } from '../../src/authContext'
import { TEST_USER } from '../test-user'

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/tickets" element={<div>TICKETS STUB</div>} />
          <Route path="/change-password" element={<div>CHANGE STUB</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Login screen (UI-30)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('UI-30: validation blocks empty submit without calling the API', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('should not be called')
    })
    vi.stubGlobal('fetch', fetchMock)
    renderLogin()

    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('UI-30: busy state while signing in, then continues to the app', async () => {
    let resolveLogin: (value: unknown) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === '/api/auth/me') {
          return { ok: false, status: 401, json: async () => ({ error: {} }) }
        }
        if (url === '/api/auth/login') {
          return new Promise((resolve) => (resolveLogin = resolve))
        }
        throw new Error(`unexpected ${url}`)
      }),
    )
    renderLogin()

    await userEvent.type(screen.getByLabelText(/email/i), 'alice@example.test')
    await userEvent.type(screen.getByLabelText(/password/i), 'Requester123!')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('button', { name: /signing in/i })).toBeDisabled()
    resolveLogin({
      ok: true,
      status: 200,
      json: async () => ({ user: TEST_USER }),
    })
    expect(await screen.findByText('TICKETS STUB')).toBeInTheDocument()
  })

  it('UI-30: failed login shows the server message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === '/api/auth/me') {
          return { ok: false, status: 401, json: async () => ({ error: {} }) }
        }
        if (url === '/api/auth/login') {
          return {
            ok: false,
            status: 401,
            json: async () => ({ error: { code: 'UNAUTHENTICATED', message: 'Invalid email or password' } }),
          }
        }
        throw new Error(`unexpected ${url}`)
      }),
    )
    renderLogin()

    await userEvent.type(screen.getByLabelText(/email/i), 'alice@example.test')
    await userEvent.type(screen.getByLabelText(/password/i), 'Wrong12345')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByTestId('login-error')).toHaveTextContent('Invalid email or password')
  })

  it('UI-30: must-change login continues to change-password', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === '/api/auth/me') {
          return { ok: false, status: 401, json: async () => ({ error: {} }) }
        }
        if (url === '/api/auth/login') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ user: { ...TEST_USER, mustChangePassword: true } }),
          }
        }
        throw new Error(`unexpected ${url}`)
      }),
    )
    renderLogin()

    await userEvent.type(screen.getByLabelText(/email/i), 'new@example.test')
    await userEvent.type(screen.getByLabelText(/password/i), 'Changeme123!')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('CHANGE STUB')).toBeInTheDocument()
  })
})
