import { describe, expect, it, vi } from 'vitest'
import { LOCALE_STORAGE_KEY, readLocalePreference, resolveLocale, writeLocalePreference } from './localePreference'

describe('language preferences', () => {
  it('uses ordered supported system languages and falls back to Chinese', () => {
    expect(resolveLocale('system', ['fr-FR', 'en-GB', 'zh-TW'])).toBe('en-US')
    expect(resolveLocale('system', ['zh-TW', 'en-US'])).toBe('zh-CN')
    expect(resolveLocale('system', ['ja-JP'])).toBe('zh-CN')
    expect(resolveLocale('system', [])).toBe('zh-CN')
    expect(resolveLocale('en-US', ['zh-CN'])).toBe('en-US')
  })
  it('persists valid preferences and tolerates corrupt or unavailable storage', () => {
    const setItem = vi.fn()
    for (const preference of ['system', 'zh-CN', 'en-US'] as const) {
      expect(readLocalePreference({ getItem: () => preference, setItem })).toBe(preference)
      writeLocalePreference({ getItem: () => null, setItem }, preference)
      expect(setItem).toHaveBeenLastCalledWith(LOCALE_STORAGE_KEY, preference)
    }
    expect(readLocalePreference(undefined)).toBe('system')
    expect(readLocalePreference({ getItem: () => '"en-US"', setItem })).toBe('system')
    const unavailable = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    expect(readLocalePreference(unavailable)).toBe('system')
    expect(() => writeLocalePreference(unavailable, 'en-US')).not.toThrow()
  })
})
