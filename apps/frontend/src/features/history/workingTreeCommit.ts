import { operationLabel } from '../../i18n/operationLabels'
import type { AppTranslator } from '../../i18n/useAppTranslation'
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

export function createWorkingTreeCommit(files: RepositoryFile[], headHash: string | undefined, operation: RepositoryOperationState | undefined, t: AppTranslator): WorkingTreeCommit | null {
  if (!files.length && !operation) return null
  const title = operation
    ? t('history:workingTree.operationTitle', { operation: operationLabel(operation.kind, t), status: operation.conflicts.length ? t('history:workingTree.conflicts') : t('history:workingTree.pending') })
    : t('history:workingTree.title')
  const author = operation ? t('history:workingTree.operationAuthor') : t('history:workingTree.author')
  return {
    id: WORKING_TREE_COMMIT_ID,
    lane: 0,
    color: '#faad14',
    title,
    message: operation
      ? t('history:workingTree.operationDescription', { operation: operationLabel(operation.kind, t) })
      : t('history:workingTree.description', { count: files.length }),
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
