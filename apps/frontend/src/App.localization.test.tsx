// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LocaleProvider } from './i18n/LocaleProvider'
import { renderLocalized } from './test/renderLocalized'
import App from './App'

vi.mock('./features/repository/useRepositoryWorkspace', () => ({ useRepositoryWorkspace: () => ({
  repository: { path: 'C:/repo', name: 'Project 原名', branch: 'feature/原名', commits: [], files: [], branches: [], remoteBranches: [], branchTracking: {}, worktrees: [], submodules: [], tags: [], stashes: [], ahead: 0, behind: 0, submoduleCount: 0 },
  structureRepository: null, parentRepository: null, recentRepositories: [], favoriteRepositories: [],
  openingRepository: false, restoringRepository: false, fetching: false, repositoryNotice: null,
  applySnapshot: vi.fn(), setRepositoryNotice: vi.fn(), autoFetchEnabled: false,
}) }))
afterEach(() => { cleanup(); localStorage.clear() })

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
