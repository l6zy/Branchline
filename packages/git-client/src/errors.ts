import type { ApplicationErrorData } from '@branchline/git-models'
export type { ApplicationErrorData } from '@branchline/git-models'

function validate(value: unknown, seen: Set<object>, depth: number): value is ApplicationErrorData {
  if (!value || typeof value !== 'object' || depth > 20 || seen.has(value)) return false
  seen.add(value)
  const item = value as Record<string, unknown>
  if (typeof item.code !== 'string' || !item.code || !item.params || typeof item.params !== 'object' || Array.isArray(item.params)) return false
  if (!Object.values(item.params).every(param => ['string', 'number', 'boolean'].includes(typeof param) && (typeof param !== 'number' || Number.isFinite(param)))) return false
  if (item.details !== undefined && typeof item.details !== 'string') return false
  return item.causes === undefined || Array.isArray(item.causes) && item.causes.every(cause => validate(cause, seen, depth + 1))
}
export function normalizeApplicationError(value: unknown): ApplicationErrorData {
  if (value instanceof ApplicationError) return value.data
  if (validate(value, new Set(), 0)) return value
  if (value == null) return { code: 'unknown', params: {} }
  let details: string | undefined
  try { details = value instanceof Error ? value.message : typeof value === 'string' ? value : JSON.stringify(value) } catch { /* Circular or hostile data. */ }
  return { code: 'unknown', params: {}, ...(details ? { details } : {}) }
}
export class ApplicationError extends Error {
  readonly data: ApplicationErrorData
  constructor(value: unknown) {
    const data = normalizeApplicationError(value)
    super(data.details ?? data.code)
    this.name = 'ApplicationError'
    this.data = data
  }
}
