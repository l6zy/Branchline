export const BLAME_VIRTUALIZATION_THRESHOLD = 200

const BLAME_ROW_HEIGHT = 26
const BLAME_OVERSCAN = 20

export function getBlameVirtualRange(totalRows: number, scrollTop: number, viewportHeight: number) {
  const firstVisible = Math.floor(Math.max(0, scrollTop) / BLAME_ROW_HEIGHT)
  const start = Math.min(totalRows, Math.max(0, firstVisible - BLAME_OVERSCAN))
  const visibleRows = Math.ceil(Math.max(0, viewportHeight) / BLAME_ROW_HEIGHT)
  const end = Math.min(totalRows, firstVisible + visibleRows + BLAME_OVERSCAN)
  return { start, end }
}
