import { Trans } from 'react-i18next'
import { useAppTranslation, type AppTranslator } from '../../i18n/useAppTranslation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { GitBranch, X } from 'lucide-react'
import { Button } from '../../components/Button'

type CreateBranchDialogProps = {
  open: boolean
  prefix?: string
  currentBranch: string
  onClose: () => void
  onCreate: (branch: string) => Promise<boolean>
}

function validateBranchName(value: string, t: AppTranslator) {
  if (!value) return t('operations:branch.required')
  if (/\s/.test(value)) return t('operations:branch.noSpaces')
  if (value.startsWith('/') || value.endsWith('/') || value.includes('//')) return t('operations:branch.invalidPath')
  if (value.includes('..') || /[~^:?*\[\\]/.test(value)) return t('operations:branch.invalidCharacters')
  if (value.endsWith('.') || value.endsWith('.lock')) return t('operations:branch.invalidEnding')
  return null
}

export function CreateBranchDialog({ open, prefix, currentBranch, onClose, onCreate }: CreateBranchDialogProps) {
  const { t } = useAppTranslation()
  const [branch, setBranch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const error = useMemo(() => validateBranchName(branch.trim(), t), [branch, t])

  useEffect(() => {
    if (!open) return
    setBranch(prefix ? `${prefix}/` : '')
    setSubmitting(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open, prefix])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open, submitting])

  if (!open) return null
  const submit = async () => {
    const value = branch.trim()
    if (validateBranchName(value, t)) return
    setSubmitting(true)
    const created = await onCreate(value)
    setSubmitting(false)
    if (created) onClose()
  }

  return <div className="modal-backdrop" onPointerDown={() => { if (!submitting) onClose() }}>
    <section className="branch-dialog" role="dialog" aria-modal="true" aria-labelledby="create-branch-title" onPointerDown={(event) => event.stopPropagation()}>
      <div className="branch-dialog-heading"><span className="branch-dialog-icon"><GitBranch size={18}/></span><div><h2 id="create-branch-title">{t('operations:branch.create')}</h2><p><Trans t={t} i18nKey="operations:branch.description" values={{ branch: currentBranch }} components={{ strong: <strong/> }}/></p></div><Button variant="icon" onClick={onClose} disabled={submitting} tooltip={t('operations:close')} aria-label={t('operations:close')}><X size={17}/></Button></div>
      <form onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <label htmlFor="new-branch-name">{t('operations:branch.name')}</label>
        <div className={`branch-name-input ${error && branch ? 'invalid' : ''}`}><GitBranch size={15}/><input ref={inputRef} id="new-branch-name" value={branch} onChange={(event) => setBranch(event.target.value)} placeholder={t('operations:branch.placeholder')} autoComplete="off" spellCheck={false}/></div>
        <div className="branch-dialog-hint">{error && branch ? <span className="error">{error}</span> : <span>{t('operations:branch.hint')}</span>}</div>
        <div className="branch-dialog-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>{t('common:cancel')}</Button><Button type="submit" variant="primary" disabled={Boolean(error) || submitting}><GitBranch size={14}/>{submitting ? t('operations:branch.creating') : t('operations:branch.create')}</Button></div>
      </form>
    </section>
  </div>
}
