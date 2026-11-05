import { describe, expect, it, vi } from 'vitest'
import { DefaultLinesDiffComputer } from 'vscode-diff'
import type { RepositoryDiffLine } from '../../repository'
import { buildDiffPresentation } from './inlineDiff'

function replacement(before: string[], after: string[]): RepositoryDiffLine[] {
  return [
    ...before.map((code, index) => ({ kind: 'del' as const, old: index + 1, next: null, code })),
    ...after.map((code, index) => ({ kind: 'add' as const, old: null, next: index + 1, code })),
  ]
}

function aligned(before: string[], after: string[]) {
  return buildDiffPresentation(replacement(before, after)).splitRows.map(({ left, right }) => [left?.code, right?.code])
}

describe('split diff line alignment', () => {
  it('pads a leading insertion before pairing modified code', () => {
    expect(aligned(['const a = 1;', 'const b = 2;'], ['// inserted', 'const a = 10;', 'const b = 20;'])).toEqual([
      [undefined, '// inserted'], ['const a = 1;', 'const a = 10;'], ['const b = 2;', 'const b = 20;'],
    ])
  })

  it('pads insertions and deletions in the middle of a replacement', () => {
    expect(aligned(['const a = 1;', 'const b = 2;'], ['const a = 10;', '// inserted', 'const b = 20;'])).toEqual([
      ['const a = 1;', 'const a = 10;'], [undefined, '// inserted'], ['const b = 2;', 'const b = 20;'],
    ])
    expect(aligned(['const a = 1;', '// removed', 'const b = 2;'], ['const a = 10;', 'const b = 20;'])).toEqual([
      ['const a = 1;', 'const a = 10;'], ['// removed', undefined], ['const b = 2;', 'const b = 20;'],
    ])
  })

  it('aligns a split or joined line to the side sharing more text', () => {
    expect(aligned(['call(first, second);'], ['call(first,', '  second);'])).toEqual([
      ['call(first, second);', 'call(first,'], [undefined, '  second);'],
    ])
    expect(aligned(['call(first,', '  second);'], ['call(first, second);'])).toEqual([
      ['call(first,', 'call(first, second);'], ['  second);', undefined],
    ])
  })

  it('preserves repeated code and every source row identity in order', () => {
    const rows = replacement(['const a = 1;', 'repeat();', 'const b = 2;', 'repeat();'], ['// inserted', 'const a = 10;', 'repeat();', 'const b = 20;', 'repeat();'])
    const result = buildDiffPresentation(rows)
    const left = result.splitRows.flatMap((row) => row.left ? [row.left] : [])
    const right = result.splitRows.flatMap((row) => row.right ? [row.right] : [])
    expect(left).toEqual(rows.filter((row) => row.kind === 'del'))
    expect(right).toEqual(rows.filter((row) => row.kind === 'add'))
    left.forEach((row, index) => expect(row).toBe(rows[index]))
    expect(result.splitRows[0]).toEqual({ right: rows[4] })
    expect(result.counterparts.get(rows[0])).toBe(rows[5])
    expect(result.counterparts.has(rows[4])).toBe(true)
    expect(result.counterparts.get(rows[4])).toBeUndefined()
  })

  it('does not pair across context or omitted Git hunks', () => {
    const first = replacement(['const a = 1;'], ['// inserted', 'const a = 10;'])
    const second = replacement(['const b = 2;'], ['const b = 20;']).map((row) => ({ ...row, old: row.old == null ? null : row.old + 100, next: row.next == null ? null : row.next + 100 }))
    const context: RepositoryDiffLine = { kind: 'same', old: 2, next: 3, code: 'context' }
    for (const between of [[], [context]]) {
      const result = buildDiffPresentation([...first, ...between, ...second])
      expect(result.counterparts.get(first[0])).toBe(first[2])
      expect(result.counterparts.get(second[0])).toBe(second[1])
      if (between.length) expect(result.splitRows).toContainEqual({ left: context, right: context })
    }
  })

  it('handles empty input, empty lines, pure additions/deletions and unrelated replacements', () => {
    expect(aligned([], [])).toEqual([])
    expect(aligned([], ['new', ''])).toEqual([[undefined, 'new'], [undefined, '']])
    expect(aligned(['old', ''], [])).toEqual([['old', undefined], ['', undefined]])
    expect(aligned(['abc'], ['xyz'])).toEqual([['abc', 'xyz']])
    expect(aligned([''], [''])).toEqual([['', '']])
  })

  it('reuses one computation for highlighters, alignment and counterparts', () => {
    const spy = vi.spyOn(DefaultLinesDiffComputer.prototype, 'computeDiff')
    try {
      const rows = replacement(['const a = 1;'], ['// inserted', 'const a = 10;'])
      const result = buildDiffPresentation(rows)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(result.inlineRanges.get(rows[0])).toEqual([{ from: 10, to: 11 }])
      expect(result.counterparts.get(rows[0])).toBe(rows[2])
    } finally { spy.mockRestore() }
  })

  it('keeps positional fallback if the block is too large or the algorithm times out', () => {
    const rows = replacement(['x'.repeat(100_001)], ['// inserted', 'y'.repeat(100_001)])
    expect(buildDiffPresentation(rows).splitRows[0]).toEqual({ left: rows[0], right: rows[1] })
    const spy = vi.spyOn(DefaultLinesDiffComputer.prototype, 'computeDiff').mockReturnValue({ changes: [], moves: [], hitTimeout: true })
    try {
      expect(aligned(['const a = 1;'], ['// inserted', 'const a = 10;'])).toEqual([
        ['const a = 1;', '// inserted'], [undefined, 'const a = 10;'],
      ])
    } finally { spy.mockRestore() }
  })
})
