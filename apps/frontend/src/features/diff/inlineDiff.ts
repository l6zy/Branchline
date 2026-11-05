import { DefaultLinesDiffComputer, type DetailedLineRangeMapping } from 'vscode-diff'
import type { RepositoryDiffLine } from '../../repository'
import { alignChangedRows, type SplitDiffRow } from './diffAlignment'

/** Zero-based UTF-16 offsets, with an exclusive end, in the displayed row. */
export type InlineDiffRange = { from: number; to: number }

type SourceRange = { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }

const diffComputer = new DefaultLinesDiffComputer()
const MAX_BLOCK_CHARACTERS = 100_000
const MAX_TOTAL_CHARACTERS = 500_000
const MAX_COMPUTATION_TIME_MS = 50
const MAX_BLOCK_TIME_MS = 20

function splitsSurrogatePair(code: string, offset: number) {
  return offset > 0 && offset < code.length
    && code.charCodeAt(offset - 1) >= 0xd800 && code.charCodeAt(offset - 1) <= 0xdbff
    && code.charCodeAt(offset) >= 0xdc00 && code.charCodeAt(offset) <= 0xdfff
}

function addRange(result: Map<RepositoryDiffLine, InlineDiffRange[]>, rows: RepositoryDiffLine[], range: SourceRange) {
  for (let line = range.startLineNumber; line <= Math.min(range.endLineNumber, rows.length); line += 1) {
    const row = rows[line - 1]
    let from = line === range.startLineNumber ? range.startColumn - 1 : 0
    let to = line === range.endLineNumber ? range.endColumn - 1 : row.code.length
    if (from >= to) continue // Insertions have an empty range on the original side, and vice versa.
    // VS Code uses UTF-16 offsets and may match just the shared high surrogate.
    if (splitsSurrogatePair(row.code, from)) from -= 1
    if (splitsSurrogatePair(row.code, to)) to += 1
    const ranges = result.get(row) ?? []
    const previous = ranges[ranges.length - 1]
    if (previous && from <= previous.to) previous.to = Math.max(previous.to, to)
    else ranges.push({ from, to })
    result.set(row, ranges)
  }
}

/** Refine Git's changed blocks for display without changing rows or patch semantics. */
export function buildDiffPresentation(rows: readonly RepositoryDiffLine[], showWhitespace = true) {
  const result = new Map<RepositoryDiffLine, InlineDiffRange[]>()
  const splitRows: SplitDiffRow[] = []
  const counterparts = new Map<RepositoryDiffLine, RepositoryDiffLine | undefined>()
  const deadline = Date.now() + MAX_COMPUTATION_TIME_MS
  let processedCharacters = 0
  for (let index = 0; index < rows.length;) {
    if (rows[index].kind === 'same') { splitRows.push({ left: rows[index], right: rows[index] }); index += 1; continue }
    const deleted: RepositoryDiffLine[] = []
    const added: RepositoryDiffLine[] = []
    let previousOld: number | null = null
    let previousNew: number | null = null
    let characters = 0
    while (index < rows.length && rows[index].kind !== 'same') {
      const row = rows[index]
      // Adjacent entries can still belong to separate Git hunks when context is omitted.
      if ((row.old != null && previousOld != null && row.old > previousOld + 1)
        || (row.next != null && previousNew != null && row.next > previousNew + 1)) break
      ;(row.kind === 'del' ? deleted : added).push(row)
      characters += row.code.length + 1
      if (row.old != null) previousOld = row.old
      if (row.next != null) previousNew = row.next
      index += 1
    }
    let changes: readonly DetailedLineRangeMapping[] | undefined
    const remainingTime = deadline - Date.now()
    if (deleted.length && added.length && characters <= MAX_BLOCK_CHARACTERS
      && remainingTime > 0 && processedCharacters + characters <= MAX_TOTAL_CHARACTERS) {
      processedCharacters += characters
      const diff = diffComputer.computeDiff(deleted.map((row) => row.code), added.map((row) => row.code), {
        ignoreTrimWhitespace: !showWhitespace,
        computeMoves: false,
        extendToSubwords: true,
        maxComputationTimeMs: Math.min(MAX_BLOCK_TIME_MS, remainingTime),
      })
      // Approximate timeout results can mark shared text as changed; retain positional fallback.
      if (!diff.hitTimeout) changes = diff.changes
    }
    for (const change of changes ?? []) {
      for (const inner of change.innerChanges ?? []) {
        addRange(result, deleted, inner.originalRange)
        addRange(result, added, inner.modifiedRange)
      }
    }
    for (const pair of alignChangedRows(deleted, added, changes)) {
      splitRows.push(pair)
      if (pair.left) counterparts.set(pair.left, pair.right)
      if (pair.right) counterparts.set(pair.right, pair.left)
    }
  }
  return { inlineRanges: result, splitRows, counterparts }
}

export function buildInlineDiffRanges(rows: readonly RepositoryDiffLine[], showWhitespace = true): Map<RepositoryDiffLine, InlineDiffRange[]> {
  return buildDiffPresentation(rows, showWhitespace).inlineRanges
}
