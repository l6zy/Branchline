import { describe, expect, it } from 'vitest'
import { formatDateTime, formatDisplayNumber } from './formatters'
describe('locale-aware display values', () => {
  it('formats dates through Intl without depending on host punctuation or timezone', () => {
    const value = '2026-08-11T17:49:51+08:00'
    for (const locale of ['zh-CN', 'en-US'] as const) {
      expect(formatDateTime(value, locale, true)).toBe(new Intl.DateTimeFormat(locale, {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).format(new Date(value)))
    }
    expect(formatDateTime(null, 'en-US')).toBe('—')
    expect(formatDateTime('raw label', 'en-US')).toBe('raw label')
  })
  it('formats counts without modifying underlying data', () => {
    expect(formatDisplayNumber(1234, 'en-US')).toBe('1,234')
  })
})
