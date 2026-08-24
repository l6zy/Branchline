import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CircleHelp } from 'lucide-react'
import { Button, type ButtonVariant } from './Button'

export type ConfirmDialogOptions = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: Exclude<ButtonVariant, 'icon'>
}

type ConfirmRequest = ConfirmDialogOptions & { id: number }

export function ConfirmDialog({ request, onResolve }: { request: ConfirmRequest | null; onResolve: (result: boolean) => void }) {
  useEffect(() => {
    if (!request) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onResolve(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onResolve, request])
  if (!request) return null
  const destructive = request.variant === 'danger'
  return <div className="modal-backdrop confirm-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onResolve(false) }}>
    <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby={`confirm-dialog-title-${request.id}`} onPointerDown={(event) => event.stopPropagation()}>
      <div className={`confirm-dialog-icon ${destructive ? 'danger' : ''}`}>{destructive ? <AlertTriangle size={19}/> : <CircleHelp size={19}/>}</div>
      <div className="confirm-dialog-content">
        <h2 id={`confirm-dialog-title-${request.id}`}>{request.title ?? (destructive ? '确认操作' : '请确认')}</h2>
        <p>{request.message}</p>
      </div>
      <div className="confirm-dialog-actions">
        <Button variant="secondary" onClick={() => onResolve(false)}>{request.cancelLabel ?? '取消'}</Button>
        <Button variant={request.variant ?? 'primary'} onClick={() => onResolve(true)}>{request.confirmLabel ?? '确认'}</Button>
      </div>
    </section>
  </div>
}

export function useConfirmDialog() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const resolverRef = useRef<((result: boolean) => void) | null>(null)
  const sequenceRef = useRef(0)
  const confirm = useCallback((options: ConfirmDialogOptions | string) => new Promise<boolean>((resolve) => {
    resolverRef.current?.(false)
    resolverRef.current = resolve
    sequenceRef.current += 1
    setRequest({ ...(typeof options === 'string' ? { message: options } : options), id: sequenceRef.current })
  }), [])
  const resolve = useCallback((result: boolean) => {
    resolverRef.current?.(result)
    resolverRef.current = null
    setRequest(null)
  }, [])
  return { confirm, confirmDialog: <ConfirmDialog request={request} onResolve={resolve}/> }
}
