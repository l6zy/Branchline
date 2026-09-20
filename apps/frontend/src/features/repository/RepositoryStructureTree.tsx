import { useMemo } from 'react'
import { Box, Check, ChevronDown, ChevronRight, FolderGit2, FolderTree, GitFork, Lock, TriangleAlert } from 'lucide-react'
import type { RepositorySnapshot } from '../../repository'
import {
  buildSubmoduleTree,
  submoduleAbsolutePath,
  type RepositoryStructureSelection,
  type SubmoduleTreeNode,
} from './repositoryTree'
import { isBooleanRecord, usePersistentState } from '../../persistentState'
import { repositoryCacheKey, sameRepositoryPath } from './repositoryPaths'

function selectionKey(selection: RepositoryStructureSelection) {
  return `${selection.kind}:${'path' in selection ? selection.path : ''}`
}

export function RepositoryStructureTree({ repository, activePath, selection, onSelect, onOpenPath }: {
  repository: RepositorySnapshot
  // The repository currently open in the workspace, which can differ from the structure repository.
  activePath: string | null
  selection: RepositoryStructureSelection
  onSelect: (selection: RepositoryStructureSelection) => void
  onOpenPath: (path: string, kind: 'worktree' | 'submodule') => void
}) {
  const [open, setOpen] = usePersistentState('branchline.repositoryStructureTreeOpen.v2', { worktrees: false, submodules: false }, isBooleanRecord)
  const submoduleTree = useMemo(() => buildSubmoduleTree(repository.submodules), [repository.submodules])
  const activeKey = selectionKey(selection)
  const toggle = (key: string) => setOpen((value) => ({ ...value, [key]: value[key] === false }))
  const rowClass = (target: RepositoryStructureSelection, extra = '') => `tree-row repository-tree-row ${activeKey === selectionKey(target) ? 'active' : ''} ${extra}`

  const renderSubmoduleNode = (node: SubmoduleTreeNode, depth: number): JSX.Element => {
    if (node.kind === 'folder') {
      const target: RepositoryStructureSelection = { kind: 'submodule-folder', path: node.path }
      const expanded = open[`folder:${node.path}`] !== false
      return <div key={node.path}>
        <div className={rowClass(target, 'group')} style={{ paddingLeft: 16 + depth * 12 }}>
        <button type="button" className="tree-expander" onClick={() => toggle(`folder:${node.path}`)} aria-label={expanded ? `收起 ${node.name}` : `展开 ${node.name}`} title={expanded ? '收起' : '展开'}>{expanded ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}</button>
        <button type="button" className="tree-node-content" onClick={() => onSelect(target)} title="查看详情"><FolderTree size={13}/><span>{node.name}</span><span className="count">{node.children.length}</span></button>
        </div>
        {expanded && <div>{node.children.map((child) => renderSubmoduleNode(child, depth + 1))}</div>}
      </div>
    }
    const submodule = node.submodule!
    const target: RepositoryStructureSelection = { kind: 'submodule', path: submodule.path }
    const available = submodule.status !== 'uninitialized' && submodule.status !== 'missing'
    const absolutePath = submoduleAbsolutePath(repository.path, submodule.path)
    const current = sameRepositoryPath(absolutePath, activePath)
    return <div key={node.path} className={rowClass(target)} style={{ paddingLeft: 29 + depth * 12 }}>
      <span className="tree-spacer"/><button type="button" className="tree-node-content" onClick={() => onSelect(target)} onDoubleClick={() => { if (available && !current) onOpenPath(absolutePath, 'submodule') }} title={current ? '当前 Submodule' : available ? '查看详情，双击进入 Submodule' : '查看详情并初始化'}><Box size={12}/><span>{node.name}</span>{current ? <Check className="repository-tree-status ok" size={12}/> : submodule.status === 'ok' ? <Check className="repository-tree-status ok" size={12}/> : <TriangleAlert className="repository-tree-status warn" size={12}/>}</button>
    </div>
  }

  return <div className="nav-section repository-tree-section">
    <div className="section-title"><span>仓库结构</span></div>
    <button className={rowClass({ kind: 'root' }, 'repository-root-row')} onClick={() => onSelect({ kind: 'root' })} onDoubleClick={() => { if (!sameRepositoryPath(repository.path, activePath)) onOpenPath(repository.path, 'worktree') }} title={sameRepositoryPath(repository.path, activePath) ? '当前仓库' : '查看详情，双击返回主仓库'}>
      <span className="tree-spacer"/><FolderGit2 size={14}/><span>{repository.name}</span>
    </button>
    <div className={rowClass({ kind: 'worktrees' }, 'group')}>
      <button type="button" className="tree-expander" onClick={() => toggle('worktrees')} aria-label={open.worktrees !== false ? '收起 Worktrees' : '展开 Worktrees'} title={open.worktrees !== false ? '收起' : '展开'}>{open.worktrees !== false ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}</button><button type="button" className="tree-node-content" onClick={() => onSelect({ kind: 'worktrees' })} title="查看详情"><GitFork size={13}/><span>Worktrees</span><span className="count">{repository.worktrees.length}</span></button>
    </div>
    {open.worktrees !== false && <div>{repository.worktrees.map((worktree) => {
      const target: RepositoryStructureSelection = { kind: 'worktree', path: worktree.path }
      const current = sameRepositoryPath(worktree.path, activePath)
      const structureRoot = repositoryCacheKey(worktree.path) === repositoryCacheKey(repository.path)
      return <div key={worktree.path} className={rowClass(target)} style={{ paddingLeft: 29 }}><span className="tree-spacer"/><button type="button" className="tree-node-content" onClick={() => onSelect(target)} onDoubleClick={() => { if (!current) onOpenPath(worktree.path, 'worktree') }} title={current ? '当前 Worktree' : structureRoot ? '查看详情，双击返回主仓库' : '查看详情，双击切换 Worktree'}><GitFork size={12}/><span>{worktree.path.split(/[\\/]/).pop() || worktree.path}</span>{worktree.locked ? <Lock className="repository-tree-status" size={11}/> : current ? <Check className="repository-tree-status ok" size={12}/> : null}</button></div>
    })}</div>}
    <div className={rowClass({ kind: 'submodules' }, 'group')}><button type="button" className="tree-expander" onClick={() => toggle('submodules')} aria-label={open.submodules !== false ? '收起 Submodules' : '展开 Submodules'} title={open.submodules !== false ? '收起' : '展开'}>{open.submodules !== false ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}</button><button type="button" className="tree-node-content" onClick={() => onSelect({ kind: 'submodules' })} title="查看详情"><Box size={13}/><span>Submodules</span><span className="count">{repository.submodules.length}</span></button></div>
    {open.submodules !== false && <div>{submoduleTree.map((node) => renderSubmoduleNode(node, 0))}</div>}
  </div>
}
