import { describe, expect, it } from 'vitest'
import { nextHistoryLoadLimit } from './historyDepth'

describe('history depth expansion', () => {
  it('expands branch lookup history without exceeding the maximum depth', () => {
    expect(nextHistoryLoadLimit(2_000)).toBe(10_000)
    expect(nextHistoryLoadLimit(10_000)).toBe(20_000)
    expect(nextHistoryLoadLimit(20_000)).toBeNull()
  })
})
