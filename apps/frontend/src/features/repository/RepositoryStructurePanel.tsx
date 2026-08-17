import { useState } from 'react'
import { Box, Check, ChevronRight, FolderGit2, GitFork, Lock, LockOpen, Plus, RefreshCw, RotateCcw, Tag, Trash2 } from 'lucide-react'
import {
  createRepositoryWorktree,
  deinitializeRepositorySubmodule,
  initializeRepositorySubmodule,
  pruneRepositoryWorktrees,
  removeRepositoryWorktree,
  setRepositoryWorktreeLock,
  syncRepositorySubmodules,
  updateRepositorySubmodule,
  type RepositorySnapshot,
} from '../../repository'
import { CreateWorktreeDialog } from './CreateWorktreeDialog'
import { submoduleAbsolutePath, type RepositoryStructureSelection } from './repositoryTree'

export type StructureView = 'structure' | 'tags'

const statusLabels = { ok: '正常', modified: '有修改', uninitialized: '未初始化', missing: '目录缺失', unknown: '未知' }
const samePath = (left: string, right: string) => left.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase() === right.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>
}

export function RepositoryStructurePanel({ repository, view, selection, onOpenPath, onOpenTag, onSnapshot, onNotice }: {
  repository: RepositorySnapshot | null
  view: StructureView
  selection: RepositoryStructureSelection
  onOpenPath: (path: string, kind: 'worktree' | 'submodule') => void
  onOpenTag: (tag: string) => void
  onSnapshot: (snapshot: RepositorySnapshot) => void
  onNotice: (message: string) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  if (!repository) return <section className="workspace-empty"><FolderGit2 size={34}/><strong>仓库结构</strong><span>请先打开本地仓库。</span></section>

  if (view === 'tags') return <section className="structure-panel workspace-page">
    <div className="workspace-page-heading"><div><span className="eyebrow">仓库结构</span><h2>标签</h2><p>按创建时间查看当前仓库中的标签。</p></div></div>
    <div className="structure-list">{repository.tags.map((tag) => <button className="tag-row" key={tag} onClick={() => onOpenTag(tag)} title={`定位到标签 ${tag} 指向的提交`}><span className="structure-icon"><Tag size={15}/></span><span><strong>{tag}</strong></span><ChevronRight size={15}/></button>)}{repository.tags.length === 0 && <div className="workspace-hint"><Tag size={26}/><strong>没有标签</strong></div>}</div>
  </section>

  const run = async (key: string, action: () => Promise<RepositorySnapshot>, notice: string) => {
    setBusy(key)
    try {
      const snapshot = await action()
      onSnapshot(snapshot)
      onNotice(notice)
      return true
    } catch (error) {
      onNotice(error instanceof Error ? error.message : String(error))
      return false
    } finally {
      setBusy(null)
    }
  }
  const worktree = selection.kind === 'worktree' ? repository.worktrees.find((item) => samePath(item.path, selection.path)) : undefined
  const submodule = selection.kind === 'submodule' ? repository.submodules.find((item) => item.path.replace(/\\/g, '/') === selection.path.replace(/\\/g, '/')) : undefined
  const folderSubmodules = selection.kind === 'submodule-folder' ? repository.submodules.filter((item) => item.path.replace(/\\/g, '/').startsWith(`${selection.path.replace(/\\/g, '/')}/`)) : []
  const currentWorktree = worktree ? samePath(worktree.path, repository.path) : false
  const availableSubmodule = submodule && submodule.status !== 'uninitialized' && submodule.status !== 'missing'
  const title = selection.kind === 'worktrees' ? 'Worktrees' : selection.kind === 'worktree' ? (worktree?.path.split(/[\\/]/).pop() || 'Worktree') : selection.kind === 'submodules' ? 'Submodules' : selection.kind === 'submodule-folder' ? selection.path : selection.kind === 'submodule' ? (submodule?.path || 'Submodule') : repository.name
  const description = selection.kind === 'worktrees' ? '管理同一仓库的多个工作目录。' : selection.kind === 'submodules' ? '初始化、更新和同步项目中的 Submodule。' : selection.kind === 'worktree' ? 'Worktree 详情与生命周期操作。' : selection.kind === 'submodule' ? 'Submodule 详情与生命周期操作。' : selection.kind === 'submodule-folder' ? '该路径下的 Submodule 汇总。' : '当前项目及其仓库结构概览。'

  return <section className="structure-panel workspace-page repository-structure-workspace">
    <div className="workspace-page-heading"><div><span className="eyebrow">仓库结构</span><h2>{title}</h2><p>{description}</p></div>{selection.kind === 'worktrees' && <button className="primary-button structure-heading-action" onClick={() => setCreateOpen(true)}><Plus size={14}/>创建 Worktree</button>}</div>

    {selection.kind === 'root' && <div className="structure-detail-grid">
      <article className="structure-detail-card"><span className="structure-icon"><FolderGit2 size={18}/></span><h3>{repository.name}</h3><dl><DetailField label="路径"><code>{repository.path}</code></DetailField><DetailField label="当前分支"><strong>{repository.branch}</strong></DetailField><DetailField label="Worktrees">{repository.worktreeCount}</DetailField><DetailField label="Submodules">{repository.submoduleCount}</DetailField><DetailField label="同步状态">领先 {repository.ahead} · 落后 {repository.behind}</DetailField></dl></article>
      <article className="structure-summary-card"><h3>状态汇总</h3><div><span>工作区变更</span><strong>{repository.files.length}</strong></div><div><span>已锁定 Worktree</span><strong>{repository.worktrees.filter((item) => item.locked).length}</strong></div><div><span>异常 Submodule</span><strong>{repository.submodules.filter((item) => item.status !== 'ok').length}</strong></div></article>
    </div>}

    {selection.kind === 'worktrees' && <div className="structure-detail-grid">
      <article className="structure-detail-card"><span className="structure-icon"><GitFork size={18}/></span><h3>Worktrees</h3><dl><DetailField label="总数">{repository.worktrees.length}</DetailField><DetailField label="Detached">{repository.worktrees.filter((item) => !item.branch).length}</DetailField><DetailField label="已锁定">{repository.worktrees.filter((item) => item.locked).length}</DetailField><DetailField label="可清理">{repository.worktrees.filter((item) => item.prunable).length}</DetailField></dl><div className="structure-actions"><button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={14}/>创建 Worktree</button><button className="secondary-button" disabled={busy !== null} onClick={() => void run('prune', () => pruneRepositoryWorktrees(repository.path), '已清理失效 Worktree 元数据')}><RotateCcw size={14}/>{busy === 'prune' ? '清理中…' : 'Prune'}</button></div></article>
    </div>}

    {selection.kind === 'worktree' && worktree && <div className="structure-detail-grid"><article className="structure-detail-card"><span className="structure-icon"><GitFork size={18}/></span><h3>{worktree.path.split(/[\\/]/).pop() || worktree.path}</h3><dl><DetailField label="目录"><code>{worktree.path}</code></DetailField><DetailField label="分支">{worktree.branch ?? 'Detached HEAD'}</DetailField><DetailField label="HEAD"><code>{worktree.head ?? '—'}</code></DetailField><DetailField label="状态">{currentWorktree ? '当前 Worktree' : worktree.locked ? `已锁定${worktree.locked ? `：${worktree.locked}` : ''}` : worktree.prunable ? `可清理：${worktree.prunable}` : '可用'}</DetailField></dl><div className="structure-actions"><button className="primary-button" disabled={currentWorktree} onClick={() => onOpenPath(worktree.path, 'worktree')}><FolderGit2 size={14}/>{currentWorktree ? '当前仓库' : '打开仓库'}</button><button className="secondary-button" disabled={busy !== null || currentWorktree} onClick={() => void run('lock', () => setRepositoryWorktreeLock(repository.path, worktree.path, !worktree.locked), worktree.locked ? '已解锁 Worktree' : '已锁定 Worktree')}>{worktree.locked ? <LockOpen size={14}/> : <Lock size={14}/>} {worktree.locked ? '解锁' : '锁定'}</button><button className="secondary-button danger-button" disabled={busy !== null || currentWorktree} onClick={() => { if (window.confirm(`确定移除 Worktree？\n${worktree.path}\n\n不会使用 --force，存在未提交修改时 Git 会拒绝。`)) void run('remove', () => removeRepositoryWorktree(repository.path, worktree.path), '已移除 Worktree') }}><Trash2 size={14}/>移除</button></div></article></div>}

    {(selection.kind === 'submodules' || selection.kind === 'submodule-folder') && <div className="structure-detail-grid"><article className="structure-detail-card"><span className="structure-icon"><Box size={18}/></span><h3>{selection.kind === 'submodules' ? 'Submodules' : selection.path}</h3><dl><DetailField label="总数">{selection.kind === 'submodules' ? repository.submodules.length : folderSubmodules.length}</DetailField><DetailField label="正常">{(selection.kind === 'submodules' ? repository.submodules : folderSubmodules).filter((item) => item.status === 'ok').length}</DetailField><DetailField label="有修改">{(selection.kind === 'submodules' ? repository.submodules : folderSubmodules).filter((item) => item.status === 'modified').length}</DetailField><DetailField label="未初始化/缺失">{(selection.kind === 'submodules' ? repository.submodules : folderSubmodules).filter((item) => item.status === 'uninitialized' || item.status === 'missing').length}</DetailField></dl><div className="structure-actions"><button className="primary-button" disabled={busy !== null} onClick={() => void run('update-all', () => updateRepositorySubmodule(repository.path), '已递归初始化并更新 Submodule')}><RefreshCw className={busy === 'update-all' ? 'spin' : ''} size={14}/>{busy === 'update-all' ? '更新中…' : '递归更新'}</button><button className="secondary-button" disabled={busy !== null} onClick={() => void run('sync', () => syncRepositorySubmodules(repository.path), '已同步 Submodule URL')}><RotateCcw size={14}/>同步 URL</button></div></article></div>}

    {selection.kind === 'submodule' && submodule && <div className="structure-detail-grid"><article className="structure-detail-card"><span className="structure-icon"><Box size={18}/></span><h3>{submodule.path}</h3><dl><DetailField label="相对路径"><code>{submodule.path}</code></DetailField><DetailField label="绝对路径"><code>{submoduleAbsolutePath(repository.path, submodule.path)}</code></DetailField><DetailField label="记录提交"><code>{submodule.hash}</code></DetailField><DetailField label="跟踪分支">{submodule.branch ?? '固定提交'}</DetailField><DetailField label="状态"><strong>{statusLabels[submodule.status]}</strong></DetailField></dl><div className="structure-actions"><button className="primary-button" disabled={!availableSubmodule} onClick={() => onOpenPath(submoduleAbsolutePath(repository.path, submodule.path), 'submodule')}><FolderGit2 size={14}/>打开仓库</button>{(submodule.status === 'uninitialized' || submodule.status === 'missing') && <button className="secondary-button" disabled={busy !== null} onClick={() => void run('init', () => initializeRepositorySubmodule(repository.path, submodule.path), '已初始化 Submodule 配置')}><Plus size={14}/>初始化</button>}<button className="secondary-button" disabled={busy !== null} onClick={() => void run('update', () => updateRepositorySubmodule(repository.path, submodule.path), '已更新 Submodule')}><RefreshCw className={busy === 'update' ? 'spin' : ''} size={14}/>更新</button><button className="secondary-button" disabled={busy !== null} onClick={() => void run('sync', () => syncRepositorySubmodules(repository.path), '已同步 Submodule URL')}><RotateCcw size={14}/>同步 URL</button><button className="secondary-button danger-button" disabled={busy !== null || submodule.status === 'uninitialized'} onClick={() => { if (window.confirm(`确定取消初始化 Submodule？\n${submodule.path}`)) void run('deinit', () => deinitializeRepositorySubmodule(repository.path, submodule.path), '已取消初始化 Submodule') }}><Trash2 size={14}/>取消初始化</button></div></article></div>}

    {((selection.kind === 'worktree' && !worktree) || (selection.kind === 'submodule' && !submodule)) && <div className="workspace-hint"><FolderGit2 size={26}/><strong>所选项目已不存在</strong><span>刷新仓库结构后请重新选择。</span></div>}
    {createOpen && (
      <CreateWorktreeDialog
        branches={repository.branches}
        busy={busy === 'create'}
        onClose={() => setCreateOpen(false)}
        onSubmit={async (path, branch, createBranch) => {
          if (await run('create', () => createRepositoryWorktree(repository.path, path, branch, createBranch), `已创建 Worktree：${path}`)) setCreateOpen(false)
        }}
      />
    )}
  </section>
}
