import { describe, expect, it } from 'vitest'
import { createWorkingTreeCommit, WORKING_TREE_COMMIT_ID } from './workingTreeCommit'

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
})
