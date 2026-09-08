export type MenuPositionInput = { x: number; y: number; width: number; height: number; viewportWidth: number; viewportHeight: number; padding?: number }

export function fitContextMenuPosition({ x, y, width, height, viewportWidth, viewportHeight, padding = 8 }: MenuPositionInput) {
  const left = Math.max(padding, Math.min(x, viewportWidth - width - padding))
  const top = Math.max(padding, Math.min(y, viewportHeight - height - padding))
  return { left, top, maxHeight: Math.max(80, viewportHeight - padding * 2) }
}
