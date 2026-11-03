// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderLocalized } from '../../test/renderLocalized'
import { loadGitUserConfig, loadCommandLogs } from '../../repository'
import { GitConfigDialog } from './GitConfigDialog'
import { CommandLogPanel } from './CommandLogPanel'
import { LocaleProvider } from '../../i18n/LocaleProvider'

vi.mock('../../repository', async (original) => ({ ...await original<typeof import('../../repository')>(), loadGitUserConfig: vi.fn(), loadCommandLogs: vi.fn() }))
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks() })
describe('settings localization', () => {
  it('updates validation in place and preserves identity and template drafts', async () => {
    vi.mocked(loadGitUserConfig).mockResolvedValue({ userName: '张三', userEmail: '', defaultBranch: 'main', autocrlf: 'false', pullStrategy: 'merge', commitTemplateContent: '# 原样保留\n\nIssue:' })
    const { i18n } = await renderLocalized(<GitConfigDialog open onClose={vi.fn()} onNotice={vi.fn()}/>, 'en-US')
    await screen.findByRole('textbox', { name: 'Username' })
    expect(screen.getByRole('button', { name: 'Merge' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Windows' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }))
    expect(screen.getByText('Enter a valid Git email address')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Username' }), { target: { value: '我的 draft' } })
    await act(() => i18n.changeLanguage('zh-CN'))
    expect(screen.getByText('请输入有效的 Git 邮箱')).toBeTruthy()
    expect((screen.getByRole('textbox', { name: '用户名' }) as HTMLInputElement).value).toBe('我的 draft')
    expect((screen.getByRole('textbox', { name: '全局提交模板' }) as HTMLTextAreaElement).value).toBe('# 原样保留\n\nIssue:')
    expect(loadGitUserConfig).toHaveBeenCalledTimes(1)
  })
  it('localizes log counts and empty output while keeping native diagnostics unchanged', async () => {
    localStorage.setItem('branchline.locale.v1', 'en-US')
    vi.mocked(loadCommandLogs).mockResolvedValue([{ id: 1, command: 'git status', startedAt: 1000, durationMs: 4, success: false, stderr: 'fatal: 原始 Git diagnostic', stdout: '', workingDirectory: 'E:/项目', exitCode: 1 }])
    await renderLocalized(<LocaleProvider><CommandLogPanel open onClose={vi.fn()}/></LocaleProvider>, 'en-US')
    await waitFor(() => expect(screen.getByText('1 entry')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /git status/ }))
    expect(screen.getByText(/fatal: 原始 Git diagnostic/)).toBeTruthy()
    expect(screen.getByText('E:/项目')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy command and output' })).toBeTruthy()
  })
})
