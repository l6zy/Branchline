import type { RecentRepository } from './repositoryPersistence'
import type { FavoriteRepository } from './repositorySwitcher'
import { repositoryCacheKey, sameRepositoryPath } from './repositoryPaths'

export const FAVORITE_REPOSITORIES_KEY = 'branchline.favoriteRepositories.v1'

export function parseRecentRepositories(value: unknown): RecentRepository[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is RecentRepository => Boolean(
    item && typeof item.name === 'string' && typeof item.path === 'string' && item.path.trim()
    && typeof item.branch === 'string' && typeof item.openedAt === 'number'
    && Number.isFinite(item.openedAt) && Math.abs(item.openedAt) <= 8.64e15,
  )).slice(0, 50)
}

export function readFavoriteRepositories(): FavoriteRepository[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(FAVORITE_REPOSITORIES_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is FavoriteRepository => Boolean(item && typeof item.name === 'string' && typeof item.path === 'string' && item.path.trim())) : []
  } catch { return [] }
}

export function addRecentRepository(current: RecentRepository[], repository: Pick<RecentRepository, 'name' | 'path' | 'branch'>, now = Date.now()): RecentRepository[] {
  return [{ ...repository, openedAt: now }, ...current.filter((item) => !sameRepositoryPath(item.path, repository.path))].slice(0, 50)
}

export function toggleFavoriteRepository(current: FavoriteRepository[], repository: FavoriteRepository): FavoriteRepository[] {
  return current.some((item) => sameRepositoryPath(item.path, repository.path))
    ? current.filter((item) => !sameRepositoryPath(item.path, repository.path))
    : [...current, { name: repository.name, path: repository.path }]
}

export function removeRepositoryRecord(recent: RecentRepository[], favorites: FavoriteRepository[], path: string) {
  return { recent: recent.filter((item) => !sameRepositoryPath(item.path, path)), favorites: favorites.filter((item) => !sameRepositoryPath(item.path, path)) }
}

export type CatalogRepository = FavoriteRepository & { branch?: string; openedAt?: number; favorite: boolean; current: boolean }

export function repositoryCatalog(recent: RecentRepository[], favorites: FavoriteRepository[], active: Pick<RecentRepository, 'name' | 'path' | 'branch'> | null): CatalogRepository[] {
  const entries = new Map<string, CatalogRepository>()
  for (const item of recent) entries.set(repositoryCacheKey(item.path), { ...item, favorite: false, current: false })
  for (const item of favorites) {
    const key = repositoryCacheKey(item.path)
    entries.set(key, { ...item, ...entries.get(key), favorite: true, current: false })
  }
  if (active) {
    const key = repositoryCacheKey(active.path)
    entries.set(key, { favorite: false, ...entries.get(key), ...active, current: true })
  }
  return [...entries.values()]
}
