import { useMemo, useState } from 'react'
import { Box, Check, ChevronDown, ChevronRight, FolderGit2, FolderTree, GitFork, Lock, TriangleAlert } from 'lucide-react'
import type { RepositorySnapshot } from '../../repository'
import {
  buildSubmoduleTree,
  submoduleAbsolutePath,
  type RepositoryStructureSelection,
  type SubmoduleTreeNode,
} from './repositoryTree'

function selectionKey(selection: RepositoryStructureSelection) {
  return `${selection.kind}:${'path' in selection ? selection.path : ''}`
}

export function RepositoryStructureTree({ repository, selection, onSelect, onOpenPath }: {
  repository: RepositorySnapshot
  selection: RepositoryStructureSelection
  onSelect: (selection: RepositoryStructureSelection) => void
  onOpenPath: (path: string, kind: 'worktree' | 'submodule') => void
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({ worktrees: true, submodules: true })
  const submoduleTree = useMemo(() => buildSubmoduleTree(repository.submodules), [repository.submodules])
  const activeKey = selectionKey(selection)
  const toggle = (key: string) => setOpen((value) => ({ ...value, [key]: value[key] === false }))
  const rowClass = (target: RepositoryStructureSelection, extra = '') => `tree-row repository-tree-row ${activeKey === selectionKey(target) ? 'active' : ''} ${extra}`

  const renderSubmoduleNode = (node: SubmoduleTreeNode, depth: number): JSX.Element => {
    if (node.kind === 'folder') {
      const target: RepositoryStructureSelection = { kind: 'submodule-folder', path: node.path }
      const expanded = open[`folder:${node.path}`] !== false
      return <div key={node.path}>
        <button className={rowClass(target, 'group')} style={{ paddingLeft: 16 + depth * 12 }} onClick={() => onSelect(target)} onDoubleClick={() => toggle(`folder:${node.path}`)} title="单击查看详情，双击展开或收起">
          {expanded ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}<FolderTree size={13}/><span>{node.name}</span><span className="count">{node.children.length}</span>
        </button>
        {expanded && <div>{node.children.map((child) => renderSubmoduleNode(child, depth + 1))}</div>}
      </div>
    }
    const submodule = node.submodule!
    const target: RepositoryStructureSelection = { kind: 'submodule', path: submodule.path }
    const available = submodule.status !== 'uninitialized' && submodule.status !== 'missing'
    return <button key={node.path} className={rowClass(target)} style={{ paddingLeft: 29 + depth * 12 }} onClick={() => onSelect(target)} onDoubleClick={() => { if (available) onOpenPath(submoduleAbsolutePath(repository.path, submodule.path), 'submodule') }} title={available ? '单击查看详情，双击进入 Submodule' : '单击查看详情并初始化'}>
      <span className="tree-spacer"/><Box size={12}/><span>{node.name}</span>{submodule.status === 'ok' ? <Check className="repository-tree-status ok" size={12}/> : <TriangleAlert className="repository-tree-status warn" size={12}/>} 
    </button>
  }

  return <div className="nav-section repository-tree-section">
    <div className="section-title"><span>仓库结构</span></div>
    <button className={rowClass({ kind: 'root' }, 'repository-root-row')} onClick={() => onSelect({ kind: 'root' })}>
      <span className="tree-spacer"/><FolderGit2 size={14}/><span>{repository.name}</span>
    </button>
    <button className={rowClass({ kind: 'worktrees' }, 'group')} onClick={() => onSelect({ kind: 'worktrees' })} onDoubleClick={() => toggle('worktrees')} title="单击查看详情，双击展开或收起">
      {open.worktrees !== false ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}<GitFork size={13}/><span>Worktrees</span><span className="count">{repository.worktrees.length}</span>
    </button>
    {open.worktrees !== false && <div>{repository.worktrees.map((worktree) => {
      const target: RepositoryStructureSelection = { kind: 'worktree', path: worktree.path }
      const current = worktree.path.replace(/\\/g, '/').toLowerCase() === repository.path.replace(/\\/g, '/').toLowerCase()
      return <button key={worktree.path} className={rowClass(target)} style={{ paddingLeft: 29 }} onClick={() => onSelect(target)} onDoubleClick={() => { if (!current) onOpenPath(worktree.path, 'worktree') }} title={current ? '当前 Worktree' : '单击查看详情，双击切换 Worktree'}>
        <span className="tree-spacer"/><GitFork size={12}/><span>{worktree.path.split(/[\\/]/).pop() || worktree.path}</span>{worktree.locked ? <Lock className="repository-tree-status" size={11}/> : current ? <Check className="repository-tree-status ok" size={12}/> : null}
      </button>
    })}</div>}
    <button className={rowClass({ kind: 'submodules' }, 'group')} onClick={() => onSelect({ kind: 'submodules' })} onDoubleClick={() => toggle('submodules')} title="单击查看详情，双击展开或收起">
      {open.submodules !== false ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}<Box size={13}/><span>Submodules</span><span className="count">{repository.submodules.length}</span>
    </button>
    {open.submodules !== false && <div>{submoduleTree.map((node) => renderSubmoduleNode(node, 0))}</div>}
  </div>
}
