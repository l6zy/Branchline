export function hasScrollBuffer(scrollTop: number, viewportHeight: number, renderedTop: number, renderedBottom: number, contentHeight: number, buffer: number) {
  return renderedTop <= Math.max(0, scrollTop - buffer)
    && renderedBottom >= Math.min(contentHeight, scrollTop + viewportHeight + buffer)
}
