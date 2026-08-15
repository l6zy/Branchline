import { Box, Check, FolderGit2, GitFork, Tag } from 'lucide-react'
import type { RepositorySnapshot } from '../../repository'

export type StructureView = 'worktrees' | 'submodules' | 'tags'

export function RepositoryStructurePanel({ repository, view, onOpenPath }: { repository: RepositorySnapshot | null; view: StructureView; onOpenPath: (path: string, kind: 'worktree' | 'submodule') => void }) {
  const labels = {
    worktrees: { title: 'Worktrees', description: '在同一仓库的多个工作目录之间快速切换。', icon: GitFork },
    submodules: { title: 'Submodules', description: '查看子模块状态并把子模块作为仓库打开。', icon: Box },
    tags: { title: '标签', description: '按创建时间查看当前仓库中的标签。', icon: Tag },
  }
  const meta = labels[view]
  const Icon = meta.icon
  if (!repository) return <section className="workspace-empty"><Icon size={34}/><strong>{meta.title}</strong><span>请先打开本地仓库。</span></section>
  return <section className="structure-panel workspace-page">
    <div className="workspace-page-heading"><div><span className="eyebrow">仓库结构</span><h2>{meta.title}</h2><p>{meta.description}</p></div></div>
    <div className="structure-list">
      {view === 'worktrees' && repository.worktrees.map((worktree) => <button key={worktree.path} onClick={() => onOpenPath(worktree.path, 'worktree')}><span className="structure-icon"><GitFork size={16}/></span><span><strong>{worktree.path.split(/[\\/]/).pop() || worktree.path}</strong><small>{worktree.path}</small></span><code>{worktree.branch ?? `Detached ${worktree.head?.slice(0, 7) ?? ''}`}</code>{worktree.path === repository.path && <i><Check size={11}/>当前</i>}</button>)}
      {view === 'submodules' && repository.submodules.map((submodule) => <button key={submodule.path} onClick={() => onOpenPath(`${repository.path}/${submodule.path}`, 'submodule')}><span className="structure-icon"><Box size={16}/></span><span><strong>{submodule.path}</strong><small>{submodule.hash.slice(0, 12)}</small></span><code>{submodule.branch ?? '固定提交'}</code><i className={submodule.status === 'ok' ? 'ok' : 'warn'}>{submodule.status}</i></button>)}
      {view === 'tags' && repository.tags.map((tag) => <div className="tag-row" key={tag}><span className="structure-icon"><Tag size={15}/></span><strong>{tag}</strong></div>)}
      {view === 'worktrees' && repository.worktrees.length === 0 && <div className="workspace-hint"><FolderGit2 size={26}/><strong>没有 Worktree</strong></div>}
      {view === 'submodules' && repository.submodules.length === 0 && <div className="workspace-hint"><Box size={26}/><strong>没有 Submodule</strong></div>}
      {view === 'tags' && repository.tags.length === 0 && <div className="workspace-hint"><Tag size={26}/><strong>没有标签</strong></div>}
    </div>
  </section>
}
