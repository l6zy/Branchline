import { describe, expect, it } from 'vitest'
import type { RepositoryDiffLine } from '../../repository'
import { buildDiffContextEntries } from './diffContext'

function row(index: number, kind: RepositoryDiffLine['kind'] = 'same'): RepositoryDiffLine {
  return { old: index, next: index, kind, code: `line ${index}` }
}

describe('buildDiffContextEntries', () => {
  it('returns no entries when the file has no modified block', () => {
    expect(buildDiffContextEntries([row(1), row(2), row(3)])).toEqual([])
  })

  it('keeps three unchanged lines around a modified block', () => {
    const entries = buildDiffContextEntries([
      row(1), row(2), row(3), row(4), row(5), row(6, 'del'), row(7, 'add'), row(8), row(9), row(10), row(11), row(12),
    ])

    expect(entries.filter((entry) => entry.kind === 'line').map((entry) => entry.sourceIndex)).toEqual([2, 3, 4, 5, 6, 7, 8, 9])
    expect(entries.filter((entry) => entry.kind === 'omitted').map((entry) => entry.count)).toEqual([2, 2])
  })

  it('shows the complete gap when modified blocks are six unchanged lines apart', () => {
    const rows = Array.from({ length: 16 }, (_, index) => row(index + 1))
    rows[3] = row(4, 'del')
    rows[10] = row(11, 'add')

    const visible = buildDiffContextEntries(rows).filter((entry) => entry.kind === 'line')
    expect(visible.map((entry) => entry.sourceIndex)).toEqual(Array.from({ length: 14 }, (_, index) => index))
  })

  it('keeps distant modified blocks in separate windows', () => {
    const rows = Array.from({ length: 20 }, (_, index) => row(index + 1))
    rows[2] = row(3, 'del')
    rows[13] = row(14, 'add')

    expect(buildDiffContextEntries(rows).filter((entry) => entry.kind === 'omitted').map((entry) => entry.count)).toEqual([4, 3])
  })
})
