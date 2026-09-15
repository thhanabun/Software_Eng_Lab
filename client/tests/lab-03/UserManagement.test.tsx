import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import UserManagement from '../../src/pages/UserManagement'
import { AuthProvider } from '../../src/authContext'

const ADMIN = {
  id: 10,
  name: 'Admin One',
  email: 'admin@example.test',
  role: 'ADMINISTRATOR',
  active: true,
  mustChangePassword: false,
}

const alice = {
  id: 1,
  name: 'Alice Carter',
  email: 'alice.carter@student.example',
  role: 'REQUESTER',
  active: true,
  mustChangePassword: true,
  createdAt: '2026-09-10T00:00:00.000Z',
}

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}

let listUrls: string[] = []
let savedBodies: { url: string; body: string }[] = []

function stubAdmin(overrides: { createStatus?: number } = {}) {
  listUrls = []
  savedBodies = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/auth/me') return ok({ user: ADMIN })
      if (url.startsWith('/api/admin/users') && (init?.method ?? 'GET') === 'GET') {
        listUrls.push(url)
        return ok({ items: [alice, ADMIN] })
      }
      if (url === '/api/admin/users' && init?.method === 'POST') {
        savedBodies.push({ url, body: String(init.body) })
        if (overrides.createStatus === 409) {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              error: {
                code: 'CONFLICT',
                message: 'Email is already in use',
                details: [{ field: 'email', message: 'Email is already in use' }],
              },
            }),
          }
        }
        return { ok: true, status: 201, json: async () => ({ ...alice, id: 99 }) }
      }
      if (url === '/api/admin/users/1' && init?.method === 'PATCH') {
        savedBodies.push({ url, body: String(init.body) })
        return ok({ ...alice, name: 'Alice C.' })
      }
      if (url === '/api/admin/users/1/reset-password' && init?.method === 'POST') {
        savedBodies.push({ url, body: String(init.body) })
        return ok({ ok: true })
      }
      throw new Error(`unexpected ${url}`)
    }),
  )
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/users']}>
      <AuthProvider>
        <Routes>
          <Route path="/admin/users" element={<UserManagement />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('User Management (UI-34)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('UI-34: rows render with roles/status and search/role filter hit the API', async () => {
    stubAdmin()
    renderPage()

    expect(await screen.findByTestId('user-row-1')).toHaveTextContent('alice.carter@student.example')
    expect(screen.getByTestId('user-row-10')).toHaveTextContent('Admin One')

    await userEvent.type(screen.getByLabelText('Search'), 'alice')
    await userEvent.click(screen.getByRole('button', { name: /apply search/i }))
    await screen.findByTestId('user-row-1')
    expect(listUrls.at(-1)).toContain('search=alice')

    await userEvent.selectOptions(screen.getByLabelText('Role'), 'REQUESTER')
    await screen.findByTestId('user-row-1')
    expect(listUrls.at(-1)).toContain('role=REQUESTER')
  })

  it('UI-34: create flow validates and posts the new user', async () => {
    stubAdmin()
    renderPage()
    await screen.findByTestId('user-row-1')

    await userEvent.click(screen.getByRole('button', { name: /create user/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByTestId('user-form-save'))
    expect(await within(dialog).findByText('Name is required')).toBeInTheDocument()

    await userEvent.type(within(dialog).getByLabelText(/^name/i), 'Newbie')
    await userEvent.type(within(dialog).getByLabelText(/email/i), 'newbie@example.test')
    await userEvent.selectOptions(within(dialog).getByLabelText(/^role/i), 'IT_STAFF')
    await userEvent.type(within(dialog).getByLabelText(/initial password/i), 'Newbie123!')
    await userEvent.click(within(dialog).getByTestId('user-form-save'))

    expect(await screen.findByTestId('admin-notice')).toHaveTextContent(/must change/i)
    expect(savedBodies.some((s) => s.body.includes('newbie@example.test'))).toBe(true)
  })

  it('UI-34: duplicate email surfaces the server message', async () => {
    stubAdmin({ createStatus: 409 })
    renderPage()
    await screen.findByTestId('user-row-1')

    await userEvent.click(screen.getByRole('button', { name: /create user/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^name/i), 'Dupe')
    await userEvent.type(within(dialog).getByLabelText(/email/i), 'alice.carter@student.example')
    await userEvent.type(within(dialog).getByLabelText(/initial password/i), 'Dupe12345!')
    await userEvent.click(within(dialog).getByTestId('user-form-save'))

    expect(await within(dialog).findByText('Email is already in use')).toBeInTheDocument()
  })

  it('UI-34: edit and reset-password flows post correctly', async () => {
    stubAdmin()
    renderPage()
    await screen.findByTestId('user-row-1')

    const row = screen.getByTestId('user-row-1')
    await userEvent.click(within(row).getByRole('button', { name: /edit alice carter/i }))
    const editDialog = await screen.findByRole('dialog')
    await userEvent.clear(within(editDialog).getByLabelText(/^name/i))
    await userEvent.type(within(editDialog).getByLabelText(/^name/i), 'Alice C.')
    await userEvent.click(within(editDialog).getByTestId('user-form-save'))
    expect(await screen.findByTestId('admin-notice')).toHaveTextContent(/updated/i)
    expect(savedBodies.some((s) => s.url.endsWith('/api/admin/users/1') && s.body.includes('Alice C.'))).toBe(true)

    await userEvent.click(within(screen.getByTestId('user-row-1')).getByRole('button', { name: /set new password/i }))
    await userEvent.type(screen.getByLabelText(/new initial password/i), 'Reset12345!')
    await userEvent.click(screen.getByTestId('confirm-reset'))
    expect(await screen.findByTestId('admin-notice')).toHaveTextContent(/must change it at next sign-in/i)
  })

  it('UI-34: self-deactivation control is disabled with an explanation', async () => {
    stubAdmin()
    renderPage()
    await screen.findByTestId('user-row-1')

    const adminRow = screen.getByTestId('user-row-10')
    await userEvent.click(within(adminRow).getByRole('button', { name: /edit admin one/i }))

    expect(screen.getByLabelText(/active/i)).toBeDisabled()
    expect(screen.getByText(/cannot deactivate your own account/i)).toBeInTheDocument()
  })
})
