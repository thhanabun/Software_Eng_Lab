import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../../src/App'

describe('App heading', () => {
  it('renders the TokTickIT heading', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: 'TokTickIT IT Service Desk' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check System' })).toBeInTheDocument()
  })
})
