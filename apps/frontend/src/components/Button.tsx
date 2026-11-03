import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Tooltip, type TooltipProps } from './tooltip'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'icon'
export type ButtonSize = 'default' | 'compact'

export type ButtonClassNameOptions = {
  variant?: ButtonVariant
  size?: ButtonSize
  active?: boolean
  className?: string
}

export function buttonClassName({ variant = 'secondary', size, active, className }: ButtonClassNameOptions = {}) {
  return [
    'button',
    `button-${variant}`,
    size === 'compact' && 'button-compact',
    active && 'active',
    className,
  ].filter(Boolean).join(' ')
}

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'title'> & ButtonClassNameOptions & {
  tooltip?: string | null
} & Pick<TooltipProps, 'disabledAnchorClassName' | 'disabledAnchorStyle'>

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant, size, active, className, tooltip, disabledAnchorClassName, disabledAnchorStyle, ...props }, ref) {
  const button = <button ref={ref} className={buttonClassName({ variant, size, active, className })} {...props} />
  return tooltip ? <Tooltip content={tooltip} disabledAnchorClassName={disabledAnchorClassName} disabledAnchorStyle={disabledAnchorStyle}>{button}</Tooltip> : button
})
