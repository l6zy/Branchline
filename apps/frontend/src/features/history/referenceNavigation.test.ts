import { describe, expect, it, vi } from 'vitest'
import { findReferenceCommit } from './referenceNavigation'

describe('reference navigation', () => {
  it.each(['main', 'v1.0'])('selects an already loaded %s reference without loading history', async (reference) => {
    const commit = { id: 'head', branches: ['main', 'v1.0'] }
    const load = vi.fn()
    expect(await findReferenceCommit([commit], reference, 2000, load)).toMatchObject({ commit, limit: 2000 })
    expect(load).not.toHaveBeenCalled()
  })

  it.each(['old-branch', 'v-old'])('expands history repeatedly to find %s', async (reference) => {
    const head = { id: 'head', branches: ['main'] }
    const target = { id: 'old', branches: ['old-branch', 'v-old'] }
    const load = vi.fn(async (limit: number) => limit === 20000 ? [head, target] : [head])
    const result = await findReferenceCommit([head], reference, 2000, load)
    expect(load.mock.calls).toEqual([[10000], [20000]])
    expect(result).toEqual({ commit: target, limit: 20000, commits: [head, target] })
  })

  it('stops loading as soon as the reference appears', async () => {
    const target = { id: 'tagged', branches: ['v1.0'] }
    const load = vi.fn(async () => [target])
    expect((await findReferenceCommit([], 'v1.0', 2000, load)).commit).toBe(target)
    expect(load.mock.calls).toEqual([[10000]])
  })

  it('returns a missing reference after exhausting the history cap', async () => {
    const load = vi.fn(async () => [{ id: 'unrelated' }])
    expect(await findReferenceCommit([], 'missing', 2000, load)).toMatchObject({ commit: null, limit: 20000 })
    expect(load.mock.calls).toEqual([[10000], [20000]])
  })

  it('does not load beyond the history cap', async () => {
    const load = vi.fn()
    expect((await findReferenceCommit([], 'missing', 20000, load)).commit).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })

  it('preserves loading errors for the caller', async () => {
    const load = vi.fn(async () => { throw new Error('history unavailable') })
    await expect(findReferenceCommit([], 'v-old', 2000, load)).rejects.toThrow('history unavailable')
    expect(load).toHaveBeenCalledTimes(1)
  })
})
