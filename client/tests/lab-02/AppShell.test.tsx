import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/App'
import AppShell from '../../src/components/AppShell'
import { RequesterProvider } from '../../src/requesterContext'
import { REQUESTER_STORAGE_KEY } from '../../src/requesterStorage'

const REQUESTER = { id: 1, name: 'Alice Carter', email: 'alice.carter@student.example' }

function renderShell(initialPath = '/tickets') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <RequesterProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/tickets" element={<div>TICKETS STUB</div>} />
            <Route path="/tickets/new" element={<div>CREATE STUB</div>} />
          </Route>
          <Route path="/select-requester" element={<div>SELECTION STUB</div>} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>,
  )
}

describe('Application shell (UI-06, STYLE-01)', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(REQUESTER))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('UI-06: shows the current requester and clears context via Change Requester', async () => {
    renderShell()

    expect(screen.getByTestId('current-requester')).toHaveTextContent('Alice Carter')

    await userEvent.click(screen.getByRole('button', { name: 'Change Requester' }))

    expect(screen.getByText('SELECTION STUB')).toBeInTheDocument()
    expect(localStorage.getItem(REQUESTER_STORAGE_KEY)).toBeNull()
  })

  it('UI-06: marks the active page in the navigation', () => {
    renderShell('/tickets/new')

    const createLink = screen.getByRole('link', { name: 'Create Ticket' })
    expect(createLink).toHaveClass('active')
    expect(createLink).toHaveAttribute('aria-current', 'page')
  })

  it('STYLE-01: header uses the Zen Green primary token class', () => {
    renderShell()

    const header = screen.getByText('TokTickIT', { selector: '.tg-brand' }).closest('header')
    expect(header).not.toBeNull()
    expect(header).toHaveClass('tg-header')
  })
})

describe('Requester guard (AC-02)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('redirects ticket screens to the Selection screen when no requester is selected', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))

    render(
      <MemoryRouter initialEntries={['/tickets']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      screen.getByText(/Select a Development Requester to test requester-specific ticket behavior/i),
    ).toBeInTheDocument()
  })
})
