// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { renderLocalized } from '../../test/renderLocalized'
import { StagingPage } from '../../features/staging/StagingPage'
import { StashPage } from '../../features/stash/StashPage'
import { loadRepositoryStagedFileDiff, stageRepositoryFiles, type RepositorySnapshot } from '../../repository'

vi.mock('../../repository', async (original) => ({
  ...await original<typeof import('../../repository')>(),
  loadRepositoryStagedFileDiff: vi.fn(async () => []),
  loadRepositoryUnstagedFileDiff: vi.fn(async () => []),
  stageRepositoryFiles: vi.fn(),
}))
const repository: RepositorySnapshot = {
  name: 'project', path: '/repo', branch: 'main', ahead: 0, behind: 0, worktreeCount: 0, submoduleCount: 0,
  commits: [], files: [], worktrees: [], submodules: [], branches: ['main'], remoteBranches: [], branchTracking: {}, tags: [], stashes: [],
}
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); vi.unstubAllGlobals(); localStorage.clear() })
async function hover(element: Element) {
  fireEvent.mouseEnter(element)
  fireEvent.mouseMove(element)
  await act(async () => { vi.advanceTimersByTime(300) })
}

it('explains a disabled template button without staging anything', async () => {
  const { container, i18n } = await renderLocalized(<StagingPage repository={repository} onSnapshot={vi.fn()} onNotice={vi.fn()} onOpenHistory={vi.fn()} onOpenLineHistory={vi.fn()}/>, 'en-US')
  const button = screen.getByRole('button', { name: 'Reapply template' }) as HTMLButtonElement
  expect(button.disabled).toBe(true)
  expect(container.querySelector('[title]')).toBeNull()
  vi.useFakeTimers()
  await hover(button.parentElement!)
  expect(screen.getByRole('tooltip').textContent).toBe('Reapply template')
  fireEvent.click(button)
  expect(stageRepositoryFiles).not.toHaveBeenCalled()
  await act(() => i18n.changeLanguage('zh-CN'))
  await hover(button.parentElement!)
  expect(screen.getByRole('tooltip').textContent).toBe(i18n.t('staging:reapplyTemplate'))
})

it('shows the full nested staging path without loading or modifying a file', async () => {
  const path = 'very/long/目录/source.ts'
  const files = [{ path, type: 'M', staged: true, add: 1234, del: 2345 }]
  const { container } = await renderLocalized(<StagingPage repository={{ ...repository, files }} onSnapshot={vi.fn()} onNotice={vi.fn()} onOpenHistory={vi.fn()} onOpenLineHistory={vi.fn()}/>, 'en-US')
  await act(async () => {})
  vi.mocked(loadRepositoryStagedFileDiff).mockClear()
  vi.useFakeTimers()
  await hover(container.querySelector('.stage-file-path')!)
  expect(screen.getByRole('tooltip').textContent).toBe(path)
  expect(screen.getAllByText('+1,234').length).toBeGreaterThan(0)
  expect(screen.getAllByText('-2,345').length).toBeGreaterThan(0)
  expect(loadRepositoryStagedFileDiff).not.toHaveBeenCalled()
  expect(stageRepositoryFiles).not.toHaveBeenCalled()
})

it('retranslates stash hints while preserving the action callback', async () => {
  const onSelectStash = vi.fn()
  const { container, i18n } = await renderLocalized(<StashPage repository={{ ...repository, stashes: [{ reference: 'stash@{0}', hash: 'abc', message: 'Raw stash 内容', author: 'Me', time: '2026-01-01' }] }} onSelectStash={onSelectStash} onSnapshot={vi.fn()} onNotice={vi.fn()}/>, 'en-US')
  const button = screen.getByRole('button', { name: 'View in commit graph' })
  expect(container.querySelector('[title]')).toBeNull()
  vi.useFakeTimers()
  await hover(button)
  expect(screen.getByRole('tooltip').textContent).toBe('View in commit graph')
  await act(() => i18n.changeLanguage('zh-CN'))
  expect(screen.getByRole('tooltip').textContent).toBe('在提交图谱中查看')
  fireEvent.click(button)
  expect(onSelectStash).toHaveBeenCalledExactlyOnceWith('stash@{0}')
  expect(screen.queryByRole('tooltip')).toBeNull()
})
