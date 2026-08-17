import { describe, expect, it } from 'vitest'
import { commitMatchesQuery, matchingCommitIds, nextSearchMatch, visibleHistoryCommits } from './historySearch'

const commits = [
  { id: 'a1', fullHash: 'aaaa1111', title: 'Prepare release', author: 'Alice' },
  { id: 'b2', fullHash: 'bbbb2222', title: 'Fix login flow', author: 'Bob' },
  { id: 'c3', fullHash: 'cccc3333', title: 'Update docs', author: 'Chen' },
]

describe('history search', () => {
  it('matches title, hash, and author without case sensitivity', () => {
    expect(commitMatchesQuery(commits[1], 'LOGIN')).toBe(true)
    expect(commitMatchesQuery(commits[1], 'bbbb')).toBe(true)
    expect(commitMatchesQuery(commits[1], 'bob')).toBe(true)
    expect(commitMatchesQuery(commits[1], 'missing')).toBe(false)
  })

  it('keeps graph context in locate mode and filters only in filter mode', () => {
    expect(visibleHistoryCommits(commits, 'fix', 'locate')).toEqual(commits)
    expect(visibleHistoryCommits(commits, 'fix', 'filter').map(({ id }) => id)).toEqual(['b2'])
    expect(matchingCommitIds(commits, 'fix')).toEqual(['b2'])
  })

  it('navigates matches circularly in both directions', () => {
    expect(nextSearchMatch(['a1', 'b2'], 'b2', 1)).toBe('a1')
    expect(nextSearchMatch(['a1', 'b2'], 'a1', -1)).toBe('b2')
    expect(nextSearchMatch(['a1', 'b2'], 'missing', 1)).toBe('a1')
    expect(nextSearchMatch([], 'a1', 1)).toBeNull()
  })
})
