import type { RepositoryImage } from '../../repository'

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'jfif', 'gif', 'webp', 'bmp', 'ico', 'avif', 'svg'])

export function fileExtension(path: string) {
  const name = path.split(/[\\/]/).pop() ?? path
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function isImagePath(path: string | undefined) {
  return Boolean(path && IMAGE_EXTENSIONS.has(fileExtension(path)))
}

export function isSvgPath(path: string | undefined) {
  return Boolean(path && fileExtension(path) === 'svg')
}

export function imageDataUrl(image: RepositoryImage) {
  return `data:${image.mime};base64,${image.data}`
}

export function fittedImageSize(naturalWidth: number, naturalHeight: number, availableWidth: number, availableHeight: number, zoom = 100) {
  if (naturalWidth <= 0 || naturalHeight <= 0 || availableWidth <= 0 || availableHeight <= 0) return null
  const fit = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight, 1)
  const scale = fit * Math.max(0, zoom) / 100
  return { width: naturalWidth * scale, height: naturalHeight * scale }
}
