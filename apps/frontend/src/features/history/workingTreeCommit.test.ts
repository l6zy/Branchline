import { createAppI18n } from '../../i18n'
import type { RepositoryFile, RepositoryOperationState } from '../../repository'
import { describe, expect, it } from 'vitest'
import type { RepositorySnapshot } from '../../repository'
import * as workingTree from './workingTreeCommit'

const { WORKING_TREE_COMMIT_ID } = workingTree
const translator = (await createAppI18n('zh-CN')).t
const createWorkingTreeCommit = (files: RepositoryFile[], head?: string, operation?: RepositoryOperationState) => workingTree.createWorkingTreeCommit(files, head, operation, translator)

describe('working tree history commit', () => {
  it('localizes synthetic node descriptions and plural file counts without changing identity', async () => {
    const en = await createAppI18n('en-US')
    const commit = workingTree.createWorkingTreeCommit([{ path: '中文.txt', type: 'M', add: 1, del: 0 }], 'raw-head', undefined, en.t)
    expect(commit).toMatchObject({ id: WORKING_TREE_COMMIT_ID, parent: 'raw-head', title: 'Uncommitted changes', author: 'Working tree', message: 'The working tree has 1 uncommitted file. These changes are not yet in Git history.' })
  })

  it('formats large synthetic file counts through Intl', async () => {
    const en = await createAppI18n('en-US')
    const files = Array.from({ length: 1000 }, (_, index) => ({ path: `${index}.txt`, type: 'M', add: 1, del: 0 }))
    expect(workingTree.createWorkingTreeCommit(files, 'raw-head', undefined, en.t)?.message).toBe('The working tree has 1,000 uncommitted files. These changes are not yet in Git history.')
  })
  it('does not create a history node for a clean working tree', () => {
    expect(createWorkingTreeCommit([], 'abc1234')).toBeNull()
  })

  it('creates a read-only node before HEAD with aggregated file stats', () => {
    const commit = createWorkingTreeCommit([
      { path: 'src/app.ts', type: 'M', add: 7, del: 2, unstaged: true },
      { path: 'README.md', type: 'A', add: 3, del: 0, staged: true },
    ], 'abcdef0123456789')

    expect(commit).toMatchObject({
      id: WORKING_TREE_COMMIT_ID,
      status: 'working',
      parent: 'abcdef0123456789',
      title: '未提交的修改',
      files: 2,
      additions: 10,
      deletions: 2,
    })
  })

  it('creates an operation node when Git has no file changes yet', () => {
    const commit = createWorkingTreeCommit([], 'abcdef0123456789', {
      kind: 'cherry-pick',
      currentStep: 1,
      totalSteps: 1,
      conflicts: [],
      steps: [],
    })

    expect(commit).toMatchObject({
      id: WORKING_TREE_COMMIT_ID,
      status: 'working',
      title: 'Cherry-pick 进行中：待处理',
      author: 'Git 操作',
      files: 0,
    })
  })

  it('uses the current worktree HEAD when another branch commit sorts first', () => {
    const repository = {
      path: 'E:\\repo',
      branch: 'main',
      commits: [
        { id: 'feature', fullHash: 'feature-head' },
        { id: 'main', fullHash: 'main-head' },
      ],
      worktrees: [
        { path: 'E:\\repo', branch: 'main', head: 'main-head', bare: false },
        { path: 'E:\\feature', branch: 'feature', head: 'feature-head', bare: false },
      ],
    } as Pick<RepositorySnapshot, 'path' | 'branch' | 'commits' | 'worktrees'>
    const resolveWorkingTreeParent = (workingTree as typeof workingTree & {
      resolveWorkingTreeParent?: (snapshot: typeof repository) => string | undefined
    }).resolveWorkingTreeParent

    const commit = createWorkingTreeCommit([
      { path: 'src/app.ts', type: 'M', add: 1, del: 0, unstaged: true },
    ], resolveWorkingTreeParent?.(repository))

    expect(commit?.parent).toBe('main-head')
  })

  it('uses a detached worktree HEAD as the working-tree parent', () => {
    const repository = {
      path: 'E:\\repo\\module',
      branch: 'Detached @ deadbee',
      commits: [{ id: 'head', fullHash: 'deadbeef' }],
      worktrees: [{ path: 'E:\\repo\\module', branch: undefined, head: 'deadbeef', bare: false }],
    } as Pick<RepositorySnapshot, 'path' | 'branch' | 'commits' | 'worktrees'>
    expect(workingTree.resolveWorkingTreeParent(repository)).toBe('deadbeef')
  })
})
