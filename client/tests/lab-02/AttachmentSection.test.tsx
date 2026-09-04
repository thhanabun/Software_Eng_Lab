import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AttachmentSection from '../../src/components/AttachmentSection'
import { RequesterProvider } from '../../src/requesterContext'
import { REQUESTER_STORAGE_KEY } from '../../src/requesterStorage'

const requester = { id: 1, name: 'Alice Carter', email: 'alice.carter@student.example' }

const active = {
  id: 31,
  ticketId: 5,
  originalName: 'battery.png',
  mimeType: 'image/png',
  sizeBytes: 182443,
  uploadedAt: '2026-08-25T08:00:00.000Z',
  removedAt: null,
  removalReason: null,
}
const removed = {
  id: 30,
  ticketId: 5,
  originalName: 'old-scan.png',
  mimeType: 'image/png',
  sizeBytes: 10240,
  uploadedAt: '2026-08-24T08:00:00.000Z',
  removedAt: '2026-08-25T10:00:00.000Z',
  removalReason: 'Uploaded the wrong page',
}
const fresh = { ...active, id: 32, originalName: 'screenshot.png', sizeBytes: 2048 }

let urls: string[] = []
let deleteBody = ''

function stubFetch(overrides: { uploadStatus?: number; uploadMessage?: string } = {}) {
  urls = []
  deleteBody = ''
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      urls.push(`${init?.method ?? 'GET'} ${url}`)
      if (url === '/api/tickets/5/attachments' && (init?.method ?? 'GET') === 'GET') {
        return { ok: true, status: 200, json: async () => [active, removed] }
      }
      if (url === '/api/tickets/5/attachments' && init?.method === 'POST') {
        if (overrides.uploadStatus) {
          return {
            ok: false,
            status: overrides.uploadStatus,
            json: async () => ({ error: { message: overrides.uploadMessage } }),
          }
        }
        return { ok: true, status: 201, json: async () => fresh }
      }
      if (url === '/api/attachments/31/download') {
        return { ok: true, status: 200, blob: async () => new Blob(['x']) }
      }
      if (url === '/api/attachments/31' && init?.method === 'DELETE') {
        deleteBody = String(init.body)
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ...active,
            removedAt: '2026-08-25T12:00:00.000Z',
            removalReason: 'duplicate upload',
          }),
        }
      }
      throw new Error(`unexpected ${url}`)
    }),
  )
}

function renderSection() {
  return render(
    <RequesterProvider>
      <AttachmentSection ticketId={5} />
    </RequesterProvider>,
  )
}

describe('Attachment section', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(requester))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('UI-20: uploading a valid file POSTs and adds the new row', async () => {
    stubFetch()
    renderSection()

    expect(await screen.findByTestId('attachment-row-31')).toBeInTheDocument()
    expect(screen.getByTestId('attachment-row-30')).toBeInTheDocument()

    const fileInput = screen.getByLabelText(/choose attachment file/i)
    await userEvent.upload(fileInput, new File(['abc'], 'screenshot.png', { type: 'image/png' }))

    await waitFor(() => {
      expect(urls).toContain('POST /api/tickets/5/attachments')
    })
    expect(await screen.findByTestId('attachment-row-32')).toHaveTextContent('screenshot.png')
  })

  it('UI-21: an invalid file type shows a per-file message and never uploads', async () => {
    stubFetch()
    renderSection()
    await screen.findByTestId('attachment-row-31')

    fireEvent.change(screen.getByLabelText(/choose attachment file/i), {
      target: { files: [new File(['no'], 'notes.txt', { type: 'text/plain' })] },
    })

    expect(await screen.findByTestId('attachment-error')).toHaveTextContent('notes.txt')
    expect(screen.queryByTestId('attachment-row-32')).not.toBeInTheDocument()
    expect(urls.some((u) => u.startsWith('POST '))).toBe(false)
  })

  it('UI-22: download exists for active attachments only', async () => {
    stubFetch()
    renderSection()
    await screen.findByTestId('attachment-row-31')

    expect(screen.getByRole('button', { name: /download battery\.png/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /download old-scan\.png/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove old-scan\.png/i })).not.toBeInTheDocument()
    expect(screen.getByTestId('attachment-row-30')).toHaveTextContent(/Uploaded the wrong page/i)

    await userEvent.click(screen.getByRole('button', { name: /download battery\.png/i }))
    await waitFor(() => {
      expect(urls).toContain('GET /api/attachments/31/download')
    })
  })

  it('UI-23: removal needs a reason, confirms through the modal, and shows the removed badge', async () => {
    stubFetch()
    renderSection()
    await screen.findByTestId('attachment-row-31')

    await userEvent.click(screen.getByRole('button', { name: /remove battery\.png/i }))
    await screen.findByRole('dialog')

    await userEvent.click(screen.getByTestId('confirm-remove'))
    expect(await screen.findByText(/removal reason is required/i)).toBeInTheDocument()
    expect(urls.some((u) => u.startsWith('DELETE '))).toBe(false)

    await userEvent.type(screen.getByLabelText(/removal reason/i), 'duplicate upload')
    await userEvent.click(screen.getByTestId('confirm-remove'))

    await waitFor(() => {
      expect(urls).toContain('DELETE /api/attachments/31')
    })
    expect(deleteBody).toContain('duplicate upload')

    const updatedRow = await screen.findByTestId('attachment-row-31')
    expect(within(updatedRow).getByTestId('attachment-removed-badge')).toBeInTheDocument()
    expect(within(updatedRow).getByTestId('attachment-removal-reason')).toHaveTextContent(
      'duplicate upload',
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('UI-21b: server-side rejections (413/415/409) surface their message', async () => {
    stubFetch({ uploadStatus: 409, uploadMessage: 'A ticket can have at most 5 active attachments' })
    renderSection()
    await screen.findByTestId('attachment-row-31')

    await userEvent.upload(
      screen.getByLabelText(/choose attachment file/i),
      new File(['x'], 'extra.png', { type: 'image/png' }),
    )

    expect(await screen.findByTestId('attachment-error')).toHaveTextContent(/at most 5 active/i)
    expect(screen.queryByTestId('attachment-row-32')).not.toBeInTheDocument()
  })
})
