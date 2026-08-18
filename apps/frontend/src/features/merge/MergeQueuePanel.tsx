import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, GitBranch, GitMerge, RefreshCw } from 'lucide-react'
import { loadMergeQueue, type MergeQueueSnapshot, type RepositorySnapshot } from '../../repository'
import { Button } from '../../components/Button'

export function MergeQueuePanel({ repository, onNotice, onSwitchBranch }: { repository: RepositorySnapshot | null; onNotice: (message: string) => void; onSwitchBranch: (branch: string) => Promise<void> }) {
  const [queue, setQueue] = useState<MergeQueueSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const refresh = useCallback(async () => {
    if (!repository) return
    setLoading(true)
    try {
      setQueue(await loadMergeQueue(repository.path))
    } catch (error) {
      onNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }, [onNotice, repository?.path])
  useEffect(() => { setQueue(null); void refresh() }, [refresh])

  if (!repository) return <section className="workspace-empty"><GitMerge size={34}/><strong>合并队列</strong><span>打开本地仓库后，可查看候选分支、领先/落后状态和冲突文件。</span></section>
  return <section className="merge-panel workspace-page">
    <div className="workspace-page-heading"><div><span className="eyebrow">合并队列</span><h2>合并到 {repository.branch}</h2><p>按候选分支的新增提交数排序，已合并分支会单独标记。</p></div><Button variant="secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''}/>{loading ? '刷新中…' : '刷新队列'}</Button></div>
    {queue?.conflicts.length ? <div className="conflict-card"><AlertTriangle size={17}/><div><strong>{queue.conflicts.length} 个未解决冲突</strong>{queue.conflicts.map((path) => <code key={path}>{path}</code>)}</div></div> : <div className="queue-healthy"><Check size={14}/>当前工作区没有未解决冲突</div>}
    <div className="merge-list">
      <div className="merge-list-header"><span>候选分支</span><span>领先</span><span>落后</span><span>状态</span><span/></div>
      {queue?.candidates.map((candidate) => <div className="merge-row" key={candidate.branch}><div><GitBranch size={14}/><strong>{candidate.branch}</strong></div><span className="ahead-count">+{candidate.ahead}</span><span>{candidate.behind}</span><span className={candidate.merged ? 'merged-state' : 'ready-state'}>{candidate.merged ? '已合并' : candidate.ahead ? '可评估' : '无新增提交'}</span><button onClick={() => void onSwitchBranch(candidate.branch)}>切换到分支</button></div>)}
      {!loading && queue?.candidates.length === 0 && <div className="workspace-hint"><GitMerge size={26}/><strong>没有其他本地分支</strong><span>创建分支后会自动出现在这里。</span></div>}
    </div>
  </section>
}
