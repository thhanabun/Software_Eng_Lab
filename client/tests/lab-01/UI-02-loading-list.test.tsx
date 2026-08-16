import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/App'

const categories = [
  { id: 1, name: 'Account and Access' },
  { id: 2, name: 'Hardware' },
  { id: 3, name: 'Software' },
  { id: 4, name: 'Network' },
]

describe('Check System loading to list flow', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows a loading state that changes to the category list', async () => {
    let resolveHealth: (value: unknown) => void = () => {}
    const healthPromise = new Promise((resolve) => {
      resolveHealth = resolve
    })
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(healthPromise)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => categories,
      })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Check System' }))

    expect(screen.getByRole('status')).toHaveTextContent('loading')

    resolveHealth({
      ok: true,
      json: async () => ({ status: 'ok', service: 'TokTickIT API' }),
    })

    await waitFor(() => {
      expect(screen.getByText('System Status: Online')).toBeInTheDocument()
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText('Supported Request Categories')).toBeInTheDocument()
    for (const category of categories) {
      expect(screen.getByText(category.name)).toBeInTheDocument()
    }
  })
})
