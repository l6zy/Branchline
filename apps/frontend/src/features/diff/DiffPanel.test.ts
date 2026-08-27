import { describe, expect, it } from 'vitest'
import type { RepositoryDiffLine } from '../../repository'
import { buildStagePatch } from './DiffPanel'

describe('buildStagePatch', () => {
  it('uses the previous old line for an insertion-only hunk', () => {
    const rows: RepositoryDiffLine[] = [
      { old: null, next: 2, kind: 'add', code: 'inserted' },
    ]

    expect(buildStagePatch('README.md', rows)).toContain('@@ -1,0 +2,1 @@')
  })

  it('uses the previous new line for a deletion-only hunk', () => {
    const rows: RepositoryDiffLine[] = [
      { old: 2, next: null, kind: 'del', code: 'removed' },
    ]

    expect(buildStagePatch('README.md', rows)).toContain('@@ -2,1 +1,0 @@')
  })
})
