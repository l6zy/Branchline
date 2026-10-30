import type { RepositorySnapshot } from '../../repository'

type FastForwardRepository = Pick<RepositorySnapshot, 'branch' | 'branches' | 'branchTracking'> & {
  worktrees: { branch?: string }[]
}

export function getAutoFastForwardBranches(repository: FastForwardRepository, configuredBranches: readonly string[]) {
  return [...new Set(configuredBranches)].filter((branch) => {
    const tracking = repository.branchTracking[branch]
    return branch !== repository.branch
      && repository.branches.includes(branch)
      && Boolean(tracking?.upstream)
      && tracking.ahead === 0
      && tracking.behind > 0
      && !repository.worktrees.some((worktree) => worktree.branch === branch)
  })
}

export type AutoPullBranchSettings = Record<string, string[]>

export function isAutoPullBranchSettings(value: unknown): value is AutoPullBranchSettings {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((branches) => Array.isArray(branches) && branches.every((branch) => typeof branch === 'string'))
}

export function toggleAutoPullBranch(settings: AutoPullBranchSettings, repositoryPath: string, branch: string) {
  const current = settings[repositoryPath] ?? []
  const branches = current.includes(branch)
    ? current.filter((item) => item !== branch)
    : [...current, branch].sort((left, right) => left.localeCompare(right))
  const next = { ...settings }
  if (branches.length) next[repositoryPath] = branches
  else delete next[repositoryPath]
  return next
}
