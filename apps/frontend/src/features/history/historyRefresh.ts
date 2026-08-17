export type CommitIdentity = { id: string }

export type CommitViewportAnchor = {
  commitId: string
  offset: number
}

export function captureCommitAnchor(commits: readonly CommitIdentity[], scrollTop: number, rowHeight: number): CommitViewportAnchor | null {
  if (!commits.length || rowHeight <= 0) return null
  const index = Math.min(commits.length - 1, Math.max(0, Math.floor(Math.max(0, scrollTop) / rowHeight)))
  return {
    commitId: commits[index].id,
    offset: Math.max(0, scrollTop - index * rowHeight),
  }
}

export function restoreCommitAnchor(commits: readonly CommitIdentity[], anchor: CommitViewportAnchor | null, rowHeight: number, fallback: number): number {
  if (!anchor || rowHeight <= 0) return Math.max(0, fallback)
  const index = commits.findIndex((commit) => commit.id === anchor.commitId)
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
