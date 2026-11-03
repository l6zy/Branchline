// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from './index'
import { renderLocalized } from '../../test/renderLocalized'
import { RepositoryStartupScreen } from '../../features/repository/RepositoryStartupScreen'
import { AddRepositoryDialog } from '../../features/repository/AddRepositoryDialog'
import { RepositoryDetailsPanel } from '../../features/repository/RepositoryDetailsPanel'
import { RepositoryStructureTree } from '../../features/repository/RepositoryStructureTree'
import { CommandLogPanel } from '../../features/settings/CommandLogPanel'
import { LocaleProvider } from '../../i18n/LocaleProvider'
import type { RepositorySnapshot } from '../../repository'
import { clearCommandLogs, loadCommandLogs, loadRepositoryDetails } from '../../repository'

vi.mock('../../repository', async (original) => ({
  ...await original<typeof import('../../repository')>(),
  loadRepositoryDetails: vi.fn(), loadCommandLogs: vi.fn(), clearCommandLogs: vi.fn(),
}))

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})

afterEach(() => {
  cleanup()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

const path = 'E:/项目/with a very long repository path/project'
const repository = { name: 'project', path, branch: 'main', branches: ['main'], tags: [], files: [], worktrees: [{ path, branch: 'main' }, { path: 'E:/项目/feature', branch: 'feature' }], submodules: [], worktreeCount: 2, submoduleCount: 0 } as unknown as RepositorySnapshot

async function hoverForDelay(element: Element) {
  fireEvent.mouseEnter(element)
  await act(async () => { vi.advanceTimersByTime(299) })
  expect(screen.queryByRole('tooltip')).toBeNull()
  await act(async () => { vi.advanceTimersByTime(1) })
}

describe('repository and settings tooltips', () => {
  it('shows a complete repository path after the shared hover delay without native titles', async () => {
    const { container } = await renderLocalized(<TooltipProvider><RepositoryStartupScreen repository={{ name: 'project', path, branch: 'main', openedAt: 0 }}/></TooltipProvider>, 'en-US')
    expect(container.querySelector('[title]')).toBeNull()
    vi.useFakeTimers()
    await hoverForDelay(screen.getByText(path))
    expect(screen.getByRole('tooltip').textContent).toBe(path)
  })

  it('names the favorite icon independently and shows help immediately on keyboard focus', async () => {
    vi.mocked(loadRepositoryDetails).mockReturnValue(new Promise(() => {}))
    const onToggleFavorite = vi.fn()
    const { container, i18n } = await renderLocalized(<TooltipProvider><RepositoryDetailsPanel item={{ name: 'project', path, favorite: false, current: false }} opening={false} onOpen={vi.fn()} onVscode={vi.fn()} onToggleFavorite={onToggleFavorite}/></TooltipProvider>, 'en-US')
    const favorite = screen.getByRole('button', { name: 'Favorite repository' })
    vi.useFakeTimers()
    fireEvent.keyDown(document, { key: 'Tab' })
    await act(() => favorite.focus())
    expect(screen.getByRole('tooltip').textContent).toBe('Favorite repository')
    expect(onToggleFavorite).not.toHaveBeenCalled()
    await act(() => i18n.changeLanguage('zh-CN'))
    expect(screen.getByRole('tooltip').textContent).toBe('收藏仓库')
    expect(favorite.getAttribute('aria-label')).toBe('收藏仓库')
    expect(container.querySelector('[title]')).toBeNull()
  })

  it('keeps a loading repository refresh disabled while its explanation can be hovered', async () => {
    vi.mocked(loadRepositoryDetails).mockReturnValue(new Promise(() => {}))
    await renderLocalized(<TooltipProvider><RepositoryDetailsPanel item={{ name: 'project', path, favorite: false, current: false }} opening={false} onOpen={vi.fn()} onVscode={vi.fn()} onToggleFavorite={vi.fn()}/></TooltipProvider>, 'en-US')
    const refresh = screen.getByRole('button', { name: 'Refresh repository details' }) as HTMLButtonElement
    expect(refresh.disabled).toBe(true)
    vi.useFakeTimers()
    await hoverForDelay(refresh.parentElement!)
    expect(screen.getByRole('tooltip').textContent).toBe('Refresh repository details')
    fireEvent.click(refresh)
    expect(loadRepositoryDetails).toHaveBeenCalledTimes(1)
  })

  it('keeps tree selection and double-click navigation separate from help', async () => {
    localStorage.setItem('branchline.repositoryStructureTreeOpen.v2', JSON.stringify({ worktrees: true, submodules: false }))
    const onSelect = vi.fn()
    const onOpenPath = vi.fn()
    const { container } = await renderLocalized(<TooltipProvider><RepositoryStructureTree repository={repository} activePath={path} selection={{ kind: 'root' }} onSelect={onSelect} onOpenPath={onOpenPath}/></TooltipProvider>, 'en-US')
    const worktree = screen.getByRole('button', { name: 'feature' })
    vi.useFakeTimers()
    await hoverForDelay(worktree)
    expect(screen.getByRole('tooltip').textContent).toBe('View details; double-click to switch worktree')
    expect(onSelect).not.toHaveBeenCalled()
    expect(onOpenPath).not.toHaveBeenCalled()
    fireEvent.click(worktree)
    expect(onSelect).toHaveBeenCalledWith({ kind: 'worktree', path: 'E:/项目/feature' })
    fireEvent.doubleClick(worktree)
    expect(onOpenPath).toHaveBeenCalledWith('E:/项目/feature', 'worktree')
    expect(container.querySelector('[title]')).toBeNull()
  })

  it('shows disabled log help without clearing logs', async () => {
    localStorage.setItem('branchline.locale.v1', 'en-US')
    vi.mocked(loadCommandLogs).mockReturnValue(new Promise(() => {}))
    const onClose = vi.fn()
    const { container } = await renderLocalized(<LocaleProvider><TooltipProvider><CommandLogPanel open onClose={onClose}/></TooltipProvider></LocaleProvider>, 'en-US')
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
    const clear = screen.getByRole('button', { name: 'Clear logs' }) as HTMLButtonElement
    expect(clear.disabled).toBe(true)
    vi.useFakeTimers()
    await hoverForDelay(clear.parentElement!)
    expect(screen.getByRole('tooltip').textContent).toBe('Clear logs')
    fireEvent.click(clear)
    expect(clearCommandLogs).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(container.querySelector('[title]')).toBeNull()
  })

  it('dismisses dialog help before Escape can close the add-repository form', async () => {
    const onClose = vi.fn()
    await renderLocalized(<TooltipProvider><AddRepositoryDialog mode="clone" initialParent="E:/code" onClose={onClose} onCreated={vi.fn()}/></TooltipProvider>, 'en-US')
    vi.useFakeTimers()
    const close = screen.getByRole('button', { name: 'Close' })
    fireEvent.keyDown(document, { key: 'Tab' })
    await act(() => close.focus())
    expect(screen.getByRole('tooltip').textContent).toBe('Close')
    fireEvent.keyDown(close, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(document.activeElement).toBe(close)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(close, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
