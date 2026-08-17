export type RecentRepository = {
  name: string
  path: string
  branch: string
  openedAt: number
}

function normalizedRepositoryPath(path: string) {
  return path.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase()
}

function isNestedRepository(path: string, possibleParent: string) {
  const normalizedPath = normalizedRepositoryPath(path)
  const normalizedParent = normalizedRepositoryPath(possibleParent)
  return normalizedPath !== normalizedParent && normalizedPath.startsWith(`${normalizedParent}\\`)
}

export function selectStartupRepository(recentRepositories: RecentRepository[], startupPath: string | null) {
  if (startupPath) {
    const normalizedStartupPath = normalizedRepositoryPath(startupPath)
    const storedRepository = recentRepositories.find(
      (repository) => normalizedRepositoryPath(repository.path) === normalizedStartupPath,
    )
    if (storedRepository) return storedRepository
  }

  const mostRecent = recentRepositories[0]
  if (!mostRecent) return null
  const parentRepository = recentRepositories
    .filter((repository) => isNestedRepository(mostRecent.path, repository.path))
    .sort((left, right) => normalizedRepositoryPath(left.path).length - normalizedRepositoryPath(right.path).length)[0]
  return parentRepository ?? mostRecent
}
