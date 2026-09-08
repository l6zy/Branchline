import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { fitContextMenuPosition } from './contextMenuPosition'

type ContextMenuProps = {
  x: number
  y: number
  onClose: () => void
  children: ReactNode
}

export function ContextMenu({ x, y, onClose, children }: ContextMenuProps) {
  const [closing, setClosing] = useState(false)
  const [position, setPosition] = useState({ left: x, top: y, maxHeight: window.innerHeight - 16 })
  const menuRef = useRef<HTMLDivElement>(null)
  const activating = useRef(false)
  const closeTimer = useRef<number | null>(null)
  const requestClose = () => {
    if (closing) return
    setClosing(true)
    closeTimer.current = window.setTimeout(onClose, 120)
  }

  useEffect(() => {
    const close = () => {
      setClosing(true)
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
      closeTimer.current = window.setTimeout(onClose, 120)
    }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKeyDown)
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    }
  }, [onClose])

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    setPosition(fitContextMenuPosition({ x, y, width: menu.offsetWidth, height: menu.offsetHeight, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight }))
  }, [x, y, children])
  const delayMenuAction = (event: MouseEvent<HTMLDivElement>) => {
    if (activating.current) return
    const button = (event.target as Element).closest('button') as HTMLButtonElement | null
    if (!button || button.disabled) return
    event.preventDefault()
    event.stopPropagation()
    setClosing(true)
    closeTimer.current = window.setTimeout(() => {
      activating.current = true
      button.click()
      activating.current = false
    }, 120)
  }
  const reopenAtPointer = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    if ((event.target as Element).closest('.context-menu')) return
    event.stopPropagation()
    const clientX = event.clientX
    const clientY = event.clientY
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    onClose()
    window.setTimeout(() => {
      const target = document.elementFromPoint(clientX, clientY)
      target?.dispatchEvent(new globalThis.MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX,
        clientY,
      }))
    }, 0)
  }
  const portalTarget = document.querySelector('.app-shell') ?? document.body

  return createPortal(<div className={`context-menu-layer ${closing ? 'closing' : ''}`} onPointerDown={(event) => { if (event.button !== 2) requestClose() }} onContextMenu={reopenAtPointer}>
    <div ref={menuRef} className="context-menu" style={{ left: position.left, top: position.top, maxHeight: position.maxHeight, overflowY: 'auto' }} onPointerDown={(event) => event.stopPropagation()} onClickCapture={delayMenuAction}>{children}</div>
  </div>, portalTarget)
}
