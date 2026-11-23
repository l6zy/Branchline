import { describe, expect, it } from 'vitest'
import { isRoundedPreference, nativeWindowTheme, nextRoundedPreference } from './themePreference'

describe('rounded theme preference', () => {
  it('accepts only booleans', () => {
    expect(isRoundedPreference(true)).toBe(true)
    expect(isRoundedPreference(false)).toBe(true)
    expect(isRoundedPreference('true')).toBe(false)
    expect(isRoundedPreference(null)).toBe(false)
  })

  it('toggles the preference', () => {
    expect(nextRoundedPreference(false)).toBe(true)
    expect(nextRoundedPreference(true)).toBe(false)
  })
})

describe('native window theme preference', () => {
  it('lets the native window follow the operating system in system mode', () => {
    expect(nativeWindowTheme('system')).toBeNull()
    expect(nativeWindowTheme('light')).toBe('light')
    expect(nativeWindowTheme('dark')).toBe('dark')
  })
})
