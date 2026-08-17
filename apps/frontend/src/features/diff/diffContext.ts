import type { RepositoryDiffLine } from '../../repository'

export type DiffContextEntry =
  | { kind: 'line'; row: RepositoryDiffLine; sourceIndex: number }
  | { kind: 'omitted'; count: number }

type DiffWindow = { start: number; end: number }

export function buildDiffContextEntries(rows: readonly RepositoryDiffLine[], contextLines = 3): DiffContextEntry[] {
  if (!rows.length) return []
  const context = Math.max(0, contextLines)
  const windows: DiffWindow[] = []
  let changeStart = -1

  const flushChange = (end: number) => {
    if (changeStart < 0) return
    const nextWindow = {
      start: Math.max(0, changeStart - context),
      end: Math.min(rows.length - 1, end + context),
    }
    const previous = windows[windows.length - 1]
    if (previous && nextWindow.start <= previous.end + 1) previous.end = Math.max(previous.end, nextWindow.end)
    else windows.push(nextWindow)
    changeStart = -1
  }

  rows.forEach((row, index) => {
    if (row.kind !== 'same') {
      if (changeStart < 0) changeStart = index
      return
    }
    if (changeStart >= 0) flushChange(index - 1)
  })
  flushChange(rows.length - 1)
  if (!windows.length) return []

  const entries: DiffContextEntry[] = []
  let cursor = 0
  windows.forEach((window) => {
    if (window.start > cursor) entries.push({ kind: 'omitted', count: window.start - cursor })
    for (let index = window.start; index <= window.end; index += 1) {
      entries.push({ kind: 'line', row: rows[index], sourceIndex: index })
    }
    cursor = window.end + 1
  })
  if (cursor < rows.length) entries.push({ kind: 'omitted', count: rows.length - cursor })
  return entries
}
