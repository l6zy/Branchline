import { describe, expect, it } from 'vitest'
import type { RepositorySnapshot } from '../../repository'
import * as workingTree from './workingTreeCommit'

const { createWorkingTreeCommit, WORKING_TREE_COMMIT_ID } = workingTree

describe('working tree history commit', () => {
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
})
