export type RepositoryCommit = {
  id: string
  fullHash: string
  parent?: string
  parents?: string[]
  lane: number
  color: string
  title: string
  message?: string
  author: string
  email: string
  committer?: string
  committerEmail?: string
  authorTime?: string
  commitTime?: string
  avatar: string
  time: string
  branches?: string[]
  status?: 'ahead' | 'merge' | 'local' | 'stash'
  files: number
  additions: number
  deletions: number
}

export type RepositoryCommitStats = {
  hash: string
  files: number
  additions: number
  deletions: number
}

export type GitUserConfig = {
  userName: string
  userEmail: string
  defaultBranch: string
  autocrlf: 'true' | 'input' | 'false'
  pullStrategy: 'merge' | 'rebase' | 'ff-only'
}

export type RepositoryFile = {
  path: string
  type: string
  add: number
  del: number
  staged?: boolean
  unstaged?: boolean
  incoming?: boolean
}

export type RepositoryOperationStep = {
  hash: string
  shortHash: string
  title: string
  author: string
  status: 'applied' | 'current' | 'pending'
}

export type RepositoryOperationState = {
  kind: 'merge' | 'rebase' | 'cherry-pick' | 'conflict'
  label: string
  originalBranch?: string
  onto?: string
  currentStep: number
  totalSteps: number
  currentCommit?: string
  message?: string
  conflicts: string[]
  steps: RepositoryOperationStep[]
}

export type ConflictFileContent = {
  path: string
  base: string | null
  current: string | null
  incoming: string | null
  result: string
  currentLabel: string
  incomingLabel: string
  binary: boolean
  gitlink: boolean
}

export type RebasePreview = {
  branch: string
  onto: string
  ontoShortHash: string
  mergeBase: string
  steps: RepositoryOperationStep[]
}

export type RepositoryDiffLine = {
  old: number | null
  next: number | null
  kind: 'same' | 'add' | 'del'
  code: string
}

export type FileHistoryEntry = {
  hash: string
  shortHash: string
  parents: string[]
  author: string
  email: string
  committer: string
  committerEmail: string
  time: string
  commitTime: string
  title: string
  message: string
}

export type BlameLine = {
  line: number
  originalLine: number
  hash: string
  shortHash: string
  author: string
  email: string
  time: string
  content: string
}

export type RepositoryWorktree = {
  path: string
  branch?: string
  head?: string
  bare: boolean
  locked?: string
  prunable?: string
}

export type RepositorySubmodule = {
  path: string
  hash: string
  status: 'ok' | 'modified' | 'uninitialized' | 'missing' | 'unknown'
  branch?: string
}

export type RepositoryBranchTracking = {
  upstream?: string
  ahead: number
  behind: number
}

export type RepositorySnapshot = {
  name: string
  path: string
  branch: string
  remote?: string
  ahead: number
  behind: number
  worktreeCount: number
  submoduleCount: number
  commits: RepositoryCommit[]
  files: RepositoryFile[]
  worktrees: RepositoryWorktree[]
  submodules: RepositorySubmodule[]
  branches: string[]
  remoteBranches: string[]
  branchTracking: Record<string, RepositoryBranchTracking>
  tags: string[]
  stashes: RepositoryStash[]
  commitTemplate?: RepositoryCommitTemplate
  operation?: RepositoryOperationState
}

export type RepositoryCommitTemplate = {
  path: string
  content: string
}

export type RepositoryStash = {
  reference: string
  message: string
  author: string
  time: string
}

export type RepositoryComparison = {
  base: string
  target: string
  ahead: number
  behind: number
  files: RepositoryFile[]
}

export type MergeCandidate = {
  branch: string
  ahead: number
  behind: number
  merged: boolean
}

export type MergeQueueSnapshot = {
  currentBranch: string
  conflicts: string[]
  candidates: MergeCandidate[]
}
