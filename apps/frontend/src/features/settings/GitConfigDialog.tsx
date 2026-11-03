import { errorMessage, message, renderMessage, type MessageContent } from '../../i18n/messages'
import { useAppTranslation } from '../../i18n/useAppTranslation'
import { useEffect, useRef, useState } from 'react'
import { FileText, GitBranch, Mail, RefreshCw, Settings2, User, X } from 'lucide-react'
import { loadGitUserConfig, updateGitUserConfig, type GitUserConfig } from '../../repository'
import { Button } from '../../components/Button'

type GitConfigDialogProps = {
  open: boolean
  onClose: () => void
  onNotice: (message: MessageContent) => void
}

const emptyConfig: GitUserConfig = {
  userName: '',
  userEmail: '',
  defaultBranch: 'main',
  autocrlf: 'false',
  pullStrategy: 'merge',
  commitTemplateContent: '',
}

export function GitConfigDialog({ open, onClose, onNotice }: GitConfigDialogProps) {
  const { t } = useAppTranslation()
  const [config, setConfig] = useState<GitUserConfig>(emptyConfig)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<MessageContent | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    loadGitUserConfig()
      .then((value) => {
        setConfig(value)
        requestAnimationFrame(() => nameRef.current?.focus())
      })
      .catch((reason) => setError(errorMessage(reason)))
      .finally(() => setLoading(false))
  }, [open])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, open, saving])

  if (!open) return null
  const save = async () => {
    if (!config.userName.trim()) return setError(message('settings:git.validation.name'))
    if (!config.userEmail.includes('@')) return setError(message('settings:git.validation.email'))
    if (!config.defaultBranch.trim()) return setError(message('settings:git.validation.branch'))
    setSaving(true)
    setError(null)
    try {
      setConfig(await updateGitUserConfig({
        ...config,
        userName: config.userName.trim(),
        userEmail: config.userEmail.trim(),
        defaultBranch: config.defaultBranch.trim(),
        commitTemplateContent: config.commitTemplateContent ?? '',
      }))
      onNotice(message('settings:git.saved'))
      onClose()
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setSaving(false)
    }
  }

  return <div className="modal-backdrop" onPointerDown={() => { if (!saving) onClose() }}>
    <section className="git-config-dialog" role="dialog" aria-modal="true" aria-labelledby="git-config-title" onPointerDown={(event) => event.stopPropagation()}>
      <div className="git-config-heading"><span className="git-config-icon"><Settings2 size={18}/></span><div><h2 id="git-config-title">{t('settings:git.title')}</h2><p>{t('settings:git.description')}</p></div><Button variant="icon" onClick={onClose} disabled={saving} tooltip={t('settings:close')} aria-label={t('settings:close')}><X size={17}/></Button></div>
      <form onSubmit={(event) => { event.preventDefault(); void save() }}>
        {loading ? <div className="git-config-loading"><RefreshCw className="spin" size={18}/><span>{t('settings:git.loading')}</span></div> : <>
          <div className="git-config-section"><div className="git-config-section-title"><User size={14}/><div><strong>{t('settings:git.identity')}</strong><span>{t('settings:git.identityHint')}</span></div></div><div className="git-config-fields"><label><span>{t('settings:git.username')}</span><div className="git-config-input"><User size={14}/><input ref={nameRef} value={config.userName} onChange={(event) => setConfig((value) => ({ ...value, userName: event.target.value }))} placeholder={t('settings:git.namePlaceholder')} autoComplete="off"/></div></label><label><span>{t('settings:git.email')}</span><div className="git-config-input"><Mail size={14}/><input value={config.userEmail} onChange={(event) => setConfig((value) => ({ ...value, userEmail: event.target.value }))} placeholder="name@example.com" autoComplete="email" spellCheck={false}/></div></label></div></div>
          <div className="git-config-section"><div className="git-config-section-title"><GitBranch size={14}/><div><strong>{t('settings:git.defaults')}</strong><span>{t('settings:git.defaultsHint')}</span></div></div><div className="git-config-fields"><label><span>{t('settings:git.defaultBranch')}</span><div className="git-config-input"><GitBranch size={14}/><input value={config.defaultBranch} onChange={(event) => setConfig((value) => ({ ...value, defaultBranch: event.target.value }))} placeholder="main" spellCheck={false}/></div></label><label><span>{t('settings:git.lineEndings')}</span><div className="git-config-choice">{([['true', t('settings:git.windows')], ['input', t('settings:git.convertOnCommit')], ['false', t('settings:git.noConversion')]] as const).map(([value, label]) => <button type="button" aria-label={label} className={config.autocrlf === value ? 'active' : ''} key={value} onClick={() => setConfig((current) => ({ ...current, autocrlf: value }))}>{label}</button>)}</div></label><label><span>{t('settings:git.pullStrategy')}</span><div className="git-config-choice">{([['merge', t('settings:git.merge')], ['rebase', t('settings:git.rebase')], ['ff-only', t('settings:git.fastForwardOnly')]] as const).map(([value, label]) => <button type="button" aria-label={label} className={config.pullStrategy === value ? 'active' : ''} key={value} onClick={() => setConfig((current) => ({ ...current, pullStrategy: value }))}>{label}</button>)}</div></label></div></div>
          <div className="git-config-section"><div className="git-config-section-title"><FileText size={14}/><div><strong>{t('settings:git.template')}</strong><span>{t('settings:git.templateHint')}</span></div></div><label className="git-config-template-field"><textarea aria-label={t('settings:git.template')} value={config.commitTemplateContent ?? ''} onChange={(event) => setConfig((value) => ({ ...value, commitTemplateContent: event.target.value }))} placeholder={t('settings:git.templatePlaceholder')} spellCheck={false}/></label></div>
        </>}
        <div className="git-config-footer"><span className={error ? 'git-config-error' : ''}>{error ? renderMessage(error, t) : t('settings:git.storageHint')}</span><div><Button type="button" variant="secondary" onClick={onClose} disabled={saving}>{t('settings:cancel')}</Button><Button type="submit" variant="primary" disabled={loading || saving}>{saving ? t('settings:git.saving') : t('settings:git.save')}</Button></div></div>
      </form>
    </section>
  </div>
}
