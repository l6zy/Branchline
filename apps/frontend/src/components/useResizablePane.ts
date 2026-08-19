import { useCallback, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { usePersistentState } from '../persistentState'

type Axis = 'horizontal' | 'vertical'

export function useResizablePane(key: string, initialValue: number, minimum: number, maximum: number, axis: Axis, direction = 1) {
  const [value, setValue] = usePersistentState(key, initialValue, (candidate): candidate is number => typeof candidate === 'number' && candidate >= minimum && candidate <= maximum)
  const [resizing, setResizing] = useState(false)

  const beginResize = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault()
    const start = axis === 'horizontal' ? event.clientX : event.clientY
    const startValue = value
    setResizing(true)
    const onMove = (moveEvent: PointerEvent) => {
      const coordinate = axis === 'horizontal' ? moveEvent.clientX : moveEvent.clientY
      setValue(Math.min(maximum, Math.max(minimum, startValue + (coordinate - start) * direction)))
    }
    const onUp = () => {
      setResizing(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [axis, direction, maximum, minimum, setValue, value])

  return { value, resizing, beginResize }
}
