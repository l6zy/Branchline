import { describe, expect, it } from 'vitest'
import type { RepositoryDiffLine } from '../../repository'
import { buildDiffContextEntries, diffContextExpansionKey, expandDiffContextOmission, expandDiffContextOmissionBySteps } from './diffContext'

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

  it('uses a configurable initial context size', () => {
    const entries = buildDiffContextEntries([row(1), row(2), row(3), row(4, 'del'), row(5), row(6), row(7)], 1)

    expect(entries.filter((entry) => entry.kind === 'line').map((entry) => entry.sourceIndex)).toEqual([2, 3, 4])
  })

  it('normalizes fractional context to whole source lines', () => {
    const rows = [row(1), row(2), row(3), row(4, 'add'), row(5), row(6), row(7)]
    expect(buildDiffContextEntries(rows, 1.5)).toEqual(buildDiffContextEntries(rows, 1))
    expect(buildDiffContextEntries(rows, Number.NaN)).toEqual(buildDiffContextEntries(rows, 0))
  })

  it('records inclusive source bounds on omitted ranges', () => {
    const entries = buildDiffContextEntries([row(1), row(2), row(3, 'del'), row(4), row(5), row(6)], 0)

    expect(entries.filter((entry) => entry.kind === 'omitted')).toEqual([
      { kind: 'omitted', count: 2, sourceStart: 0, sourceEnd: 1 },
      { kind: 'omitted', count: 3, sourceStart: 3, sourceEnd: 5 },
    ])
  })

  it('expands an omitted range by one 20-line step', () => {
    const rows = Array.from({ length: 48 }, (_, index) => row(index + 1))
    const omission = { kind: 'omitted' as const, count: 45, sourceStart: 1, sourceEnd: 45 }

    expect(expandDiffContextOmission(rows, omission, 'start')).toEqual([
      ...Array.from({ length: 20 }, (_, index) => ({ kind: 'line', row: rows[index + 1], sourceIndex: index + 1 })),
      { kind: 'omitted', count: 25, sourceStart: 21, sourceEnd: 45 },
    ])
  })

  it('caps expansion at the omitted range boundary near a file edge', () => {
    const rows = Array.from({ length: 8 }, (_, index) => row(index + 1))
    const omission = { kind: 'omitted' as const, count: 3, sourceStart: 5, sourceEnd: 7 }

    expect(expandDiffContextOmission(rows, omission, 'start')).toEqual(
      Array.from({ length: 3 }, (_, index) => ({ kind: 'line', row: rows[index + 5], sourceIndex: index + 5 })),
    )
  })

  it('keeps the expansion state key stable as the omitted range is expanded repeatedly', () => {
    const rows = Array.from({ length: 80 }, (_, index) => row(index + 1))
    const original = { kind: 'omitted' as const, count: 70, sourceStart: 5, sourceEnd: 74 }
    const remaining = expandDiffContextOmission(rows, original, 'start').find((entry) => entry.kind === 'omitted')

    expect(remaining?.kind).toBe('omitted')
    if (remaining?.kind !== 'omitted') return
    expect(diffContextExpansionKey('file-a', 3, original)).toBe(diffContextExpansionKey('file-a', 3, remaining))
  })

  it('reveals another 20 rows for each successive expansion step', () => {
    const rows = Array.from({ length: 80 }, (_, index) => row(index + 1))
    const omission = { kind: 'omitted' as const, count: 70, sourceStart: 5, sourceEnd: 74 }

    const entries = expandDiffContextOmissionBySteps(rows, omission, 2)

    expect(entries.filter((entry) => entry.kind === 'line')).toHaveLength(40)
    expect(entries.find((entry) => entry.kind === 'omitted')).toEqual({ kind: 'omitted', count: 30, sourceStart: 45, sourceEnd: 74 })
  })

  it('can reveal the last 20 lines of an omitted range', () => {
    const rows = Array.from({ length: 48 }, (_, index) => row(index + 1))
    const omission = { kind: 'omitted' as const, count: 45, sourceStart: 1, sourceEnd: 45 }

    expect(expandDiffContextOmission(rows, omission, 'end')).toEqual([
      { kind: 'omitted', count: 25, sourceStart: 1, sourceEnd: 25 },
      ...Array.from({ length: 20 }, (_, index) => ({ kind: 'line', row: rows[index + 26], sourceIndex: index + 26 })),
    ])
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
