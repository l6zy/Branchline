export const DEFAULT_HISTORY_LOAD_LIMIT = 2_000
const MAX_HISTORY_LOAD_LIMIT = 20_000

export function nextHistoryLoadLimit(currentLimit: number) {
  const normalized = Math.max(DEFAULT_HISTORY_LOAD_LIMIT, currentLimit)
  if (normalized >= MAX_HISTORY_LOAD_LIMIT) return null
  return Math.min(normalized * 5, MAX_HISTORY_LOAD_LIMIT)
}
