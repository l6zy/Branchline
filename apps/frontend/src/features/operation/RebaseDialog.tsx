import { useEffect, useState } from 'react'
import { AlertTriangle, GitBranch, GitCommitHorizontal, GitPullRequest, X } from 'lucide-react'
import { previewRepositoryRebase, type RebasePreview, type RepositorySnapshot } from '../../repository'

export function RebaseDialog({ open, repository, onto, targetLabel, onClose, onStart }: { open: boolean; repository: RepositorySnapshot | null; onto: string | null; targetLabel: string; onClose: () => void; onStart: (onto: string) => Promise<void> }) {
  const [preview, setPreview] = useState<RebasePreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!open || !repository || !onto) return
    let cancelled = false
    setPreview(null)
    setError(null)
    setLoading(true)
    previewRepositoryRebase(repository.path, onto)
      .then((value) => { if (!cancelled) setPreview(value) })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, onto, repository?.path])
  if (!open || !repository || !onto) return null
  return <div className="modal-backdrop" onPointerDown={() => { if (!starting) onClose() }}><section className="rebase-dialog" role="dialog" aria-modal="true" aria-labelledby="rebase-title" onPointerDown={(event) => event.stopPropagation()}><div className="rebase-dialog-heading"><span className="rebase-dialog-icon"><GitPullRequest size={19}/></span><div><span className="eyebrow">变基预览</span><h2 id="rebase-title">将 {repository.branch} 变基到 {targetLabel}</h2><p>工作区必须保持干净。Git 会按线路逐个重放提交，遇到冲突可在操作中心继续处理。</p></div><button className="icon-button" onClick={onClose} disabled={starting} title="关闭"><X size={17}/></button></div>{loading && <div className="rebase-dialog-loading"><GitPullRequest size={20} className="spin"/>正在计算变基线路…</div>}{error && <div className="rebase-dialog-error"><AlertTriangle size={15}/>{error}</div>}{preview && <><div className="rebase-route-summary"><div><GitBranch size={15}/><span>{preview.branch}</span></div><span className="route-arrow">→</span><div><GitCommitHorizontal size={15}/><span>{preview.ontoShortHash}</span></div><small>{preview.steps.length} 个提交待重放</small></div><div className="rebase-preview-list"><div className="rebase-preview-heading"><strong>待重放提交</strong><span>{preview.steps.length} 个</span></div>{preview.steps.length ? preview.steps.map((step, index) => <div className="rebase-preview-step" key={step.hash}><span className="rebase-preview-index">{index + 1}</span><div><strong>{step.title}</strong><small>{step.shortHash} · {step.author}</small></div></div>) : <div className="rebase-dialog-empty">目标提交已经包含当前分支的全部提交，无需重放。</div>}</div></>}<div className="rebase-dialog-actions"><button className="secondary-button" onClick={onClose} disabled={starting}>取消</button><button className="primary-button" onClick={() => { if (!preview || !preview.steps.length) return; setStarting(true); void onStart(preview.onto).finally(() => setStarting(false)) }} disabled={loading || starting || !preview?.steps.length}><GitPullRequest size={14}/>{starting ? '正在开始…' : '开始变基'}</button></div></section></div>
}
