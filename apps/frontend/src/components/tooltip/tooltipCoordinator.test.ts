import { describe, expect, it, vi } from 'vitest'
import { createTooltipCoordinator } from './tooltipCoordinator'

describe('tooltip ownership', () => {
  it('invalidates earlier pending opens and protects a new owner from an old unmount', () => {
    const state = createTooltipCoordinator()
    const first = state.claim('first')
    const second = state.claim('second')
    expect(state.open('first', first)).toBe(false)
    expect(state.open('second', second)).toBe(true)
    state.close('first', 'unmount')
    expect(state.getSnapshot().openId).toBe('second')
    state.dismiss('scroll')
    expect(state.getSnapshot().openId).toBeNull()
    expect(state.open('second', second)).toBe(false)
  })

  it('closes an open owner immediately when another trigger is claimed', () => {
    const state = createTooltipCoordinator()
    state.open('first', state.claim('first'))
    state.claim('second')
    expect(state.getSnapshot()).toMatchObject({ ownerId: 'second', openId: null, lastClosedId: 'first', closeReason: 'superseded' })
  })

  it('caches snapshots and notifies only actual state changes', () => {
    const state = createTooltipCoordinator()
    const initial = state.getSnapshot()
    expect(state.getSnapshot()).toBe(initial)
    const listener = vi.fn()
    const unsubscribe = state.subscribe(listener)
    const generation = state.claim('first')
    expect(listener).toHaveBeenCalledTimes(1)
    state.open('first', generation)
    expect(listener).toHaveBeenCalledTimes(2)
    const opened = state.getSnapshot()
    state.open('first', generation)
    state.close('unrelated', 'unmount')
    expect(state.getSnapshot()).toBe(opened)
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    state.dismiss('escape')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('ignores dismissals when no tooltip is pending or open', () => {
    const state = createTooltipCoordinator()
    const listener = vi.fn()
    state.subscribe(listener)
    const initial = state.getSnapshot()
    state.dismiss('scroll')
    state.dismiss('activation')
    expect(state.getSnapshot()).toBe(initial)
    expect(listener).not.toHaveBeenCalled()
  })

  it('invalidates stale callbacks on leave and on reentry into the same trigger', () => {
    const state = createTooltipCoordinator()
    const first = state.claim('same')
    state.close('same', 'leave')
    const second = state.claim('same')
    expect(second).toBeGreaterThan(first)
    expect(state.open('same', first)).toBe(false)
    expect(state.open('same', second)).toBe(true)
  })
})
