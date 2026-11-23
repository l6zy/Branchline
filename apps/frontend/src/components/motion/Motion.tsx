import { AnimatePresence, motion, useIsPresent, usePresenceData, useReducedMotion, type HTMLMotionProps } from 'motion/react'
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { motionPresets as response } from './presets'

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect
const PageActivityContext = createContext(true)

export function usePageActive() {
  return useContext(PageActivityContext)
}

export function useInertRef<T extends HTMLElement>(isPresent: boolean, externalRef?: (node: T | null) => void) {
  const currentRef = useRef<T | null>(null)
  const setInert = useCallback((node: T | null) => {
    if (node) {
      node.inert = !isPresent
      if (isPresent) node.removeAttribute('inert')
      else node.setAttribute('inert', '')
    }
  }, [isPresent])
  useIsomorphicLayoutEffect(() => {
    setInert(currentRef.current)
  }, [setInert])
  return useCallback((node: T | null) => {
    currentRef.current = node
    setInert(node)
    externalRef?.(node)
  }, [externalRef, setInert])
}

export type MotionPresenceProps = Omit<HTMLMotionProps<'div'>, 'children'> & {
  present: boolean
  children: ReactNode
  elementRef?: (node: HTMLDivElement | null) => void
}

export function MotionPresence({ present, children, className = '', elementRef, ...props }: MotionPresenceProps) {
  return <AnimatePresence mode="sync">
    {present && <PresenceLayer key="presence" className={className} elementRef={elementRef} {...props}>{children}</PresenceLayer>}
  </AnimatePresence>
}

function PresenceLayer({ children, className, elementRef, ...props }: Omit<HTMLMotionProps<'div'>, 'children'> & { children: ReactNode; elementRef?: (node: HTMLDivElement | null) => void }) {
  const reduced = useReducedMotion()
  const isPresent = useIsPresent()
  const inertRef = useInertRef<HTMLDivElement>(isPresent, elementRef)
  return <motion.div
    {...props}
    ref={inertRef}
    className={`motion-presence${className ? ` ${className}` : ''}`}
    aria-hidden={!isPresent}
    style={{ ...props.style, pointerEvents: isPresent ? props.style?.pointerEvents : 'none' }}
    initial={{ opacity: 0, y: reduced ? 0 : -6, scale: reduced ? 1 : 0.96 }}
    animate={{ opacity: 1, y: 0, scale: 1, transition: reduced ? response.instant : { ...response.surface, opacity: response.fadeIn } }}
    exit={{ opacity: 0, y: reduced ? 0 : -3, scale: reduced ? 1 : 0.98, transition: reduced ? response.instant : response.fadeOut }}
  >{children}</motion.div>
}

export type AnimatedModalProps = Omit<HTMLMotionProps<'div'>, 'children'> & {
  open: boolean
  children: ReactNode
  surfaceClassName?: string
  kind?: 'dialog' | 'drawer'
}

export function isMotionBackdropTarget(event: { target: EventTarget | null; currentTarget: HTMLElement }) {
  return event.target === event.currentTarget || (event.target instanceof Element && event.target.hasAttribute('data-motion-backdrop'))
}

export function AnimatedModal({ open, className = 'modal-backdrop', kind = 'dialog', surfaceClassName = kind === 'drawer' ? 'motion-drawer-surface' : 'motion-modal-surface', children, ...props }: AnimatedModalProps) {
  const pageActive = useContext(PageActivityContext)
  const content = <AnimatePresence mode="sync">
    {open && pageActive && <ModalBackdrop key="modal" className={className} {...props}><ModalSurface kind={kind} className={surfaceClassName}>{children}</ModalSurface></ModalBackdrop>}
  </AnimatePresence>
  // Keep overlays outside animated pages and titlebar stacking contexts.
  return typeof document === 'undefined' ? content : createPortal(content, document.body)
}

function ModalBackdrop({ children, className, style, ...props }: Omit<HTMLMotionProps<'div'>, 'children'> & { children: ReactNode }) {
  const reduced = useReducedMotion()
  const isPresent = useIsPresent()
  const inertRef = useInertRef<HTMLDivElement>(isPresent)
  return <motion.div
    {...props}
    ref={inertRef}
    className={`motion-modal-backdrop ${className ?? ''}`}
    aria-hidden={!isPresent}
    style={{ ...style, pointerEvents: isPresent ? style?.pointerEvents : 'none' }}
  ><motion.div
    className="motion-modal-scrim"
    data-motion-backdrop=""
    initial={{ opacity: 0 }}
    animate={{ opacity: 1, transition: reduced ? response.instant : response.fadeIn }}
    exit={{ opacity: 0, transition: reduced ? response.instant : response.fadeOut }}
  />{children}</motion.div>
}

function ModalSurface({ className, kind, children }: { className: string; kind: 'dialog' | 'drawer'; children: ReactNode }) {
  const reduced = useReducedMotion()
  const isPresent = useIsPresent()
  const inertRef = useInertRef<HTMLDivElement>(isPresent)
  return <motion.div
    ref={inertRef}
    className={className}
    data-motion-backdrop=""
    aria-hidden={!isPresent}
    style={{ pointerEvents: isPresent ? 'auto' : 'none' }}
    initial={kind === 'drawer'
      ? { opacity: 1, x: reduced ? 0 : '100%' }
      : { opacity: 0, y: reduced ? 0 : 18, scale: reduced ? 1 : 0.94 }}
    animate={{ opacity: 1, x: 0, y: 0, scale: 1, transition: reduced ? response.instant : { ...response.surface, opacity: response.fadeIn } }}
    exit={kind === 'drawer'
      ? { opacity: 1, x: reduced ? 0 : '100%', transition: reduced ? response.instant : { duration: 0.2, ease: [0.32, 0, 0.67, 0] } }
      : { opacity: 0, y: reduced ? 0 : 10, scale: reduced ? 1 : 0.97, transition: reduced ? response.instant : response.fadeOut }}
  >{children}</motion.div>
}

export function AnimatedPage({ pageKey, order = 0, cacheScope, children, className = '', ...props }: HTMLMotionProps<'section'> & { pageKey: string; order?: number; cacheScope?: string; children: ReactNode }) {
  const navigationRef = useRef({ key: pageKey, order, direction: 1 })
  const previousNavigation = navigationRef.current
  const direction = pageKey === previousNavigation.key ? previousNavigation.direction : order < previousNavigation.order ? -1 : 1
  useIsomorphicLayoutEffect(() => {
    navigationRef.current = { key: pageKey, order, direction }
  }, [direction, order, pageKey])
  return <motion.section {...props} className={`motion-page-stack ${className}`}>
    {cacheScope === undefined ? <AnimatePresence initial={false} mode="sync" custom={direction}>
      <PageLayer key={pageKey}>{children}</PageLayer>
    </AnimatePresence> : <RetainedPages pageKey={pageKey} scope={cacheScope} direction={direction}>{children}</RetainedPages>}
  </motion.section>
}

type RetainedPage = { key: string; children: ReactNode; used: number }
type RetainedPageCache = { scope: string; clock: number; pages: RetainedPage[] }

function RetainedPages({ pageKey, scope, direction, children }: { pageKey: string; scope: string; direction: number; children: ReactNode }) {
  const cacheRef = useRef<RetainedPageCache>({ scope, clock: 0, pages: [{ key: pageKey, children, used: 0 }] })
  const cache = cacheRef.current
  const nextCache = cache.scope !== scope
    ? { scope, clock: 0, pages: [{ key: pageKey, children, used: 0 }] }
    : updateRetainedPage(cache, pageKey, children)
  useIsomorphicLayoutEffect(() => {
    cacheRef.current = nextCache
  }, [nextCache])
  return <AnimatePresence initial={false} mode="sync" custom={direction}>
    {nextCache.pages.map((page) => <PageLayer key={JSON.stringify([nextCache.scope, page.key])} active={page.key === pageKey} retain>{page.children}</PageLayer>)}
  </AnimatePresence>
}

function updateRetainedPage(cache: RetainedPageCache, pageKey: string, children: ReactNode): RetainedPageCache {
  const current = cache.pages.find((page) => page.key === pageKey)
  if (current?.children === children) return cache
  const clock = cache.clock + 1
  const next = { key: pageKey, children, used: clock }
  const pages = current ? cache.pages.map((page) => page.key === pageKey ? next : page) : [...cache.pages, next]
  const oldest = pages.reduce((previous, page) => page.used < previous.used ? page : previous)
  return { scope: cache.scope, clock, pages: pages.length > 4 ? pages.filter((page) => page !== oldest) : pages }
}

function PageLayer({ children, active = true, retain = false }: { children: ReactNode; active?: boolean; retain?: boolean }) {
  const reduced = useReducedMotion()
  const isPresent = useIsPresent()
  const parentActive = usePageActive()
  const visible = active && isPresent && parentActive
  const [hidden, setHidden] = useState(false)
  const visibleRef = useRef(visible)
  useIsomorphicLayoutEffect(() => {
    visibleRef.current = visible
    if (visible) setHidden(false)
  }, [visible])
  const direction = (usePresenceData() as number | undefined) ?? 1
  const inertRef = useInertRef<HTMLElement>(visible)
  const enter = { opacity: 1, x: 0, transition: reduced ? response.instant : { ...response.page, opacity: response.fadeIn } }
  const exit = { opacity: 0, x: reduced ? 0 : direction * -12, transition: reduced ? response.instant : response.fadeOut }
  return <motion.section
    ref={inertRef}
    className="motion-page"
    aria-hidden={!visible}
    style={{ pointerEvents: visible ? 'auto' : 'none', zIndex: visible ? 1 : 0, visibility: retain && hidden && !visible ? 'hidden' : undefined }}
    initial={{ opacity: 0, x: reduced ? 0 : direction * 10 }}
    animate={visible ? enter : exit}
    exit={exit}
    onAnimationComplete={() => { if (retain && !visibleRef.current) setHidden(true) }}
  ><PageActivityContext.Provider value={visible}>{children}</PageActivityContext.Provider></motion.section>
}

export function AnimatedCollapse({ open, children, className = '', ...props }: HTMLMotionProps<'div'> & { open: boolean; children: ReactNode }) {
  return <AnimatePresence initial={false} mode="sync">
    {open && <CollapseLayer key="collapse" className={className} {...props}>{children}</CollapseLayer>}
  </AnimatePresence>
}

function CollapseLayer({ children, className, ...props }: Omit<HTMLMotionProps<'div'>, 'children'> & { children: ReactNode }) {
  const reduced = useReducedMotion()
  const isPresent = useIsPresent()
  const inertRef = useInertRef<HTMLDivElement>(isPresent)
  return <motion.div
    {...props}
    ref={inertRef}
    className={`motion-collapse${className ? ` ${className}` : ''}`}
    aria-hidden={!isPresent}
    style={{ ...props.style, pointerEvents: isPresent ? props.style?.pointerEvents : 'none' }}
    initial={{ height: 0, opacity: 0 }}
    animate={{ height: 'auto', opacity: 1, transition: reduced ? response.instant : { height: response.disclosure, opacity: response.fadeIn } }}
    exit={{ height: 0, opacity: 0, transition: reduced ? response.instant : { height: response.disclosure, opacity: response.fadeOut } }}
  >{children}</motion.div>
}

export function AnimatedTabBar({ activeKey, children, className = '' }: { activeKey: string; children: ReactNode; className?: string }) {
  const reduced = useReducedMotion()
  const barRef = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<{ left: number; width: number } | null>(null)
  useIsomorphicLayoutEffect(() => {
    const bar = barRef.current
    const active = bar?.querySelector<HTMLElement>('button.active')
    if (!bar || !active) { setSelection(null); return }
    const measure = () => {
      const next = { left: active.offsetLeft, width: active.offsetWidth }
      setSelection((current) => current?.left === next.left && current.width === next.width ? current : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(bar)
    observer.observe(active)
    return () => observer.disconnect()
  }, [activeKey])
  return <div ref={barRef} className={`motion-tab-bar ${className}`}>
    {children}
    {selection && <motion.span className="motion-tab-indicator" aria-hidden="true" initial={false} animate={{ x: selection.left, width: selection.width }} transition={reduced ? response.instant : response.selection}/>}
  </div>
}
