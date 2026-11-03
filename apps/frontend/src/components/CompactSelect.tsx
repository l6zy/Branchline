import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown } from 'lucide-react'

type CompactSelectValue = string | number
export type CompactSelectOption<T extends CompactSelectValue> = { value: T; label: string }
type CompactSelectProps<T extends CompactSelectValue> = {
  value: T; options: CompactSelectOption<T>[]; onChange: (value: T) => void
  ariaLabel: string; className?: string; disabled?: boolean; title?: string
}
export function compactSelectOptionClassName(selected: boolean) {
  return ['compact-select-option', selected && 'selected'].filter(Boolean).join(' ')
}
export function CompactSelect<T extends CompactSelectValue>({ value, options, onChange, ariaLabel, className, disabled = false, title }: CompactSelectProps<T>) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const listId = useId()
  const selected = options.find((option) => option.value === value)
  const close = () => { setOpen(false); triggerRef.current?.focus() }
  const begin = () => { setHighlight(Math.max(0, options.findIndex(option => option.value === value))); setOpen(true) }
  useEffect(() => { if (open) optionRefs.current[highlight]?.focus() }, [open, highlight])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  return <div ref={rootRef} className={['compact-select', open && 'open', className].filter(Boolean).join(' ')} onKeyDown={(event) => {
    if (disabled) return
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close() }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      if (!open) begin()
      else setHighlight(current => event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
    }
    if (event.key === 'Tab') setOpen(false)
  }}>
    <button ref={triggerRef} type="button" className="compact-select-trigger" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-label={ariaLabel} disabled={disabled} title={title ?? selected?.label} onClick={() => open ? close() : begin()}>
      <span>{selected?.label ?? t('select')}</span><ChevronDown size={14}/>
    </button>
    {open && <div id={listId} className="compact-select-popover" role="listbox" aria-label={ariaLabel}>
      {options.map((option, index) => {
        const isSelected = option.value === value
        return <button ref={element => { optionRefs.current[index] = element }} tabIndex={-1} type="button" key={String(option.value)} role="option" aria-selected={isSelected} className={compactSelectOptionClassName(isSelected)} title={option.label} onClick={() => { onChange(option.value); close() }}>
          <span>{option.label}</span>{isSelected && <Check size={14}/>}
        </button>
      })}
    </div>}
  </div>
}
