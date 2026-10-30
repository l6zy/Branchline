import { describe, expect, it, vi } from 'vitest'
import { findParentCommit } from './parentNavigation'

describe('parent navigation', () => {
  it('selects an already loaded parent without querying history', async () => {
    const parent = { id: 'abc1234', fullHash: 'abc1234567' }
    const load = vi.fn()
    expect(await findParentCommit([parent], 'abc1234567', 2000, load)).toMatchObject({ commit: parent, limit: 2000 })
    expect(load).not.toHaveBeenCalled()
  })

  it('grows history repeatedly until an unloaded parent is found', async () => {
    const parent = { id: 'parent', fullHash: 'parent-full' }
    const limits: number[] = []
    const result = await findParentCommit([], 'parent-full', 2000, async (limit) => {
      limits.push(limit)
      return limit === 20000 ? [parent] : []
    })
    expect(limits).toEqual([10000, 20000])
    expect(result.commit).toBe(parent)
  })

  it('returns a missing parent after exhausting the history cap', async () => {
    expect((await findParentCommit([], 'missing', 20000, async () => [])).commit).toBeNull()
  })

  it('propagates history errors so the current selection can remain intact', async () => {
    await expect(findParentCommit([], 'parent', 2000, async () => { throw new Error('failed') })).rejects.toThrow('failed')
  })
})
