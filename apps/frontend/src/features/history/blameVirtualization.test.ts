import { describe, expect, it } from 'vitest'
import { getBlameVirtualRange } from './blameVirtualization'

describe('getBlameVirtualRange', () => {
  it('keeps an overscanned window around the current viewport', () => {
    expect(getBlameVirtualRange(10_000, 2_600, 520)).toEqual({ start: 80, end: 140 })
  })

  it('clamps the window to the start and end of the file', () => {
    expect(getBlameVirtualRange(10_000, 0, 520)).toEqual({ start: 0, end: 40 })
    expect(getBlameVirtualRange(10_000, 259_480, 520)).toEqual({ start: 9_960, end: 10_000 })
  })
})
