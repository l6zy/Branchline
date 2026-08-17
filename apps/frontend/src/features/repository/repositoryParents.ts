import type { RepositorySnapshot } from '../../repository'

export type RepositoryParent = {
  name: string
  path: string
  branch: string
}

export function repositoryParentFromSnapshot(snapshot: Pick<RepositorySnapshot, 'superprojectPath'>): RepositoryParent | null {
  const path = snapshot.superprojectPath?.trim()
  if (!path) return null
  return {
    name: path.split(/[\\/]/).filter(Boolean).pop() ?? path,
    path,
    branch: '',
  }
}
