import { nextHistoryLoadLimit } from './historyDepth'

export async function findReferenceCommit<T extends { id: string; branches?: string[] }>(
  commits: readonly T[], reference: string, initialLimit: number, load: (limit: number) => Promise<readonly T[]>,
) {
  let loaded = commits
  let limit = initialLimit
  const find = () => loaded.find((commit) => commit.branches?.includes(reference)) ?? null
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
