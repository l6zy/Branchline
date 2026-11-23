export type CommitIdentity = {
  id: string
  fullHash?: string
  status?: string
}

function historyCommitIdentity(commit: CommitIdentity) {
  return commit.fullHash ?? commit.id
}

export function findNewHistoryCommitIds(previous: readonly CommitIdentity[] | null, next: readonly CommitIdentity[]) {
  if (!previous) return new Set<string>()
  const previousIds = new Set(
    previous
      .filter((commit) => commit.status !== 'working')
      .map(historyCommitIdentity),
  )
  return new Set(
    next
      .filter((commit) => commit.status !== 'working')
      .map(historyCommitIdentity)
      .filter((id) => !previousIds.has(id)),
  )
}

export function shouldKeepHistoryAtTop(wasAtTop: boolean, newCommitCount: number) {
  return wasAtTop && newCommitCount > 0
}

export type CommitViewportAnchor = {
  commitId: string
  offset: number
}

export function captureCommitAnchor(commits: readonly CommitIdentity[], scrollTop: number, rowHeight: number): CommitViewportAnchor | null {
  if (!commits.length || rowHeight <= 0) return null
  const index = Math.min(commits.length - 1, Math.max(0, Math.floor(Math.max(0, scrollTop) / rowHeight)))
  return {
    commitId: historyCommitIdentity(commits[index]),
    offset: Math.max(0, scrollTop - index * rowHeight),
  }
}

export function restoreCommitAnchor(commits: readonly CommitIdentity[], anchor: CommitViewportAnchor | null, rowHeight: number, fallback: number): number {
  if (!anchor || rowHeight <= 0) return Math.max(0, fallback)
  const index = commits.findIndex((commit) => historyCommitIdentity(commit) === anchor.commitId)
  return index < 0 ? Math.max(0, fallback) : Math.max(0, index * rowHeight + anchor.offset)
}

export function resolveCommitSelection(previous: readonly CommitIdentity[], next: readonly CommitIdentity[], selected: string): string {
  if (!next.length) return ''
  const nextIds = new Set(next.map((commit) => commit.id))
  if (nextIds.has(selected)) return selected

  const previousIndex = previous.findIndex((commit) => commit.id === selected)
  if (previousIndex >= 0) {
    for (let distance = 1; distance < previous.length; distance += 1) {
      const before = previous[previousIndex - distance]
      if (before && nextIds.has(before.id)) return before.id
      const after = previous[previousIndex + distance]
      if (after && nextIds.has(after.id)) return after.id
    }
  }

  return next[0].id
}

export function resolveCommitSelectionAfterRefresh(
  previous: readonly CommitIdentity[],
  next: readonly CommitIdentity[],
  selected: string,
  selectedWorkingTree: boolean,
  keepWorkingTree: boolean,
  preferred: string | null,
) {
  if (selectedWorkingTree) {
    if (keepWorkingTree) return selected
    if (preferred && next.some((commit) => commit.id === preferred)) return preferred
  }
  return resolveCommitSelection(previous, next, selected)
}
