import { describe, expect, it } from 'vitest'
import type { RepositoryDiffLine } from '../../repository'
import { buildStagePatch, changeBlock, changeLine, diffOverviewBounds, diffOverviewMarkers, shouldJumpToFirstChange, shouldRenderLoadedRows } from './DiffPanel'

describe('diffOverviewBounds', () => {
  it('ends above the horizontal scrollbar when it consumes viewport height', () => {
    expect(diffOverviewBounds(100, 600, 100, 0, 590, 34)).toEqual({ top: 34, bottom: 10 })
    expect(diffOverviewBounds(100, 600, 100, 0, 600, 34)).toEqual({ top: 34, bottom: 0 })
  })

  it('uses the split pane viewport below the header and hunk', () => {
    expect(diffOverviewBounds(100, 600, 158, 0, 532, 0)).toEqual({ top: 58, bottom: 10 })
  })

  it('accounts for pane borders without depending on horizontal scroll position', () => {
    expect(diffOverviewBounds(100, 600, 134, 1, 554, 0)).toEqual({ top: 35, bottom: 11 })
  })
})

describe('diffOverviewMarkers', () => {
  it('maps changed entry indexes onto normalized overview positions', () => {
    expect(diffOverviewMarkers([0, 5, 9], 10)).toEqual([
      { index: 0, top: 0 },
      { index: 5, top: 50 },
      { index: 9, top: 90 },
    ])
  })

  it('returns no markers for an empty diff', () => {
    expect(diffOverviewMarkers([0], 0)).toEqual([])
  })
})

describe('shouldJumpToFirstChange', () => {
  it('jumps to the first change when opening the full-file view', () => {
    expect(shouldJumpToFirstChange('file', 'file-a', null)).toBe(true)
  })

  it('does not jump twice for the same file activation', () => {
    expect(shouldJumpToFirstChange('file', 'file-a', 'file-a')).toBe(false)
  })

  it('does not jump in changes-only mode', () => {
    expect(shouldJumpToFirstChange('changes', 'file-a', null)).toBe(false)
  })

  it('preserves a pending cross-file navigation target', () => {
    expect(shouldJumpToFirstChange('file', 'file-b', 'file-a', true, true)).toBe(false)
    // The explicit jump consumes this activation even after pending navigation clears.
    expect(shouldJumpToFirstChange('file', 'file-b', 'file-b', false, true)).toBe(false)
  })

  it('waits for the current staged scope before consuming a new activation', () => {
    const previousIdentity = 'staged\0file.ts'
    const activeIdentity = 'unstaged\0file.ts'
    const oldRowsReady = shouldRenderLoadedRows(true, previousIdentity, activeIdentity)
    expect(shouldJumpToFirstChange('file', activeIdentity, previousIdentity, false, oldRowsReady)).toBe(false)
    const currentRowsReady = shouldRenderLoadedRows(true, activeIdentity, activeIdentity)
    expect(shouldJumpToFirstChange('file', activeIdentity, previousIdentity, false, currentRowsReady)).toBe(true)
  })
})

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

  it('uses the correct whitespace variant as context for staging and restoring', () => {
    const rows: RepositoryDiffLine[] = [
      { old: 1, next: 1, kind: 'same', code: '  first  ', oldCode: 'first', newCode: '  first  ' },
      { old: 2, next: null, kind: 'del', code: 'removed' },
    ]

    expect(buildStagePatch('README.md', rows, undefined, 'stage')).toContain(' first\n-removed')
    expect(buildStagePatch('README.md', rows, undefined, 'restore')).toContain('   first  \n-removed')
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

describe('changeLine', () => {
  it('keeps only contiguous context around a changed row', () => {
    const rows: RepositoryDiffLine[] = [
      { old: 1, next: 1, kind: 'same', code: 'before' },
      { old: 2, next: null, kind: 'del', code: 'removed' },
      { old: null, next: 2, kind: 'add', code: 'replacement' },
      { old: 3, next: 3, kind: 'same', code: 'after' },
      { old: 4, next: null, kind: 'del', code: 'other removed' },
    ]
    const line = changeLine(rows, 2)
    expect(line.map((row) => row.code)).toEqual(['replacement', 'after'])
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
