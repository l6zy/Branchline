// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderLocalized } from '../../test/renderLocalized'
import { fetchRepository, loadRepositoryDetails, loadRepository, fastForwardRepositoryBranch, type RepositoryDetails, type RepositorySnapshot } from '../../repository'
import { AddRepositoryDialog } from './AddRepositoryDialog'
import { RepositoryDetailsPanel } from './RepositoryDetailsPanel'
import { RepositoryStructurePanel } from './RepositoryStructurePanel'
import { RepositoryQuickSwitcher } from './RepositoryQuickSwitcher'
import { useRepositoryWorkspace } from './useRepositoryWorkspace'
import { renderMessage } from '../../i18n/messages'
import { useAppTranslation } from '../../i18n/useAppTranslation'
import { CreateWorktreeDialog } from './CreateWorktreeDialog'
import { RepositoryManagerPage } from './RepositoryManagerPage'
import { LocaleProvider, useLocale } from '../../i18n/LocaleProvider'
import { useAutoFastForward } from './useAutoFastForward'
import type { MessageContent } from '../../i18n/messages'
import { useState } from 'react'

vi.mock('../../repository', async (original) => ({
  ...await original<typeof import('../../repository')>(),
  loadRepositoryDetails: vi.fn(), loadRepository: vi.fn(), fetchRepository: vi.fn(), fastForwardRepositoryBranch: vi.fn(), loadRepositoryStateToken: vi.fn().mockResolvedValue('stable'),
}))
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks() })
const snapshot = { name: 'project', path: 'E:/code/project', branch: 'main', branches: ['main'], tags: [], files: [], worktrees: [{ path: 'E:/code/project', branch: 'main' }, { path: 'E:/code/feature', branch: 'feature' }], submodules: [], worktreeCount: 2, submoduleCount: 0, ahead: 2, behind: 1 } as unknown as RepositorySnapshot

describe('repository localization', () => {
  it('renders the clone form in English and preserves user input when switching', async () => {
    const { i18n } = await renderLocalized(<AddRepositoryDialog mode="clone" initialParent="E:/code" onClose={vi.fn()} onCreated={vi.fn()}/>, 'en-US')
    const source = screen.getByRole('textbox', { name: 'Repository URL' }) as HTMLInputElement
    fireEvent.change(source, { target: { value: 'git@example.com:team/项目.git' } })
    await act(() => i18n.changeLanguage('zh-CN'))
    expect(screen.getByRole('dialog', { name: '克隆仓库' })).toBeTruthy()
    expect((screen.getByRole('textbox', { name: '仓库地址' }) as HTMLInputElement).value).toBe('git@example.com:team/项目.git')
  })
  it('keeps a new worktree draft when translating the form', async () => {
    const { i18n } = await renderLocalized(<CreateWorktreeDialog branches={['main']} busy={false} onClose={vi.fn()} onSubmit={vi.fn()}/>, 'en-US')
    expect(screen.getByText('Removing a worktree uses force mode and deletes its working directory and uncommitted changes. Commit or back up any changes you want to keep first.')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Destination directory' }), { target: { value: 'E:/项目/new' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create new branch' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New branch name' }), { target: { value: 'feature/新功能' } })
    await act(() => i18n.changeLanguage('zh-CN'))
    expect((screen.getByRole('textbox', { name: '目标目录' }) as HTMLInputElement).value).toBe('E:/项目/new')
    expect((screen.getByRole('textbox', { name: '新分支名' }) as HTMLInputElement).value).toBe('feature/新功能')
  })
  it('updates details without fetching again or changing the selected tab', async () => {
    vi.mocked(loadRepositoryDetails).mockResolvedValue({ ...snapshot, remoteBranches: [], remotes: [] } as unknown as RepositoryDetails)
    const { i18n } = await renderLocalized(<RepositoryDetailsPanel item={{ name: 'project', path: snapshot.path, favorite: false, current: false }} opening={false} onOpen={vi.fn()} onVscode={vi.fn()} onToggleFavorite={vi.fn()}/>, 'en-US')
    await screen.findByRole('tab', { name: 'Remotes 0' })
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    fireEvent.click(screen.getByRole('tab', { name: 'Remotes 0' }))
    expect(screen.getByText('No remotes configured')).toBeTruthy()
    await act(() => i18n.changeLanguage('zh-CN'))
    expect(screen.getByRole('tab', { name: '远程 0' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('尚未配置远程仓库')).toBeTruthy()
    expect(loadRepositoryDetails).toHaveBeenCalledTimes(1)
  })
  it('formats display counts without changing branch identifiers', async () => {
    const branches = Array.from({ length: 1234 }, (_, index) => `feature/${index}`)
    vi.mocked(loadRepositoryDetails).mockResolvedValue({ ...snapshot, branches, remoteBranches: [], remotes: [] } as unknown as RepositoryDetails)
    await renderLocalized(<RepositoryDetailsPanel item={{ name: 'project', path: snapshot.path, favorite: false, current: false }} opening={false} onOpen={vi.fn()} onVscode={vi.fn()} onToggleFavorite={vi.fn()}/>, 'en-US')
    expect(await screen.findByRole('tab', { name: 'Branches 1,234' })).toBeTruthy()
    expect(screen.getByText('feature/1233')).toBeTruthy()
  })
  it('translates an already open destructive confirmation and keeps raw paths', async () => {
    const { i18n } = await renderLocalized(<RepositoryStructurePanel repository={snapshot} activePath={snapshot.path} view="structure" selection={{ kind: 'worktree', path: 'E:/code/feature' }} onOpenPath={vi.fn()} onOpenTag={vi.fn()} onSnapshot={vi.fn()} onNotice={vi.fn()}/>, 'en-US')
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.getByRole('dialog', { name: 'Remove worktree' })).toBeTruthy()
    expect(screen.getByText(/E:\/code\/feature/, { selector: '.confirm-dialog p' })).toBeTruthy()
    await act(() => i18n.changeLanguage('zh-CN'))
    expect(screen.getByRole('dialog', { name: '移除 Worktree' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '强制移除' })).toBeTruthy()
  })
  it('keeps the switcher search open and translates stable target kinds', async () => {
    const { i18n } = await renderLocalized(<RepositoryQuickSwitcher repository={snapshot} parentRepository={null} favorites={[]} recentRepositories={[]} openingRepository={false} openSignal={1} onToggleFavorite={vi.fn()} onOpenRepository={vi.fn()} onOpenRepositoryPath={vi.fn()} onOpenSubmodulePath={vi.fn()} onReturnToParentRepository={vi.fn()}/>, 'en-US')
    const search = screen.getByPlaceholderText('Search repository name or path')
    expect(screen.queryByRole('button', { name: 'Repository manager' })).toBeNull()
    expect(screen.getByRole('button', { name: /^Open local repository/ })).toBeTruthy()
    fireEvent.change(search, { target: { value: 'feature' } })
    expect(screen.getByText('Worktree · feature · E:/code/feature')).toBeTruthy()
    await act(() => i18n.changeLanguage('zh-CN'))
    expect((screen.getByPlaceholderText('搜索仓库名称或路径') as HTMLInputElement).value).toBe('feature')
  })
  it('renders persistent notices in the current language without reopening the repository', async () => {
    vi.mocked(fetchRepository).mockResolvedValue(snapshot)
    function Workspace() {
      const workspace = useRepositoryWorkspace()
      const { t } = useAppTranslation()
      return <><button onClick={() => workspace.applySnapshot(snapshot)}>seed</button><button onClick={() => workspace.fetchNow()}>fetch</button><output>{renderMessage(workspace.repositoryNotice, t)}</output><span>{workspace.repository?.name}</span></>
    }
    const { i18n } = await renderLocalized(<Workspace/>, 'en-US')
    fireEvent.click(screen.getByText('seed'))
    fireEvent.click(screen.getByText('fetch'))
    await screen.findByText('Fetch complete; remote refs updated')
    expect(screen.getByText('project')).toBeTruthy()
    await act(() => i18n.changeLanguage('zh-CN'))
    expect(screen.getByText('Fetch 完成，远程引用已更新')).toBeTruthy()
    expect(screen.getByText('project')).toBeTruthy()
    expect(loadRepository).not.toHaveBeenCalled()
  })
  it('keeps catalog search, selection and loaded details while localizing dates', async () => {
    localStorage.setItem('branchline.locale.v1', 'en-US')
    vi.mocked(loadRepositoryDetails).mockResolvedValue({ ...snapshot, remoteBranches: [], remotes: [] } as unknown as RepositoryDetails)
    const openedAt = Date.UTC(2026, 10, 3, 12)
    function SwitchLocale() { const { setPreference } = useLocale(); return <button onClick={() => setPreference('zh-CN')}>switch-locale</button> }
    await renderLocalized(<LocaleProvider><SwitchLocale/><RepositoryManagerPage recent={[{ name: 'project', path: snapshot.path, branch: 'main', openedAt }]} favorites={[]} current={null} opening={false} theme="system" resolvedTheme="dark" rounded={false} onToggleRounded={vi.fn()} onToggleTheme={vi.fn()} onBack={vi.fn()} onOpen={vi.fn()} onRegister={vi.fn()} onToggleFavorite={vi.fn()} onForget={vi.fn()} onNotice={vi.fn()}/></LocaleProvider>, 'en-US')
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    fireEvent.change(screen.getByRole('textbox', { name: 'Search repositories' }), { target: { value: 'proj' } })
    const before = document.querySelector('time')
    expect(before?.textContent).toBe(new Intl.DateTimeFormat('en-US').format(openedAt))
    fireEvent.click(screen.getByText('switch-locale'))
    await screen.findByRole('textbox', { name: '搜索仓库' })
    expect((screen.getByRole('textbox', { name: '搜索仓库' }) as HTMLInputElement).value).toBe('proj')
    expect(document.querySelector('time')?.textContent).toBe(new Intl.DateTimeFormat('zh-CN').format(openedAt))
    expect(loadRepositoryDetails).toHaveBeenCalledTimes(1)
  })
  it('keeps structured auto-fast-forward failures translatable with original Git details', async () => {
    const completion = { snapshot: { ...snapshot, branches: ['main', 'develop'], branchTracking: { develop: { upstream: 'origin/develop', ahead: 0, behind: 1 } } } as RepositorySnapshot }
    vi.mocked(fastForwardRepositoryBranch).mockRejectedValue({ code: 'branch.cannotFastForward', params: { branch: 'develop' }, details: 'fatal: 原始 diagnostic' })
    function AutoForward() {
      const [notice, setNotice] = useState<MessageContent | null>(null)
      const { t } = useAppTranslation()
      useAutoFastForward({ repository: completion.snapshot, configuredBranches: ['develop'], fetchCompletion: completion, busy: false, onSnapshot: vi.fn(), onNotice: setNotice, onBranchPulling: vi.fn(), onRunningChange: vi.fn() })
      return <output>{renderMessage(notice, t)}</output>
    }
    const { i18n } = await renderLocalized(<AutoForward/>, 'en-US')
    await screen.findByText(/Automatic fast-forward of develop failed:/)
    expect(screen.getByText(/fatal: 原始 diagnostic/)).toBeTruthy()
    await act(() => i18n.changeLanguage('zh-CN'))
    expect(screen.getByText(/自动快进 develop 失败：/)).toBeTruthy()
    expect(screen.getByText(/fatal: 原始 diagnostic/)).toBeTruthy()
    expect(fastForwardRepositoryBranch).toHaveBeenCalledTimes(1)
  })
})
