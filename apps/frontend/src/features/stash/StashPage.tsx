import { useCallback, useEffect, useState } from 'react'
import { Archive, Check, CornerDownLeft, FileCode2, Plus, Trash2 } from 'lucide-react'
import {
  applyRepositoryStash,
  createRepositoryStash,
  dropRepositoryStash,
  loadRepositoryStashFileDiff,
  loadRepositoryStashFiles,
  type RepositoryFile,
  type RepositorySnapshot,
} from '../../repository'
import { DiffPanel } from '../diff/DiffPanel'

export function StashPage({ repository, onSnapshot, onNotice }: { repository: RepositorySnapshot | null; onSnapshot: (snapshot: RepositorySnapshot) => void; onNotice: (message: string) => void }) {
  const [message, setMessage] = useState('')
  const [includeUntracked, setIncludeUntracked] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [selectedReference, setSelectedReference] = useState<string | null>(null)
  const [stashFiles, setStashFiles] = useState<RepositoryFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesError, setFilesError] = useState<string | null>(null)
  const [widePreview, setWidePreview] = useState(false)

  useEffect(() => {
    const stashes = repository?.stashes ?? []
    if (!selectedReference || !stashes.some((stash) => stash.reference === selectedReference)) setSelectedReference(stashes[0]?.reference ?? null)
  }, [repository?.stashes, selectedReference])
  useEffect(() => {
    if (!repository || !selectedReference) {
      setStashFiles([])
      setFilesError(null)
      return
    }
    let cancelled = false
    setFilesLoading(true)
    setFilesError(null)
    loadRepositoryStashFiles(repository.path, selectedReference)
      .then((files) => { if (!cancelled) setStashFiles(files) })
      .catch((error) => { if (!cancelled) setFilesError(error instanceof Error ? error.message : String(error)) })
      .finally(() => { if (!cancelled) setFilesLoading(false) })
    return () => { cancelled = true }
  }, [repository?.path, selectedReference])
  const loadRows = useCallback((filePath: string) => repository && selectedReference ? loadRepositoryStashFileDiff(repository.path, selectedReference, filePath) : Promise.resolve([]), [repository?.path, selectedReference])
  const run = async (key: string, operation: () => Promise<RepositorySnapshot>, notice: string) => {
    if (!repository) return onNotice('Stash 需要先打开本地仓库')
    setBusy(key)
    try {
      onSnapshot(await operation())
      onNotice(notice)
    } catch (error) {
      onNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  return <section className="workspace-page stash-page">
    <div className={`stash-workspace ${widePreview ? 'preview-wide' : ''}`}>
      <div className="stash-control-pane">
        <div className="stash-compose"><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="可选：输入 Stash 说明"/><label><input type="checkbox" checked={includeUntracked} onChange={(event) => setIncludeUntracked(event.target.checked)}/>包含未跟踪文件</label><button className="primary-button" disabled={!repository || busy !== null} onClick={() => void run('create', () => createRepositoryStash(repository!.path, message, includeUntracked), '已保存工作区到 Stash')}><Plus size={14}/>{busy === 'create' ? '正在保存…' : '创建 Stash'}</button></div>
        <div className="stash-list-heading"><strong>已保存的工作区</strong><span>{repository?.stashes.length ?? 0}</span></div>
        <div className="stash-list">{repository?.stashes.map((stash) => <article className={selectedReference === stash.reference ? 'active' : ''} key={stash.reference}>
          <button className="stash-select" onClick={() => { setSelectedReference(stash.reference); setWidePreview(false) }}><span className="stash-icon"><Archive size={15}/></span><span><strong>{stash.message}</strong><small>{stash.reference} · {stash.author} · {stash.time}</small></span></button>
          <div className="stash-actions"><button disabled={busy !== null} title="应用并保留" onClick={() => void run(`apply-${stash.reference}`, () => applyRepositoryStash(repository.path, stash.reference, false), `已应用 ${stash.reference}`)}><Check size={13}/></button><button disabled={busy !== null} title="弹出并删除" onClick={() => void run(`pop-${stash.reference}`, () => applyRepositoryStash(repository.path, stash.reference, true), `已弹出 ${stash.reference}`)}><CornerDownLeft size={13}/></button><button className="danger" disabled={busy !== null} title="删除" onClick={() => { if (window.confirm(`确定删除 ${stash.reference}？`)) void run(`drop-${stash.reference}`, () => dropRepositoryStash(repository.path, stash.reference), `已删除 ${stash.reference}`) }}><Trash2 size={13}/></button></div>
        </article>)}
          {repository && repository.stashes.length === 0 && <div className="workspace-hint"><Archive size={26}/><strong>暂无 Stash</strong><span>保存当前工作区后会显示在这里。</span></div>}
          {!repository && <div className="workspace-hint"><Archive size={26}/><strong>请先打开本地仓库</strong></div>}
        </div>
      </div>
      <div className="stash-preview-pane">
        {filesLoading && <div className="drawer-preview-empty"><Archive size={28}/><strong>正在读取 Stash…</strong></div>}
        {filesError && <div className="drawer-preview-empty error"><Archive size={28}/><strong>无法读取 Stash</strong><span>{filesError}</span></div>}
        {!filesLoading && !filesError && selectedReference && stashFiles.length > 0 && <DiffPanel key={selectedReference} files={stashFiles} repositoryPath={repository?.path} wide={widePreview} onWideChange={setWidePreview} loadRows={loadRows}/>} 
        {!filesLoading && !filesError && selectedReference && stashFiles.length === 0 && <div className="drawer-preview-empty"><FileCode2 size={30}/><strong>该 Stash 没有文本变更</strong></div>}
        {!selectedReference && <div className="drawer-preview-empty"><Archive size={30}/><strong>选择 Stash 查看内容</strong><span>文件列表和完整 Diff 会显示在这里。</span></div>}
      </div>
    </div>
  </section>
}
