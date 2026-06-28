import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

// Minimal, dependency-free sanity test — proves the Vitest + jsdom +
// Testing Library + jest-dom pipeline works end to end.
describe('test harness', () => {
  it('renders DOM and applies jest-dom matchers', () => {
    render(<h1>anki-video-finder</h1>)
    expect(screen.getByRole('heading')).toHaveTextContent('anki-video-finder')
  })
})
