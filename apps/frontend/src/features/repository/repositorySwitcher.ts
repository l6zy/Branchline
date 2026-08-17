export type RepositorySwitchSource = 'current' | 'worktree' | 'submodule' | 'pinned' | 'recent'
export type RepositorySwitchNavigation = 'current' | 'worktree' | 'submodule' | 'repository'

export type RepositorySwitchTarget = {
  id: string
  label: string
  path: string
  kind: string
  source: RepositorySwitchSource
  navigation: RepositorySwitchNavigation
  pinned: boolean
  recentRank?: number
}

export type FavoriteRepository = {
  name: string
  path: string
}

export type RepositoryHistoryEntry = FavoriteRepository & {
  branch: string
  openedAt: number
}

export type RepositorySwitchSnapshot = {
  name: string
  path: string
  branch: string
  worktrees: Array<{ path: string; branch?: string }>
  submodules: Array<{ path: string; status: string }>
}

export function normalizedRepositoryTargetPath(path: string) {
  return path.trim().replace(/\//g, '\\').replace(/\\+$/, '').toLocaleLowerCase()
}

function joinedRepositoryPath(root: string, relative: string) {
  const separator = root.includes('\\') ? '\\' : '/'
  return `${root.replace(/[\\/]+$/, '')}${separator}${relative.replace(/^[\\/]+/, '').replace(/[\\/]/g, separator)}`
}

function pathLabel(path: string) {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path
}

export function buildRepositorySwitchTargets(
  repository: RepositorySwitchSnapshot | null,
  recentRepositories: RepositoryHistoryEntry[],
  favorites: FavoriteRepository[],
) {
  const favoritePaths = new Set(favorites.map((favorite) => normalizedRepositoryTargetPath(favorite.path)))
  const recentRanks = new Map(recentRepositories.map((recent, index) => [normalizedRepositoryTargetPath(recent.path), index]))
  const targets: RepositorySwitchTarget[] = []
  const byPath = new Map<string, RepositorySwitchTarget>()

  const add = (target: Omit<RepositorySwitchTarget, 'id' | 'pinned' | 'recentRank'>) => {
    const id = normalizedRepositoryTargetPath(target.path)
    const pinned = favoritePaths.has(id)
    const recentRank = recentRanks.get(id)
    const existing = byPath.get(id)
    if (existing) {
      existing.pinned ||= pinned
      if (recentRank !== undefined && (existing.recentRank === undefined || recentRank < existing.recentRank)) existing.recentRank = recentRank
      return
    }
    const next = { ...target, id, pinned, recentRank }
    targets.push(next)
    byPath.set(id, next)
  }

  if (repository) {
    add({ label: repository.name, path: repository.path, kind: `当前仓库 · ${repository.branch}`, source: 'current', navigation: 'current' })
    repository.worktrees
      .filter((worktree) => normalizedRepositoryTargetPath(worktree.path) !== normalizedRepositoryTargetPath(repository.path))
      .forEach((worktree) => add({ label: pathLabel(worktree.path), path: worktree.path, kind: `Worktree · ${worktree.branch ?? 'Detached'}`, source: 'worktree', navigation: 'worktree' }))
    repository.submodules.forEach((submodule) => add({ label: submodule.path, path: joinedRepositoryPath(repository.path, submodule.path), kind: `Submodule · ${submodule.status}`, source: 'submodule', navigation: 'submodule' }))
  }

  favorites.forEach((favorite) => add({ label: favorite.name, path: favorite.path, kind: '收藏仓库', source: 'pinned', navigation: 'repository' }))
  recentRepositories.forEach((recent) => add({ label: recent.name, path: recent.path, kind: `最近仓库 · ${recent.branch}`, source: 'recent', navigation: 'repository' }))
  return targets
}

function searchableRepositoryText(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\\/_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function filterRepositoryTargets(targets: RepositorySwitchTarget[], query: string) {
  const tokens = searchableRepositoryText(query).split(' ').filter(Boolean)
  if (!tokens.length) return targets
  return targets.filter((target) => {
    const searchable = searchableRepositoryText(`${target.label} ${target.path} ${target.kind}`)
    return tokens.every((token) => searchable.includes(token))
  })
}

export function quickAccessRepositoryTargets(targets: RepositorySwitchTarget[]) {
  const pinned = targets.filter((target) => target.pinned && target.source !== 'current')
  if (pinned.length) return pinned.slice(0, 5)
  return targets
    .filter((target) => target.source !== 'current' && target.recentRank !== undefined)
    .sort((left, right) => left.recentRank! - right.recentRank!)
    .slice(0, 3)
}
