import type { RepositoryDiffLine } from '../../repository'

export type DiffContextEntry =
  | { kind: 'line'; row: RepositoryDiffLine; sourceIndex: number }
  | { kind: 'omitted'; count: number; sourceStart: number; sourceEnd: number }

type DiffWindow = { start: number; end: number }

export function buildDiffContextEntries(rows: readonly RepositoryDiffLine[], contextLines = 3): DiffContextEntry[] {
  if (!rows.length) return []
  const context = Number.isFinite(contextLines) ? Math.max(0, Math.trunc(contextLines)) : 0
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
    if (window.start > cursor) entries.push({ kind: 'omitted', count: window.start - cursor, sourceStart: cursor, sourceEnd: window.start - 1 })
    for (let index = window.start; index <= window.end; index += 1) {
      entries.push({ kind: 'line', row: rows[index], sourceIndex: index })
    }
    cursor = window.end + 1
  })
  if (cursor < rows.length) entries.push({ kind: 'omitted', count: rows.length - cursor, sourceStart: cursor, sourceEnd: rows.length - 1 })
  return entries
}

export function expandDiffContextOmission(
  rows: readonly RepositoryDiffLine[],
  omission: Extract<DiffContextEntry, { kind: 'omitted' }>,
  direction: 'start' | 'end',
): DiffContextEntry[] {
  const count = Math.min(20, omission.count)
  const start = direction === 'start' ? omission.sourceStart : omission.sourceEnd - count + 1
  const end = start + count - 1
  const lines: DiffContextEntry[] = []
  for (let index = start; index <= end; index += 1) {
    lines.push({ kind: 'line', row: rows[index], sourceIndex: index })
  }
  if (count === omission.count) return lines
  const remaining: DiffContextEntry = {
    kind: 'omitted',
    count: omission.count - count,
    sourceStart: direction === 'start' ? end + 1 : omission.sourceStart,
    sourceEnd: direction === 'start' ? omission.sourceEnd : start - 1,
  }
  return direction === 'start' ? [...lines, remaining] : [remaining, ...lines]
}

export function diffContextExpansionKey(
  fileIdentity: string | null,
  contextLines: number,
  omission: Extract<DiffContextEntry, { kind: 'omitted' }>,
  direction: 'start' | 'end' = 'start',
) {
  const stableBound = direction === 'start' ? omission.sourceEnd : omission.sourceStart
  return `${fileIdentity}:${contextLines}:${direction}:${stableBound}`
}

export function expandDiffContextOmissionBySteps(
  rows: readonly RepositoryDiffLine[],
  omission: Extract<DiffContextEntry, { kind: 'omitted' }>,
  steps: number,
  direction: 'start' | 'end' = 'start',
) {
  const entries: DiffContextEntry[] = []
  let remaining: DiffContextEntry = omission
  for (let step = 0; step < steps && remaining.kind === 'omitted'; step += 1) {
    const expanded = expandDiffContextOmission(rows, remaining, direction)
    entries.push(...expanded.filter((entry) => entry.kind === 'line'))
    remaining = expanded.find((entry) => entry.kind === 'omitted') ?? {
      kind: 'omitted', count: 0, sourceStart: 0, sourceEnd: -1,
    }
  }
  if (remaining.kind === 'omitted' && remaining.count > 0) entries.push(remaining)
  return entries
}
