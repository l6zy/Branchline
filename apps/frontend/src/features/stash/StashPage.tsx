import { useState } from 'react'
import { Archive, Check, CornerDownLeft, GitCommitHorizontal, Plus, Trash2 } from 'lucide-react'
import {
  applyRepositoryStash,
  createRepositoryStash,
  dropRepositoryStash,
  type RepositorySnapshot,
} from '../../repository'
import { formatLocalDateTime } from '../../dateTime'
import { Button } from '../../components/Button'

export function StashPage({ repository, onSelectStash, onSnapshot, onNotice }: { repository: RepositorySnapshot | null; onSelectStash: (reference: string) => void; onSnapshot: (snapshot: RepositorySnapshot) => void; onNotice: (message: string) => void }) {
  const [message, setMessage] = useState('')
  const [includeUntracked, setIncludeUntracked] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const run = async (key: string, operation: () => Promise<RepositorySnapshot>, notice: string) => {
    if (!repository) return onNotice('Stash 需要先打开本地仓库')
    setBusy(key)
    try {
      const snapshot = await operation()
      onSnapshot(snapshot)
      onNotice(snapshot.operation
        ? `${snapshot.operation.label}：请处理 ${snapshot.operation.conflicts.length} 个冲突文件`
        : notice)
    } catch (error) {
      onNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }
  const selectStash = (reference: string) => {
    onSelectStash(reference)
  }

  return <section className="workspace-page stash-page">
    <div className="stash-workspace stash-manager">
      <div className="stash-control-pane">
        <div className="stash-compose"><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="可选：输入 Stash 说明"/><label><input type="checkbox" checked={includeUntracked} onChange={(event) => setIncludeUntracked(event.target.checked)}/>包含未跟踪文件</label><Button variant="primary" disabled={!repository || busy !== null} onClick={() => void run('create', () => createRepositoryStash(repository!.path, message, includeUntracked), '已保存工作区到 Stash')}><Plus size={14}/>{busy === 'create' ? '正在保存…' : '创建 Stash'}</Button></div>
        <div className="stash-list-heading"><strong>已保存的工作区</strong><span>{repository?.stashes.length ?? 0}</span></div>
        <div className="stash-list">{repository?.stashes.map((stash) => <article key={stash.reference}>
          <button className="stash-select" onClick={() => selectStash(stash.reference)} title="在提交图谱中查看"><span className="stash-icon"><Archive size={15}/></span><span><strong>{stash.message}</strong><small>{stash.reference} · {stash.author} · {formatLocalDateTime(stash.time)}</small></span></button>
          <div className="stash-actions"><Button variant="icon" disabled={busy !== null} title="应用并保留" onClick={() => void run(`apply-${stash.reference}`, () => applyRepositoryStash(repository.path, stash.reference, false), `已应用 ${stash.reference}`)}><Check size={13}/></Button><Button variant="icon" disabled={busy !== null} title="弹出并删除" onClick={() => void run(`pop-${stash.reference}`, () => applyRepositoryStash(repository.path, stash.reference, true), `已弹出 ${stash.reference}`)}><CornerDownLeft size={13}/></Button><Button variant="danger" disabled={busy !== null} title="删除" onClick={() => { if (window.confirm(`确定删除 ${stash.reference}？`)) void run(`drop-${stash.reference}`, () => dropRepositoryStash(repository.path, stash.reference), `已删除 ${stash.reference}`) }}><Trash2 size={13}/></Button></div>
        </article>)}
          {repository && repository.stashes.length === 0 && <div className="workspace-hint"><Archive size={26}/><strong>暂无 Stash</strong><span>保存当前工作区后会显示在这里。</span></div>}
          {!repository && <div className="workspace-hint"><Archive size={26}/><strong>请先打开本地仓库</strong></div>}
        </div>
      </div>
      <div className="stash-graph-handoff">
        <GitCommitHorizontal size={32}/><strong>Stash 已并入提交图谱</strong><span>选择左侧任意 Stash，会回到对应图谱节点；文件列表和 Diff 都在统一的右侧详情中查看。</span>
      </div>
    </div>
  </section>
}
