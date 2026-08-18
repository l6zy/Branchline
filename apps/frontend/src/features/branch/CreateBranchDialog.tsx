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

function validateBranchName(value: string) {
  if (!value) return '请输入分支名称'
  if (/\s/.test(value)) return '分支名称不能包含空格'
  if (value.startsWith('/') || value.endsWith('/') || value.includes('//')) return '分支路径格式不正确'
  if (value.includes('..') || /[~^:?*\[\\]/.test(value)) return '分支名称包含 Git 不支持的字符'
  if (value.endsWith('.') || value.endsWith('.lock')) return '分支名称不能以 . 或 .lock 结尾'
  return null
}

export function CreateBranchDialog({ open, prefix, currentBranch, onClose, onCreate }: CreateBranchDialogProps) {
  const [branch, setBranch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const error = useMemo(() => validateBranchName(branch.trim()), [branch])

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
    if (validateBranchName(value)) return
    setSubmitting(true)
    const created = await onCreate(value)
    setSubmitting(false)
    if (created) onClose()
  }

  return <div className="modal-backdrop" onPointerDown={() => { if (!submitting) onClose() }}>
    <section className="branch-dialog" role="dialog" aria-modal="true" aria-labelledby="create-branch-title" onPointerDown={(event) => event.stopPropagation()}>
      <div className="branch-dialog-heading"><span className="branch-dialog-icon"><GitBranch size={18}/></span><div><h2 id="create-branch-title">创建分支</h2><p>基于当前分支 <strong>{currentBranch}</strong> 创建，完成后仍停留在当前分支。</p></div><Button variant="icon" onClick={onClose} disabled={submitting} title="关闭"><X size={17}/></Button></div>
      <form onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <label htmlFor="new-branch-name">分支名称</label>
        <div className={`branch-name-input ${error && branch ? 'invalid' : ''}`}><GitBranch size={15}/><input ref={inputRef} id="new-branch-name" value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="例如 feat/1234" autoComplete="off" spellCheck={false}/></div>
        <div className="branch-dialog-hint">{error && branch ? <span className="error">{error}</span> : <span>支持使用斜杠整理分支，例如 feat/1234。</span>}</div>
        <div className="branch-dialog-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>取消</Button><Button type="submit" variant="primary" disabled={Boolean(error) || submitting}><GitBranch size={14}/>{submitting ? '正在创建…' : '创建分支'}</Button></div>
      </form>
    </section>
  </div>
}
