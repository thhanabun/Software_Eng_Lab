import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ChangePassword from '../../src/pages/ChangePassword'
import { AuthProvider } from '../../src/authContext'
import { TEST_USER } from '../test-user'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/change-password']}>
      <AuthProvider>
        <Routes>
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/tickets" element={<div>TICKETS STUB</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function stubMe() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/auth/me') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ user: { ...TEST_USER, mustChangePassword: true } }),
        }
      }
      throw new Error(`unexpected ${url}`)
    }),
  )
}

describe('Change Password screen (UI-31)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('UI-31: forced mode explains the initial-password situation', async () => {
    stubMe()
    renderPage()

    expect(await screen.findByText(/initial password/i)).toBeInTheDocument()
    expect(screen.getByText(/8–72 characters/i)).toBeInTheDocument()
  })

  it('UI-31: mismatch and short passwords block submit client-side', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/auth/me') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ user: { ...TEST_USER, mustChangePassword: true } }),
        }
      }
      throw new Error(`unexpected ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    await userEvent.type(screen.getByLabelText(/current password/i), 'Changeme123!')
    await userEvent.type(screen.getByLabelText(/^new password/i), 'short')
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'different')
    await userEvent.click(screen.getByRole('button', { name: /save new password/i }))

    expect(await screen.findAllByText(/passwords do not match/i)).toHaveLength(2)
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/auth/change-password',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('UI-31: valid change continues into the app', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === '/api/auth/me') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ user: { ...TEST_USER, mustChangePassword: true } }),
          }
        }
        if (url === '/api/auth/change-password' && init?.method === 'POST') {
          return { ok: true, status: 200, json: async () => ({ user: TEST_USER }) }
        }
        throw new Error(`unexpected ${url}`)
      }),
    )
    renderPage()

    await userEvent.type(screen.getByLabelText(/current password/i), 'Changeme123!')
    await userEvent.type(screen.getByLabelText(/^new password/i), 'BrandNew123')
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'BrandNew123')
    await userEvent.click(screen.getByRole('button', { name: /save new password/i }))

    expect(await screen.findByText('TICKETS STUB')).toBeInTheDocument()
  })

  it('UI-31: server field errors surface below fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === '/api/auth/me') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ user: { ...TEST_USER, mustChangePassword: true } }),
          }
        }
        if (url === '/api/auth/change-password' && init?.method === 'POST') {
          return {
            ok: false,
            status: 400,
            json: async () => ({
              error: {
                code: 'VALIDATION_ERROR',
                details: [{ field: 'newPassword', message: 'New password must differ' }],
              },
            }),
          }
        }
        throw new Error(`unexpected ${url}`)
      }),
    )
    renderPage()

    await userEvent.type(screen.getByLabelText(/current password/i), 'Changeme123!')
    await userEvent.type(screen.getByLabelText(/^new password/i), 'Changeme123!')
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'Changeme123!')
    await userEvent.click(screen.getByRole('button', { name: /save new password/i }))

    expect(await screen.findByText('New password must differ')).toBeInTheDocument()
  })
})
