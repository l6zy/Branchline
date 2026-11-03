import { describe, expect, it } from 'vitest'
import { createAppI18n } from './index'
import { errorMessage, message, renderMessage } from './messages'
describe('messages rendered in the current language', () => {
  it('retranslates the same descriptor while preserving repository data', async () => {
    const zh = await createAppI18n('zh-CN')
    const en = await createAppI18n('en-US')
    const notice = message('repository:branchSwitched', { branch: '修复/分支' })
    expect(renderMessage(notice, zh.t)).toBe('已切换到分支：修复/分支')
    expect(renderMessage(notice, en.t)).toBe('Switched to branch: 修复/分支')
  })
  it('formats structured error causes without translating native diagnostics', async () => {
    const en = await createAppI18n('en-US')
    const failure = errorMessage({ code: 'task.load_repository', params: {}, causes: [
      { code: 'repository.required', params: {}, details: 'fatal: 原始诊断' },
    ] })
    const text = renderMessage(failure, en.t)
    expect(text).toContain('Open a local repository first')
    expect(text).toContain('fatal: 原始诊断')
    expect(renderMessage(errorMessage({ code: 'missing.code', params: {} }), en.t)).toBe('Operation failed')
  })
  it('uses count-aware application errors in both languages', async () => {
    const en = await createAppI18n('en-US')
    expect(renderMessage(errorMessage({ code: 'conflict.remaining', params: { count: 1 } }), en.t)).toBe('1 file still has conflicts')
    expect(renderMessage(errorMessage({ code: 'conflict.remaining', params: { count: 2 } }), en.t)).toBe('2 files still have conflicts')
  })
})
