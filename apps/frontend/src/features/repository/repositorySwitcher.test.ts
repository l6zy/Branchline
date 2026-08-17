import { describe, expect, it } from 'vitest'
import { buildRepositorySwitchTargets, filterRepositoryTargets, quickAccessRepositoryTargets } from './repositorySwitcher'

const repository = {
  name: 'Branchline',
  path: 'E:\\code\\Branchline',
  branch: 'master',
  worktrees: [
    { path: 'E:\\code\\Branchline', branch: 'master' },
    { path: 'E:\\code\\Branchline-feature', branch: 'feat/search' },
  ],
  submodules: [
    { path: 'vendor/ui-kit', status: '已初始化' },
  ],
}

const recent = [
  { name: 'mono-web', path: 'E:\\FONE\\mono-web', branch: 'master', openedAt: 3 },
  { name: 'Branchline', path: 'e:/code/Branchline/', branch: 'master', openedAt: 2 },
  { name: 'tools', path: 'E:\\code\\tools', branch: 'main', openedAt: 1 },
]

describe('repository switch targets', () => {
  it('deduplicates normalized paths while preserving structure priority and pin state', () => {
    const targets = buildRepositorySwitchTargets(repository, recent, [
      { name: 'Feature', path: 'e:/code/Branchline-feature/' },
    ])

    expect(targets.filter((target) => target.path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase() === 'e:\\code\\branchline')).toHaveLength(1)
    expect(targets.find((target) => target.path.includes('Branchline-feature'))).toMatchObject({ source: 'worktree', pinned: true })
  })

  it('matches repository names and paths with separator-insensitive tokens', () => {
    const targets = buildRepositorySwitchTargets(repository, recent, [])
    expect(filterRepositoryTargets(targets, 'mono web').map(({ path }) => path)).toEqual(['E:\\FONE\\mono-web'])
    expect(filterRepositoryTargets(targets, 'vendor ui').map(({ source }) => source)).toEqual(['submodule'])
  })

  it('uses pinned repositories first and otherwise falls back to three recent entries', () => {
    const pinnedTargets = buildRepositorySwitchTargets(repository, recent, [
      { name: 'tools', path: 'E:\\code\\tools' },
    ])
    expect(quickAccessRepositoryTargets(pinnedTargets).map(({ path }) => path)).toEqual(['E:\\code\\tools'])

    const recentTargets = buildRepositorySwitchTargets(repository, recent, [])
    expect(quickAccessRepositoryTargets(recentTargets).map(({ path }) => path)).toEqual([
      'E:\\FONE\\mono-web',
      'E:\\code\\tools',
    ])
  })
})
