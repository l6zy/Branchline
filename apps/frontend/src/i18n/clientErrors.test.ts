import { describe, expect, it } from 'vitest'
import { ApplicationError, normalizeApplicationError } from '../../../../packages/git-client/src/errors'

describe('application error transport', () => {
  it('preserves structured errors and raw diagnostics', () => {
    const source = { code: 'repository.required', params: { count: 2, force: false }, details: 'fatal: 原始诊断', causes: [{ code: 'native', params: {}, details: 'cherry-pick is now empty' }] }
    expect(normalizeApplicationError(source)).toEqual(source)
    expect(new ApplicationError(source).data).toEqual(source)
    expect(normalizeApplicationError(new Error('系统原始诊断')).details).toBe('系统原始诊断')
  })
  it('safely rejects malformed and circular payloads', () => {
    expect(normalizeApplicationError(null).code).toBe('unknown')
    expect(normalizeApplicationError({ code: 12, params: [] }).code).toBe('unknown')
    const circular: Record<string, unknown> = {}; circular.self = circular
    expect(() => normalizeApplicationError(circular)).not.toThrow()
    const recursive = { code: 'native', params: {}, causes: [] as unknown[] }
    recursive.causes.push(recursive)
    expect(normalizeApplicationError(recursive).code).toBe('unknown')
  })
})
