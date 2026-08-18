export type HistorySearchMode = 'locate' | 'filter'

export type HistorySearchSummary = {
  current: number
  total: number
}

export type HistorySearchCommit = {
  id: string
  fullHash?: string
  title?: string
  author?: string
}

function normalizedQuery(query: string) {
  return query.trim().toLocaleLowerCase()
}

export function commitMatchesQuery(commit: HistorySearchCommit, query: string) {
  const normalized = normalizedQuery(query)
  if (!normalized) return true
  return `${commit.title ?? ''} ${commit.fullHash ?? commit.id} ${commit.author ?? ''}`
    .toLocaleLowerCase()
    .includes(normalized)
}

export function matchingCommitIds<T extends HistorySearchCommit>(commits: T[], query: string) {
  if (!normalizedQuery(query)) return []
  return commits.filter((commit) => commitMatchesQuery(commit, query)).map((commit) => commit.id)
}

export function visibleHistoryCommits<T extends HistorySearchCommit>(
  commits: T[],
  query: string,
  mode: HistorySearchMode,
) {
  if (mode === 'locate' || !normalizedQuery(query)) return commits
  return commits.filter((commit) => commitMatchesQuery(commit, query))
}

export function nextSearchMatch(matches: string[], selected: string, direction: 1 | -1) {
  if (!matches.length) return null
  const currentIndex = matches.indexOf(selected)
  if (currentIndex < 0) return direction === 1 ? matches[0] : matches[matches.length - 1]
  return matches[(currentIndex + direction + matches.length) % matches.length]
}

export function retainUnchangedSearchSummary(current: HistorySearchSummary, next: HistorySearchSummary) {
  return current.current === next.current && current.total === next.total ? current : next
}
