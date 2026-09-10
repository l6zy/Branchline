import { describe, expect, it } from 'vitest'
import type { RepositoryDiffLine } from '../../repository'
import { buildStagePatch, changeBlock, shouldRenderLoadedRows } from './DiffPanel'

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

  it('preserves context rows to anchor a block at its original location', () => {
    const rows: RepositoryDiffLine[] = [
      { old: 10, next: 10, kind: 'same', code: 'before' },
      { old: 11, next: null, kind: 'del', code: 'removed' },
      { old: null, next: 11, kind: 'add', code: 'replacement' },
      { old: 12, next: 12, kind: 'same', code: 'after' },
    ]

    const patch = buildStagePatch('README.md', rows)
    expect(patch).toContain('@@ -10,3 +10,3 @@')
    expect(patch).toContain(' before\n-removed\n+replacement\n after')
  })

  it('builds a valid deletion-only patch with context', () => {
    const rows: RepositoryDiffLine[] = [
      { old: 10, next: 10, kind: 'same', code: 'before' },
      { old: 11, next: null, kind: 'del', code: 'removed' },
      { old: 12, next: 11, kind: 'same', code: 'after' },
    ]

    const patch = buildStagePatch('README.md', rows)
    expect(patch).toContain('@@ -10,3 +10,2 @@')
    expect(patch).toContain(' before\n-removed\n after')
  })

  it('uses trailing context to anchor an insertion at the beginning of a file', () => {
    const rows: RepositoryDiffLine[] = [
      { old: null, next: 1, kind: 'add', code: 'inserted' },
      { old: 1, next: 2, kind: 'same', code: 'original first line' },
    ]

    expect(buildStagePatch('README.md', rows)).toContain('@@ -1,1 +1,2 @@')
  })

  it('uses trailing context to anchor a deletion at the beginning of a file', () => {
    const rows: RepositoryDiffLine[] = [
      { old: 1, next: null, kind: 'del', code: 'removed' },
      { old: 2, next: 1, kind: 'same', code: 'remaining first line' },
    ]

    expect(buildStagePatch('README.md', rows)).toContain('@@ -1,2 +1,1 @@')
  })

  it('does not include a nearby independent change while adding context', () => {
    const rows: RepositoryDiffLine[] = [
      { old: 1, next: 1, kind: 'same', code: 'before' },
      { old: 2, next: null, kind: 'del', code: 'first old' },
      { old: null, next: 2, kind: 'add', code: 'first new' },
      { old: 3, next: 3, kind: 'same', code: 'between' },
      { old: 4, next: null, kind: 'del', code: 'second old' },
      { old: null, next: 4, kind: 'add', code: 'second new' },
    ]

    const block = changeBlock(rows, 1)
    expect(block.some((row) => row.code === 'first new')).toBe(true)
    expect(block.some((row) => row.code === 'second new')).toBe(false)
  })
})

describe('shouldRenderLoadedRows', () => {
  it('does not expose rows from the previous staged scope before the next load starts', () => {
    expect(shouldRenderLoadedRows(true, 'staged\0file.ts', 'unstaged\0file.ts')).toBe(false)
  })

  it('keeps rows visible while reloading the same staged scope', () => {
    expect(shouldRenderLoadedRows(true, 'unstaged\0file.ts', 'unstaged\0file.ts')).toBe(true)
  })

  it('renders direct fallback rows without a loader identity', () => {
    expect(shouldRenderLoadedRows(false, null, null)).toBe(true)
  })
})
