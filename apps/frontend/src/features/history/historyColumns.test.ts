import { describe, expect, it } from 'vitest'
import { DEFAULT_HISTORY_COLUMN_WIDTHS, DEFAULT_HISTORY_VISIBLE_COLUMNS, isHistoryColumnWidths, isHistoryVisibleColumns } from './historyColumns'

describe('history column persistence validators', () => {
  it('accepts complete finite widths and rejects malformed persisted values', () => {
    expect(isHistoryColumnWidths(DEFAULT_HISTORY_COLUMN_WIDTHS)).toBe(true)
    expect(isHistoryColumnWidths({ ...DEFAULT_HISTORY_COLUMN_WIDTHS, graph: 0 })).toBe(false)
    expect(isHistoryColumnWidths({ branch: 140, graph: Number.NaN, time: 104, hash: 82, author: 110 })).toBe(false)
    expect(isHistoryColumnWidths({ branch: 140 })).toBe(false)
  })

  it('accepts the optional committer visibility flag and existing saved settings', () => {
    expect(DEFAULT_HISTORY_VISIBLE_COLUMNS.committer).toBe(true)
    expect(isHistoryVisibleColumns({ time: true, hash: false })).toBe(true)
    expect(isHistoryVisibleColumns({ time: true, hash: false, committer: false })).toBe(true)
    expect(isHistoryVisibleColumns({ time: 'true', hash: false })).toBe(false)
    expect(isHistoryVisibleColumns({ time: true, hash: false, committer: 'false' })).toBe(false)
  })
})
