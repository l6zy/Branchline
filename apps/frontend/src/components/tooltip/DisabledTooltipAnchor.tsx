import { cloneElement, forwardRef, type CSSProperties, type HTMLAttributes, type ReactElement } from 'react'

type DisabledTooltipAnchorProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactElement<{ style?: CSSProperties }>
}

export const DisabledTooltipAnchor = forwardRef<HTMLSpanElement, DisabledTooltipAnchorProps>(function DisabledTooltipAnchor({ children, className, ...props }, ref) {
  return <span {...props} ref={ref} className={['tooltip-disabled-anchor', className].filter(Boolean).join(' ')}>
    {cloneElement(children, { style: { ...children.props.style, pointerEvents: 'none' } })}
  </span>
})
