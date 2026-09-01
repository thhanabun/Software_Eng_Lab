import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CreateTicket from '../../src/pages/CreateTicket'
import { RequesterProvider } from '../../src/requesterContext'
import { REQUESTER_STORAGE_KEY } from '../../src/requesterStorage'

const requester = { id: 1, name: 'Alice Carter', email: 'alice.carter@student.example' }
const categories = [
  { id: 1, name: 'Account and Access' },
  { id: 2, name: 'Hardware' },
]
const systems = [
  { id: 1, name: 'Email' },
  { id: 3, name: 'VPN' },
]

const validFilled = {
  category: '2',
  system: '3',
  priority: 'HIGH',
  summary: 'VPN keeps disconnecting',
  description: 'The VPN drops every few minutes on campus Wi-Fi.',
}

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}

function fail(status: number, body: unknown) {
  return { ok: false, status, json: async () => body }
}

function createdTicket() {
  return {
    id: 42,
    ticketNumber: 'TKT-20260823-0001',
    requesterId: 1,
    categoryId: 2,
    relatedSystemId: 3,
    summary: 'VPN keeps disconnecting',
    description: 'The VPN drops every few minutes on campus Wi-Fi.',
    requestedPriority: 'HIGH',
    currentStatus: 'NEW',
    createdAt: '2026-08-23T09:00:00.000Z',
    updatedAt: '2026-08-23T09:00:00.000Z',
  }
}

async function fillValidForm() {
  await userEvent.selectOptions(screen.getByLabelText(/^Category/i), '2')
  await userEvent.selectOptions(screen.getByLabelText(/Related System/i), '3')
  await userEvent.selectOptions(screen.getByLabelText(/Requested Priority/i), 'HIGH')
  await userEvent.type(screen.getByLabelText(/ticket summary/i), validFilled.summary)
  await userEvent.type(screen.getByLabelText(/^Description/i), validFilled.description)
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/tickets/new']}>
      <RequesterProvider>
        <Routes>
          <Route path="/tickets/new" element={<CreateTicket />} />
          <Route path="/tickets/:id" element={<div>DETAIL STUB</div>} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>,
  )
}

describe('Create Ticket screen', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(requester))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('UI-11: system values read-only, requester prefilled, reference data from API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === '/api/categories') return ok(categories)
        if (url === '/api/related-systems') return ok(systems)
        throw new Error(`unexpected ${url}`)
      }),
    )

    renderPage()

    const numberField = await screen.findByLabelText(/Ticket Number/i)
    expect(numberField).toHaveAttribute('readonly')
    expect(numberField).toHaveValue('—')
    expect(screen.getByLabelText(/Requester/i)).toHaveValue('Alice Carter')

    const categorySelect = await screen.findByLabelText(/^Category/i)
    await waitFor(() => {
      expect(
        within(categorySelect as HTMLElement).getByRole('option', { name: 'Hardware' }),
      ).toBeInTheDocument()
    })
    const systemSelect = screen.getByLabelText(/Related System/i)
    expect(within(systemSelect as HTMLElement).getByRole('option', { name: 'VPN' })).toBeInTheDocument()
  })

  it('UI-07: submit without Summary/Description shows field messages and calls no API', async () => {
    const fetchMock = vi.fn(async () => ok([]))
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    await screen.findByLabelText(/^Category/i)

    await userEvent.click(screen.getByRole('button', { name: /submit ticket/i }))

    expect(await screen.findByText('Summary is required')).toBeInTheDocument()
    expect(await screen.findByText('Description is required')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/tickets',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('UI-08: Submit shows a busy state and cannot double-submit', async () => {
    let resolvePost: (value: unknown) => void = () => {}
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/categories') return ok(categories)
      if (url === '/api/related-systems') return ok(systems)
      if (url === '/api/tickets') return new Promise((resolve) => (resolvePost = resolve))
      throw new Error(`unexpected ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    await screen.findByLabelText(/^Category/i)
    await fillValidForm()

    const submit = screen.getByRole('button', { name: /submit ticket/i })
    await userEvent.click(submit)

    const busy = screen.getByRole('button', { name: /submitting/i })
    expect(busy).toBeDisabled()
    await userEvent.click(busy)
    resolvePost(ok(createdTicket()))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/tickets',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    expect(
      fetchMock.mock.calls.filter(([u]) => String(u) === '/api/tickets'),
    ).toHaveLength(1)
  })

  it('UI-09: success state displays the backend-generated Ticket Number and next action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === '/api/categories') return ok(categories)
        if (url === '/api/related-systems') return ok(systems)
        if (url === '/api/tickets' && init?.method === 'POST') {
          return { ...ok(createdTicket()), status: 201 }
        }
        throw new Error(`unexpected ${url}`)
      }),
    )

    renderPage()
    await screen.findByLabelText(/^Category/i)
    await fillValidForm()
    await userEvent.click(screen.getByRole('button', { name: /submit ticket/i }))

    expect(
      await screen.findByTestId('generated-ticket-number'),
    ).toHaveTextContent('TKT-20260823-0001')
    expect(screen.getByRole('button', { name: /view ticket/i })).toBeInTheDocument()
  })

  it('UI-10: API failure keeps form values and shows a safe error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === '/api/categories') return ok(categories)
        if (url === '/api/related-systems') return ok(systems)
        if (url === '/api/tickets') throw new Error('Network error')
        throw new Error(`unexpected ${url}`)
      }),
    )

    renderPage()
    await screen.findByLabelText(/^Category/i)
    await fillValidForm()
    await userEvent.click(screen.getByRole('button', { name: /submit ticket/i }))

    expect(
      await screen.findByText(/unable to create ticket/i),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/ticket summary/i)).toHaveValue(validFilled.summary)
    expect(screen.getByLabelText(/^Description/i)).toHaveValue(validFilled.description)
  })

  it('UI-10b: server field-level validation errors surface near fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === '/api/categories') return ok(categories)
        if (url === '/api/related-systems') return ok(systems)
        if (url === '/api/tickets') {
          return fail(400, {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Ticket payload is invalid',
              details: [{ field: 'summary', message: 'Summary must be 120 characters or fewer' }],
            },
          })
        }
        throw new Error(`unexpected ${url}`)
      }),
    )

    renderPage()
    await screen.findByLabelText(/^Category/i)
    await fillValidForm()
    await userEvent.click(screen.getByRole('button', { name: /submit ticket/i }))

    expect(
      await screen.findByText('Summary must be 120 characters or fewer'),
    ).toBeInTheDocument()
  })

  it('UI-12: attachment selection validates type and size per file', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok([])),
    )

    renderPage()
    const fileInput = await screen.findByLabelText(/attachments/i)

    const badFile = new File(['not an image'], 'notes.txt', { type: 'text/plain' })
    const bigFile = new File(['x'], 'huge.png', { type: 'image/png' })
    Object.defineProperty(bigFile, 'size', { value: 6 * 1024 * 1024 })
    const goodFile = new File(['x'], 'screenshot.png', { type: 'image/png' })

    await userEvent.upload(fileInput, [badFile, bigFile, goodFile])

    expect(await screen.findByText(/notes\.txt.*(unsupported|not supported|allowed)/i)).toBeInTheDocument()
    expect(screen.getByText(/huge\.png.*(too large|exceed)/i)).toBeInTheDocument()
    expect(screen.getByText('screenshot.png')).toBeInTheDocument()
  })
})
