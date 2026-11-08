// @vitest-environment jsdom
import { act, cleanup, fireEvent, render as renderUi, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppI18n } from '../../i18n'
import { ApplicationError, type FileHistoryEntry, type RepositorySnapshot } from '../../repository'
import { DiffPanel } from './DiffPanel'
import { HistoryDrawer } from '../history/HistoryDrawer'
import { ComparePanel } from '../compare/ComparePanel'
import { TooltipProvider } from '../../components/tooltip'

const render = (ui: ReactElement) => renderUi(<TooltipProvider>{ui}</TooltipProvider>)

const api = vi.hoisted(() => ({ history: vi.fn(), blame: vi.fn(), lineHistory: vi.fn(), diff: vi.fn(), compare: vi.fn() }))
vi.mock('../../repository', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../repository')>(),
  loadFileHistory: api.history, loadFileBlame: api.blame, loadLineHistory: api.lineHistory,
  loadFileCommitDiff: api.diff, compareRepositoryRefs: api.compare,
}))
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  HTMLElement.prototype.scrollIntoView = vi.fn()
  api.history.mockResolvedValue([]); api.blame.mockResolvedValue([]); api.lineHistory.mockResolvedValue([]); api.diff.mockResolvedValue([])
})
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); vi.unstubAllGlobals() })

describe('diff and history localization', () => {
  it('uses a singular full-sentence hint for one omitted source line', async () => {
    const i18n = await createAppI18n('en-US')
    const rows = Array.from({ length: 5 }, (_, index) => ({ old: index + 1, next: index + 1, kind: index === 4 ? 'add' as const : 'same' as const, code: `line ${index}` }))
    render(<I18nextProvider i18n={i18n}><DiffPanel files={[{ path: 'a', type: 'M', add: 1, del: 0 }]} wide={false} onWideChange={() => {}} fallbackChangeRows={rows}/></I18nextProvider>)
    const omission = screen.getByRole('button', { name: 'Expand 1 unchanged line above' })
    expect(omission.hasAttribute('title')).toBe(false)
    await act(() => omission.focus())
    expect(screen.getByRole('tooltip').textContent).toBe('Expand 1 unchanged line above (1 remaining)')
  })

  it('preserves source line coordinates without display grouping', async () => {
    const i18n = await createAppI18n('en-US')
    api.blame.mockResolvedValue([{ line: 1000, hash: 'rawhash', shortHash: 'rawhash', author: '原始作者', email: 'a@b', time: '1793516400', content: '原始代码' }])
    render(<I18nextProvider i18n={i18n}><HistoryDrawer repositoryPath="E:/repo" filePath="a.txt" initialTab="blame" onClose={() => {}}/></I18nextProvider>)
    await waitFor(() => expect(document.querySelector('.blame-line-number')?.textContent).toBe('1000'))
    const line = screen.getByRole('button', { name: /原始代码/ })
    expect(line.hasAttribute('title')).toBe(false)
    await act(() => line.focus())
    expect(screen.getByRole('tooltip').textContent).toBe('View the owning commit and full history for line 1000')
  })

  it('switches a real diff view without resetting its file, layout, search, or cached rows', async () => {
    const i18n = await createAppI18n('en-US')
    const loadRows = vi.fn(async () => [{ old: null, next: 1, kind: 'add' as const, code: '原始内容 keep' }])
    const files = [{ path: 'first.txt', type: 'M', add: 1, del: 0 }, { path: '中文文件.txt', type: 'M', add: 1, del: 0 }]
    render(<I18nextProvider i18n={i18n}><DiffPanel files={files} wide={false} onWideChange={() => {}} loadRows={loadRows}/></I18nextProvider>)
    expect(screen.getByText('Changed files')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /中文文件.txt/ }))
    await waitFor(() => expect(loadRows).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(document.querySelector('.diff-message')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Side-by-side diff' }))
    fireEvent.click(screen.getByRole('button', { name: 'Search diff' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Search diff' }), { target: { value: 'keep' } })
    await act(async () => { await i18n.changeLanguage('zh-CN') })
    expect(screen.getByText('变更文件')).toBeTruthy()
    expect((screen.getByRole('textbox', { name: '搜索 Diff' }) as HTMLInputElement).value).toBe('keep')
    expect(screen.getByRole('button', { name: '并排 Diff' }).className).toContain('active')
    expect(document.querySelector('.file-header code')?.textContent).toBe('中文文件.txt')
    expect(document.querySelector('.split-right')?.textContent).toContain('原始内容 keep')
    expect(loadRows).toHaveBeenCalledTimes(2)
  })

  it('renders retained structured diff errors again in the current language', async () => {
    const i18n = await createAppI18n('en-US')
    const loadRows = vi.fn().mockRejectedValue(new ApplicationError({ code: 'repository.required', params: {} }))
    render(<I18nextProvider i18n={i18n}><DiffPanel files={[{ path: 'a', type: 'M', add: 0, del: 0 }]} wide={false} onWideChange={() => {}} loadRows={loadRows}/></I18nextProvider>)
    await screen.findByText('Open a local repository first')
    await act(async () => { await i18n.changeLanguage('zh-CN') })
    expect(screen.getByText(i18n.t('errors:repository.required'))).toBeTruthy()
    expect(loadRows).toHaveBeenCalledTimes(1)
  })

  it('switches history metadata while retaining selected commit and raw commit content', async () => {
    const i18n = await createAppI18n('en-US')
    const entry = (hash: string) => ({ hash, shortHash: hash, title: `原始提交 ${hash}`, author: '作者姓名', email: 'a@b', committer: '提交者', committerEmail: 'c@d', time: '2026-11-01T08:00:00Z', commitTime: '2026-11-01T08:00:00Z', parents: [], message: `提交正文 ${hash}` } as FileHistoryEntry)
    api.history.mockResolvedValue([entry('first'), entry('second')])
    render(<I18nextProvider i18n={i18n}><HistoryDrawer repositoryPath="E:/repo" filePath="中文文件.txt" onClose={() => {}}/></I18nextProvider>)
    fireEvent.click(await screen.findByRole('button', { name: /原始提交 second/ }))
    await waitFor(() => expect(document.querySelector('.file-history-commit pre')?.textContent).toBe('提交正文 second'))
    const diffLoads = api.diff.mock.calls.length
    expect(screen.getByText('Author')).toBeTruthy()
    await act(async () => { await i18n.changeLanguage('zh-CN') })
    expect(screen.getByText('作者')).toBeTruthy()
    expect(document.querySelector('.file-history-row.active')?.textContent).toContain('原始提交 second')
    expect(document.querySelector('.file-history-commit pre')?.textContent).toBe('提交正文 second')
    expect(api.history).toHaveBeenCalledTimes(1)
    expect(api.diff).toHaveBeenCalledTimes(diffLoads)
  })

  it('switches an open compare reference search without changing its query or Git reference names', async () => {
    const i18n = await createAppI18n('en-US')
    const repository = { path: 'E:/repo', branch: '主分支', branches: ['主分支', 'feature'], remoteBranches: ['origin/main'] } as RepositorySnapshot
    render(<I18nextProvider i18n={i18n}><ComparePanel repository={repository} onNotice={() => {}}/></I18nextProvider>)
    expect(screen.getByText('Compare two branches or commits')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '主分支' }))
    fireEvent.change(screen.getByPlaceholderText('Search branches or enter a commit hash'), { target: { value: '主' } })
    await act(async () => { await i18n.changeLanguage('zh-CN') })
    expect((screen.getByPlaceholderText('搜索分支或输入提交 Hash') as HTMLInputElement).value).toBe('主')
    expect(screen.getByRole('option', { name: /主分支/ })).toBeTruthy()
    expect(api.compare).not.toHaveBeenCalled()
  })
})
