import { describe, expect, it } from 'vitest'
import { fileExtension, fittedImageSize, imageDataUrl, isImagePath, isSvgPath } from './imagePreview'

describe('diff image preview helpers', () => {
  it('recognizes supported raster and vector image paths case-insensitively', () => {
    expect(isImagePath('assets/logo.PNG')).toBe(true)
    expect(isImagePath('docs/diagram.svg')).toBe(true)
    expect(isImagePath('docs/screenshot.jpeg')).toBe(true)
    expect(isImagePath('src/app.tsx')).toBe(false)
    expect(isImagePath(undefined)).toBe(false)
    expect(fileExtension('C:\\repo\\photo.WebP')).toBe('webp')
  })

  it('only identifies svg files as source-preview candidates', () => {
    expect(isSvgPath('icon.SVG')).toBe(true)
    expect(isSvgPath('icon.png')).toBe(false)
  })

  it('builds a data URL from the returned image payload', () => {
    expect(imageDataUrl({ mime: 'image/png', data: 'AAEC', byteLength: 3 })).toBe('data:image/png;base64,AAEC')
  })

  it('fits images inside the preview and applies the requested zoom', () => {
    expect(fittedImageSize(1000, 500, 500, 500)).toEqual({ width: 500, height: 250 })
    expect(fittedImageSize(500, 1000, 500, 500)).toEqual({ width: 250, height: 500 })
    expect(fittedImageSize(100, 100, 500, 500)).toEqual({ width: 100, height: 100 })
    expect(fittedImageSize(1000, 500, 500, 500, 200)).toEqual({ width: 1000, height: 500 })
    expect(fittedImageSize(1000, 500, 500, 500, 50)).toEqual({ width: 250, height: 125 })
    expect(fittedImageSize(0, 500, 500, 500)).toBeNull()
  })
})
