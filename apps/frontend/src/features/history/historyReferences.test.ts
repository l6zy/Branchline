import { describe, expect, it } from 'vitest'
import { visibleCommitReferences } from './historyReferences'

describe('commit reference labels', () => {
  const tracking = {
    main: { upstream: 'origin/main', ahead: 0, behind: 0 },
  }

  it('keeps the local branch and hides its tracked remote on the same commit', () => {
    expect(visibleCommitReferences(
      ['main', 'origin/main', 'v1.0'],
      new Set(['origin/main']),
      tracking,
    )).toEqual(['main', 'v1.0'])
  })

  it('preserves unrelated remote references and special labels', () => {
    expect(visibleCommitReferences(
      ['main', 'origin/release', 'refs/stash', 'v1.0'],
      new Set(['origin/release']),
      tracking,
    )).toEqual(['main', 'origin/release', 'refs/stash', 'v1.0'])
  })

  it('does not infer tracking from a similar branch name', () => {
    expect(visibleCommitReferences(
      ['feature/demo', 'origin/feature/demo'],
      new Set(['origin/feature/demo']),
      {},
    )).toEqual(['feature/demo', 'origin/feature/demo'])
  })
})
