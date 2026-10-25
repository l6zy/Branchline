export type BranchHistoryCommit = {
  id: string
  fullHash?: string
  parents?: string[]
  parent?: string
  branches?: string[]
  author: string
  committer?: string
  status?: string
}

export function committerName(commit: Pick<BranchHistoryCommit, 'author' | 'committer'>) {
  return commit.committer ?? commit.author
}

export function committerInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length > 1) return words.slice(0, 2).map((word) => Array.from(word)[0]).join('').toLocaleUpperCase()
  return Array.from(words[0] ?? '').slice(0, 2).join('').toLocaleUpperCase()
}

export function matchesCommitterFilter(commit: Pick<BranchHistoryCommit, 'author' | 'committer'>, selectedCommitters: string[]) {
  return selectedCommitters.length === 0 || selectedCommitters.includes(committerName(commit))
}

function indexCommitReferences(commits: BranchHistoryCommit[]) {
  const byReference = new Map<string, BranchHistoryCommit>()
  commits.forEach((commit) => {
    byReference.set(commit.id, commit)
    if (!commit.fullHash) return
    byReference.set(commit.fullHash, commit)
    for (let length = 7; length < commit.fullHash.length; length += 1) {
      const prefix = commit.fullHash.slice(0, length)
      if (!byReference.has(prefix)) byReference.set(prefix, commit)
    }
  })
  return byReference
}

export function reachableHistoryCommitIds(commits: BranchHistoryCommit[], selectedBranches: string[]) {
  if (selectedBranches.length === 0) return null
  const byReference = indexCommitReferences(commits)
  const tips = commits.filter((commit) => commit.branches?.some((branch) => selectedBranches.includes(branch)))
  const reachable = new Set<string>()
  const stack = [...tips]
  while (stack.length) {
    const commit = stack.pop()!
    if (reachable.has(commit.id)) continue
    reachable.add(commit.id)
    ;(commit.parents ?? (commit.parent ? [commit.parent] : [])).forEach((parent) => {
      const parentCommit = byReference.get(parent)
      if (parentCommit) stack.push(parentCommit)
    })
  }
  return reachable
}

export function unloadedHistoryBranches(commits: BranchHistoryCommit[], selectedBranches: string[]) {
  return selectedBranches.filter((branch) => !commits.some((commit) => commit.branches?.includes(branch)))
}

export function isHistoryCommitVisibleOnSelectedBranches(
  commit: Pick<BranchHistoryCommit, 'id' | 'status'>,
  selectedBranches: string[],
  currentBranch: string,
  reachableCommitIds: Set<string> | null,
) {
  if (selectedBranches.length === 0) return true
  if (commit.status === 'working') return selectedBranches.includes(currentBranch)
  return Boolean(reachableCommitIds?.has(commit.id))
}

export function toggleFilterValue(values: string[], value: string) {
  const unique = Array.from(new Set(values))
  return unique.includes(value) ? unique.filter((item) => item !== value) : [...unique, value]
}
