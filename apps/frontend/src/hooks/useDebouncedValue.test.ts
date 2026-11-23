// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedValue } from './useDebouncedValue'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useDebouncedValue', () => {
  it('applies only the latest value after the delay', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 220), { initialProps: { value: '' } })

    rerender({ value: 'first' })
    act(() => vi.advanceTimersByTime(180))
    rerender({ value: 'latest' })
    act(() => vi.advanceTimersByTime(219))
    expect(result.current).toBe('')
    act(() => vi.advanceTimersByTime(1))

    expect(result.current).toBe('latest')
  })
})
