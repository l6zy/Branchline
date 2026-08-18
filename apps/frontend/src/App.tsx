import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { applyRepositoryStash, cherryPickRepositoryCommit, createRepositoryBranch, createRepositoryTag, deleteBranchPrefix, deleteRepositoryBranch, dropRepositoryStash, loadFileCommitDiff, loadRepository, loadRepositoryCommitFiles, loadRepositoryCommitStats, loadRepositoryFileDiff, mergeRepositoryReference, previewBranchPrefix, pullRepositoryBranch, pushRepository, rebaseRepositoryOnto, resetRepositoryToCommit, switchRepositoryBranch, type RepositoryCommitStats, type RepositoryFile, type RepositorySnapshot } from './repository'
import { ContextMenu } from './components/ContextMenu'
import { Button } from './components/Button'
import { useRepositoryWorkspace, type RecentRepository, type RepositoryParent } from './features/repository/useRepositoryWorkspace'
import { StagingPage } from './features/staging/StagingPage'
import { HistoryDrawer } from './features/history/HistoryDrawer'
import { DiffFileList } from './features/diff/DiffFileList'
import { DiffPanel } from './features/diff/DiffPanel'
import { ComparePanel } from './features/compare/ComparePanel'
import { CreateBranchDialog } from './features/branch/CreateBranchDialog'
import { GitConfigDialog } from './features/settings/GitConfigDialog'
import { MergeQueuePanel } from './features/merge/MergeQueuePanel'
import { RepositoryStructurePanel, type StructureView } from './features/repository/RepositoryStructurePanel'
import { RepositoryStructureTree } from './features/repository/RepositoryStructureTree'
import { RepositoryQuickSwitcher } from './features/repository/RepositoryQuickSwitcher'
import { resolveRepositoryStructureSelection, type RepositoryStructureSelection } from './features/repository/repositoryTree'
import { StashPage } from './features/stash/StashPage'
import { RebaseDialog } from './features/operation/RebaseDialog'
import { buildCommitGraphLayout, lanePosition, type CommitGraphRow } from './features/graph/commitGraphLayout'
import { captureCommitAnchor, resolveCommitSelection, restoreCommitAnchor, type CommitViewportAnchor } from './features/history/historyRefresh'
import { visibleCommitReferences, type BranchTrackingMap } from './features/history/historyReferences'
import { matchingCommitIds, nextSearchMatch, retainUnchangedSearchSummary, visibleHistoryCommits, type HistorySearchMode, type HistorySearchSummary } from './features/history/historySearch'
import { createWorkingTreeCommit, resolveWorkingTreeParent, WORKING_TREE_COMMIT_ID } from './features/history/workingTreeCommit'
import { formatLocalDateTime } from './dateTime'
import { isBooleanRecord, usePersistentState } from './persistentState'
import {
  Archive,
  AlertTriangle,
  ArrowLeft,
  Bell,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDot,
  Clock3,
  CloudDownload,
  CloudUpload,
  Code2,
  Command,
  Copy,
  CornerDownLeft,
  FileDiff,
  FileText,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  GitFork,
  GitMerge,
  History,
  LayoutGrid,
  List,
  ListFilter,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  RotateCcw,
  Rows3,
  Search,
  Settings2,
  Sun,
  Moon,
  Tag,
  TimerReset,
  Trash2,
  X,
} from 'lucide-react'

type Commit = {
  id: string
  fullHash?: string
  lane: number
  color: string
  title: string
  message?: string
  author: string
  email?: string
  committer?: string
  committerEmail?: string
  authorTime?: string
  commitTime?: string
  avatar: string
  time: string
  branches?: string[]
  status?: 'ahead' | 'merge' | 'local' | 'stash' | 'working'
  parent?: string
  parents?: string[]
  files: number
  additions: number
  deletions: number
}

type WorkspaceView = 'history' | 'changes' | 'stash' | 'compare' | 'merge' | 'operation' | StructureView
type TimeFilter = 'all' | 'day' | 'week' | 'month'
type SearchNavigationAction = { sequence: number; direction: 1 | -1 }
type SearchSummary = HistorySearchSummary
type HistoryTarget = { path: string; tab: 'history' | 'blame' | 'line'; line?: number; revision?: string }
type ActiveOperation = { key: 'fetch' | 'pull' | 'push' | 'commit' | 'stash'; label: string; detail: string }

const isTheme = (value: unknown): value is 'dark' | 'light' => value === 'dark' || value === 'light'
const isSidebarWidth = (value: unknown): value is number => typeof value === 'number' && value >= 200 && value <= 360
const isInspectorWidth = (value: unknown): value is number => typeof value === 'number' && value >= 300 && value <= 520
const isDetailsHeight = (value: unknown): value is number => typeof value === 'number' && value >= 230 && value <= 560
const isFileMode = (value: unknown): value is 'list' | 'tree' => value === 'list' || value === 'tree'

const OperationPanel = lazy(async () => ({ default: (await import('./features/operation/OperationPanel')).OperationPanel }))

function AppMark({ className }: { className?: string }) {
  return <img className={className} src="/app-icon.svg" alt="" aria-hidden="true"/>
}

const emptyCommit: Commit = {
  id: '—', lane: 0, color: '#70d9d2', title: '仓库暂无提交', author: 'Git', avatar: 'GT', time: '—', files: 0, additions: 0, deletions: 0,
}

function formatCommitClipboard(commit: Commit) {
  const metadata = [
    `提交：${commit.fullHash ?? commit.id}`,
    `父级：${commit.parents?.join(', ') || commit.parent || '—'}`,
    `作者：${commit.author}${commit.email ? ` <${commit.email}>` : ''}`,
    `提交人：${commit.committer ?? commit.author}${commit.committerEmail ? ` <${commit.committerEmail}>` : ''}`,
    `提交日期：${formatLocalDateTime(commit.commitTime ?? commit.time)}`,
  ].filter(Boolean).join('\n')
  return `${metadata}\n\n${commit.message ?? commit.title}`
}

function commitTimestamp(commit: Commit) {
  const value = commit.commitTime ?? commit.authorTime ?? commit.time
  const parsed = Date.parse(value)
  if (!Number.isNaN(parsed)) return parsed
  const now = new Date()
  if (value === '刚刚') return now.getTime()
  const minutes = value.match(/(\d+)\s*分钟前/)
  if (minutes) return now.getTime() - Number(minutes[1]) * 60_000
  const today = value.match(/今天\s*(\d{1,2}):(\d{2})/)
  if (today) return new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(today[1]), Number(today[2])).getTime()
  const yesterday = value.match(/昨天\s*(\d{1,2}):(\d{2})/)
  if (yesterday) return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, Number(yesterday[1]), Number(yesterday[2])).getTime()
  const monthDay = value.match(/(\d{1,2})月(\d{1,2})日/)
  if (monthDay) return new Date(now.getFullYear(), Number(monthDay[1]) - 1, Number(monthDay[2])).getTime()
  return null
}

function formatCommitListTime(commit: Commit) {
  const timestamp = commitTimestamp(commit)
  if (timestamp === null) return commit.time
  const value = new Date(timestamp)
  const pad = (part: number) => String(part).padStart(2, '0')
  const date = `${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  const time = `${pad(value.getHours())}:${pad(value.getMinutes())}`
  return value.getFullYear() === new Date().getFullYear() ? `${date} ${time}` : `${value.getFullYear()}-${date} ${time}`
}

function BranchTree({ branches, remoteBranches = [], branchTracking = {}, currentBranch, onCreateBranch, onDeletePrefix, onJumpBranch, onSwitchBranch, onPullBranch, onMergeBranch, onDeleteBranch, onCopyBranch }: { branches: string[]; remoteBranches?: string[]; branchTracking?: Record<string, { upstream?: string; ahead: number; behind: number }>; currentBranch?: string; onCreateBranch: (prefix?: string) => void; onDeletePrefix: (prefix: string) => void; onJumpBranch: (branch: string) => void; onSwitchBranch: (branch: string) => void; onPullBranch: (branch: string) => void; onMergeBranch: (branch: string) => void; onDeleteBranch: (branch: string) => void; onCopyBranch: (branch: string) => void }) {
  const [open, setOpen] = usePersistentState('branchline.branchTreeOpen.v1', { local: true, feat: true, fix: true, remote: false }, isBooleanRecord)
  const [contextBranch, setContextBranch] = useState<{ branch: string; x: number; y: number } | null>(null)
  const [contextPrefix, setContextPrefix] = useState<{ prefix: string; x: number; y: number } | null>(null)
  const toggle = (key: string) => setOpen((value) => ({ ...value, [key]: !value[key] }))
  const openContextMenu = (event: React.MouseEvent, branch: string) => {
    event.preventDefault()
    event.stopPropagation()
    setContextPrefix(null)
    setContextBranch({ branch, x: event.clientX, y: event.clientY })
  }
  const openPrefixMenu = (event: React.MouseEvent, prefix: string) => {
    event.preventDefault()
    event.stopPropagation()
    setContextBranch(null)
    setContextPrefix({ prefix, x: event.clientX, y: event.clientY })
  }
  const remoteBranchSet = new Set(remoteBranches)
  const incomingBadge = (branch: string) => {
    const count = branchTracking[branch]?.behind ?? 0
    return count > 0 ? <span className="branch-sync" title={`${branch} 有 ${count} 个未拉取提交`} aria-label={`${count} 个未拉取提交`}>↓{count}</span> : null
  }
  const branchNames = branches.filter((branch) => !remoteBranchSet.has(branch))
  const grouped = branchNames.reduce<Record<string, string[]>>((groups, branch) => {
    const [prefix, ...rest] = branch.split('/')
    const key = rest.length ? prefix : ''
    const value = rest.length ? rest.join('/') : branch
    groups[key] = [...(groups[key] ?? []), value]
    return groups
  }, {})
  const remoteGroups = remoteBranches.reduce<Record<string, string[]>>((groups, branch) => {
    const [remote, ...nameParts] = branch.split('/')
    if (!remote || !nameParts.length) return groups
    groups[remote] = [...(groups[remote] ?? []), nameParts.join('/')]
    return groups
  }, {})
  return <div className="nav-section branch-tree">
    <div className="section-title"><span>分支</span><button className="section-add" onClick={() => onCreateBranch()} title="创建分支"><Plus size={14}/></button></div>
    <button className="tree-row group" onClick={() => toggle('local')}>{open.local ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}<GitBranch size={14}/><span>本地</span><span className="count">{branchNames.length}</span></button>
    {open.local && <div className="tree-children">
      {(grouped[''] ?? []).map((branch) => <button className={`tree-row ${branch === currentBranch ? 'active' : ''}`} key={branch} onClick={() => onJumpBranch(branch)} onDoubleClick={() => onSwitchBranch(branch)} onContextMenu={(event) => openContextMenu(event, branch)} title={branch}><span className="tree-spacer"/><CircleDot size={12}/><span>{branch}</span>{incomingBadge(branch)}</button>)}
      {Object.entries(grouped).filter(([prefix]) => prefix).map(([prefix, children]) => <div key={prefix}><button className="tree-row group nested" onClick={() => toggle(prefix)} onContextMenu={(event) => openPrefixMenu(event, prefix)} title="单击展开或收起，右键管理分支组">{open[prefix] ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}<FolderGit2 size={13}/><span>{prefix}</span><span className="count">{children.length}</span></button>{open[prefix] && <div className="tree-children compact">{children.map((branch) => { const fullBranch = `${prefix}/${branch}`; return <button className={`tree-row ${fullBranch === currentBranch ? 'active' : ''}`} key={fullBranch} onClick={() => onJumpBranch(fullBranch)} onDoubleClick={() => onSwitchBranch(fullBranch)} onContextMenu={(event) => openContextMenu(event, fullBranch)}><span className="tree-spacer"/><GitBranch size={12}/><span>{branch}</span>{incomingBadge(fullBranch)}</button> })}</div>}</div>)}
    </div>}
    <button className="tree-row group" onClick={() => toggle('remote')}>{open.remote ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}<CloudDownload size={14}/><span>远程</span><span className="count">{remoteBranches.length}</span></button>
    {open.remote && <div className="tree-children remote-tree">{Object.entries(remoteGroups).map(([remote, remoteBranchNames]) => {
      const remoteKey = `remote:${remote}`
      const groupedRemoteBranches = remoteBranchNames.reduce<Record<string, string[]>>((groups, branch) => {
        const [prefix, ...rest] = branch.split('/')
        const key = rest.length ? prefix : ''
        groups[key] = [...(groups[key] ?? []), rest.length ? rest.join('/') : branch]
        return groups
      }, {})
      return <div key={remote}><button className="tree-row group nested remote-root" onClick={() => toggle(remoteKey)}>{open[remoteKey] ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}<CloudDownload size={13}/><span>{remote}</span><span className="count">{remoteBranchNames.length}</span></button>{open[remoteKey] && <div className="tree-children compact remote-children">
        {(groupedRemoteBranches[''] ?? []).map((branch) => { const fullBranch = `${remote}/${branch}`; return <button className="tree-row" key={fullBranch} onClick={() => onJumpBranch(fullBranch)} onDoubleClick={() => onSwitchBranch(fullBranch)} onContextMenu={(event) => openContextMenu(event, fullBranch)} title={fullBranch}><span className="tree-spacer"/><GitBranch size={12}/><span>{branch}</span></button> })}
        {Object.entries(groupedRemoteBranches).filter(([prefix]) => prefix).map(([prefix, children]) => { const prefixKey = `${remoteKey}:${prefix}`; return <div key={prefix}><button className="tree-row group remote-prefix" onClick={() => toggle(prefixKey)}>{open[prefixKey] ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}<FolderGit2 size={12}/><span>{prefix}</span><span className="count">{children.length}</span></button>{open[prefixKey] && <div className="tree-children compact remote-prefix-children">{children.map((branch) => { const fullBranch = `${remote}/${prefix}/${branch}`; return <button className="tree-row" key={fullBranch} onClick={() => onJumpBranch(fullBranch)} onDoubleClick={() => onSwitchBranch(fullBranch)} onContextMenu={(event) => openContextMenu(event, fullBranch)}><span className="tree-spacer"/><GitBranch size={12}/><span>{branch}</span></button> })}</div>}</div> })}
      </div>}</div>
    })}</div>}
    {contextBranch && <ContextMenu x={contextBranch.x} y={contextBranch.y} onClose={() => setContextBranch(null)}>
      <div className="context-menu-title"><GitBranch size={13}/><span>{contextBranch.branch}</span></div>
      <button onClick={() => { onJumpBranch(contextBranch.branch); setContextBranch(null) }}><Search size={14}/><span>定位到分支提交</span></button>
      <button onClick={() => { onSwitchBranch(contextBranch.branch); setContextBranch(null) }}><GitBranch size={14}/><span>切换到该分支</span></button>
      <button onClick={() => { onPullBranch(contextBranch.branch); setContextBranch(null) }}><RefreshCw size={14}/><span>拉取对应分支</span></button>
      <button onClick={() => { onMergeBranch(contextBranch.branch); setContextBranch(null) }} disabled={contextBranch.branch === currentBranch}><GitMerge size={14}/><span>合并到 {currentBranch ?? '当前分支'}</span></button>
      <div className="context-menu-separator"/>
      <button onClick={() => { onCopyBranch(contextBranch.branch); setContextBranch(null) }}><Copy size={14}/><span>复制分支名</span></button>
      <Button variant="danger" onClick={() => { onDeleteBranch(contextBranch.branch); setContextBranch(null) }} disabled={contextBranch.branch === currentBranch}><Trash2 size={14}/><span>删除分支</span></Button>
    </ContextMenu>}
    {contextPrefix && <ContextMenu x={contextPrefix.x} y={contextPrefix.y} onClose={() => setContextPrefix(null)}>
      <div className="context-menu-title"><FolderGit2 size={13}/><span>{contextPrefix.prefix} 分支组</span></div>
      <button onClick={() => { toggle(contextPrefix.prefix); setContextPrefix(null) }}>{open[contextPrefix.prefix] ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}<span>{open[contextPrefix.prefix] ? '收起分支组' : '展开分支组'}</span></button>
      <button onClick={() => { onCreateBranch(contextPrefix.prefix); setContextPrefix(null) }}><Plus size={14}/><span>在该组中创建分支</span></button>
      <button onClick={() => { onCopyBranch(`${contextPrefix.prefix}/`); setContextPrefix(null) }}><Copy size={14}/><span>复制分支前缀</span></button>
      <div className="context-menu-separator"/>
      <Button variant="danger" onClick={() => { onDeletePrefix(contextPrefix.prefix); setContextPrefix(null) }}><Trash2 size={14}/><span>删除整个分支组</span></Button>
    </ContextMenu>}
  </div>
}

type SidebarProps = {
  repository: RepositorySnapshot | null
  parentRepository: RepositoryParent | null
  recentRepositories: RecentRepository[]
  openingRepository: boolean
  activeView: WorkspaceView
  structureSelection: RepositoryStructureSelection
  repositorySwitcherSignal: number
  onOpenRepository: () => void
  onOpenRepositoryPath: (path: string, preserveTrail?: boolean) => void
  onOpenSubmodulePath: (path: string) => void
  onReturnToParentRepository: () => void
  onCreateBranch: (prefix?: string) => void
  onDeleteBranchPrefix: (prefix: string) => void
  onJumpBranch: (branch: string) => void
  onSwitchBranch: (branch: string) => void
  onPullBranch: (branch: string) => void
  onMergeBranch: (branch: string) => void
  onDeleteBranch: (branch: string) => void
  onCopyBranch: (branch: string) => void
  onSelectView: (view: WorkspaceView) => void
  onSelectStructure: (selection: RepositoryStructureSelection) => void
  onOpenGitConfig: () => void
  onToggle: () => void
}

function Sidebar({ repository, parentRepository, recentRepositories, openingRepository, activeView, structureSelection, repositorySwitcherSignal, onOpenRepository, onOpenRepositoryPath, onOpenSubmodulePath, onReturnToParentRepository, onCreateBranch, onDeleteBranchPrefix, onJumpBranch, onSwitchBranch, onPullBranch, onMergeBranch, onDeleteBranch, onCopyBranch, onSelectView, onSelectStructure, onOpenGitConfig, onToggle }: SidebarProps) {
  return <aside className="sidebar">
    <div className="sidebar-repository-header">
      <RepositoryQuickSwitcher repository={repository} parentRepository={parentRepository} recentRepositories={recentRepositories} openingRepository={openingRepository} openSignal={repositorySwitcherSignal} onOpenRepository={onOpenRepository} onOpenRepositoryPath={onOpenRepositoryPath} onOpenSubmodulePath={onOpenSubmodulePath} onReturnToParentRepository={onReturnToParentRepository}/>
      <Button variant="icon" className="sidebar-toggle" onClick={onToggle} title="收起左侧面板"><PanelLeftClose size={16}/></Button>
    </div>
    <nav>{repository ? <>
      <div className="nav-section quick-nav"><button className={`nav-row ${activeView === 'history' ? 'active' : ''}`} onClick={() => onSelectView('history')}><LayoutGrid size={15}/><span>工作台</span><span className="key">⌘1</span></button><button className={`nav-row ${activeView === 'changes' ? 'active' : ''}`} onClick={() => onSelectView('changes')}><FileDiff size={15}/><span>工作区变更</span><span className="nav-badge">{repository.files.length}</span></button><button className={`nav-row ${activeView === 'stash' ? 'active' : ''}`} onClick={() => onSelectView('stash')}><Archive size={15}/><span>Stash</span></button></div>
      <BranchTree branches={repository.branches} remoteBranches={repository.remoteBranches} branchTracking={repository.branchTracking} currentBranch={repository.branch} onCreateBranch={onCreateBranch} onDeletePrefix={onDeleteBranchPrefix} onJumpBranch={onJumpBranch} onSwitchBranch={onSwitchBranch} onPullBranch={onPullBranch} onMergeBranch={onMergeBranch} onDeleteBranch={onDeleteBranch} onCopyBranch={onCopyBranch}/>
      <RepositoryStructureTree repository={repository} selection={structureSelection} onSelect={onSelectStructure} onOpenPath={(path, kind) => { if (kind === 'submodule') onOpenSubmodulePath(path); else onOpenRepositoryPath(path, true) }}/>
      <div className="nav-section structure-tags-section"><button className={`nav-row ${activeView === 'tags' ? 'active' : ''}`} onClick={() => onSelectView('tags')}><Tag size={15}/><span>标签</span><span className="nav-badge muted">{repository.tags.length}</span></button></div>
    </> : <div className="sidebar-empty-state"><FolderOpen size={24}/><strong>尚未打开仓库</strong><span>打开本地 Git 仓库后，这里会显示分支、Worktree 和 Submodule。</span><button onClick={onOpenRepository} disabled={openingRepository}>{openingRepository ? '正在打开…' : '打开仓库'}</button></div>}</nav>
    <div className="sidebar-footer"><button className="profile" onClick={onOpenGitConfig} title="打开本地 Git 配置"><AppMark className="app-brand-mark"/><div><strong>Branchline</strong><span>本地 Git 配置</span></div><Settings2 size={15}/></button></div>
  </aside>
}

function GraphLine({ commit, row, laneCount, graphWidth }: { commit: Commit; row: CommitGraphRow; laneCount: number; graphWidth: number }) {
  const x = lanePosition(row.lane, laneCount, graphWidth)
  const isStash = commit.status === 'stash'
  const isWorking = commit.status === 'working'
  const isMerge = !isStash && !isWorking && (row.parentCount > 1 || commit.status === 'merge')
  const title = isWorking ? '工作区未提交修改' : isStash ? `Stash ${commit.id}，从基准提交独立保存` : isMerge ? `合并提交 ${commit.id}，连接 ${row.parentCount} 个父提交` : row.parentCount === 0 ? `路径终点 ${commit.id}` : `提交 ${commit.id}，轨道 ${row.lane + 1}`
  return <div className="graph-cell" title={title} data-lane={row.lane} data-parent-count={row.parentCount}>
    <svg className="graph-segments" width={graphWidth} height="32" viewBox={`0 0 ${graphWidth} 32`} aria-hidden="true">
      {row.segments.map((segment) => <path key={segment.id} className={`graph-segment ${segment.kind}`} d={segment.path} stroke={segment.color}/>) }
    </svg>
    <span className={`commit-dot ${isMerge ? 'merge' : ''} ${isStash ? 'stash' : ''} ${isWorking ? 'working' : ''} ${row.parentCount === 0 ? 'terminal' : ''}`} style={{ left: x, borderColor: row.color, color: row.color, background: isMerge || isStash || isWorking ? 'transparent' : row.color }}/>
  </div>
}

type ColumnKey = 'branch' | 'graph' | 'time' | 'hash' | 'author'
const COMMIT_ROW_HEIGHT = 32

function commitDay(commit: Commit) {
  const timestamp = commitTimestamp(commit)
  if (timestamp === null) return null
  const date = new Date(timestamp)
  return {
    key: `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
    label: `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`,
  }
}

function CommitList({ commits, selected, onSelect, query, searchMode, searchAction, onSearchSummaryChange, branchFilter, timeFilter, currentBranch, remoteBranches, branchTracking, tags, stashReference, inspectorCollapsed, onToggleInspector, onMergeCommit, onCherryPickCommit, onResetCommit, onRebaseCommit, onTagCommit, onCompareCommit, onCopyCommit, onOpenStash, onApplyStash, onPopStash, onDropStash }: { commits: Commit[]; selected: string; onSelect: (id: string) => void; query: string; searchMode: HistorySearchMode; searchAction: SearchNavigationAction; onSearchSummaryChange: (summary: SearchSummary) => void; branchFilter: string; timeFilter: TimeFilter; currentBranch: string; remoteBranches: string[]; branchTracking: BranchTrackingMap; tags: string[]; stashReference: string; inspectorCollapsed: boolean; onToggleInspector: () => void; onMergeCommit: (commit: Commit) => void; onCherryPickCommit: (commit: Commit) => void; onResetCommit: (commit: Commit) => void; onRebaseCommit: (commit: Commit) => void; onTagCommit: (commit: Commit) => void; onCompareCommit: (commit: Commit) => void; onCopyCommit: (commit: Commit, mode: 'hash' | 'details') => void; onOpenStash: () => void; onApplyStash: (reference: string) => void; onPopStash: (reference: string) => void; onDropStash: (reference: string) => void }) {
  const [widths, setWidths] = useState({ branch: 180, graph: 250, time: 104, hash: 82, author: 138 })
  const [visibleColumns, setVisibleColumns] = useState({ time: false, hash: false })
  const [columnMenuOpen, setColumnMenuOpen] = useState(false)
  const [authorFilter, setAuthorFilter] = useState<string | null>(null)
  const [authorMenuOpen, setAuthorMenuOpen] = useState(false)
  const [contextCommit, setContextCommit] = useState<{ commit: Commit; x: number; y: number } | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [listHeight, setListHeight] = useState(600)
  const commitListRef = useRef<HTMLDivElement>(null)
  const scrollFrame = useRef<number | null>(null)
  const pendingScrollTop = useRef(0)
  const viewportAnchor = useRef<CommitViewportAnchor | null>(null)
  const handledSearchAction = useRef(0)
  const deferredQuery = useDeferredValue(query)
  const authors = useMemo(() => Array.from(new Set(commits.map((commit) => commit.author))), [commits])
  const remoteBranchSet = useMemo(() => new Set(remoteBranches), [remoteBranches])
  const tagSet = useMemo(() => new Set(tags), [tags])
  const branchCommitIds = useMemo(() => {
    if (branchFilter === 'all') return null
    const byReference = new Map<string, Commit>()
    commits.forEach((commit) => {
      byReference.set(commit.id, commit)
      if (commit.fullHash) {
        byReference.set(commit.fullHash, commit)
        for (let length = 7; length < commit.fullHash.length; length += 1) {
          const prefix = commit.fullHash.slice(0, length)
          if (!byReference.has(prefix)) byReference.set(prefix, commit)
        }
      }
    })
    const tip = commits.find((commit) => commit.branches?.includes(branchFilter))
    const reachable = new Set<string>()
    const stack = tip ? [tip] : []
    while (stack.length) {
      const commit = stack.pop()!
      if (reachable.has(commit.id)) continue
      reachable.add(commit.id)
      ;(commit.parents ?? (commit.parent ? [commit.parent] : [])).forEach((parent) => {
        const parentCommit = byReference.get(parent)
        if (parentCommit) stack.push(parentCommit)
      })
    }
    return reachable
  }, [branchFilter, commits])
  const baseFiltered = useMemo(() => {
    const timeWindow = timeFilter === 'day' ? 86_400_000 : timeFilter === 'week' ? 7 * 86_400_000 : timeFilter === 'month' ? 30 * 86_400_000 : null
    const threshold = timeWindow ? Date.now() - timeWindow : null
    return commits.filter((commit) => {
      const timestamp = threshold ? commitTimestamp(commit) : null
      const visibleOnBranch = commit.status === 'working'
        ? (!branchCommitIds || branchFilter === currentBranch)
        : (!branchCommitIds || branchCommitIds.has(commit.id))
      return (!authorFilter || commit.author === authorFilter)
        && visibleOnBranch
        && (!threshold || timestamp === null || timestamp >= threshold)
    })
  }, [authorFilter, branchCommitIds, branchFilter, commits, currentBranch, timeFilter])
  const searchMatches = useMemo(() => matchingCommitIds(baseFiltered, deferredQuery), [baseFiltered, deferredQuery])
  const searchMatchSet = useMemo(() => new Set(searchMatches), [searchMatches])
  const filtered = useMemo(() => visibleHistoryCommits(baseFiltered, deferredQuery, searchMode), [baseFiltered, deferredQuery, searchMode])
  const graphLayout = useMemo(() => buildCommitGraphLayout(filtered, widths.graph), [filtered, widths.graph])
  const virtualRange = useMemo(() => {
    const overscan = 12
    const start = Math.max(0, Math.floor(scrollTop / COMMIT_ROW_HEIGHT) - overscan)
    const end = Math.min(filtered.length, Math.ceil((scrollTop + listHeight) / COMMIT_ROW_HEIGHT) + overscan)
    return { start, end }
  }, [filtered.length, listHeight, scrollTop])
  const visibleCommits = filtered.slice(virtualRange.start, virtualRange.end)
  const searchMatchIndex = searchMatches.indexOf(selected)
  const searchMatchCount = searchMatches.length
  useEffect(() => {
    const element = commitListRef.current
    if (!element) return
    const updateHeight = () => setListHeight(element.clientHeight)
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => () => { if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current) }, [])
  useEffect(() => {
    onSearchSummaryChange({ current: searchMatchIndex >= 0 ? searchMatchIndex + 1 : 0, total: searchMatchCount })
  }, [onSearchSummaryChange, searchMatchCount, searchMatchIndex])
  useEffect(() => {
    if (!deferredQuery.trim() || !searchMatches.length || searchMatchSet.has(selected)) return
    onSelect(searchMatches[0])
  }, [deferredQuery, onSelect, searchMatches, searchMatchSet, selected])
  useEffect(() => {
    if (searchAction.sequence === handledSearchAction.current) return
    handledSearchAction.current = searchAction.sequence
    if (!deferredQuery.trim()) return
    const next = nextSearchMatch(searchMatches, selected, searchAction.direction)
    if (next && next !== selected) onSelect(next)
  }, [deferredQuery, onSelect, searchAction, searchMatches, selected])
  useLayoutEffect(() => {
    const element = commitListRef.current
    if (!element) return
    const nextTop = restoreCommitAnchor(filtered, viewportAnchor.current, COMMIT_ROW_HEIGHT, element.scrollTop)
    if (nextTop !== element.scrollTop) element.scrollTop = nextTop
    const restoredTop = element.scrollTop
    pendingScrollTop.current = restoredTop
    viewportAnchor.current = captureCommitAnchor(filtered, restoredTop, COMMIT_ROW_HEIGHT)
    setScrollTop((current) => current === restoredTop ? current : restoredTop)
  }, [filtered])
  useEffect(() => {
    const index = filtered.findIndex((commit) => commit.id === selected)
    const element = commitListRef.current
    if (index < 0 || !element) return
    const top = index * COMMIT_ROW_HEIGHT
    const bottom = top + COMMIT_ROW_HEIGHT
    if (top < element.scrollTop || bottom > element.scrollTop + element.clientHeight) {
      element.scrollTo({ top: Math.max(0, top - element.clientHeight / 2), behavior: 'smooth' })
    }
  }, [selected])
  const template = [`${widths.branch}px`, `${widths.graph}px`, 'minmax(180px, 1fr)', visibleColumns.time ? `${widths.time}px` : '', visibleColumns.hash ? `${widths.hash}px` : '', `${widths.author}px`].filter(Boolean).join(' ')
  const beginResize = (column: ColumnKey, event: React.PointerEvent<HTMLSpanElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = widths[column]
    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX
      const minimum = column === 'graph' ? 120 : column === 'author' ? 128 : column === 'time' ? 88 : column === 'branch' ? 90 : 68
      setWidths((current) => ({ ...current, [column]: Math.max(minimum, startWidth + (column === 'author' ? -delta : delta)) }))
    }
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  const resizer = (column: ColumnKey) => <span className="column-resizer" role="separator" aria-label="拖动调整列宽" onPointerDown={(event) => beginResize(column, event)}/>
  const refTag = (reference: string, color: string) => {
    const kind = reference === 'refs/stash' ? 'stash' : tagSet.has(reference) ? 'tag' : remoteBranchSet.has(reference) ? 'remote' : 'local'
    const RefIcon = kind === 'stash' ? Archive : kind === 'tag' ? Tag : kind === 'remote' ? CloudDownload : GitBranch
    const kindLabel = kind === 'stash' ? 'Stash 引用' : kind === 'tag' ? '标签' : kind === 'remote' ? '远程分支' : '本地分支'
    const label = kind === 'stash' ? 'Stash' : reference
    return <span className={`ref ref-${kind}`} style={{ background: kind === 'stash' ? '#ffd666' : `color-mix(in srgb, ${color} 58%, white)` }} title={`${kindLabel}：${reference}`} key={reference}><RefIcon size={11}/><span>{label}</span>{reference === currentBranch && <Check className="ref-current" size={11}/>}</span>
  }
  return <div className="commit-table">
    <div className="commit-columns-header" style={{ gridTemplateColumns: template }}>
      <div className="column-label">分支 / 标签{resizer('branch')}</div>
      <div className="column-label">图谱{resizer('graph')}</div>
      <div className="column-label">提交信息{resizer('author')}</div>
      {visibleColumns.time && <div className="column-label">时间{resizer('time')}</div>}
      {visibleColumns.hash && <div className="column-label">Hash{resizer('hash')}</div>}
      <div className="column-label author-label"><span className="column-title">提交人</span><div className="column-actions"><Button variant="icon" active={Boolean(authorFilter)} onClick={() => { setAuthorMenuOpen((value) => !value); setColumnMenuOpen(false) }} title="筛选提交人" aria-label="筛选提交人"><ListFilter size={14}/></Button><Button variant="icon" onClick={onToggleInspector} title={inspectorCollapsed ? '展开右侧面板' : '收起右侧面板'} aria-label={inspectorCollapsed ? '展开右侧面板' : '收起右侧面板'}>{inspectorCollapsed ? <PanelRightOpen size={15}/> : <PanelRightClose size={15}/>}</Button><Button variant="icon" onClick={() => { setColumnMenuOpen((value) => !value); setAuthorMenuOpen(false) }} title="配置列" aria-label="配置列"><Settings2 size={14}/></Button></div>{authorMenuOpen && <div className="column-config-menu author-filter-menu"><strong>筛选提交人</strong><button className={!authorFilter ? 'active' : ''} onClick={() => { setAuthorFilter(null); setAuthorMenuOpen(false) }}>全部提交人</button>{authors.map((author) => <button className={authorFilter === author ? 'active' : ''} key={author} onClick={() => { setAuthorFilter(author); setAuthorMenuOpen(false) }}>{author}</button>)}</div>}{columnMenuOpen && <div className="column-config-menu"><strong>显示列</strong><label><input type="checkbox" checked={visibleColumns.time} onChange={(event) => setVisibleColumns((value) => ({ ...value, time: event.target.checked }))}/>时间</label><label><input type="checkbox" checked={visibleColumns.hash} onChange={(event) => setVisibleColumns((value) => ({ ...value, hash: event.target.checked }))}/>Hash</label></div>}</div>
    </div>
    <div className="commit-list" ref={commitListRef} onScroll={(event) => {
      pendingScrollTop.current = event.currentTarget.scrollTop
      viewportAnchor.current = captureCommitAnchor(filtered, pendingScrollTop.current, COMMIT_ROW_HEIGHT)
      if (scrollFrame.current !== null) return
      scrollFrame.current = requestAnimationFrame(() => {
        scrollFrame.current = null
        setScrollTop(pendingScrollTop.current)
      })
    }}>
    {virtualRange.start > 0 && <div className="commit-list-spacer" style={{ height: virtualRange.start * COMMIT_ROW_HEIGHT }}/>} 
    {visibleCommits.map((commit, localIndex) => {
      const visibleIndex = virtualRange.start + localIndex
      const currentDay = commitDay(commit)
      const previousDay = visibleIndex > 0 ? commitDay(filtered[visibleIndex - 1]) : null
      const timeDivider = visibleIndex > 0 && currentDay && currentDay.key !== previousDay?.key ? currentDay.label : null
      const graphRow = graphLayout.rows[visibleIndex]
      const rowStyle = { gridTemplateColumns: template, '--time-divider-left': `${widths.branch + widths.graph + 8}px` } as React.CSSProperties
      return <button key={commit.id} data-commit-id={commit.id} className={`commit-row ${commit.status === 'working' ? 'working-tree' : ''} ${selected === commit.id ? 'selected' : ''} ${searchMatchSet.has(commit.id) ? 'search-match' : ''} ${selected === commit.id && searchMatchSet.has(commit.id) ? 'search-current' : ''} ${timeDivider ? 'time-break' : ''}`} style={rowStyle} onClick={() => onSelect(commit.id)} onContextMenu={(event) => { event.preventDefault(); if (commit.status === 'working') return; onSelect(commit.id); setContextCommit({ commit, x: event.clientX, y: event.clientY }) }}>
        {timeDivider && <span className="time-divider-label">{timeDivider}</span>}
        <div className="branch-cell">{commit.status === 'working' ? <span className="ref ref-working"><FileDiff size={11}/><span>工作区</span></span> : visibleCommitReferences(commit.branches ?? [], remoteBranchSet, branchTracking).map((branch) => refTag(branch, graphRow.color))}</div>
        <GraphLine commit={commit} row={graphRow} laneCount={graphLayout.laneCount} graphWidth={widths.graph}/>
        <div className="commit-content message-cell">
          <div className="commit-subject"><span>{commit.title}</span></div>
        </div>
        {visibleColumns.time && <div className="optional-cell time-cell" title={formatLocalDateTime(commit.commitTime ?? commit.authorTime ?? commit.time)}>{formatCommitListTime(commit)}</div>}
        {visibleColumns.hash && <div className="optional-cell hash-cell">{commit.id}</div>}
        <div className={`author-cell ${authorFilter === commit.author ? 'filtered-author' : ''}`}><div className="avatar tiny">{commit.avatar}</div><span>{commit.author}</span></div>
      </button>
    })}
    {virtualRange.end < filtered.length && <div className="commit-list-spacer" style={{ height: (filtered.length - virtualRange.end) * COMMIT_ROW_HEIGHT }}/>} 
    {filtered.length === 0 && <div className="empty-search">{commits.length ? <Search size={24}/> : <GitCommitHorizontal size={24}/>}<strong>{commits.length ? '没有匹配的提交' : '仓库暂无提交'}</strong><span>{commits.length ? '试试提交信息、Hash 或提交人' : '完成首次提交后，提交图谱会显示在这里。'}</span></div>}
    </div>
    {contextCommit && <ContextMenu x={contextCommit.x} y={contextCommit.y} onClose={() => setContextCommit(null)}>
      {contextCommit.commit.status === 'stash' ? <>
        <div className="context-menu-title"><Archive size={13}/><span>{stashReference} · {contextCommit.commit.title}</span></div>
        <button onClick={() => { onOpenStash(); setContextCommit(null) }}><Archive size={14}/><span>查看 Stash 内容</span></button>
        <button onClick={() => { onApplyStash(stashReference); setContextCommit(null) }}><Check size={14}/><span>应用并保留</span></button>
        <button onClick={() => { onPopStash(stashReference); setContextCommit(null) }}><CornerDownLeft size={14}/><span>弹出并删除</span></button>
        <div className="context-menu-separator"/>
        <Button variant="danger" onClick={() => { onDropStash(stashReference); setContextCommit(null) }}><Trash2 size={14}/><span>删除 Stash</span></Button>
        <div className="context-menu-separator"/>
        <button onClick={() => { onCopyCommit(contextCommit.commit, 'hash'); setContextCommit(null) }}><Copy size={14}/><span>复制 Stash Hash</span></button>
        <button onClick={() => { onCopyCommit(contextCommit.commit, 'details'); setContextCommit(null) }}><FileText size={14}/><span>复制完整 Stash 信息</span></button>
      </> : <>
        <div className="context-menu-title"><GitCommitHorizontal size={13}/><span>{contextCommit.commit.id} · {contextCommit.commit.title}</span></div>
        <button onClick={() => { onCompareCommit(contextCommit.commit); setContextCommit(null) }}><GitCompareArrows size={14}/><span>与当前分支对比</span></button>
        <button onClick={() => { onMergeCommit(contextCommit.commit); setContextCommit(null) }}><GitMerge size={14}/><span>合并此提交到 {currentBranch}</span></button>
        <button onClick={() => { onCherryPickCommit(contextCommit.commit); setContextCommit(null) }}><GitCommitHorizontal size={14}/><span>Cherry-pick 此提交</span></button>
        <button onClick={() => { onRebaseCommit(contextCommit.commit); setContextCommit(null) }}><GitFork size={14}/><span>将当前分支变基到此提交</span></button>
        <button onClick={() => { onTagCommit(contextCommit.commit); setContextCommit(null) }}><Tag size={14}/><span>在此提交创建标签</span></button>
        <div className="context-menu-separator"/>
        <Button variant="danger" onClick={() => { onResetCommit(contextCommit.commit); setContextCommit(null) }}><RotateCcw size={14}/><span>回退到此提交（保留文件）</span></Button>
        <div className="context-menu-separator"/>
        <button onClick={() => { onCopyCommit(contextCommit.commit, 'hash'); setContextCommit(null) }}><Copy size={14}/><span>复制提交 Hash</span></button>
        <button onClick={() => { onCopyCommit(contextCommit.commit, 'details'); setContextCommit(null) }}><FileText size={14}/><span>复制完整提交信息</span></button>
      </>}
    </ContextMenu>}
  </div>
}

function CommitDetails({ commit }: { commit: Commit }) {
  const [copied, setCopied] = useState(false)
  const [moreMenu, setMoreMenu] = useState<{ x: number; y: number } | null>(null)
  const commitTextRef = useRef<HTMLTextAreaElement>(null)
  const isWorkingTree = commit.status === 'working'
  const fullHash = isWorkingTree ? '未提交' : commit.fullHash ?? `${commit.id}4b92d7e08f7e16f85b16d0c`
  const parentHash = commit.parents?.length ? commit.parents.join(', ') : commit.parent ? (commit.parent.length > 7 ? commit.parent : `${commit.parent}019be47a1d40d5406a8f61b0`) : '—'
  const email = isWorkingTree ? '本地工作区' : commit.email ?? 'zhou@example.com'
  const message = commit.message ?? (isWorkingTree ? '这些修改尚未写入 Git 历史。' : `${commit.title}\n\n将提交图谱切换为可视区域渲染，并复用 lane 缓冲区，降低大型仓库滚动时的布局与绘制开销。\n\n- 仅渲染可见提交行\n- 缓存 lane 绘制数据\n- 保持搜索和跳转定位稳定`)
  const committer = commit.committer ?? commit.author
  const committerEmail = commit.committerEmail ?? email
  const commitTime = commit.commitTime ?? commit.time
  const commitText = (isWorkingTree ? [
    '状态：未提交',
    `基于：${parentHash}`,
    '',
    message,
  ] : [
    `提交：${fullHash}`,
    `父级：${parentHash}`,
    `作者：${commit.author} <${email}>`,
    `提交人：${committer} <${committerEmail}>`,
    `提交日期：${formatLocalDateTime(commitTime)}`,
    '',
    message,
  ]).join('\n')
  const copy = () => {
    commitTextRef.current?.focus()
    commitTextRef.current?.select()
    document.execCommand('copy')
    navigator.clipboard?.writeText(commitText).catch(() => undefined)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  const copyHash = () => {
    navigator.clipboard?.writeText(fullHash).catch(() => undefined)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  return <section className="commit-details">
    <div className="detail-heading"><div><span className="eyebrow">{isWorkingTree ? '工作区详情' : '提交详情'}</span><h2>{commit.title}</h2></div>{!isWorkingTree && <Button variant="icon" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setMoreMenu({ x: rect.right - 220, y: rect.bottom + 4 }) }} title="更多提交操作"><MoreHorizontal size={17}/></Button>}</div>
    <div className="identity-row"><div className="avatar large">{commit.avatar}</div><div><strong>{commit.author}</strong><span>{isWorkingTree ? `${email} · 尚未提交` : `${email} · ${formatLocalDateTime(commitTime)}`}</span></div>{!commit.fullHash && !isWorkingTree && <span className="verified"><Check size={11}/> 已验证</span>}</div>
    <div className="commit-text-panel">
      <div className="commit-text-toolbar"><div><FileText size={14}/><span>{isWorkingTree ? '工作区信息' : '完整提交信息'}</span></div><button className="icon-tool-button" onClick={copy} title={copied ? '已复制' : '复制全部'} aria-label={copied ? '已复制' : '复制全部'}>{copied ? <Check size={14}/> : <Copy size={14}/>}</button></div>
      <textarea ref={commitTextRef} aria-label="完整提交信息" readOnly value={commitText} onFocus={(event) => event.currentTarget.select()}/>
    </div>
    {moreMenu && !isWorkingTree && <ContextMenu x={moreMenu.x} y={moreMenu.y} onClose={() => setMoreMenu(null)}><div className="context-menu-title"><GitCommitHorizontal size={13}/><span>提交详情操作</span></div><button onClick={() => { copyHash(); setMoreMenu(null) }}><Copy size={14}/><span>复制提交 Hash</span></button><button onClick={() => { copy(); setMoreMenu(null) }}><FileText size={14}/><span>复制完整提交信息</span></button></ContextMenu>}
  </section>
}

function ChangedFilesPanel({ files, loading, activeFile, onOpenFile, onOpenHistory }: { files: RepositoryFile[]; loading?: boolean; activeFile: number | null; onOpenFile: (index: number) => void; onOpenHistory: (path: string, tab: HistoryTarget['tab']) => void }) {
  const [fileMode, setFileMode] = usePersistentState('branchline.changedFilesMode.v1', 'list', isFileMode)
  const [moreMenu, setMoreMenu] = useState<{ x: number; y: number } | null>(null)
  const [contextFile, setContextFile] = useState<{ file: RepositoryFile; x: number; y: number } | null>(null)
  const [collapsedFolders, setCollapsedFolders] = usePersistentState('branchline.changedFilesCollapsedFolders.v1', {}, isBooleanRecord)
  const fileFolders = useMemo(() => {
    const folders = new Set<string>()
    files.forEach((file) => {
      const segments = file.path.split('/').filter(Boolean).slice(0, -1)
      segments.forEach((_, index) => folders.add(segments.slice(0, index + 1).join('/')))
    })
    return Array.from(folders)
  }, [files])
  return <section className="changed-files-panel">
    <div className="changed-files-heading"><div><FileDiff size={15}/><strong>变更文件</strong><span>{loading ? '…' : files.length}</span></div><div className="changed-files-actions"><div className="segmented compact-segmented icon-segmented"><button className={fileMode === 'tree' ? 'active' : ''} onClick={() => setFileMode('tree')} title="树形视图" aria-label="树形视图"><FolderOpen size={14}/></button><button className={fileMode === 'list' ? 'active' : ''} onClick={() => setFileMode('list')} title="列表视图" aria-label="列表视图"><List size={14}/></button></div><Button variant="icon" disabled={loading || !files.length} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setMoreMenu({ x: rect.right - 220, y: rect.bottom + 4 }) }} title="更多文件操作"><MoreHorizontal size={15}/></Button></div></div>
    {loading ? <div className="changed-files-list"><div className="changed-files-empty"><RefreshCw className="spin" size={15}/><span>正在读取该提交的变更文件…</span></div></div> : !files.length ? <div className="changed-files-list"><div className="changed-files-empty"><FileDiff size={15}/><span>该提交没有文件变更</span></div></div> : <DiffFileList files={files} activeFile={activeFile ?? -1} mode={fileMode} onSelectFile={onOpenFile} className="changed-files-list" fileRowHeight={42} folderRowHeight={28} collapsedFolders={collapsedFolders} onCollapsedFoldersChange={setCollapsedFolders} showOpenIndicator onFileContextMenu={(event, file) => { event.preventDefault(); setContextFile({ file, x: event.clientX, y: event.clientY }) }}/>} 
    {moreMenu && <ContextMenu x={moreMenu.x} y={moreMenu.y} onClose={() => setMoreMenu(null)}><div className="context-menu-title"><FileDiff size={13}/><span>变更文件操作</span></div>{fileMode === 'tree' && <><button onClick={() => { setCollapsedFolders({}); setMoreMenu(null) }}><ChevronDown size={14}/><span>展开全部文件夹</span></button><button onClick={() => { setCollapsedFolders(Object.fromEntries(fileFolders.map((folder) => [folder, true]))); setMoreMenu(null) }}><ChevronRight size={14}/><span>收起全部文件夹</span></button><div className="context-menu-separator"/></>}<button onClick={() => { navigator.clipboard?.writeText(files.map((file) => file.path).join('\n')).catch(() => undefined); setMoreMenu(null) }}><Copy size={14}/><span>复制文件路径列表</span></button><button onClick={() => { navigator.clipboard?.writeText(files.map((file) => `${file.type} ${file.path} (+${file.add} -${file.del})`).join('\n')).catch(() => undefined); setMoreMenu(null) }}><FileText size={14}/><span>复制变更摘要</span></button></ContextMenu>}
    {contextFile && <ContextMenu x={contextFile.x} y={contextFile.y} onClose={() => setContextFile(null)}><div className="context-menu-title"><FileText size={13}/><span>{contextFile.file.path}</span></div><button onClick={() => { onOpenHistory(contextFile.file.path, 'history'); setContextFile(null) }}><History size={14}/><span>查看文件历史</span></button><button onClick={() => { onOpenHistory(contextFile.file.path, 'blame'); setContextFile(null) }}><Rows3 size={14}/><span>查看逐行归属（Blame）</span></button><div className="context-menu-separator"/><button onClick={() => { navigator.clipboard?.writeText(contextFile.file.path).catch(() => undefined); setContextFile(null) }}><Copy size={14}/><span>复制文件路径</span></button></ContextMenu>}
  </section>
}

function ShortcutOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  const shortcuts = [
    ['⌘ F', '聚焦提交搜索'],
    ['⌘ ⇧ F', '立即 Fetch'],
    ['⌘ ↵', '打开暂存与提交'],
    ['T', '切换树形 / 列表视图'],
    ['W', '切换 Diff 宽屏模式'],
    ['⌘ + / −', '放大 / 缩小 Diff 字体'],
    ['⌘ 0', '恢复 Diff 默认字号'],
    ['⌘ /', '切换深色 / 浅色主题'],
    ['?', '显示快捷键'],
  ]
  return <div className="shortcut-backdrop" onClick={onClose}><section className="shortcut-dialog" onClick={(event) => event.stopPropagation()}>
    <div className="drawer-heading"><div><span className="eyebrow">导航</span><h2>快捷键</h2></div><Button variant="icon" onClick={onClose}><X size={18}/></Button></div>
    <div className="shortcut-list">{shortcuts.map(([key, label]) => <div className="shortcut-row" key={key}><span>{label}</span><kbd>{key}</kbd></div>)}</div>
  </section></div>
}

function RepositoryWelcome({ recentRepositories, openingRepository, onOpenRepository, onOpenRepositoryPath }: { recentRepositories: RecentRepository[]; openingRepository: boolean; onOpenRepository: () => void; onOpenRepositoryPath: (path: string) => void }) {
  return <section className="repository-welcome">
    <div className="welcome-card">
      <div className="welcome-icon"><AppMark/></div>
      <span className="eyebrow">开始使用 Branchline</span>
      <h1>打开一个 Git 仓库</h1>
      <p>选择已有仓库或 Worktree，即可查看提交图谱、工作区变更、Stash、Submodule 与完整 Diff。</p>
      <Button variant="primary" className="welcome-open-button" onClick={onOpenRepository} disabled={openingRepository}><FolderOpen size={16}/>{openingRepository ? '正在读取仓库…' : '选择本地仓库'}</Button>
      {recentRepositories.length > 0 && <div className="welcome-recents"><div className="welcome-section-title"><span>最近打开</span><small>{recentRepositories.length}</small></div>{recentRepositories.slice(0, 5).map((item) => <button key={item.path} onClick={() => onOpenRepositoryPath(item.path)} disabled={openingRepository}><span className="switcher-icon"><FolderGit2 size={14}/></span><span><strong>{item.name}</strong><small>{item.path}</small></span><ChevronRight size={14}/></button>)}</div>}
      <div className="welcome-capabilities"><div><GitBranch size={16}/><span><strong>提交与分支</strong><small>提交图谱、搜索和分支管理</small></span></div><div><GitFork size={16}/><span><strong>Worktree</strong><small>在同一仓库内快速切换</small></span></div><div><Box size={16}/><span><strong>Submodule</strong><small>进入子模块并返回父仓库</small></span></div></div>
    </div>
  </section>
}

export default function App() {
  const { repository, parentRepository, recentRepositories, openingRepository, fetching, repositoryNotice, pauseRepositoryNotice, resumeRepositoryNotice, setRepositoryNotice, applySnapshot, openRepository, openRepositoryPath, openSubmodulePath, returnToParentRepository, fetchNow, autoFetchEnabled, fetchIntervalMinutes, localPollingEnabled, localPollingIntervalSeconds, setAutoFetchEnabled, setFetchIntervalMinutes, setLocalPollingEnabled, setLocalPollingIntervalSeconds, lastFetchAt } = useRepositoryWorkspace()
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistentState('branchline.sidebarCollapsed.v1', false, (value): value is boolean => typeof value === 'boolean')
  const [sidebarWidth, setSidebarWidth] = usePersistentState('branchline.sidebarWidth.v1', 252, isSidebarWidth)
  const [inspectorWidth, setInspectorWidth] = usePersistentState('branchline.inspectorWidth.v1', 360, isInspectorWidth)
  const [detailsHeight, setDetailsHeight] = usePersistentState('branchline.detailsHeight.v1', 330, isDetailsHeight)
  const [panelResizing, setPanelResizing] = useState<'sidebar' | 'inspector' | 'details' | null>(null)
  const [selected, setSelected] = useState('')
  const [query, setQuery] = useState('')
  const [searchMode, setSearchMode] = useState<HistorySearchMode>('locate')
  const [searchAction, setSearchAction] = useState<SearchNavigationAction>({ sequence: 0, direction: 1 })
  const [searchSummary, setSearchSummary] = useState<SearchSummary>({ current: 0, total: 0 })
  const handleSearchSummaryChange = useCallback((next: SearchSummary) => {
    setSearchSummary((current) => retainUnchangedSearchSummary(current, next))
  }, [])
  const [repositorySwitcherSignal, setRepositorySwitcherSignal] = useState(0)
  const [branchFilter, setBranchFilter] = useState('all')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [filterMenu, setFilterMenu] = useState<{ kind: 'branch' | 'time'; x: number; y: number } | null>(null)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('history')
  const [structureSelection, setStructureSelection] = useState<RepositoryStructureSelection>({ kind: 'root' })
  const [compareBase, setCompareBase] = useState<string | null>(null)
  const [branchDialog, setBranchDialog] = useState<{ prefix?: string } | null>(null)
  const [rebaseDialog, setRebaseDialog] = useState<{ commit: string; label: string } | null>(null)
  const [gitConfigOpen, setGitConfigOpen] = useState(false)
  const [wideDiff, setWideDiff] = useState(false)
  const [diffFile, setDiffFile] = useState<number | null>(null)
  const [inspectorCollapsed, setInspectorCollapsed] = usePersistentState('branchline.inspectorCollapsed.v1', false, (value): value is boolean => typeof value === 'boolean')
  const [theme, setTheme] = usePersistentState('branchline.theme.v1', 'light', isTheme)
  const [shortcutOpen, setShortcutOpen] = useState(false)
  const [autoFetchOpen, setAutoFetchOpen] = useState(false)
  const [historyTarget, setHistoryTarget] = useState<HistoryTarget | null>(null)
  const [activeOperation, setActiveOperation] = useState<ActiveOperation | null>(null)
  const [operationPath, setOperationPath] = useState<string | null>(null)
  const [commitStats, setCommitStats] = useState<Record<string, RepositoryCommitStats>>({})
  const [commitFiles, setCommitFiles] = useState<Record<string, RepositoryFile[]>>({})
  const searchRef = useRef<HTMLInputElement>(null)
  const autoFetchRef = useRef<HTMLDivElement>(null)
  const expandedRepositoryPath = useRef<string | null>(null)
  const structureRepositoryPath = useRef<string | null>(null)
  const previousCommits = useRef<Commit[]>([])
  const workingTreeCommit = useMemo(() => repository
    ? createWorkingTreeCommit(repository.files, resolveWorkingTreeParent(repository))
    : null, [repository])
  const activeCommits = useMemo<Commit[]>(() => workingTreeCommit
    ? [workingTreeCommit, ...(repository?.commits ?? [])]
    : repository?.commits ?? [], [repository?.commits, workingTreeCommit])
  const availableBranches = repository?.branches ?? []
  const selectedCommitBase = activeCommits.find((commit) => commit.id === selected) ?? activeCommits[0] ?? emptyCommit
  const selectedWorkingTree = selectedCommitBase.status === 'working'
  const selectedStatsKey = selectedCommitBase.fullHash ?? selectedCommitBase.id
  useEffect(() => {
    if (!repository) {
      structureRepositoryPath.current = null
      setStructureSelection({ kind: 'root' })
      return
    }
    if (structureRepositoryPath.current !== repository.path) {
      structureRepositoryPath.current = repository.path
      setStructureSelection({ kind: 'root' })
      return
    }
    setStructureSelection((current) => resolveRepositoryStructureSelection(repository, current))
  }, [repository])
  const selectedCommit = !selectedWorkingTree && commitStats[selectedStatsKey]
    ? { ...selectedCommitBase, ...commitStats[selectedStatsKey] }
    : selectedCommitBase
  const selectedCommitFiles = selectedWorkingTree ? repository?.files ?? [] : repository ? (commitFiles[selectedStatsKey] ?? []) : []
  const selectedCommitFilesLoading = !selectedWorkingTree && Boolean(repository) && selectedCommitBase.id !== '—' && !Object.prototype.hasOwnProperty.call(commitFiles, selectedStatsKey)
  useEffect(() => {
    if (!autoFetchOpen) return
    const closeWhenOutside = (event: PointerEvent) => {
      if (!autoFetchRef.current?.contains(event.target as Node)) setAutoFetchOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAutoFetchOpen(false)
    }
    document.addEventListener('pointerdown', closeWhenOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeWhenOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [autoFetchOpen])
  useEffect(() => {
    const path = repository?.path ?? null
    if (path && expandedRepositoryPath.current !== path) {
      setSelected(repository?.commits[0]?.id ?? '')
    } else if (path) {
      setSelected((current) => current === WORKING_TREE_COMMIT_ID && Boolean(repository?.files.length)
        ? current
        : resolveCommitSelection(previousCommits.current, repository?.commits ?? [], current))
    }
    expandedRepositoryPath.current = path
    previousCommits.current = repository?.commits ?? []
  }, [repository?.commits, repository?.files.length, repository?.path])
  useEffect(() => {
    if (!repository || selectedWorkingTree || selectedCommitBase.id === '—' || commitStats[selectedStatsKey]) return
    let cancelled = false
    loadRepositoryCommitStats(repository.path, selectedStatsKey)
      .then((stats) => {
        if (!cancelled) setCommitStats((current) => ({ ...current, [selectedStatsKey]: stats }))
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [commitStats, repository?.path, selectedStatsKey, selectedWorkingTree])
  useEffect(() => {
    if (!repository || selectedWorkingTree || selectedCommitBase.id === '—' || Object.prototype.hasOwnProperty.call(commitFiles, selectedStatsKey)) return
    let cancelled = false
    loadRepositoryCommitFiles(repository.path, selectedStatsKey)
      .then((files) => {
        if (!cancelled) setCommitFiles((current) => ({ ...current, [selectedStatsKey]: files }))
      })
      .catch((error) => {
        if (cancelled) return
        setCommitFiles((current) => ({ ...current, [selectedStatsKey]: [] }))
        setRepositoryNotice(error instanceof Error ? error.message : String(error))
      })
    return () => { cancelled = true }
  }, [commitFiles, repository?.path, selectedStatsKey, selectedWorkingTree])
  useEffect(() => {
    setDiffFile(null)
    setWideDiff(false)
  }, [selectedStatsKey])
  const loadSelectedCommitDiff = useCallback((filePath: string) => {
    if (!repository) return Promise.resolve([])
    if (selectedWorkingTree) return loadRepositoryFileDiff(repository.path, filePath)
    return loadFileCommitDiff(repository.path, selectedStatsKey, filePath)
  }, [repository?.path, selectedStatsKey, selectedWorkingTree])
  const handleOpenSnapshot = (snapshot: RepositorySnapshot | null) => {
    if (!snapshot) return
    setCommitStats({})
    setCommitFiles({})
    setSelected(snapshot.commits[0]?.id ?? '')
    setDiffFile(null)
    setWideDiff(false)
    setQuery('')
    setBranchFilter('all')
    setTimeFilter('all')
    setWorkspaceView(snapshot.operation ? 'changes' : 'history')
  }
  const handleOpenRepository = async () => handleOpenSnapshot(await openRepository())
  const handleOpenRepositoryPath = async (path: string, preserveTrail = false) => handleOpenSnapshot(await openRepositoryPath(path, preserveTrail))
  const handleOpenSubmodulePath = async (path: string) => handleOpenSnapshot(await openSubmodulePath(path))
  const handleReturnToParentRepository = async () => handleOpenSnapshot(await returnToParentRepository())
  const handleSnapshot = (snapshot: RepositorySnapshot) => {
    applySnapshot(snapshot)
    setSelected((current) => current === WORKING_TREE_COMMIT_ID && snapshot.files.length
      ? current
      : resolveCommitSelection(activeCommits, snapshot.commits, current))
    if (!snapshot.operation && workspaceView === 'operation') setWorkspaceView('history')
  }
  const handleDeleteBranchPrefix = async (prefix: string) => {
    if (!repository) return setRepositoryNotice('请先打开本地仓库')
    try {
      const branches = await previewBranchPrefix(repository.path, prefix)
      if (!branches.length) return setRepositoryNotice(`前缀 ${prefix} 下没有可删除的本地分支`)
      const confirmed = window.confirm(`将永久删除以下 ${branches.length} 个本地分支：\n\n${branches.join('\n')}\n\n此操作不会删除远程分支，是否继续？`)
      if (!confirmed) return
      const snapshot = await deleteBranchPrefix(repository.path, prefix, branches)
      applySnapshot(snapshot, `已删除 ${branches.length} 个 ${prefix} 前缀分支`)
    } catch (error) {
      setRepositoryNotice(error instanceof Error ? error.message : String(error))
    }
  }
  const openCreateBranchDialog = (prefix?: string) => {
    if (!repository) return setRepositoryNotice('创建分支需要先打开本地仓库')
    setBranchDialog({ prefix })
  }
  const handleCreateBranch = async (branch: string) => {
    if (!repository) {
      setRepositoryNotice('创建分支需要先打开本地仓库')
      return false
    }
    try {
      const snapshot = await createRepositoryBranch(repository.path, branch)
      applySnapshot(snapshot, `已创建分支：${branch}`)
      return true
    } catch (error) {
      setRepositoryNotice(error instanceof Error ? error.message : String(error))
      return false
    }
  }
  const handleSwitchBranch = async (branch: string) => {
    if (!repository) return setRepositoryNotice('切换分支需要先打开本地仓库')
    if (branch === repository.branch) return setRepositoryNotice(`当前已在 ${branch}`)
    try {
      const snapshot = await switchRepositoryBranch(repository.path, branch)
      handleSnapshot(snapshot)
      setWorkspaceView('history')
      setRepositoryNotice(`已切换到分支：${snapshot.branch}`)
    } catch (error) {
      setRepositoryNotice(error instanceof Error ? error.message : String(error))
    }
  }
  const executeRepositoryAction = async (action: (repositoryPath: string) => Promise<RepositorySnapshot>, success: string, operation?: ActiveOperation) => {
    if (!repository) {
      setRepositoryNotice('该操作需要先打开本地仓库')
      return
    }
    if (operation && activeOperation) {
      setRepositoryNotice(`${activeOperation.label}，请等待当前操作完成`)
      return
    }
    if (operation) setActiveOperation(operation)
    try {
      const snapshot = await action(repository.path)
      handleSnapshot(snapshot)
      if (snapshot.operation) {
        setOperationPath(snapshot.operation.conflicts[0] ?? null)
        setWorkspaceView('operation')
        setRepositoryNotice(`${snapshot.operation.label}：请处理 ${snapshot.operation.conflicts.length} 个冲突文件`)
      } else {
        setRepositoryNotice(success)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      try {
        const snapshot = await loadRepository(repository.path)
        applySnapshot(snapshot)
      } catch {
        // 保留原始 Git 操作错误，仓库可通过下一次刷新重新同步。
      }
      setRepositoryNotice(message)
    } finally {
      if (operation) setActiveOperation((current) => current?.key === operation.key ? null : current)
    }
  }
  const handleMergeReference = async (reference: string, label = reference) => {
    if (!repository) return setRepositoryNotice('合并操作需要先打开本地仓库')
    if (repository.operation) return setRepositoryNotice(`请先完成或中止当前${repository.operation.label}`)
    if (!window.confirm(`将 ${label} 合并到 ${repository.branch}？\n\n工作区必须保持干净；如产生冲突，将保留 Git 的冲突状态供后续处理。`)) return
    await executeRepositoryAction((path) => mergeRepositoryReference(path, reference), `已将 ${label} 合并到 ${repository.branch}`)
  }
  const handleCherryPickCommit = async (commit: Commit) => {
    if (!repository) return setRepositoryNotice('Cherry-pick 需要先打开本地仓库')
    if (repository.operation) return setRepositoryNotice(`请先完成或中止当前${repository.operation.label}`)
    if (!window.confirm(`将提交 ${commit.id} Cherry-pick 到 ${repository.branch}？\n\n${commit.title}`)) return
    await executeRepositoryAction((path) => cherryPickRepositoryCommit(path, commit.fullHash ?? commit.id), `已 Cherry-pick 提交 ${commit.id}`)
  }
  const handleResetCommit = async (commit: Commit) => {
    if (!repository) return setRepositoryNotice('回退提交需要先打开本地仓库')
    if (!window.confirm(`将 ${repository.branch} 回退到提交 ${commit.id}？\n\n提交之后的内容会保留为未暂存文件，不会直接删除。`)) return
    await executeRepositoryAction((path) => resetRepositoryToCommit(path, commit.fullHash ?? commit.id), `已回退到提交 ${commit.id}，后续改动已保留在工作区`)
  }
  const handleRebaseCommit = async (commit: Commit) => {
    if (!repository) return setRepositoryNotice('变基操作需要先打开本地仓库')
    if (repository.operation) return setRepositoryNotice(`请先完成或中止当前${repository.operation.label}`)
    setRebaseDialog({ commit: commit.fullHash ?? commit.id, label: commit.id })
  }
  const startRebase = async (onto: string) => {
    if (!repository) return
    await executeRepositoryAction((path) => rebaseRepositoryOnto(path, onto), `已将 ${repository.branch} 变基到 ${onto.slice(0, 8)}`)
    setRebaseDialog(null)
  }
  const handleTagCommit = async (commit: Commit) => {
    if (!repository) return setRepositoryNotice('创建标签需要先打开本地仓库')
    const tagName = window.prompt(`为提交 ${commit.id} 输入标签名称`)?.trim()
    if (!tagName) return
    await executeRepositoryAction((path) => createRepositoryTag(path, tagName, commit.fullHash ?? commit.id), `已创建标签 ${tagName}`)
  }
  const handleCompareCommit = (commit: Commit) => {
    setCompareBase(commit.fullHash ?? commit.id)
    setWorkspaceView('compare')
  }
  const handleApplyStash = async (reference: string) => {
    await executeRepositoryAction(
      (path) => applyRepositoryStash(path, reference, false),
      `已应用并保留 ${reference}`,
      { key: 'stash', label: `正在应用 ${reference}…`, detail: '正在将 Stash 中的修改恢复到工作区' },
    )
  }
  const handlePopStash = async (reference: string) => {
    if (!window.confirm(`弹出 ${reference}？\n\n修改会应用到工作区，成功后该 Stash 将被删除。`)) return
    await executeRepositoryAction(
      (path) => applyRepositoryStash(path, reference, true),
      `已弹出并删除 ${reference}`,
      { key: 'stash', label: `正在弹出 ${reference}…`, detail: '正在恢复修改，并在成功后删除该 Stash' },
    )
  }
  const handleDropStash = async (reference: string) => {
    if (!window.confirm(`确定永久删除 ${reference}？\n\n此操作不会把其中的修改恢复到工作区。`)) return
    await executeRepositoryAction(
      (path) => dropRepositoryStash(path, reference),
      `已删除 ${reference}`,
      { key: 'stash', label: `正在删除 ${reference}…`, detail: '正在从 Stash 列表中移除该记录' },
    )
  }
  const handlePullBranch = async (branch: string) => {
    const hasLocalChanges = branch === repository?.branch && Boolean(repository?.files.length)
    await executeRepositoryAction(
      (path) => pullRepositoryBranch(path, branch),
      hasLocalChanges ? `分支 ${branch} 已拉取，本地修改保持不变` : `分支 ${branch} 已拉取并安全快进`,
      { key: 'pull', label: hasLocalChanges ? '正在检查本地修改并拉取…' : `正在拉取 ${branch}…`, detail: hasLocalChanges ? '仅当远端涉及同一普通文件时自动 Stash；Gitlink 不会进入 Stash' : '正在获取远端提交并安全快进当前分支' },
    )
  }
  const handlePush = async () => {
    await executeRepositoryAction((path) => pushRepository(path), `分支 ${repository?.branch ?? ''} 已推送`, { key: 'push', label: `正在推送 ${repository?.branch ?? ''}…`, detail: '正在将本地提交发送到远端仓库' })
  }
  const handleFetch = useCallback(async () => {
    if (!repository || fetching || activeOperation) return
    setActiveOperation({ key: 'fetch', label: '正在获取远端更新…', detail: '正在刷新远程分支和提交状态' })
    try {
      await fetchNow()
    } finally {
      setActiveOperation((current) => current?.key === 'fetch' ? null : current)
    }
  }, [activeOperation, fetchNow, fetching, repository])
  const handleDeleteBranch = async (branch: string) => {
    if (!repository) return setRepositoryNotice('删除分支需要先打开本地仓库')
    const remote = branch.includes('/') && branch.startsWith('origin/')
    if (!window.confirm(`${remote ? '远程' : '本地'}分支 ${branch} 将被永久删除，是否继续？`)) return
    await executeRepositoryAction((path) => deleteRepositoryBranch(path, branch), `已删除分支 ${branch}`)
  }
  const copyText = async (value: string, success: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setRepositoryNotice(success)
    } catch {
      setRepositoryNotice('复制失败，请检查系统剪贴板权限')
    }
  }
  const handleJumpBranch = (branch: string) => {
    const commit = activeCommits.find((item) => item.branches?.includes(branch))
    if (!commit) {
      setRepositoryNotice(`未在当前提交范围找到分支 ${branch} 指向的提交`)
      return
    }
    setWorkspaceView('history')
    setQuery('')
    setSelected(commit.id)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-commit-id="${commit.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      })
    })
  }
  const handleJumpTag = (tag: string) => {
    const commit = activeCommits.find((item) => item.branches?.includes(tag))
    if (!commit) {
      setRepositoryNotice(`标签 ${tag} 指向的提交不在当前 500 条图谱范围内`)
      return
    }
    setWorkspaceView('history')
    setQuery('')
    setBranchFilter('all')
    setTimeFilter('all')
    setSelected(commit.id)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-commit-id="${commit.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      })
    })
  }
  const beginPanelResize = (panel: 'sidebar' | 'inspector', event: React.PointerEvent<HTMLSpanElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = panel === 'sidebar' ? sidebarWidth : inspectorWidth
    setPanelResizing(panel)
    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX
      if (panel === 'sidebar') setSidebarWidth(Math.min(360, Math.max(200, startWidth + delta)))
      else setInspectorWidth(Math.min(520, Math.max(300, startWidth - delta)))
    }
    const onUp = () => {
      setPanelResizing(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  const beginDetailsResize = (event: React.PointerEvent<HTMLSpanElement>) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = detailsHeight
    setPanelResizing('details')
    const onMove = (moveEvent: PointerEvent) => setDetailsHeight(Math.min(560, Math.max(230, startHeight + moveEvent.clientY - startY)))
    const onUp = () => {
      setPanelResizing(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key.toLowerCase() === 'f') { event.preventDefault(); searchRef.current?.focus() }
      if (modifier && event.key.toLowerCase() === 'p') { event.preventDefault(); setSidebarCollapsed(false); setRepositorySwitcherSignal((current) => current + 1) }
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); void handleFetch() }
      if (modifier && event.key === 'Enter') { event.preventDefault(); setWorkspaceView('changes') }
      if (event.key.toLowerCase() === 'w' && !modifier && document.activeElement?.tagName !== 'INPUT') { setWideDiff((value) => !value) }
      if (event.key.toLowerCase() === 't' && !modifier && document.activeElement?.tagName !== 'INPUT') {
        const activeView = document.querySelector<HTMLButtonElement>('.view-switch button.active')
        const nextView = activeView?.nextElementSibling ?? activeView?.parentElement?.querySelector('button')
        ;(nextView as HTMLButtonElement | null)?.click()
      }
      if (modifier && event.key === '/') { event.preventDefault(); setTheme((value) => value === 'dark' ? 'light' : 'dark') }
      if (event.key === '?' && !modifier) { setShortcutOpen((value) => !value) }
      if (event.key === 'Escape') { setShortcutOpen(false); setHistoryTarget(null); setDiffFile(null); setWideDiff(false); setFilterMenu(null); setNotificationOpen(false) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleFetch])
  const inspectorVisible = workspaceView === 'history' && !inspectorCollapsed && !(wideDiff && diffFile !== null)
  const timeFilterLabels: Record<TimeFilter, string> = { all: '全部时间', day: '最近 24 小时', week: '最近 7 天', month: '最近 30 天' }
  const branchFilterLabel = branchFilter === 'all' ? '全部分支' : branchFilter
  return <main className={`app-shell ${theme === 'light' ? 'theme-light' : ''} ${panelResizing === 'details' ? 'panel-resizing-vertical' : panelResizing ? 'panel-resizing' : ''}`}>
    <div className={`sidebar-shell ${sidebarCollapsed ? 'collapsed' : ''}`} style={{ width: sidebarCollapsed ? 0 : sidebarWidth, flexBasis: sidebarCollapsed ? 0 : sidebarWidth }}>
      <Sidebar repository={repository} parentRepository={parentRepository} recentRepositories={recentRepositories} openingRepository={openingRepository} activeView={workspaceView} structureSelection={structureSelection} repositorySwitcherSignal={repositorySwitcherSignal} onOpenRepository={handleOpenRepository} onOpenRepositoryPath={handleOpenRepositoryPath} onOpenSubmodulePath={handleOpenSubmodulePath} onReturnToParentRepository={handleReturnToParentRepository} onCreateBranch={openCreateBranchDialog} onDeleteBranchPrefix={(prefix) => void handleDeleteBranchPrefix(prefix)} onJumpBranch={handleJumpBranch} onSwitchBranch={(branch) => void handleSwitchBranch(branch)} onPullBranch={(branch) => void handlePullBranch(branch)} onMergeBranch={(branch) => void handleMergeReference(branch)} onDeleteBranch={(branch) => void handleDeleteBranch(branch)} onCopyBranch={(branch) => void copyText(branch, `已复制分支名：${branch}`)} onSelectView={setWorkspaceView} onSelectStructure={(selection) => { setStructureSelection(selection); setWorkspaceView('structure') }} onOpenGitConfig={() => setGitConfigOpen(true)} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}/>
    </div>
    <span className={`panel-resizer sidebar-resizer ${sidebarCollapsed ? 'hidden' : ''} ${panelResizing === 'sidebar' ? 'active' : ''}`} role="separator" aria-label="拖动调整左侧面板宽度" onPointerDown={(event) => beginPanelResize('sidebar', event)}/>
    <div className={`workspace ${repository ? '' : 'empty-repository'}`}>
      {repository && <header className="topbar">
        <div className="branch-context">{sidebarCollapsed && <Button variant="icon" className="panel-toggle" onClick={() => setSidebarCollapsed(false)} title="展开左侧面板"><PanelLeftOpen size={17}/></Button>}{parentRepository && <button className="parent-repository-chip" onClick={() => void handleReturnToParentRepository()} title={`返回父仓库：${parentRepository.path}`}><ArrowLeft size={13}/><Box size={13}/><span>{parentRepository.name}</span></button>}{repository ? <GitBranch size={16}/> : <FolderOpen size={16}/>}<strong>{repository?.branch ?? '未打开仓库'}</strong></div>
          <div className={`global-search ${query ? 'has-query' : ''}`}><Search size={16}/><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); setSearchAction((current) => ({ sequence: current.sequence + 1, direction: event.shiftKey ? -1 : 1 })) } }} placeholder={repository ? '搜索提交信息、Hash 或提交人…' : '打开仓库后可搜索提交'} disabled={!repository}/>{query ? <><span className="search-result-count">{searchSummary.total ? `${searchSummary.current || 1}/${searchSummary.total}` : '0/0'}</span><button type="button" onClick={() => setSearchAction((current) => ({ sequence: current.sequence + 1, direction: -1 }))} disabled={!searchSummary.total} title="上一个匹配"><ChevronUp size={13}/></button><button type="button" onClick={() => setSearchAction((current) => ({ sequence: current.sequence + 1, direction: 1 }))} disabled={!searchSummary.total} title="下一个匹配"><ChevronDown size={13}/></button><button type="button" className={searchMode === 'filter' ? 'active' : ''} onClick={() => setSearchMode((current) => current === 'locate' ? 'filter' : 'locate')} title={searchMode === 'locate' ? '切换为仅显示匹配提交' : '保留完整图谱并定位匹配提交'}><ListFilter size={13}/></button><button type="button" onClick={() => setQuery('')} title="清除搜索"><X size={13}/></button></> : <kbd>⌘ F</kbd>}</div>
          <div className="top-actions">
            <Button variant="icon" onClick={() => setShortcutOpen(true)} title="查看快捷键"><Command size={17}/></Button>
            <Button variant="secondary" className="fetch-button sync-action" onClick={() => void handleFetch()} disabled={!repository || fetching || Boolean(activeOperation)} title="获取远程更新"><RefreshCw size={15} className={fetching ? 'spin' : ''}/><span>{fetching ? '获取中…' : '获取'}</span></Button>
            <Button variant="secondary" className="fetch-button sync-action" onClick={() => repository && void handlePullBranch(repository.branch)} disabled={!repository || Boolean(activeOperation) || Boolean(repository.operation)} title={repository?.operation ? '请先完成当前 Git 操作' : repository?.behind ? `拉取当前分支（${repository.behind} 个待拉取提交）` : '拉取当前分支'}>{activeOperation?.key === 'pull' ? <RefreshCw className="spin" size={15}/> : <CloudDownload size={15}/>}<span>{activeOperation?.key === 'pull' ? '拉取中…' : '拉取'}</span>{Boolean(repository?.behind) && <small className="sync-count pull-count">{repository!.behind}</small>}</Button>
            <Button variant="secondary" className="fetch-button sync-action" onClick={() => void handlePush()} disabled={!repository || Boolean(activeOperation) || Boolean(repository.operation)} title={repository?.operation ? '请先完成当前 Git 操作' : repository?.ahead ? `推送当前分支（${repository.ahead} 个待推送提交）` : '推送当前分支'}>{activeOperation?.key === 'push' ? <RefreshCw className="spin" size={15}/> : <CloudUpload size={15}/>}<span>{activeOperation?.key === 'push' ? '推送中…' : '推送'}</span>{Boolean(repository?.ahead) && <small className="sync-count push-count">{repository!.ahead}</small>}</Button>
            <Button variant="icon" onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? '切换浅色主题' : '切换深色主题'}>{theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}</Button>
            <Button variant="icon" className="notification" active={notificationOpen} onClick={() => setNotificationOpen((value) => !value)} title="查看通知"><Bell size={17}/><span/></Button>
            {notificationOpen && <div className="notification-popover">
              <div className="popover-heading"><strong>通知</strong><button onClick={() => setNotificationOpen(false)} title="关闭通知"><X size={13}/></button></div>
              <div className="notification-item unread"><span/><div><strong>{repository ? '仓库状态正常' : '尚未打开仓库'}</strong><small>{repository ? `${repository.branch}：领先 ${repository.ahead}，落后 ${repository.behind}` : '选择本地 Git 仓库后开始使用'}</small></div></div>
              <div className="notification-item"><span/><div><strong>{repository ? (autoFetchEnabled ? '自动 Fetch 已启用' : '自动 Fetch 已停用') : '自动 Fetch 等待中'}</strong><small>{repository ? (autoFetchEnabled ? `每 ${fetchIntervalMinutes} 分钟在后台更新远程引用` : '可在底部状态栏重新启用') : '打开仓库后按当前配置运行'}</small></div></div>
              <div className="notification-item"><span/><div><strong>Submodule 状态</strong><small>{repository ? `${repository.submoduleCount} 个 Submodule 已同步` : '暂无仓库数据'}</small></div></div>
            </div>}
          </div>
        </header>
      }
      {repository ? <><div className="content-tabs"><button className={workspaceView === 'history' ? 'active' : ''} onClick={() => setWorkspaceView('history')} title="提交历史和提交图谱"><GitCommitHorizontal size={14}/><span className="tab-label">提交历史</span></button><button className={workspaceView === 'changes' ? 'active' : ''} onClick={() => setWorkspaceView('changes')} title="查看和暂存工作区变更"><FileDiff size={14}/><span className="tab-label">工作区变更</span></button><button className={workspaceView === 'stash' ? 'active' : ''} onClick={() => setWorkspaceView('stash')} title="浏览和管理 Stash"><Archive size={14}/><span className="tab-label">Stash</span></button><button className={workspaceView === 'compare' ? 'active' : ''} onClick={() => { setCompareBase(null); setWorkspaceView('compare') }} title="比较两个提交或分支的差异"><GitCompareArrows size={14}/><span className="tab-label">Diff 比较</span></button><button className={workspaceView === 'merge' ? 'active' : ''} onClick={() => setWorkspaceView('merge')} title="查看待合并分支和冲突"><GitMerge size={14}/><span className="tab-label">合并队列</span></button>{repository.operation && <button className={`operation-tab ${workspaceView === 'operation' ? 'active' : ''}`} onClick={() => setWorkspaceView('operation')} title="处理当前 Git 操作"><CircleDot size={14}/><span className="tab-label">{repository.operation.kind === 'rebase' ? '变基处理' : repository.operation.conflicts.length ? '冲突处理' : repository.operation.kind === 'merge' ? '合并处理' : repository.operation.kind === 'cherry-pick' ? '挑选处理' : '操作处理'}</span><span className="tab-badge">{repository.operation.conflicts.length || repository.operation.currentStep || '!'}</span></button>}<div className="tab-spacer"/>{workspaceView === 'history' && <><Button variant="secondary" className="filter-button" active={branchFilter !== 'all'} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setFilterMenu({ kind: 'branch', x: rect.right - 220, y: rect.bottom + 4 }) }} title={`分支筛选：${branchFilterLabel}`}><ListFilter size={14}/><span>{branchFilterLabel}</span><ChevronDown size={12}/></Button><Button variant="secondary" className="filter-button" active={timeFilter !== 'all'} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setFilterMenu({ kind: 'time', x: rect.right - 220, y: rect.bottom + 4 }) }} title={`时间筛选：${timeFilterLabels[timeFilter]}`}><Clock3 size={14}/><span>{timeFilterLabels[timeFilter]}</span><ChevronDown size={12}/></Button></>}</div>
      {filterMenu && <ContextMenu x={filterMenu.x} y={filterMenu.y} onClose={() => setFilterMenu(null)}>
        {filterMenu.kind === 'branch' ? <><div className="context-menu-title"><ListFilter size={13}/><span>按分支筛选提交</span></div><div className="context-menu-options"><button className={branchFilter === 'all' ? 'selected-option' : ''} onClick={() => { setBranchFilter('all'); setFilterMenu(null) }}><Check size={14}/><span>全部分支</span></button>{availableBranches.map((branch) => <button className={branchFilter === branch ? 'selected-option' : ''} key={branch} onClick={() => { setBranchFilter(branch); setFilterMenu(null) }}><GitBranch size={14}/><span>{branch}</span></button>)}</div></> : <><div className="context-menu-title"><Clock3 size={13}/><span>按提交时间筛选</span></div>{(['all', 'day', 'week', 'month'] as TimeFilter[]).map((value) => <button className={timeFilter === value ? 'selected-option' : ''} key={value} onClick={() => { setTimeFilter(value); setFilterMenu(null) }}><Clock3 size={14}/><span>{timeFilterLabels[value]}</span></button>)}</>}
      </ContextMenu>}
      <div className={`workspace-grid ${wideDiff && diffFile !== null ? 'diff-wide' : ''} ${inspectorCollapsed ? 'inspector-collapsed' : ''}`} style={{ gridTemplateColumns: `minmax(0, 1fr) ${inspectorVisible ? 1 : 0}px ${inspectorVisible ? inspectorWidth : 0}px` }}>
        {workspaceView === 'history' && <section className="history-pane">
          <CommitList key={repository.path} commits={activeCommits} selected={selected} onSelect={setSelected} query={query} searchMode={searchMode} searchAction={searchAction} onSearchSummaryChange={handleSearchSummaryChange} branchFilter={branchFilter} timeFilter={timeFilter} currentBranch={repository.branch} remoteBranches={repository.remoteBranches} branchTracking={repository.branchTracking} tags={repository.tags} stashReference={repository.stashes[0]?.reference ?? 'stash@{0}'} inspectorCollapsed={inspectorCollapsed} onToggleInspector={() => setInspectorCollapsed((value) => !value)} onMergeCommit={(commit) => void handleMergeReference(commit.fullHash ?? commit.id, `提交 ${commit.id}`)} onCherryPickCommit={(commit) => void handleCherryPickCommit(commit)} onResetCommit={(commit) => void handleResetCommit(commit)} onRebaseCommit={(commit) => void handleRebaseCommit(commit)} onTagCommit={(commit) => void handleTagCommit(commit)} onCompareCommit={handleCompareCommit} onCopyCommit={(commit, mode) => void copyText(mode === 'hash' ? commit.fullHash ?? commit.id : formatCommitClipboard(commit), mode === 'hash' ? `已复制${commit.status === 'stash' ? ' Stash' : '提交'} Hash：${commit.id}` : `已复制${commit.status === 'stash' ? ' Stash' : `提交 ${commit.id}`} 的完整信息`)} onOpenStash={() => setWorkspaceView('stash')} onApplyStash={(reference) => void handleApplyStash(reference)} onPopStash={(reference) => void handlePopStash(reference)} onDropStash={(reference) => void handleDropStash(reference)}/>
          {diffFile !== null && <div className="history-diff-overlay"><DiffPanel files={selectedCommitFiles} repositoryPath={repository.path} wide={wideDiff} onWideChange={setWideDiff} initialFile={diffFile} hideFileList loadRows={loadSelectedCommitDiff} onOpenLineHistory={(path, line, side) => setHistoryTarget({ path, line, tab: 'line', revision: selectedWorkingTree ? (side === 'old' ? selectedCommit.parent : undefined) : side === 'old' ? (selectedCommit.parents?.[0] ?? selectedCommit.parent ?? selectedStatsKey) : selectedStatsKey })} onClose={() => { setDiffFile(null); setWideDiff(false) }}/></div>}
        </section>}
        {workspaceView === 'compare' && <ComparePanel repository={repository} initialBase={compareBase ?? undefined} initialTarget={compareBase ? repository?.branch : undefined} onNotice={setRepositoryNotice}/>} 
        {workspaceView === 'merge' && <MergeQueuePanel repository={repository} onNotice={setRepositoryNotice} onSwitchBranch={handleSwitchBranch}/>} 
        {workspaceView === 'operation' && <Suspense fallback={<section className="workspace-empty"><RefreshCw className="spin" size={28}/><strong>正在加载冲突编辑器</strong><span>编辑器组件仅在处理合并、变基或 Cherry-pick 时按需加载。</span></section>}><OperationPanel repository={repository} onSnapshot={handleSnapshot} onNotice={setRepositoryNotice} initialPath={operationPath} onReturnToChanges={() => setWorkspaceView('changes')}/></Suspense>}
        {workspaceView === 'changes' && (
          <StagingPage
            repository={repository}
            onSnapshot={handleSnapshot}
            onNotice={setRepositoryNotice}
            onOperationChange={(label) => setActiveOperation(label ? { key: 'commit', label, detail: '正在写入提交并刷新仓库状态' } : null)}
            onOpenHistory={(path, tab) => setHistoryTarget({ path, tab })}
            onOpenLineHistory={(path, line) => setHistoryTarget({ path, line, tab: 'line', revision: 'HEAD' })}
            onOpenConflict={(path) => { setOperationPath(path); setWorkspaceView('operation') }}
          />
        )}
        {workspaceView === 'stash' && <StashPage repository={repository} onSnapshot={(snapshot) => {
          handleSnapshot(snapshot)
          if (snapshot.operation) {
            setOperationPath(snapshot.operation.conflicts[0] ?? null)
            setWorkspaceView('operation')
          }
        }} onNotice={setRepositoryNotice}/>}
        {(workspaceView === 'structure' || workspaceView === 'tags') && (
          <RepositoryStructurePanel
            repository={repository}
            view={workspaceView}
            selection={structureSelection}
            onOpenPath={(path, kind) => void (kind === 'submodule' ? handleOpenSubmodulePath(path) : handleOpenRepositoryPath(path, true))}
            onOpenTag={handleJumpTag}
            onSnapshot={handleSnapshot}
            onNotice={setRepositoryNotice}
          />
        )}
        <span className={`panel-resizer inspector-resizer ${inspectorVisible ? '' : 'hidden'} ${panelResizing === 'inspector' ? 'active' : ''}`} role="separator" aria-label="拖动调整右侧面板宽度" onPointerDown={(event) => beginPanelResize('inspector', event)}/>
        {workspaceView === 'history' && <section className="inspector-pane" style={{ gridTemplateRows: `${detailsHeight}px 1px minmax(0, 1fr)` }}>
          <CommitDetails commit={selectedCommit}/>
          <span className={`panel-resizer inspector-vertical-resizer ${panelResizing === 'details' ? 'active' : ''}`} role="separator" aria-label="拖动调整提交信息和变更文件高度" onPointerDown={beginDetailsResize}/>
          <ChangedFilesPanel files={selectedCommitFiles} loading={selectedCommitFilesLoading} activeFile={diffFile} onOpenFile={(index) => { setDiffFile(index); setWideDiff(false) }} onOpenHistory={(path, tab) => setHistoryTarget({ path, tab })}/>
        </section>}
      </div>
      <footer className="statusbar">
        <div><span className={repository.operation ? 'status-warning' : 'status-ok'}>{repository.operation ? <AlertTriangle size={11}/> : <Check size={11}/>}</span><span>{repository.operation?.label ?? '仓库状态正常'}</span><span className="status-separator"/><GitBranch size={12}/><span>{repository.operation?.originalBranch ?? repository.branch}</span><span>↑{repository.ahead}</span><span>↓{repository.behind}</span></div>
        <div ref={autoFetchRef} className="statusbar-secondary"><button className={`status-fetch-control ${autoFetchOpen ? 'active' : ''}`} onClick={() => setAutoFetchOpen((value) => !value)} aria-expanded={autoFetchOpen} aria-haspopup="dialog" title="配置后台同步"><TimerReset size={12}/><span>自动 Fetch：{autoFetchEnabled ? `每 ${fetchIntervalMinutes} 分钟` : '已停用'}</span></button><span className="status-separator"/><Box size={12}/><span>{repository.submoduleCount} 个 Submodule 已同步</span><span className="status-separator"/><Code2 size={12}/><span>UTF-8</span>{autoFetchOpen && <div className="auto-fetch-popover" role="dialog" aria-label="后台同步配置"><div className="auto-fetch-heading"><div><strong>后台同步</strong><small>控制远程引用更新与本地状态采样</small></div><Button variant="icon" onClick={() => setAutoFetchOpen(false)} title="关闭"><X size={14}/></Button></div><label className="auto-fetch-toggle"><span><strong>启用自动 Fetch</strong><small>仅在仓库已打开时执行</small></span><input type="checkbox" checked={autoFetchEnabled} onChange={(event) => setAutoFetchEnabled(event.target.checked)}/><span className="toggle-track" aria-hidden="true"><span/></span></label><label className="auto-fetch-field"><span>获取间隔</span><select value={fetchIntervalMinutes} onChange={(event) => setFetchIntervalMinutes(Number(event.target.value))} disabled={!autoFetchEnabled}>{[1, 5, 10, 15, 30].map((minutes) => <option key={minutes} value={minutes}>{minutes} 分钟</option>)}</select></label><div className="local-polling-settings"><label className="auto-fetch-toggle"><span><strong>本地状态采样</strong><small>定期检测其他工具产生的仓库变更</small></span><input type="checkbox" checked={localPollingEnabled} onChange={(event) => setLocalPollingEnabled(event.target.checked)}/><span className="toggle-track" aria-hidden="true"><span/></span></label><label className="auto-fetch-field"><span>采样间隔</span><select value={localPollingIntervalSeconds} onChange={(event) => setLocalPollingIntervalSeconds(Number(event.target.value))} disabled={!localPollingEnabled}>{[2, 5, 10, 30].map((seconds) => <option key={seconds} value={seconds}>{seconds} 秒</option>)}</select></label></div><div className="auto-fetch-meta"><span>最近 Fetch</span><strong>{lastFetchAt ? new Date(lastFetchAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '尚未执行'}</strong></div><Button variant="secondary" className="auto-fetch-now" onClick={() => void handleFetch()} disabled={fetching || Boolean(activeOperation)}><RefreshCw size={13} className={fetching ? 'spin' : ''}/>{fetching ? '获取中…' : '立即 Fetch'}</Button></div>}</div>
      </footer></> : <RepositoryWelcome recentRepositories={recentRepositories} openingRepository={openingRepository} onOpenRepository={handleOpenRepository} onOpenRepositoryPath={(path) => void handleOpenRepositoryPath(path)}/>} 
    </div>
    {openingRepository && <div className="repository-loading" role="status" aria-live="polite"><div><RefreshCw className="spin" size={22}/><strong>正在加载仓库</strong><span>正在读取分支、提交图谱、Worktree 与 Submodule…</span></div></div>}
    {activeOperation && <div className="operation-indicator" role="status" aria-live="polite"><RefreshCw className="spin" size={17}/><div><strong>{activeOperation.label}</strong><span>{activeOperation.detail}</span></div></div>}
    <HistoryDrawer repositoryPath={repository?.path} filePath={historyTarget?.path ?? null} initialTab={historyTarget?.tab ?? 'history'} lineNumber={historyTarget?.line} revision={historyTarget?.revision} onClose={() => setHistoryTarget(null)}/>
    <CreateBranchDialog open={Boolean(branchDialog)} prefix={branchDialog?.prefix} currentBranch={repository?.branch ?? ''} onClose={() => setBranchDialog(null)} onCreate={handleCreateBranch}/>
    <RebaseDialog open={Boolean(rebaseDialog)} repository={repository} onto={rebaseDialog?.commit ?? null} targetLabel={rebaseDialog?.label ?? ''} onClose={() => setRebaseDialog(null)} onStart={startRebase}/>
    <GitConfigDialog open={gitConfigOpen} onClose={() => setGitConfigOpen(false)} onNotice={setRepositoryNotice}/>
    <ShortcutOverlay open={shortcutOpen} onClose={() => setShortcutOpen(false)}/>
    {repositoryNotice && <button className="app-notice" onMouseEnter={pauseRepositoryNotice} onMouseLeave={resumeRepositoryNotice} onFocus={pauseRepositoryNotice} onBlur={resumeRepositoryNotice} onClick={() => setRepositoryNotice(null)}>{repositoryNotice}<X size={14}/></button>}
  </main>
}
