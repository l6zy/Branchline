import { describe, expect, it } from 'vitest'
import type { RepositorySubmodule, RepositoryWorktree } from '../../repository'
import {
  buildSubmoduleTree,
  resolveRepositoryStructureSelection,
  submoduleAbsolutePath,
  type RepositoryStructureSelection,
} from './repositoryTree'

const submodule = (path: string, status: RepositorySubmodule['status'] = 'ok'): RepositorySubmodule => ({
  path,
  hash: '1234567890abcdef',
  status,
})

describe('repository structure tree', () => {
  it('builds nested folder nodes from submodule paths', () => {
    const tree = buildSubmoduleTree([
      submodule('packages/editor/core'),
      submodule('packages/editor/ui'),
      submodule('vendor/icons'),
    ])

    expect(tree.map((node) => [node.kind, node.name])).toEqual([
      ['folder', 'packages'],
      ['folder', 'vendor'],
    ])
    expect(tree[0].children[0].name).toBe('editor')
    expect(tree[0].children[0].children.map((node) => [node.kind, node.name])).toEqual([
      ['submodule', 'core'],
      ['submodule', 'ui'],
    ])
  })

  it('joins a Windows repository path with a relative submodule path', () => {
    expect(submoduleAbsolutePath('E:\\FONE\\mono-web', 'apps/planning')).toBe('E:\\FONE\\mono-web\\apps\\planning')
  })

  it('retains existing selections and falls back removed items to their group', () => {
    const snapshot = {
      path: 'E:\\FONE\\mono-web',
      worktrees: [{ path: 'E:\\FONE\\mono-web', bare: false }] satisfies RepositoryWorktree[],
      submodules: [submodule('apps/planning')],
    }
    const current: RepositoryStructureSelection = { kind: 'submodule', path: 'apps/planning' }
    expect(resolveRepositoryStructureSelection(snapshot, current)).toEqual(current)
    expect(resolveRepositoryStructureSelection({ ...snapshot, submodules: [] }, current)).toEqual({ kind: 'submodules' })
    expect(resolveRepositoryStructureSelection(snapshot, { kind: 'worktree', path: 'E:\\missing' })).toEqual({ kind: 'worktrees' })
  })
})
