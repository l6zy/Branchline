import { describe, expect, it } from 'vitest'
import { formatLocalDateTime } from './dateTime'

describe('formatLocalDateTime', () => {
  it('converts ISO timestamps to a compact local date and time', () => {
    const formatted = formatLocalDateTime('2026-08-11T17:49:51+08:00', true)

    expect(formatted).not.toContain('T')
    expect(formatted).not.toContain('+08:00')
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('keeps relative and otherwise unparseable labels unchanged', () => {
    expect(formatLocalDateTime('刚刚')).toBe('刚刚')
    expect(formatLocalDateTime('—')).toBe('—')
  })
})
