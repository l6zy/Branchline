// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { undo } from '@codemirror/commands'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderLocalized } from '../../test/renderLocalized'
import { ApplicationError, applyRepositoryStash, commitRepository, loadRepository, previewRepositoryRebase, stageRepositoryFiles, type RepositorySnapshot } from '../../repository'
import { createAppI18n } from '../../i18n'
import { message, renderMessage, type MessageContent } from '../../i18n/messages'
import { useAppTranslation } from '../../i18n/useAppTranslation'
import { useState } from 'react'
import { LocaleProvider } from '../../i18n/LocaleProvider'
import { LanguageSelect } from '../../components/LanguageSelect'
import { formatLocalDateTime } from '../../dateTime'
import { CreateBranchDialog } from '../branch/CreateBranchDialog'
import { CherryPickDialog } from './CherryPickDialog'
import { RebaseDialog } from './RebaseDialog'
import { OperationPanel } from './OperationPanel'
import { ConflictCodeEditor } from './ConflictCodeEditor'
import { StagingPage } from '../staging/StagingPage'
import { StashPage } from '../stash/StashPage'
import { MergeQueuePanel } from '../merge/MergeQueuePanel'

vi.mock('../../repository', async (original) => ({
  ...await original<typeof import('../../repository')>(),
  previewRepositoryRebase: vi.fn(async () => ({ branch: 'main', onto: 'abc', ontoShortHash: 'abc', steps: [] })),
  loadMergeQueue: vi.fn(async () => ({ currentBranch: 'main', candidates: [], conflicts: [] })),
  applyRepositoryStash: vi.fn(),
  commitRepository: vi.fn(),
  loadRepository: vi.fn(),
  stageRepositoryFiles: vi.fn(),
  loadRepositoryStagedFileDiff: vi.fn(async () => []),
  loadRepositoryUnstagedFileDiff: vi.fn(async () => []),
}))

const repository: RepositorySnapshot = {
  name: 'raw repository', path: '/repo', branch: 'main', ahead: 0, behind: 0, worktreeCount: 0, submoduleCount: 0,
  commits: [], files: [], worktrees: [], submodules: [], branches: ['main'], remoteBranches: [], branchTracking: {}, tags: [], stashes: [],
  commitTemplate: { path: '/template', content: 'User template 原文' },
}
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('workflow localization', () => {
  it('renders branch creation in English and switches validation without losing the name', async () => {
    const { i18n } = await renderLocalized(<CreateBranchDialog open currentBranch="main" onClose={vi.fn()} onCreate={vi.fn()}/>, 'en-US')
    expect(screen.getByRole('heading', { name: 'Create branch' })).toBeTruthy()
    expect(screen.getByText('main', { selector: 'strong' })).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'my branch' } })
    expect(screen.getByText('Branch names cannot contain spaces')).toBeTruthy()
    await act(() => i18n.changeLanguage('zh-CN'))
    expect(screen.getByText('分支名称不能包含空格')).toBeTruthy()
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('my branch')
  })

  it('preserves markup-like branch names as literal user data in descriptions', async () => {
    const rawBranch = 'feature<raw>&name'
    const { container } = await renderLocalized(<CreateBranchDialog open currentBranch={rawBranch} onClose={vi.fn()} onCreate={vi.fn()}/>, 'en-US')
    expect(screen.getByText(rawBranch, { selector: 'strong' })).toBeTruthy()
    expect(container.querySelector('raw')).toBeNull()
  })

  it('renders cherry-pick, rebase and merge queue controls in English', async () => {
    await renderLocalized(<><CherryPickDialog open commit={{ id: 'abc', title: 'Raw 提交', parents: [] }} currentBranch="main" onClose={vi.fn()} onConfirm={vi.fn()}/><RebaseDialog open repository={repository} onto="abc" targetLabel="feature" onClose={vi.fn()} onStart={vi.fn()}/><MergeQueuePanel repository={repository} onNotice={vi.fn()} onSwitchBranch={vi.fn()}/></>, 'en-US')
    expect(screen.getByRole('heading', { name: 'Cherry-pick commit' })).toBeTruthy()
    expect(screen.getByText('abc', { selector: 'strong' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Rebase main onto feature' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Merge into main' })).toBeTruthy()
    await waitFor(() => expect(screen.getByText('No other local branches')).toBeTruthy())
    expect(screen.getByText('Raw 提交')).toBeTruthy()
  })

  it('retranslates parent fallbacks and formats raw parent dates in an open cherry-pick dialog', async () => {
    const { i18n } = await renderLocalized(<CherryPickDialog open commit={{ id: 'abc', title: 'Raw title', parents: [
      { hash: 'parent1', title: message('history:app.details.parentUnavailable'), author: message('history:app.details.unknownAuthor'), time: '—' },
      { hash: 'parent2', title: 'Raw 父提交', author: 'Raw 作者', time: '2026-01-01' },
    ] }} currentBranch="main" onClose={vi.fn()} onConfirm={vi.fn()}/>, 'en-US')
    expect(screen.getByText('Raw 父提交').parentElement?.textContent).toContain(formatLocalDateTime('2026-01-01', true, 'en-US'))
    const fallback = screen.getByText(i18n.t('history:app.details.parentUnavailable'))
    await act(() => i18n.changeLanguage('zh-CN'))
    expect(fallback.textContent).toBe(i18n.t('history:app.details.parentUnavailable'))
    expect(screen.getByText('Raw 父提交').parentElement?.textContent).toContain(formatLocalDateTime('2026-01-01', true, 'zh-CN'))
    expect(screen.getByText('Raw 父提交').parentElement?.textContent).toContain('Raw 作者')
  })

  it('switches a pending stash confirmation and keeps the stash message draft', async () => {
    const { i18n } = await renderLocalized(<StashPage repository={{ ...repository, stashes: [{ reference: 'stash@{0}', hash: 'abc', message: 'Raw stash 内容', author: 'Me', time: '2026-01-01' }] }} onSelectStash={vi.fn()} onSnapshot={vi.fn()} onNotice={vi.fn()}/>, 'en-US')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep draft 原文' } })
    expect(screen.getByRole('button', { name: 'View in commit graph' }).textContent).toContain(formatLocalDateTime('2026-01-01', true, 'en-US'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('dialog').textContent).toContain('Delete stash@{0}?')
    await act(() => i18n.changeLanguage('zh-CN'))
    expect(screen.getByRole('dialog').textContent).toContain('确定删除 stash@{0}？')
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Keep draft 原文')
    expect(screen.getByRole('button', { name: '在提交图谱中查看' }).textContent).toContain(formatLocalDateTime('2026-01-01', true, 'zh-CN'))
  })

  it('switches staging labels while preserving commit and template drafts', async () => {
    const { i18n } = await renderLocalized(<StagingPage repository={repository} onSnapshot={vi.fn()} onNotice={vi.fn()} onOpenHistory={vi.fn()} onOpenLineHistory={vi.fn()}/>, 'en-US')
    fireEvent.change(screen.getByRole('textbox', { name: 'Full commit message' }), { target: { value: 'Commit draft 原文' } })
    fireEvent.click(screen.getByRole('button', { name: 'Edit template' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Full repository commit template' }), { target: { value: 'Template draft 原文' } })
    await act(() => i18n.changeLanguage('zh-CN'))
    expect((screen.getByRole('textbox', { name: '完整提交信息' }) as HTMLTextAreaElement).value).toBe('Commit draft 原文')
    expect((screen.getByRole('textbox', { name: '当前仓库完整提交模板' }) as HTMLTextAreaElement).value).toBe('Template draft 原文')
    expect(screen.getByText('工作区干净')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: '修订提交' })).toBeTruthy()
  })

  it('renders the operation empty state in English', async () => {
    await renderLocalized(<OperationPanel repository={repository} onSnapshot={vi.fn()} onNotice={vi.fn()} onReturnToChanges={vi.fn()}/>, 'en-US')
    expect(screen.getByText('No pending Git operation')).toBeTruthy()
  })

  it('switches conflict actions and search while preserving the editor, selection and undo', async () => {
    const text = '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> incoming'
    const blocks = [{ index: 0, offset: 0, currentEnd: 18, separatorStart: 18, separatorEnd: 26, incomingEnd: 33, endOffset: text.length }]
    const { i18n, container } = await renderLocalized(<ConflictCodeEditor value={text} filePath="raw.txt" blocks={blocks} activeBlock={0} onChange={vi.fn()} onResolveBlock={vi.fn()} onSave={vi.fn()} saveLabel="Save"/>, 'en-US')
    expect(screen.getByRole('button', { name: 'Accept current change' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Search current file' }))
    expect(screen.getByRole('textbox', { name: 'Search current conflict file' })).toBeTruthy()
    const editor = container.querySelector('.cm-editor') as HTMLElement
    const view = EditorView.findFromDOM(editor)!
    expect(view.state.phrase('Selection deleted')).toBe('Selection deleted')
    act(() => view.dispatch({ changes: { from: view.state.doc.length, insert: '\ndraft' }, selection: { anchor: 3 } }))
    await act(() => i18n.changeLanguage('zh-CN'))
    expect(screen.getByRole('button', { name: '采用当前更改' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: '搜索当前冲突文件' })).toBeTruthy()
    expect(view.state.phrase('Selection deleted')).toBe('已删除所选内容')
    expect(container.querySelector('.cm-editor')).toBe(editor)
    expect(view.state.selection.main.anchor).toBe(3)
    expect(view.state.doc.toString()).toBe(text + '\ndraft')
    act(() => { expect(undo(view)).toBe(true) })
    expect(view.state.doc.toString()).toBe(text)
  })

  it('uses singular and plural file and conflict counts', async () => {
    const i18n = await createAppI18n('en-US')
    expect(i18n.t('staging:filesStaged', { count: 0 })).toBe('Staged 0 files')
    expect(i18n.t('staging:filesStaged', { count: 1 })).toBe('Staged 1 file')
    expect(i18n.t('staging:filesStaged', { count: 2 })).toBe('Staged 2 files')
    expect(i18n.t('operations:panel.conflictCount', { count: 1 })).toBe('1 conflicted file')
    expect(i18n.t('operations:panel.conflictCount', { count: 2 })).toBe('2 conflicted files')
  })

  it('retranslates a rebase error and preserves nested Git diagnostics', async () => {
    vi.mocked(previewRepositoryRebase).mockRejectedValueOnce(new ApplicationError({ code: 'git.commandFailed', params: {}, details: 'fatal: 原始 Git stderr', causes: [{ code: 'native', params: {}, details: 'OS 原始诊断' }] }))
    const { i18n } = await renderLocalized(<RebaseDialog open repository={repository} onto="abc" targetLabel="feature" onClose={vi.fn()} onStart={vi.fn()}/>, 'en-US')
    await waitFor(() => expect(screen.getByText(/The Git command failed/)).toBeTruthy())
    await act(() => i18n.changeLanguage('zh-CN'))
    const error = screen.getByText(/fatal: 原始 Git stderr/)
    expect(error.textContent).toContain('OS 原始诊断')
    expect(error.textContent).not.toContain('The Git command failed')
  })

  it('stores a stash notice as a descriptor so a later language switch updates it', async () => {
    vi.mocked(applyRepositoryStash).mockResolvedValueOnce(repository)
    function StashWithNotice() {
      const [notice, setNotice] = useState<MessageContent | null>(null)
      const { t } = useAppTranslation()
      return <><StashPage repository={{ ...repository, stashes: [{ reference: 'stash@{0}', hash: 'abc', message: 'User 内容', author: 'Me', time: '2026-01-01' }] }} onSelectStash={vi.fn()} onSnapshot={vi.fn()} onNotice={setNotice}/><output>{renderMessage(notice, t)}</output></>
    }
    const { i18n } = await renderLocalized(<StashWithNotice/>, 'en-US')
    fireEvent.click(screen.getByRole('button', { name: 'Apply and keep' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Applied stash@{0}'))
    await act(() => i18n.changeLanguage('zh-CN'))
    expect(screen.getByRole('status').textContent).toBe('已应用 stash@{0}')
  })

  it('switches an in-flight commit label and retains the exact user message sent to Git', async () => {
    const stagedRepository = { ...repository, files: [{ path: 'User 文件.txt', type: 'M', add: 1, del: 0, staged: true }] }
    let finishCommit!: (value: RepositorySnapshot) => void
    vi.mocked(commitRepository).mockReturnValueOnce(new Promise((resolve) => { finishCommit = resolve }))
    function StagingWithNotice() {
      const [notice, setNotice] = useState<MessageContent | null>(null)
      const [operation, setOperation] = useState<MessageContent | null>(null)
      const { t } = useAppTranslation()
      return <><StagingPage repository={stagedRepository} onSnapshot={vi.fn()} onNotice={setNotice} onOperationChange={setOperation} onOpenHistory={vi.fn()} onOpenLineHistory={vi.fn()}/><output aria-label="notice">{renderMessage(notice, t)}</output><output aria-label="active operation">{renderMessage(operation, t)}</output></>
    }
    localStorage.setItem('branchline.locale.v1', 'en-US')
    await renderLocalized(<LocaleProvider><LanguageSelect/><StagingWithNotice/></LocaleProvider>, 'en-US')
    expect(screen.getByText('Modified', { selector: '.stage-file-status' }).textContent).toBe('Modified')
    fireEvent.change(screen.getByRole('textbox', { name: 'Full commit message' }), { target: { value: 'Exact commit message 原文\n\nBody' } })
    fireEvent.click(screen.getByRole('button', { name: /Commit 1 file/ }))
    expect(screen.getByLabelText('active operation').textContent).toBe('Creating commit…')
    fireEvent.click(screen.getByRole('button', { name: 'Interface language' }))
    fireEvent.click(screen.getByRole('option', { name: '简体中文' }))
    await waitFor(() => expect(screen.getByLabelText('active operation').textContent).toBe('正在创建提交…'))
    expect((screen.getByRole('textbox', { name: '完整提交信息' }) as HTMLTextAreaElement).value).toBe('Exact commit message 原文\n\nBody')
    expect(commitRepository).toHaveBeenLastCalledWith('/repo', 'Exact commit message 原文\n\nBody', false, false)
    await act(async () => finishCommit(repository))
    expect(screen.getByLabelText('notice').textContent).toBe('提交完成，工作区已刷新')
    fireEvent.click(screen.getByRole('button', { name: '界面语言' }))
    fireEvent.click(screen.getByRole('option', { name: 'English' }))
    expect(screen.getByLabelText('notice').textContent).toBe('Commit created and working tree refreshed')
  })

  it('preserves refresh diagnostics when force staging succeeds but repository refresh fails', async () => {
    const conflictRepository = { ...repository, files: [{ path: 'Conflict 原文.txt', type: 'U', add: 1, del: 0 }], operation: { kind: 'conflict' as const, currentStep: 0, totalSteps: 0, conflicts: ['Conflict 原文.txt'], steps: [] } }
    vi.mocked(stageRepositoryFiles).mockResolvedValueOnce([])
    vi.mocked(loadRepository).mockRejectedValueOnce(new ApplicationError({ code: 'git.commandFailed', params: {}, details: 'fatal: refresh 原始信息' }))
    function StagingWithNotice() {
      const [notice, setNotice] = useState<MessageContent | null>(null)
      const { t } = useAppTranslation()
      return <><StagingPage repository={conflictRepository} onSnapshot={vi.fn()} onNotice={setNotice} onOpenHistory={vi.fn()} onOpenLineHistory={vi.fn()}/><output>{renderMessage(notice, t)}</output></>
    }
    const { i18n } = await renderLocalized(<StagingWithNotice/>, 'en-US')
    expect(screen.getByText('Conflict', { selector: '.stage-file-status' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Force stage conflicted file' }))
    fireEvent.click(screen.getByRole('button', { name: 'Force stage' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('fatal: refresh 原始信息'))
    expect(screen.getByRole('status').textContent).toContain('Force staged 1 conflicted file')
    await act(() => i18n.changeLanguage('zh-CN'))
    expect(screen.getByRole('status').textContent).toContain('fatal: refresh 原始信息')
    expect(screen.getByRole('status').textContent).toContain('已强制暂存 1 个冲突文件')
  })
})
