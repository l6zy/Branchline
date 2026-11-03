import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createTooltipCoordinator, type TooltipCoordinator } from './tooltipCoordinator'

type TooltipContextValue = { coordinator: TooltipCoordinator; pointerInput: { current: boolean } }
const TooltipContext = createContext<TooltipContextValue | null>(null)

export function TooltipProvider({ children }: { children: ReactNode }) {
  const [coordinator] = useState(createTooltipCoordinator)
  const pointerInput = useRef(false)
  useEffect(() => {
    const activate = (event: Event) => {
      if (event.type === 'pointerdown' || event.type === 'click') pointerInput.current = true
      coordinator.dismiss('activation')
    }
    const contextmenu = () => coordinator.dismiss('contextmenu')
    const scroll = () => coordinator.dismiss('scroll')
    const keydown = (event: KeyboardEvent) => {
      pointerInput.current = false
      if (event.key === 'Escape' && coordinator.getSnapshot().openId) {
        coordinator.dismiss('escape')
        // Menu widgets can restore focus while handling this same Escape.
        pointerInput.current = true
        if (!(event.target instanceof Element && event.target.closest('[data-tooltip-escape-delegate]'))) {
          event.preventDefault()
          event.stopPropagation()
        }
      }
    }
    document.addEventListener('pointerdown', activate, true)
    document.addEventListener('click', activate, true)
    document.addEventListener('contextmenu', contextmenu, true)
    document.addEventListener('scroll', scroll, true)
    document.addEventListener('keydown', keydown, true)
    return () => {
      document.removeEventListener('pointerdown', activate, true)
      document.removeEventListener('click', activate, true)
      document.removeEventListener('contextmenu', contextmenu, true)
      document.removeEventListener('scroll', scroll, true)
      document.removeEventListener('keydown', keydown, true)
      coordinator.dismiss('unmount')
    }
  }, [coordinator])
  return <TooltipContext.Provider value={{ coordinator, pointerInput }}>{children}</TooltipContext.Provider>
}

export function useTooltipContext() { return useContext(TooltipContext) }
