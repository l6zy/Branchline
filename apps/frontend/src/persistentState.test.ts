import { describe, expect, it } from 'vitest'
import { parsePersistentState } from './persistentState'

describe('parsePersistentState', () => {
  it('restores a stored value only when it matches the expected shape', () => {
    const isTheme = (value: unknown): value is 'dark' | 'light' => value === 'dark' || value === 'light'

    expect(parsePersistentState('"dark"', 'light', isTheme)).toBe('dark')
    expect(parsePersistentState('"system"', 'light', isTheme)).toBe('light')
    expect(parsePersistentState('{', 'light', isTheme)).toBe('light')
  })
})
