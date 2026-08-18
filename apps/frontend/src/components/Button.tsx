import { forwardRef, type ButtonHTMLAttributes } from 'react'

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

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & ButtonClassNameOptions

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant, size, active, className, ...props }, ref) {
  return <button ref={ref} className={buttonClassName({ variant, size, active, className })} {...props} />
})
