import { cloneElement, Fragment, isValidElement, useEffect, useId, useRef, useSyncExternalStore, type CSSProperties, type HTMLAttributes, type ReactElement, type Ref } from 'react'
import { arrow, autoUpdate, flip, FloatingArrow, FloatingPortal, offset, safePolygon, shift, useFloating, useFocus, useHover, useInteractions, useMergeRefs, useRole, useTransitionStyles, type Placement } from '@floating-ui/react'
import { useTooltipContext } from './TooltipProvider'
import { createTooltipCoordinator } from './tooltipCoordinator'
import { DisabledTooltipAnchor } from './DisabledTooltipAnchor'

export type TooltipProps = {
  content?: string | null
  children: ReactElement
  placement?: Placement
  disabledAnchorClassName?: string
  disabledAnchorStyle?: CSSProperties
}

type TriggerProps = HTMLAttributes<HTMLElement> & { ref?: Ref<HTMLElement> }
const emptyCoordinator = createTooltipCoordinator()

function supportsRef(type: ReactElement['type']): boolean {
  if (typeof type === 'string') return true
  if (typeof type !== 'object' || type === null) return false
  const component = type as { $$typeof?: symbol; type?: ReactElement['type'] }
  return component.$$typeof === Symbol.for('react.forward_ref') || component.$$typeof === Symbol.for('react.memo') && !!component.type && supportsRef(component.type)
}

function nearestTrigger(target: EventTarget | null, reference: Element | null) {
  return target instanceof Element && target.closest('[data-tooltip-trigger]') === reference
}

export function Tooltip({ content, children, placement = 'top', disabledAnchorClassName, disabledAnchorStyle }: TooltipProps) {
  if (!isValidElement(children) || children.type === Fragment || !supportsRef(children.type)) {
    throw new Error('Tooltip requires one DOM element or forwardRef component as its child')
  }
  const provider = useTooltipContext()
  if (content && !provider) throw new Error('Tooltip requires TooltipProvider')
  const coordinator = provider?.coordinator ?? emptyCoordinator
  const snapshot = useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot, coordinator.getSnapshot)
  const id = useId()
  const generation = useRef<number | null>(null)
  const hoverReadyAt = useRef(0)
  const hoverOpenTimer = useRef<number | null>(null)
  const hiddenExit = useRef(false)
  const arrowRef = useRef<SVGSVGElement>(null)
  const open = !!content && snapshot.openId === id
  if (open) hiddenExit.current = false
  else if (snapshot.ownerId && snapshot.ownerId !== id || snapshot.lastClosedId === id && snapshot.closeReason === 'superseded') hiddenExit.current = true
  const floating = useFloating({
    open,
    onOpenChange(next, event, reason) {
      if (!content) return
      if (next) {
        // An earlier native enter timer must not shorten a resumed hover intent.
        const remainingDelay = hoverReadyAt.current - Date.now()
        if (reason !== 'focus' && remainingDelay > 0) {
          const current = coordinator.getSnapshot()
          if (current.ownerId === id && current.generation === generation.current) scheduleHoverOpen(event, remainingDelay)
          return
        }
        if (reason === 'focus') {
          if (provider?.pointerInput.current || !nearestTrigger(event?.target ?? null, floating.refs.domReference.current)) return
          generation.current = coordinator.claim(id)
        }
        if (generation.current !== null) coordinator.open(id, generation.current)
      } else {
        coordinator.close(id, reason === 'focus' ? 'blur' : 'leave')
      }
    },
    placement,
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 }), arrow({ element: arrowRef })],
  })
  const hover = useHover(floating.context, { enabled: !!content, delay: { open: 300, close: 100 }, handleClose: safePolygon(), move: false })
  const focus = useFocus(floating.context, { enabled: !!content, visibleOnly: true })
  const role = useRole(floating.context, { role: 'tooltip' })
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, role])
  const child = children as ReactElement<TriggerProps> & { ref?: Ref<HTMLElement> }
  const mergedRef = useMergeRefs<HTMLElement>([child.ref, floating.refs.setReference])
  const { isMounted, styles: transitionStyles } = useTransitionStyles(floating.context, { duration: 100, initial: { opacity: 0 } })
  useEffect(() => {
    if (!content) {
      window.clearTimeout(hoverOpenTimer.current ?? undefined)
      coordinator.close(id, 'unmount')
    }
  }, [content, coordinator, id])
  useEffect(() => {
    if (snapshot.ownerId !== id || snapshot.generation !== generation.current) window.clearTimeout(hoverOpenTimer.current ?? undefined)
  }, [snapshot.ownerId, snapshot.generation, id])
  useEffect(() => () => {
    window.clearTimeout(hoverOpenTimer.current ?? undefined)
    coordinator.close(id, 'unmount')
  }, [coordinator, id])

  if (!content) return children
  const existingDescription = child.props['aria-describedby']
  const describedBy = open ? [...new Set(`${existingDescription ?? ''} ${id}`.trim().split(/\s+/))].join(' ') : existingDescription
  const disabled = typeof child.type === 'string' && ['button', 'input', 'select', 'textarea'].includes(child.type) && !!(child.props as { disabled?: boolean }).disabled
  function scheduleHoverOpen(event: Event | undefined, delay: number) {
    window.clearTimeout(hoverOpenTimer.current ?? undefined)
    const claimedGeneration = generation.current
    hoverOpenTimer.current = window.setTimeout(() => {
      hoverOpenTimer.current = null
      if (coordinator.getSnapshot().generation === claimedGeneration) floating.context.onOpenChange(true, event, 'hover')
    }, delay)
  }
  const claimOnEnter = (event: React.MouseEvent<HTMLElement>) => {
    if (nearestTrigger(event.target, event.currentTarget)) {
      window.clearTimeout(hoverOpenTimer.current ?? undefined)
      hoverReadyAt.current = Date.now() + 300
      generation.current = coordinator.claim(id)
    }
  }
  const reclaimFromNestedTrigger = (event: React.MouseEvent<HTMLElement>) => {
    if (!nearestTrigger(event.target, event.currentTarget) || !(event.relatedTarget instanceof Element)
      || !event.currentTarget.contains(event.relatedTarget) || nearestTrigger(event.relatedTarget, event.currentTarget)) return
    claimOnEnter(event)
    // Native mouseenter does not fire when returning from a nested trigger.
    scheduleHoverOpen(event.nativeEvent, 300)
  }
  const leaveReference = () => {
    window.clearTimeout(hoverOpenTimer.current ?? undefined)
    if (coordinator.getSnapshot().openId !== id) coordinator.close(id, 'leave')
  }
  const referenceProps = getReferenceProps(disabled ? { onMouseEnter: claimOnEnter, onMouseOver: reclaimFromNestedTrigger, onMouseLeave: leaveReference } : {
    ...child.props,
    onMouseEnter(event: React.MouseEvent<HTMLElement>) {
      child.props.onMouseEnter?.(event)
      claimOnEnter(event)
    },
    onMouseOver(event: React.MouseEvent<HTMLElement>) {
      child.props.onMouseOver?.(event)
      reclaimFromNestedTrigger(event)
    },
    onMouseLeave(event: React.MouseEvent<HTMLElement>) {
      child.props.onMouseLeave?.(event)
      leaveReference()
    },
  })
  const trigger = disabled
    ? <DisabledTooltipAnchor {...referenceProps} ref={floating.refs.setReference} className={disabledAnchorClassName} style={disabledAnchorStyle} data-tooltip-trigger={id} aria-describedby={undefined}>
      {cloneElement(child, { 'aria-describedby': describedBy })}
    </DisabledTooltipAnchor>
    : cloneElement(child, { ...referenceProps, ref: mergedRef, 'data-tooltip-trigger': id, 'aria-describedby': describedBy } as TriggerProps)
  return <>{trigger}{isMounted && !hiddenExit.current && <FloatingPortal>
    <div ref={floating.refs.setFloating} style={floating.floatingStyles} className="tooltip-positioner" {...getFloatingProps({ id, tabIndex: undefined, 'aria-hidden': open ? undefined : true })}>
      <div className="branchline-tooltip" style={transitionStyles}>{content}<FloatingArrow ref={arrowRef} context={floating.context} width={8} height={4} fill="#242424"/></div>
    </div>
  </FloatingPortal>}</>
}
