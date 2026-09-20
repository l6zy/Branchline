// Git reports worktree paths with mixed separators and casing, so every comparison is normalized.
export function repositoryCacheKey(path: string) {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase()
}

export function sameRepositoryPath(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) return false
  return repositoryCacheKey(left) === repositoryCacheKey(right)
}

// A submodule always lives inside its superproject's working tree.
export function isRepositoryDescendant(path: string | null | undefined, ancestor: string | null | undefined) {
  if (!path || !ancestor) return false
  return repositoryCacheKey(path).startsWith(`${repositoryCacheKey(ancestor)}/`)
}
