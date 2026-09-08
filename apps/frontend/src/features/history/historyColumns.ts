export type HistoryColumnWidths = { branch: number; graph: number; time: number; hash: number; author: number }
export type HistoryVisibleColumns = { time: boolean; hash: boolean }

export const DEFAULT_HISTORY_COLUMN_WIDTHS: HistoryColumnWidths = { branch: 140, graph: 200, time: 104, hash: 82, author: 110 }
export const DEFAULT_HISTORY_VISIBLE_COLUMNS: HistoryVisibleColumns = { time: false, hash: false }

export function isHistoryColumnWidths(value: unknown): value is HistoryColumnWidths {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return ['branch', 'graph', 'time', 'hash', 'author'].every((key) => typeof candidate[key] === 'number' && Number.isFinite(candidate[key]) && candidate[key] >= 60 && candidate[key] <= 1000)
}

export function isHistoryVisibleColumns(value: unknown): value is HistoryVisibleColumns {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.time === 'boolean' && typeof candidate.hash === 'boolean'
}
