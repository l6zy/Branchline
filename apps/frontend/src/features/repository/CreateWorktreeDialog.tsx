import { useEffect, useState } from 'react'
import { GitFork, X } from 'lucide-react'
import { Button } from '../../components/Button'

export function CreateWorktreeDialog({ branches, busy, onClose, onSubmit }: {
  branches: string[]
  busy: boolean
  onClose: () => void
  onSubmit: (path: string, branch: string, createBranch: boolean) => Promise<void>
}) {
  const [path, setPath] = useState('')
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [branch, setBranch] = useState(branches[0] ?? '')
  useEffect(() => { if (mode === 'existing' && !branches.includes(branch)) setBranch(branches[0] ?? '') }, [branch, branches, mode])
  const valid = path.trim().length > 0 && branch.trim().length > 0
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="branch-dialog worktree-dialog" role="dialog" aria-modal="true" aria-label="创建 Worktree">
      <div className="branch-dialog-heading"><span className="branch-dialog-icon"><GitFork size={18}/></span><div><h2>创建 Worktree</h2><p>选择现有分支，或基于当前 HEAD 创建新分支。</p></div><Button variant="icon" onClick={onClose} disabled={busy} title="关闭"><X size={16}/></Button></div>
      <form onSubmit={(event) => { event.preventDefault(); if (valid) void onSubmit(path.trim(), branch.trim(), mode === 'new') }}>
        <label>目标目录</label><div className="branch-name-input"><input autoFocus value={path} onChange={(event) => setPath(event.target.value)} placeholder="例如 E:\\code\\mono-web-feature"/></div>
        <label>分支方式</label><div className="segmented worktree-mode"><button type="button" className={mode === 'existing' ? 'active' : ''} onClick={() => { setMode('existing'); setBranch(branches[0] ?? '') }}>使用现有分支</button><button type="button" className={mode === 'new' ? 'active' : ''} onClick={() => { setMode('new'); setBranch('') }}>创建新分支</button></div>
        <label>{mode === 'existing' ? '本地分支' : '新分支名'}</label>{mode === 'existing' ? <select className="worktree-branch-select" value={branch} onChange={(event) => setBranch(event.target.value)}>{branches.map((item) => <option key={item} value={item}>{item}</option>)}</select> : <div className="branch-name-input"><input value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="feat/new-worktree"/></div>}
        <div className="branch-dialog-hint">Worktree 移除不会使用强制模式，脏工作区会由 Git 拒绝。</div>
        <div className="branch-dialog-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>取消</Button><Button type="submit" variant="primary" disabled={!valid || busy}>{busy ? '正在创建…' : '创建 Worktree'}</Button></div>
      </form>
    </section>
  </div>
}
