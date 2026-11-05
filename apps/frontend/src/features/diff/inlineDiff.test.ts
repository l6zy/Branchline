import { describe, expect, it, vi } from 'vitest'
import { DefaultLinesDiffComputer } from 'vscode-diff'
import type { RepositoryDiffLine } from '../../repository'
import { buildInlineDiffRanges } from './inlineDiff'

function replacement(before: string[], after: string[]): RepositoryDiffLine[] {
  return [
    ...before.map((code, index) => ({ kind: 'del' as const, old: index + 1, next: null, code })),
    ...after.map((code, index) => ({ kind: 'add' as const, old: null, next: index + 1, code })),
  ]
}

function highlighted(rows: RepositoryDiffLine[], showWhitespace = true) {
  const ranges = buildInlineDiffRanges(rows, showWhitespace)
  return rows.map((row) => (ranges.get(row) ?? []).map(({ from, to }) => row.code.slice(from, to)))
}

describe('buildInlineDiffRanges', () => {
  it('highlights a changed value without marking the shared code', () => {
    const rows = replacement(['const count = 100;'], ['const count = 200;'])
    const ranges = buildInlineDiffRanges(rows)
    expect(ranges.get(rows[0])).toEqual([{ from: 14, to: 17 }])
    expect(ranges.get(rows[1])).toEqual([{ from: 14, to: 17 }])
  })

  it('keeps separate edits on one line separate', () => {
    expect(highlighted(replacement(['alpha = oldValue; omega = oldFlag;'], ['alpha = newValue; omega = newFlag;'])))
      .toEqual([['oldValue', 'oldFlag'], ['newValue', 'newFlag']])
  })

  it('does not mark unchanged text on the empty side of an inline insertion or deletion', () => {
    const before = 'const a = 1;'
    const after = before + ' // extra'
    expect(highlighted(replacement([before], [after]))).toEqual([[], [' // extra']])
    expect(highlighted(replacement([after], [before]))).toEqual([[' // extra'], []])
  })

  it('compares whole blocks when a new line shifts the matching lines', () => {
    expect(highlighted(replacement(
      ['const first = 100;', 'const second = 100;'],
      ['// inserted', 'const first = 200;', 'const second = 200;'],
    ))).toEqual([['100'], ['100'], ['// inserted'], ['200'], ['200']])
  })

  it('maps a change spanning line boundaries onto each affected row', () => {
    expect(highlighted(replacement(['call(first, second);'], ['call(first,', '  second);'])))
      .toEqual([[], [], [' ']])
  })

  it('preserves Chinese character offsets and complete emoji', () => {
    expect(highlighted(replacement(['const label = "你好世界";'], ['const label = "你好朋友";'])))
      .toEqual([['世界'], ['朋友']])
    expect(highlighted(replacement(['const label = "😀";'], ['const label = "😃";'])))
      .toEqual([['😀'], ['😃']])
  })

  it('respects the existing trim-whitespace toggle', () => {
    const rows = replacement(['  const n = 1;  '], ['    const n = 1;    '])
    expect(highlighted(rows, true)).toEqual([[], ['  ', '  ']])
    expect(highlighted(rows, false)).toEqual([[], []])
    const contentRows = replacement(['  return oldValue;  '], ['    return newValue;    '])
    expect(highlighted(contentRows, false)).toEqual([['oldValue'], ['newValue']])
  })

  it('keeps independent changes separated by context or omitted Git lines independent', () => {
    const first = replacement(['const count = 100;'], ['const count = 200;'])
    const second = replacement(['const count = 300;'], ['const count = 400;'])
      .map((row) => ({ ...row, old: row.old == null ? null : row.old + 100, next: row.next == null ? null : row.next + 100 }))
    const context: RepositoryDiffLine = { kind: 'same', old: 2, next: 2, code: 'context' }
    expect(highlighted([...first, context, ...second])).toEqual([['100'], ['200'], [], ['300'], ['400']])
    expect(highlighted([...first, ...second])).toEqual([['100'], ['200'], ['300'], ['400']])
  })

  it('leaves unchanged rows, pure additions/deletions and empty content to line backgrounds', () => {
    expect(buildInlineDiffRanges([]).size).toBe(0)
    expect(highlighted(replacement([], ['new']))).toEqual([[]])
    expect(highlighted(replacement(['old'], []))).toEqual([[]])
    expect(highlighted(replacement([''], ['']))).toEqual([[], []])
    const context: RepositoryDiffLine = { kind: 'same', old: 1, next: 1, code: 'new', oldCode: 'old', newCode: 'new' }
    expect(buildInlineDiffRanges([context]).size).toBe(0)
  })

  it('falls back to line backgrounds for oversized blocks', () => {
    expect(highlighted(replacement(['a'.repeat(150_000)], ['b'.repeat(150_000)]))).toEqual([[], []])
  })

  it('discards approximate inner ranges when computation times out', () => {
    const approximate = new DefaultLinesDiffComputer().computeDiff(['old'], ['new'], { ignoreTrimWhitespace: false, computeMoves: false, maxComputationTimeMs: 0 })
    expect(approximate.changes[0].innerChanges?.length).toBeGreaterThan(0)
    const spy = vi.spyOn(DefaultLinesDiffComputer.prototype, 'computeDiff').mockReturnValue({ ...approximate, hitTimeout: true })
    try {
      expect(highlighted(replacement(['old'], ['new']))).toEqual([[], []])
    } finally {
      spy.mockRestore()
    }
  })
})
