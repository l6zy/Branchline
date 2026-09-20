// Windows hands back the extended-length spelling (`\\?\E:\repo`) from APIs like canonicalize. It is
// the same directory, but it reads badly in the UI and never matches a path the user typed, so it is
// dropped at the edge. `\\?\UNC\server\share` maps back to the ordinary `\\server\share` form.
export function displayRepositoryPath(path: string) {
  const trimmed = path.trim()
  if (trimmed.startsWith('\\\\?\\UNC\\')) return `\\\\${trimmed.slice(8)}`
  return trimmed.startsWith('\\\\?\\') ? trimmed.slice(4) : trimmed
}

// Git reports worktree paths with mixed separators and casing, so every comparison is normalized.
export function repositoryCacheKey(path: string) {
  return displayRepositoryPath(path).replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase()
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
