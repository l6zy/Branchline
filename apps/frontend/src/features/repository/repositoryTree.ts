import type { RepositorySnapshot, RepositorySubmodule } from '../../repository'

export type RepositoryStructureSelection =
  | { kind: 'root' }
  | { kind: 'worktrees' }
  | { kind: 'worktree'; path: string }
  | { kind: 'submodules' }
  | { kind: 'submodule-folder'; path: string }
  | { kind: 'submodule'; path: string }

export type SubmoduleTreeNode = {
  kind: 'folder' | 'submodule'
  name: string
  path: string
  children: SubmoduleTreeNode[]
  submodule?: RepositorySubmodule
}

type StructureSnapshot = Pick<RepositorySnapshot, 'path' | 'worktrees' | 'submodules'>

function normalizedRelativePath(path: string) {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

function normalizedRepositoryPath(path: string) {
  return path.replace(/\\/g, '/').replace(/\/$/, '').toLocaleLowerCase()
}

function sortNodes(nodes: SubmoduleTreeNode[]) {
  nodes.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
  nodes.forEach((node) => sortNodes(node.children))
  return nodes
}

export function buildSubmoduleTree(submodules: RepositorySubmodule[]) {
  const roots: SubmoduleTreeNode[] = []
  submodules.forEach((submodule) => {
    const path = normalizedRelativePath(submodule.path)
    const segments = path.split('/').filter(Boolean)
    let children = roots
    let parentPath = ''
    segments.forEach((name, index) => {
      const currentPath = parentPath ? `${parentPath}/${name}` : name
      const last = index === segments.length - 1
      if (last) {
        const existing = children.find((node) => node.path === currentPath)
        if (existing) {
          existing.kind = 'submodule'
          existing.submodule = submodule
        } else {
          children.push({ kind: 'submodule', name, path: currentPath, children: [], submodule })
        }
      } else {
        let folder = children.find((node) => node.kind === 'folder' && node.path === currentPath)
        if (!folder) {
          folder = { kind: 'folder', name, path: currentPath, children: [] }
          children.push(folder)
        }
        children = folder.children
      }
      parentPath = currentPath
    })
  })
  return sortNodes(roots)
}

export function submoduleAbsolutePath(repositoryPath: string, submodulePath: string) {
  const separator = repositoryPath.includes('\\') ? '\\' : '/'
  const root = repositoryPath.replace(/[\\/]+$/, '')
  return `${root}${separator}${normalizedRelativePath(submodulePath).replace(/\//g, separator)}`
}

export function resolveRepositoryStructureSelection(snapshot: StructureSnapshot, selection: RepositoryStructureSelection): RepositoryStructureSelection {
  if (selection.kind === 'worktree') {
    return snapshot.worktrees.some((worktree) => normalizedRepositoryPath(worktree.path) === normalizedRepositoryPath(selection.path))
      ? selection
      : { kind: 'worktrees' }
  }
  if (selection.kind === 'submodule') {
    return snapshot.submodules.some((submodule) => normalizedRelativePath(submodule.path) === normalizedRelativePath(selection.path))
      ? selection
      : { kind: 'submodules' }
  }
  if (selection.kind === 'submodule-folder') {
    const folder = `${normalizedRelativePath(selection.path)}/`
    return snapshot.submodules.some((submodule) => normalizedRelativePath(submodule.path).startsWith(folder))
      ? selection
      : { kind: 'submodules' }
  }
  return selection
}
