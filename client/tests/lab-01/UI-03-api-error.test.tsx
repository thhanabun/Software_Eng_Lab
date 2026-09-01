import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SystemStatusCard from '../../src/components/SystemStatusCard'

describe('Check System API failure', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('displays a useful error message when the API is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    render(<SystemStatusCard />)
    await userEvent.click(screen.getByRole('button', { name: 'Check System' }))

    await waitFor(() => {
      expect(screen.getByText('System Status: Offline')).toBeInTheDocument()
      expect(
        screen.getByText('Unable to connect to TokTickIT API'),
      ).toBeInTheDocument()
    })
    expect(screen.queryByText('Supported Request Categories')).not.toBeInTheDocument()
  })
})
