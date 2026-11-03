import { Tooltip } from '../../components/tooltip'
import { useAppTranslation } from '../../i18n/useAppTranslation'
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
  const { t, i18n } = useAppTranslation()
  const formatNumber = new Intl.NumberFormat(i18n.resolvedLanguage).format
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
        <Tooltip content={expanded ? t('repository:tree.collapse') : t('repository:tree.expand')}><button type="button" className="tree-expander" onClick={() => toggle(`folder:${node.path}`)} aria-label={t(expanded ? 'repository:tree.collapseName' : 'repository:tree.expandName', { name: node.name })}>{expanded ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}</button></Tooltip>
        <Tooltip content={t('repository:tree.details')}><button type="button" className="tree-node-content" onClick={() => onSelect(target)}><span className="repository-tree-icon"><FolderTree size={13}/></span><span>{node.name}</span><span className="count">{formatNumber(node.children.length)}</span></button></Tooltip>
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
      <span className="tree-spacer"/><Tooltip content={current ? t('repository:tree.currentSubmodule') : available ? t('repository:tree.openSubmodule') : t('repository:tree.initializeSubmodule')}><button type="button" className="tree-node-content" onClick={() => onSelect(target)} onDoubleClick={() => { if (available && !current) onOpenPath(absolutePath, 'submodule') }}><span className="repository-tree-icon"><Box size={12}/></span><span>{node.name}</span>{current ? <Check className="repository-tree-status ok" size={12}/> : submodule.status === 'ok' ? <Check className="repository-tree-status ok" size={12}/> : <TriangleAlert className="repository-tree-status warn" size={12}/>}</button></Tooltip>
    </div>
  }

  return <div className="nav-section repository-tree-section">
    <div className="section-title"><span>{t('repository:structure.title')}</span></div>
    <Tooltip content={sameRepositoryPath(repository.path, activePath) ? t('repository:manager.current') : t('repository:tree.returnMain')}><button className={rowClass({ kind: 'root' }, 'repository-root-row')} onClick={() => onSelect({ kind: 'root' })} onDoubleClick={() => { if (!sameRepositoryPath(repository.path, activePath)) onOpenPath(repository.path, 'worktree') }}>
      <span className="tree-expander-spacer"/><span className="repository-tree-icon"><FolderGit2 size={14}/></span><span>{repository.name}</span>
    </button></Tooltip>
    <div className={rowClass({ kind: 'worktrees' }, 'group')}>
      <Tooltip content={open.worktrees !== false ? t('repository:tree.collapse') : t('repository:tree.expand')}><button type="button" className="tree-expander" onClick={() => toggle('worktrees')} aria-label={open.worktrees !== false ? t('repository:tree.collapseWorktrees') : t('repository:tree.expandWorktrees')}>{open.worktrees !== false ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}</button></Tooltip><Tooltip content={t('repository:tree.details')}><button type="button" className="tree-node-content" onClick={() => onSelect({ kind: 'worktrees' })}><span className="repository-tree-icon"><GitFork size={13}/></span><span>{t('repository:worktrees')}</span><span className="count">{formatNumber(repository.worktrees.length)}</span></button></Tooltip>
    </div>
    {open.worktrees !== false && <div>{repository.worktrees.map((worktree) => {
      const target: RepositoryStructureSelection = { kind: 'worktree', path: worktree.path }
      const current = sameRepositoryPath(worktree.path, activePath)
      const structureRoot = repositoryCacheKey(worktree.path) === repositoryCacheKey(repository.path)
      return <div key={worktree.path} className={rowClass(target)} style={{ paddingLeft: 29 }}><span className="tree-spacer"/><Tooltip content={current ? t('repository:tree.currentWorktree') : structureRoot ? t('repository:tree.returnMain') : t('repository:tree.openWorktree')}><button type="button" className="tree-node-content" onClick={() => onSelect(target)} onDoubleClick={() => { if (!current) onOpenPath(worktree.path, 'worktree') }}><span className="repository-tree-icon"><GitFork size={12}/></span><span>{worktree.path.split(/[\\/]/).pop() || worktree.path}</span>{worktree.locked ? <Lock className="repository-tree-status" size={11}/> : current ? <Check className="repository-tree-status ok" size={12}/> : null}</button></Tooltip></div>
    })}</div>}
    <div className={rowClass({ kind: 'submodules' }, 'group')}><Tooltip content={open.submodules !== false ? t('repository:tree.collapse') : t('repository:tree.expand')}><button type="button" className="tree-expander" onClick={() => toggle('submodules')} aria-label={open.submodules !== false ? t('repository:tree.collapseSubmodules') : t('repository:tree.expandSubmodules')}>{open.submodules !== false ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}</button></Tooltip><Tooltip content={t('repository:tree.details')}><button type="button" className="tree-node-content" onClick={() => onSelect({ kind: 'submodules' })}><span className="repository-tree-icon"><Box size={13}/></span><span>{t('repository:submodules.title')}</span><span className="count">{formatNumber(repository.submodules.length)}</span></button></Tooltip></div>
    {open.submodules !== false && <div>{submoduleTree.map((node) => renderSubmoduleNode(node, 0))}</div>}
  </div>
}
