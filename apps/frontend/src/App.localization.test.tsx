// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LocaleProvider } from './i18n/LocaleProvider'
import { renderLocalized } from './test/renderLocalized'
import App from './App'

vi.mock('./features/repository/useRepositoryWorkspace', () => ({ useRepositoryWorkspace: () => ({
  repository: { path: 'C:/repo', name: 'Project 原名', branch: 'feature/原名', commits: [], files: [], branches: ['main', 'feature/search', 'bugfix/parser'], remoteBranches: [], branchTracking: {}, worktrees: [], submodules: [], tags: [], stashes: [], ahead: 0, behind: 0, submoduleCount: 0 },
  structureRepository: null, parentRepository: null, recentRepositories: [], favoriteRepositories: [],
  openingRepository: false, restoringRepository: false, fetching: false, repositoryNotice: null,
  applySnapshot: vi.fn(), setRepositoryNotice: vi.fn(), autoFetchEnabled: false,
}) }))
afterEach(() => { cleanup(); localStorage.clear() })

it('places repository switching and the single manager entry in the titlebar', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  await renderLocalized(<LocaleProvider><App/></LocaleProvider>, 'en-US')
  const titlebar = document.querySelector('.app-titlebar')
  expect(titlebar?.querySelector('.repo-switcher')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: 'Repository manager' })).toHaveLength(1)
  expect(screen.queryByRole('button', { name: 'Repositories' })).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Repository manager' }))
  expect(screen.getByRole('region', { name: 'Repository manager' })).toBeTruthy()
  expect(titlebar?.querySelector('.repo-switcher')).toBeNull()
})

it('keeps the sidebar toggle in the shared toolbar in both states', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  await renderLocalized(<LocaleProvider><App/></LocaleProvider>, 'en-US')

  const appShell = document.querySelector('.app-shell')
  const sidebar = document.querySelector('.sidebar-shell')
  const topbar = document.querySelector('.topbar')
  expect(topbar?.parentElement).toBe(appShell)
  expect(document.querySelector('.sidebar-topbar')).toBeNull()

  const collapse = screen.getByRole('button', { name: 'Collapse left panel' })
  expect(collapse.closest('.topbar')).toBe(topbar)

  fireEvent.click(collapse)
  expect(sidebar?.classList.contains('collapsed')).toBe(true)
  const expand = screen.getByRole('button', { name: 'Expand left panel' })
  expect(expand.closest('.topbar')).toBe(topbar)

  fireEvent.click(expand)
  expect(sidebar?.classList.contains('collapsed')).toBe(false)
  expect(screen.getByRole('button', { name: 'Collapse left panel' }).closest('.topbar')).toBe(topbar)
})

it('keeps workspace navigation in the content tabs and avoids duplicate status entries', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  await renderLocalized(<LocaleProvider><App/></LocaleProvider>, 'en-US')

  expect(document.querySelector('.sidebar .quick-nav')).toBeNull()
  expect(screen.getAllByRole('button', { name: 'Command log' })).toHaveLength(1)
  expect(document.querySelector('.branch-context strong')).toBeNull()
})

it('groups low-frequency global actions under the topbar overflow menu', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  await renderLocalized(<LocaleProvider><App/></LocaleProvider>, 'en-US')

  expect(screen.getByRole('button', { name: 'More options' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'View keyboard shortcuts' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'View notifications' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'More options' }))
  expect(screen.getByRole('button', { name: 'View keyboard shortcuts' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Switch dark / light theme' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'View notifications' })).toBeTruthy()
})

it('filters branch names in the repository sidebar', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  await renderLocalized(<LocaleProvider><App/></LocaleProvider>, 'en-US')

  const filter = document.querySelector<HTMLInputElement>('.branch-filter input')
  expect(filter).not.toBeNull()
  fireEvent.change(filter!, { target: { value: 'search' } })

  const localBranches = Array.from(document.querySelectorAll('.branch-tree .tree-row:not(.group)')).map((row) => row.textContent)
  expect(localBranches.some((name) => name?.includes('search'))).toBe(true)
  expect(localBranches.some((name) => name?.includes('main'))).toBe(false)
  expect(Array.from(document.querySelectorAll('.branch-tree .tree-row.group')).some((row) => row.textContent?.includes('feature'))).toBe(true)
})

it('exposes the sidebar splitter as a keyboard-operable separator', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  await renderLocalized(<LocaleProvider><App/></LocaleProvider>, 'en-US')

  const separator = document.querySelector<HTMLElement>('.sidebar-resizer')
  const hiddenInspectorSeparator = document.querySelector<HTMLElement>('.inspector-resizer')
  expect(separator?.tabIndex).toBe(0)
  expect(separator?.getAttribute('aria-orientation')).toBe('vertical')
  expect(separator?.getAttribute('aria-valuemin')).toBe('200')
  expect(separator?.getAttribute('aria-valuemax')).toBe('360')
  const initialWidth = Number(separator?.getAttribute('aria-valuenow'))
  fireEvent.keyDown(separator!, { key: 'ArrowRight' })
  expect(Number(separator?.getAttribute('aria-valuenow'))).toBe(initialWidth + 12)
  expect(hiddenInspectorSeparator?.tabIndex).toBe(-1)
  expect(hiddenInspectorSeparator?.getAttribute('aria-hidden')).toBe('true')
})

it('switches the application shell while preserving repository identity and search', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  localStorage.setItem('branchline.locale.v1', 'zh-CN')
  await renderLocalized(<LocaleProvider><App/></LocaleProvider>)
  const search = screen.getByPlaceholderText('搜索提交信息、Hash 或提交人…') as HTMLInputElement
  fireEvent.change(search, { target: { value: 'raw query 原文' } })
  fireEvent.click(screen.getByRole('button', { name: '界面语言' }))
  await act(async () => { fireEvent.click(screen.getByRole('option', { name: 'English' })) })
  expect(screen.getByRole('button', { name: 'Minimize' })).toBeTruthy()
  expect(screen.getByPlaceholderText('Search messages, hashes or committers…')).toBe(search)
  expect(search.value).toBe('raw query 原文')
  expect(screen.getAllByText('feature/原名').length).toBeGreaterThan(0)
  expect(screen.getAllByText('Commit graph').length).toBeGreaterThan(0)
  for (const name of ['Fetch', 'Pull', 'Push', 'Undo last commit']) {
    expect(screen.getByRole('button', { name }).getAttribute('aria-label')).toBe(name)
  }
})
