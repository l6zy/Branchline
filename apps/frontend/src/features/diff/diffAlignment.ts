import type { DetailedLineRangeMapping } from 'vscode-diff'
import type { RepositoryDiffLine } from '../../repository'

export type SplitDiffRow = { left?: RepositoryDiffLine; right?: RepositoryDiffLine }
type Position = { lineNumber: number; column: number }
type Anchor = { old: number; next: number; weight: number; score: number; previous?: Anchor }

/** Project unchanged spans between VS Code edits onto corresponding source lines. */
export function alignChangedRows(deleted: RepositoryDiffLine[], added: RepositoryDiffLine[], changes: readonly DetailedLineRangeMapping[] = []): SplitDiffRow[] {
  const weights = new Map<number, Map<number, number>>()
  const addGap = (oldStart: Position, newStart: Position, oldEnd: Position, newEnd: Position) => {
    const lines = Math.min(oldEnd.lineNumber - oldStart.lineNumber, newEnd.lineNumber - newStart.lineNumber)
    for (let offset = 0; offset <= lines; offset += 1) {
      const old = oldStart.lineNumber + offset - 1
      const next = newStart.lineNumber + offset - 1
      const oldText = deleted[old].code.slice(offset ? 0 : oldStart.column - 1, old + 1 === oldEnd.lineNumber ? oldEnd.column - 1 : undefined).trim()
      const newText = added[next].code.slice(offset ? 0 : newStart.column - 1, next + 1 === newEnd.lineNumber ? newEnd.column - 1 : undefined).trim()
      // Whitespace-only overlap is too weak to move a line away from its ordinal pair.
      if (!oldText || oldText !== newText) continue
      const row = weights.get(old) ?? new Map<number, number>()
      row.set(next, (row.get(next) ?? 0) + oldText.length)
      weights.set(old, row)
    }
  }

  if (deleted.length && added.length) {
    let oldCursor: Position = { lineNumber: 1, column: 1 }
    let newCursor: Position = { lineNumber: 1, column: 1 }
    for (const change of changes) {
      for (const { originalRange: old, modifiedRange: next } of change.innerChanges ?? []) {
        addGap(oldCursor, newCursor, { lineNumber: old.startLineNumber, column: old.startColumn }, { lineNumber: next.startLineNumber, column: next.startColumn })
        oldCursor = { lineNumber: old.endLineNumber, column: old.endColumn }
        newCursor = { lineNumber: next.endLineNumber, column: next.endColumn }
      }
    }
    // No edits means both blocks matched; on a fallback call no anchors are needed.
    if (changes.length) addGap(oldCursor, newCursor,
      { lineNumber: deleted.length, column: deleted[deleted.length - 1].code.length + 1 },
      { lineNumber: added.length, column: added[added.length - 1].code.length + 1 })
  }

  // Maximum-weight monotonic matching, without allocating an old-lines × new-lines matrix.
  // Delay updates for each original row so neither side can be matched twice.
  const bestByPrefix: (Anchor | undefined)[] = new Array(added.length + 1)
  const bestBefore = (column: number) => {
    let best: Anchor | undefined
    for (let index = column; index > 0; index -= index & -index) {
      const candidate = bestByPrefix[index]
      if (candidate && (!best || candidate.score > best.score)) best = candidate
    }
    return best
  }
  for (const [old, columns] of weights) {
    const anchors: Anchor[] = []
    for (const [next, weight] of columns) {
      const previous = bestBefore(next)
      anchors.push({ old, next, weight, score: (previous?.score ?? 0) + weight, previous })
    }
    for (const anchor of anchors) {
      for (let index = anchor.next + 1; index < bestByPrefix.length; index += index & -index) {
        if (!bestByPrefix[index] || anchor.score > bestByPrefix[index]!.score) bestByPrefix[index] = anchor
      }
    }
  }
  const anchors: Anchor[] = []
  for (let anchor = bestBefore(added.length); anchor; anchor = anchor.previous) anchors.push(anchor)
  anchors.reverse()

  const result: SplitDiffRow[] = []
  let old = 0
  let next = 0
  const appendUntil = (oldEnd: number, newEnd: number) => {
    while (old < oldEnd || next < newEnd) {
      const row: SplitDiffRow = {}
      if (old < oldEnd) row.left = deleted[old++]
      if (next < newEnd) row.right = added[next++]
      result.push(row)
    }
  }
  for (const anchor of anchors) {
    appendUntil(anchor.old, anchor.next)
    result.push({ left: deleted[old++], right: added[next++] })
  }
  appendUntil(deleted.length, added.length)
  return result
}
