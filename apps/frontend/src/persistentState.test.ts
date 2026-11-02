import { describe, expect, it } from 'vitest'
import { parsePersistentState } from './persistentState'
import { isThemePreference, nextThemePreference, resolveTheme } from './themePreference'

describe('parsePersistentState', () => {
  it('restores a stored value only when it matches the expected shape', () => {
    expect(parsePersistentState('"dark"', 'light', isThemePreference)).toBe('dark')
    expect(parsePersistentState('"system"', 'light', isThemePreference)).toBe('system')
    expect(parsePersistentState('{', 'light', isThemePreference)).toBe('light')
  })

  it('cycles icon button choices through light, dark, and system themes', () => {
    expect(nextThemePreference('light')).toBe('dark')
    expect(nextThemePreference('dark')).toBe('system')
    expect(nextThemePreference('system')).toBe('light')
  })

  it('resolves system preference against the current operating system appearance', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})
