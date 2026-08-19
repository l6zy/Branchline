import { useEffect, useRef, useState } from 'react'
import { FileText, GitBranch, Mail, RefreshCw, Settings2, User, X } from 'lucide-react'
import { loadGitUserConfig, updateGitUserConfig, type GitUserConfig } from '../../repository'
import { Button } from '../../components/Button'

type GitConfigDialogProps = {
  open: boolean
  onClose: () => void
  onNotice: (message: string) => void
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
  const [config, setConfig] = useState<GitUserConfig>(emptyConfig)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
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
    if (!config.userName.trim()) return setError('请输入 Git 用户名')
    if (!config.userEmail.includes('@')) return setError('请输入有效的 Git 邮箱')
    if (!config.defaultBranch.trim()) return setError('请输入默认分支名')
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
      onNotice('本地 Git 配置已保存')
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }

  return <div className="modal-backdrop" onPointerDown={() => { if (!saving) onClose() }}>
    <section className="git-config-dialog" role="dialog" aria-modal="true" aria-labelledby="git-config-title" onPointerDown={(event) => event.stopPropagation()}>
      <div className="git-config-heading"><span className="git-config-icon"><Settings2 size={18}/></span><div><h2 id="git-config-title">本地 Git 配置</h2><p>管理当前系统的 Git 全局身份与常用默认行为。</p></div><Button variant="icon" onClick={onClose} disabled={saving} title="关闭"><X size={17}/></Button></div>
      <form onSubmit={(event) => { event.preventDefault(); void save() }}>
        {loading ? <div className="git-config-loading"><RefreshCw className="spin" size={18}/><span>正在读取 ~/.gitconfig…</span></div> : <>
          <div className="git-config-section"><div className="git-config-section-title"><User size={14}/><div><strong>提交身份</strong><span>将写入 user.name 与 user.email</span></div></div><div className="git-config-fields"><label><span>用户名</span><div className="git-config-input"><User size={14}/><input ref={nameRef} value={config.userName} onChange={(event) => setConfig((value) => ({ ...value, userName: event.target.value }))} placeholder="例如 Zhou Lei" autoComplete="off"/></div></label><label><span>邮箱</span><div className="git-config-input"><Mail size={14}/><input value={config.userEmail} onChange={(event) => setConfig((value) => ({ ...value, userEmail: event.target.value }))} placeholder="name@example.com" autoComplete="email" spellCheck={false}/></div></label></div></div>
          <div className="git-config-section"><div className="git-config-section-title"><GitBranch size={14}/><div><strong>仓库默认设置</strong><span>新仓库分支名、换行符与拉取策略</span></div></div><div className="git-config-fields"><label><span>默认分支名</span><div className="git-config-input"><GitBranch size={14}/><input value={config.defaultBranch} onChange={(event) => setConfig((value) => ({ ...value, defaultBranch: event.target.value }))} placeholder="main" spellCheck={false}/></div></label><label><span>换行符处理</span><div className="git-config-choice">{([['true', 'Windows'], ['input', '提交时转换'], ['false', '不转换']] as const).map(([value, label]) => <button type="button" className={config.autocrlf === value ? 'active' : ''} key={value} onClick={() => setConfig((current) => ({ ...current, autocrlf: value }))}>{label}</button>)}</div></label><label><span>拉取策略</span><div className="git-config-choice">{([['merge', '合并'], ['rebase', '变基'], ['ff-only', '仅快进']] as const).map(([value, label]) => <button type="button" className={config.pullStrategy === value ? 'active' : ''} key={value} onClick={() => setConfig((current) => ({ ...current, pullStrategy: value }))}>{label}</button>)}</div></label></div></div>
          <div className="git-config-section"><div className="git-config-section-title"><FileText size={14}/><div><strong>全局提交模板</strong><span>完整保留多行文本、空行和注释</span></div></div><label className="git-config-template-field"><textarea value={config.commitTemplateContent ?? ''} onChange={(event) => setConfig((value) => ({ ...value, commitTemplateContent: event.target.value }))} placeholder="例如：\n类型：\n说明：\n\n关联 Issue：" spellCheck={false}/></label></div>
        </>}
        <div className="git-config-footer"><span className={error ? 'git-config-error' : ''}>{error ?? '配置保存到 ~/.gitconfig，并应用于本机的所有仓库。'}</span><div><Button type="button" variant="secondary" onClick={onClose} disabled={saving}>取消</Button><Button type="submit" variant="primary" disabled={loading || saving}>{saving ? '正在保存…' : '保存配置'}</Button></div></div>
      </form>
    </section>
  </div>
}
