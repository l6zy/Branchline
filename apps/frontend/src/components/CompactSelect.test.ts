import { describe, expect, it } from 'vitest'
import { compactSelectOptionClassName } from './CompactSelect'

describe('CompactSelect option classes', () => {
  it('marks only the selected option for the active menu state', () => {
    expect(compactSelectOptionClassName(true)).toBe('compact-select-option selected')
    expect(compactSelectOptionClassName(false)).toBe('compact-select-option')
  })
})
