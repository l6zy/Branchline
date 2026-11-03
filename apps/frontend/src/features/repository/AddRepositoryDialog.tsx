import { errorMessage, renderMessage, type MessageContent } from '../../i18n/messages'
import { useAppTranslation } from '../../i18n/useAppTranslation'
import { useEffect, useRef, useState } from 'react'
import { CloudDownload, FolderGit2, FolderOpen, Plus, RefreshCw, X } from 'lucide-react'
import { Button } from '../../components/Button'
import { createRepository, pickRepositoryDirectory, type RepositoryDetails } from '../../repository'

export function AddRepositoryDialog({ mode, initialParent, onClose, onCreated }: {
  mode: 'clone' | 'init'
  initialParent: string
  onClose: () => void
  onCreated: (repository: RepositoryDetails) => void
}) {
  const { t } = useAppTranslation()
  const [source, setSource] = useState('')
  const [parent, setParent] = useState(initialParent)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<MessageContent | null>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const destination = parent ? `${parent.replace(/[\\/]+$/, '')}${parent.includes('\\') ? '\\' : '/'}${name}` : ''
  const validName = Boolean(name.trim()) && !/^[.]+$|[<>:"/\\|?*\x00-\x1f]|[. ]$/.test(name)
  const canSubmit = validName && Boolean(parent.trim()) && (mode !== 'clone' || Boolean(source.trim()))
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector('input')?.focus()
    return () => { if (previousFocus?.isConnected) previousFocus.focus() }
  }, [])
  useEffect(() => {
    if (!busy && !dialogRef.current?.contains(document.activeElement)) dialogRef.current?.querySelector('input')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (!busy) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  const browse = async () => {
    try {
      const path = await pickRepositoryDirectory(t('repository:add.parentPicker'))
      if (path) setParent(path)
    } catch (error) { setError(errorMessage(error)) }
  }
  const submit = async () => {
    if (!canSubmit || busy) return
    setBusy(true)
    setError(null)
    try { onCreated(await createRepository(destination, mode === 'clone' ? source.trim() : null)) }
    catch (error) { setError(errorMessage(error)); setBusy(false) }
  }

  return <div className="modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section ref={dialogRef} className="branch-dialog repository-add-dialog" role="dialog" aria-modal="true" aria-labelledby="repository-add-title" onKeyDown={(event) => {
      if (event.key === 'Tab') {
        const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled)') ?? [])
        const target = event.shiftKey ? items[items.length - 1] : items[0]
        if (document.activeElement === (event.shiftKey ? items[0] : items[items.length - 1])) { event.preventDefault(); target?.focus() }
      }
    }}>
      <div className="branch-dialog-heading"><span className="branch-dialog-icon"><FolderGit2 size={19}/></span><div><h2 id="repository-add-title">{mode === 'clone' ? t('repository:add.clone') : t('repository:add.initialize')}</h2><p>{mode === 'clone' ? t('repository:add.cloneHint') : t('repository:add.initializeHint')}</p></div><Button variant="icon" tooltip={t('repository:close')} disabledAnchorStyle={{ marginLeft: 'auto' }} aria-label={t('repository:close')} disabled={busy} onClick={onClose}><X size={17}/></Button></div>
      <form onSubmit={(event) => { event.preventDefault(); void submit() }}>
        {mode === 'clone' && <label>{t('repository:add.source')}<input value={source} onChange={(event) => setSource(event.target.value)} onBlur={() => {
          if (!name) setName(source.trim().replace(/[\\/]+$/, '').split(/[/:\\]/).pop()?.replace(/\.git$/, '') ?? '')
        }} placeholder={t('repository:add.sourcePlaceholder')} spellCheck={false} disabled={busy}/></label>}
        <label>{t('repository:add.parent')}<span className="repository-directory-input"><input value={parent} onChange={(event) => setParent(event.target.value)} placeholder={t('repository:add.parentPlaceholder')} disabled={busy}/><Button type="button" variant="secondary" onClick={() => void browse()} disabled={busy} tooltip={t('repository:add.selectParent')} aria-label={t('repository:add.selectParent')}><FolderOpen size={15}/></Button></span></label>
        <label>{t('repository:add.name')}<input value={name} onChange={(event) => setName(event.target.value)} placeholder="my-project" spellCheck={false} disabled={busy}/></label>
        <div className="repository-destination"><span>{t('repository:add.destination')}</span><code>{destination || t('repository:add.destinationPlaceholder')}</code><small>{t('repository:add.destinationHint')}</small></div>
        {error && <p className="repository-inline-error" role="alert">{renderMessage(error, t)}</p>}
        <div className="branch-dialog-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>{t('repository:cancel')}</Button><Button type="submit" variant="primary" disabled={!canSubmit || busy}>{busy ? <RefreshCw size={14} className="spin"/> : mode === 'clone' ? <CloudDownload size={14}/> : <Plus size={14}/>}<span>{busy ? (mode === 'clone' ? t('repository:add.cloning') : t('repository:add.creating')) : mode === 'clone' ? t('repository:add.clone') : t('repository:add.create')}</span></Button></div>
      </form>
    </section>
  </div>
}
