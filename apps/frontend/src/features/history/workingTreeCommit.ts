import type { RepositoryFile, RepositoryOperationState, RepositorySnapshot } from '../../repository'

export const WORKING_TREE_COMMIT_ID = '__branchline_working_tree__'

export type WorkingTreeCommit = {
  id: string
  lane: number
  color: string
  title: string
  message: string
  author: string
  avatar: string
  time: string
  status: 'working'
  parent?: string
  files: number
  additions: number
  deletions: number
}

type WorkingTreeRepository = Pick<RepositorySnapshot, 'path' | 'branch' | 'commits' | 'worktrees'>

function comparablePath(path: string) {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase()
}

export function resolveWorkingTreeParent(repository: WorkingTreeRepository) {
  const currentWorktree = repository.worktrees.find((worktree) => worktree.branch === repository.branch)
    ?? repository.worktrees.find((worktree) => comparablePath(worktree.path) === comparablePath(repository.path))
  return currentWorktree?.head
    ?? repository.commits.find((commit) => commit.branches?.includes(repository.branch))?.fullHash
}

export function createWorkingTreeCommit(files: RepositoryFile[], headHash?: string, operation?: RepositoryOperationState): WorkingTreeCommit | null {
  if (!files.length && !operation) return null
  const title = operation
    ? `${operation.label}：${operation.conflicts.length ? '冲突待处理' : '待处理'}`
    : '未提交的修改'
  const author = operation ? 'Git 操作' : '工作区'
  return {
    id: WORKING_TREE_COMMIT_ID,
    lane: 0,
    color: '#faad14',
    title,
    message: operation
      ? `${operation.label}仍在进行中，请在操作面板中继续、跳过或中止。`
      : `当前工作区有 ${files.length} 个未提交文件，这些修改尚未写入 Git 历史。`,
    author,
    avatar: operation ? 'OP' : 'WT',
    time: new Date().toISOString(),
    status: 'working',
    parent: headHash,
    files: files.length,
    additions: files.reduce((total, file) => total + file.add, 0),
    deletions: files.reduce((total, file) => total + file.del, 0),
  }
}
