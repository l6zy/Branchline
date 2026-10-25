import { describe, expect, it } from 'vitest'
import { committerInitials, committerName, isHistoryCommitVisibleOnSelectedBranches, matchesCommitterFilter, reachableHistoryCommitIds, toggleFilterValue, unloadedHistoryBranches, type BranchHistoryCommit } from './historyFilters'

describe('reachableHistoryCommitIds', () => {
  const commits: BranchHistoryCommit[] = [
    { id: 'root', fullHash: '0000000000000000', author: 'Author', committer: 'Committer A' },
    { id: 'main-tip', fullHash: '1111111111111111', parents: ['0000000000000000'], branches: ['main'], author: 'Author', committer: 'Committer B' },
    { id: 'feature-tip', fullHash: '2222222222222222', parents: ['0000000000000000'], branches: ['feature'], author: 'Author', committer: 'Committer C' },
    { id: 'outside', fullHash: '3333333333333333', author: 'Author', committer: 'Committer D' },
  ]

  it('returns the union of commits reachable from every selected branch', () => {
    expect(reachableHistoryCommitIds(commits, ['main', 'feature'])).toEqual(new Set(['main-tip', 'feature-tip', 'root']))
  })

  it('uses all commits when no branch is selected', () => {
    expect(reachableHistoryCommitIds(commits, [])).toBeNull()
  })

  it('keeps the working-tree row only when its current branch is included', () => {
    const reachable = reachableHistoryCommitIds(commits, ['main'])
    expect(isHistoryCommitVisibleOnSelectedBranches({ id: 'working', status: 'working' }, ['main'], 'main', reachable)).toBe(true)
    expect(isHistoryCommitVisibleOnSelectedBranches({ id: 'working', status: 'working' }, ['feature'], 'main', reachable)).toBe(false)
    expect(isHistoryCommitVisibleOnSelectedBranches({ id: 'working', status: 'working' }, [], 'main', null)).toBe(true)
  })

  it('identifies selected branches whose tips are outside the loaded history window', () => {
    expect(unloadedHistoryBranches(commits, ['main', 'older'])).toEqual(['older'])
  })
})

describe('committer filtering', () => {
  it('uses committer identity and falls back to author when metadata is absent', () => {
    expect(committerName({ author: 'Author', committer: 'Committer' })).toBe('Committer')
    expect(committerName({ author: 'Author' })).toBe('Author')
    expect(committerInitials('Ada Lovelace')).toBe('AL')
    expect(committerInitials('提交人')).toBe('提交')
  })

  it('matches any selected committer and treats an empty selection as all', () => {
    const commit = { id: 'one', author: 'Author', committer: 'Committer' }
    expect(matchesCommitterFilter(commit, ['Other', 'Committer'])).toBe(true)
    expect(matchesCommitterFilter(commit, ['Other'])).toBe(false)
    expect(matchesCommitterFilter(commit, [])).toBe(true)
  })
})

describe('toggleFilterValue', () => {
  it('adds and removes individual filter values without duplicates', () => {
    expect(toggleFilterValue(['main'], 'feature')).toEqual(['main', 'feature'])
    expect(toggleFilterValue(['main', 'feature'], 'main')).toEqual(['feature'])
    expect(toggleFilterValue(['main', 'main'], 'main')).toEqual([])
  })
})
