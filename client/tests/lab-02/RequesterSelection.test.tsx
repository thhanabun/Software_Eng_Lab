import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RequesterSelection from '../../src/pages/RequesterSelection'
import { RequesterProvider } from '../../src/requesterContext'
import { REQUESTER_STORAGE_KEY } from '../../src/requesterStorage'

const REQUESTERS = [
  { id: 1, name: 'Alice Carter', email: 'alice.carter@student.example' },
  { id: 2, name: 'Benjalak Suwan', email: 'benjalak.suw@student.example' },
]

function renderSelection() {
  return render(
    <MemoryRouter initialEntries={['/select-requester']}>
      <RequesterProvider>
        <Routes>
          <Route path="/select-requester" element={<RequesterSelection />} />
          <Route path="/tickets" element={<div>MY TICKETS PLACEHOLDER</div>} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>,
  )
}

function stubRequesters(response: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => response,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('Requester Selection screen', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('UI-01: shows a loading state while requesters are fetched', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise(() => {})),
    )

    renderSelection()
    expect(screen.getByRole('status')).toHaveTextContent('Loading requesters')
  })

  it('UI-02: lists active requesters and keeps Continue disabled until one is selected', async () => {
    stubRequesters(REQUESTERS)
    renderSelection()

    const select = await screen.findByLabelText(/Development Requester/i)
    expect(select).toBeInTheDocument()
    for (const requester of REQUESTERS) {
      expect(screen.getByRole('option', { name: new RegExp(requester.name) })).toBeInTheDocument()
    }

    const continueButton = screen.getByRole('button', { name: 'Continue' })
    expect(continueButton).toBeDisabled()

    await userEvent.selectOptions(select, '1')
    expect(continueButton).toBeEnabled()
  })

  it('UI-03: shows the empty state when no active requesters exist', async () => {
    stubRequesters([])
    renderSelection()

    expect(
      await screen.findByText(/No active Development Requesters exist/i),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText(/Development Requester/i)).not.toBeInTheDocument()
  })

  it('UI-04: shows a safe failure state with a working Retry action', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ ok: true, json: async () => REQUESTERS })
    vi.stubGlobal('fetch', fetchMock)

    renderSelection()

    expect(
      await screen.findByText(/Unable to load Development Requesters/i),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(
      await screen.findByLabelText(/Development Requester/i),
    ).toBeInTheDocument()
  })

  it('UI-05: Continue stores the selected requester and proceeds to My Tickets', async () => {
    stubRequesters(REQUESTERS)
    renderSelection()

    const select = await screen.findByLabelText(/Development Requester/i)
    await userEvent.selectOptions(select, '2')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(screen.getByText('MY TICKETS PLACEHOLDER')).toBeInTheDocument()
    })

    const stored = JSON.parse(localStorage.getItem(REQUESTER_STORAGE_KEY) ?? 'null')
    expect(stored).toEqual(REQUESTERS[1])
  })
})
