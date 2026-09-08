import { describe, expect, it } from 'vitest'
import { acquireOperationLock, releaseOperationLock } from './operationLock'

describe('operation lock', () => {
  it('rejects a repeated action until the running action releases the lock', () => {
    const lock = { current: false }
    expect(acquireOperationLock(lock)).toBe(true)
    expect(acquireOperationLock(lock)).toBe(false)
    releaseOperationLock(lock)
    expect(acquireOperationLock(lock)).toBe(true)
  })
})
