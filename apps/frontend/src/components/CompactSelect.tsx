import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

type CompactSelectValue = string | number

export type CompactSelectOption<T extends CompactSelectValue> = {
  value: T
  label: string
}

type CompactSelectProps<T extends CompactSelectValue> = {
  value: T
  options: CompactSelectOption<T>[]
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
  disabled?: boolean
  title?: string
}

export function compactSelectOptionClassName(selected: boolean) {
  return ['compact-select-option', selected && 'selected'].filter(Boolean).join(' ')
}

export function CompactSelect<T extends CompactSelectValue>({ value, options, onChange, ariaLabel, className, disabled = false, title }: CompactSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) return
    const closeWhenOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeWhenOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeWhenOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return <div ref={rootRef} className={['compact-select', open && 'open', className].filter(Boolean).join(' ')}>
    <button type="button" className="compact-select-trigger" aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} disabled={disabled} title={title ?? selected?.label} onClick={() => setOpen((current) => !current)}>
      <span>{selected?.label ?? '请选择'}</span><ChevronDown size={14}/>
    </button>
    {open && <div className="compact-select-popover" role="listbox" aria-label={ariaLabel}>
      {options.map((option) => {
        const isSelected = option.value === value
        return <button type="button" key={String(option.value)} role="option" aria-selected={isSelected} className={compactSelectOptionClassName(isSelected)} title={option.label} onClick={() => { onChange(option.value); setOpen(false) }}>
          <span>{option.label}</span>{isSelected && <Check size={14}/>} 
        </button>
      })}
    </div>}
  </div>
}
