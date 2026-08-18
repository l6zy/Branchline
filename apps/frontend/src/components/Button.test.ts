import { describe, expect, it } from 'vitest'
import { buttonClassName } from './Button'

describe('Button variants', () => {
  it('maps each semantic variant to one shared button class', () => {
    expect(buttonClassName({ variant: 'primary' })).toBe('button button-primary')
    expect(buttonClassName({ variant: 'secondary' })).toBe('button button-secondary')
    expect(buttonClassName({ variant: 'danger' })).toBe('button button-danger')
    expect(buttonClassName({ variant: 'icon' })).toBe('button button-icon')
  })

  it('adds shared state and layout modifiers without changing the variant', () => {
    expect(buttonClassName({ variant: 'icon', active: true, size: 'compact', className: 'panel-toggle' }))
      .toBe('button button-icon button-compact active panel-toggle')
  })
})
