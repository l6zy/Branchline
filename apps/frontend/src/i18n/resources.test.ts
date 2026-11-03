import { describe, expect, it } from 'vitest'
import { createAppI18n } from './index'
import { resources } from './resources'

function leaves(value: unknown, path = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
    const next = path ? path + '.' + key : key
    return typeof item === 'string' ? [[next, item]] : Object.entries(leaves(item, next))
  }))
}
describe('bundled resources', () => {
  it('has matching keys and interpolation parameters in every namespace', () => {
    for (const namespace of Object.keys(resources['zh-CN'])) {
      const zh = leaves(resources['zh-CN'][namespace as keyof typeof resources['zh-CN']])
      const en = leaves(resources['en-US'][namespace as keyof typeof resources['en-US']])
      expect(Object.keys(en).sort(), namespace).toEqual(Object.keys(zh).sort())
      for (const key of Object.keys(zh)) {
        const params = (text: string) => [...text.matchAll(/{{\s*([\w]+)(?:\s*,[^}]+)?\s*}}/g)].map(match => match[1]).sort()
        expect(params(en[key]), namespace + ':' + key).toEqual(params(zh[key]))
        expect(en[key].trim()).not.toBe('')
      }
    }
  })
  it('resolves English plurals and Chinese counts', async () => {
    const zh = await createAppI18n('zh-CN')
    const en = await createAppI18n('en-US')
    expect(zh.t('common:fileCount', { count: 2 })).toBe('2 个文件')
    expect(en.t('common:fileCount', { count: 0 })).toBe('0 files')
    expect(en.t('common:fileCount', { count: 1 })).toBe('1 file')
    expect(en.t('common:fileCount', { count: 2 })).toBe('2 files')
    en.addResource('zh-CN', 'common', 'fallbackTest', '中文回退')
    expect(en.t('common:fallbackTest' as never)).toBe('中文回退')
  })
})
