import { describe, expect, it } from 'vitest'
import { fitContextMenuPosition } from './contextMenuPosition'

describe('context menu viewport placement', () => {
  it('moves a bottom-right menu inside the viewport using its measured size', () => {
    expect(fitContextMenuPosition({ x: 790, y: 590, width: 260, height: 360, viewportWidth: 800, viewportHeight: 600 })).toMatchObject({ left: 532, top: 232 })
  })

  it('keeps oversized menus scrollable within the viewport', () => {
    expect(fitContextMenuPosition({ x: 20, y: 20, width: 200, height: 900, viewportWidth: 800, viewportHeight: 600 }).maxHeight).toBe(584)
  })
})
