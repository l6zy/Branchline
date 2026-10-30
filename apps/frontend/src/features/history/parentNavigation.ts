import { nextHistoryLoadLimit } from './historyDepth'

export async function findParentCommit<T extends { id: string; fullHash?: string }>(
  commits: readonly T[], hash: string, initialLimit: number, load: (limit: number) => Promise<readonly T[]>,
) {
  let loaded = commits
  let limit = initialLimit
  const find = () => loaded.find((commit) => commit.fullHash === hash || commit.id === hash) ?? null
  let commit = find()
  while (!commit) {
    const next = nextHistoryLoadLimit(limit)
    if (!next) break
    loaded = await load(next)
    limit = next
    commit = find()
  }
  return { commit, limit, commits: loaded }
}
