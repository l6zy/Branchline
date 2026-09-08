export type OperationLock = { current: boolean }

export function acquireOperationLock(lock: OperationLock) {
  if (lock.current) return false
  lock.current = true
  return true
}

export function releaseOperationLock(lock: OperationLock) {
  lock.current = false
}
