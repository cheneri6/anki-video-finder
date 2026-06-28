import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../App'

describe('App Component', () => {
  it('renders the main title', async () => {
    render(<App />)
    expect(await screen.findByText('Anki Video Finder')).toBeInTheDocument()
  })
})
