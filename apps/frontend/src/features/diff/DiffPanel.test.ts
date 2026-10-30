import { describe, expect, it } from 'vitest'
import type { RepositoryDiffLine } from '../../repository'
import { buildStagePatch, changeBlock, changeLine, diffActionEdgeSpace, diffOverviewBounds, diffOverviewMarkers, diffOverviewViewport, diffSplitRowHeight, shouldJumpToFirstChange, shouldRenderLoadedRows, shouldShowDiffOverviewViewport } from './DiffPanel'

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
	it('maps contiguous additions and deletions to proportional overview ranges', () => {
		expect(diffOverviewMarkers([
			{ kind: 'same' },
			{ kind: 'add' },
			{ kind: 'add' },
			{ kind: 'del' },
			{ kind: 'same' },
		], 'unified')).toEqual([
			{ index: 1, top: 20, height: 40, kind: 'add', column: 'unified' },
			{ index: 3, top: 60, height: 20, kind: 'del', column: 'unified' },
		])
	})

	it('renders additions and deletions in separate columns for split diffs', () => {
		expect(diffOverviewMarkers([
			{ oldKind: 'same', newKind: 'same' },
			{ oldKind: 'del', newKind: 'add' },
			{ oldKind: 'del', newKind: 'add' },
			{ oldKind: 'same', newKind: 'same' },
		], 'split')).toEqual([
			{ index: 1, top: 25, height: 50, kind: 'del', column: 'old' },
			{ index: 1, top: 25, height: 50, kind: 'add', column: 'new' },
		])
	})

	it('uses rendered row heights when mapping markers across mixed-height entries', () => {
		expect(diffOverviewMarkers([
			{ kind: 'same', height: 24 },
			{ kind: 'add', height: 30 },
			{ kind: 'add', height: 30 },
			{ kind: 'del', height: 24 },
		], 'unified')).toEqual([
			{ index: 1, top: 22.2, height: 55.6, kind: 'add', column: 'unified' },
			{ index: 3, top: 77.8, height: 22.2, kind: 'del', column: 'unified' },
		])
	})

  it('returns no markers for an empty diff', () => {
		expect(diffOverviewMarkers([], 'unified')).toEqual([])
  })
})

describe('diffOverviewViewport', () => {
	it('hides the viewport indicator when there is no vertical scroll range', () => {
		expect(shouldShowDiffOverviewViewport(400, 400)).toBe(false)
		expect(shouldShowDiffOverviewViewport(300, 400)).toBe(false)
		expect(shouldShowDiffOverviewViewport(401, 400)).toBe(true)
	})
	it('maps the content viewport below a sticky header to the overview track', () => {
		expect(diffOverviewViewport(0, 1034, 400, 34)).toEqual({ top: 0, height: 36.6 })
		expect(diffOverviewViewport(317, 1034, 400, 34)).toEqual({ top: 31.7, height: 36.6 })
		expect(diffOverviewViewport(634, 1034, 400, 34)).toEqual({ top: 63.4, height: 36.6 })
	})

	it('fills the overview when the diff content does not scroll', () => {
		expect(diffOverviewViewport(0, 400, 400, 34)).toEqual({ top: 0, height: 100 })
	})
})

describe('diffSplitRowHeight', () => {
  it('keeps code rows compact independently of block actions and scales with the font', () => {
    expect(diffSplitRowHeight(12)).toBe(24)
    expect(diffSplitRowHeight(22)).toBe(39)
  })
})

describe('diffActionEdgeSpace', () => {
  it('adds enough trailing room for a toolbar taller than the final row', () => {
    expect(diffActionEdgeSpace(24, 40)).toBe(16)
    expect(diffActionEdgeSpace(48, 40)).toBe(0)
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
  it('keeps the complete replacement block and contiguous context around a changed row', () => {
    const rows: RepositoryDiffLine[] = [
      { old: 1, next: 1, kind: 'same', code: 'before' },
      { old: 2, next: null, kind: 'del', code: 'removed' },
      { old: null, next: 2, kind: 'add', code: 'replacement' },
      { old: 3, next: 3, kind: 'same', code: 'after' },
      { old: 4, next: null, kind: 'del', code: 'other removed' },
    ]
    const line = changeLine(rows, 2)
    expect(line.map((row) => row.code)).toEqual(['before', 'removed', 'replacement', 'after'])
  })

  it('keeps only the matching replacement pair when several replacements share a hunk', () => {
    const rows: RepositoryDiffLine[] = [
      { old: 1, next: 1, kind: 'same', code: 'before' },
      { old: 2, next: null, kind: 'del', code: 'old one' },
      { old: 3, next: null, kind: 'del', code: 'old two' },
      { old: null, next: 2, kind: 'add', code: 'new one' },
      { old: null, next: 3, kind: 'add', code: 'new two' },
      { old: 4, next: 4, kind: 'same', code: 'after' },
    ]

    expect(changeLine(rows, 4).map((row) => row.code)).toEqual(['old two', 'new two'])
  })

  it('does not cross an independent change while collecting context', () => {
    const rows: RepositoryDiffLine[] = [
      { old: 1, next: 1, kind: 'same', code: 'before' },
      { old: 2, next: null, kind: 'del', code: 'removed' },
      { old: null, next: 2, kind: 'add', code: 'replacement' },
      { old: 3, next: 3, kind: 'same', code: 'between' },
      { old: 4, next: null, kind: 'del', code: 'other removed' },
      { old: 5, next: 4, kind: 'same', code: 'after' },
    ]

    expect(changeLine(rows, 2).map((row) => row.code)).toEqual(['before', 'removed', 'replacement', 'between'])
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
