import { Tooltip } from './components/tooltip'
import { message, errorMessage, renderMessage, type MessageContent } from './i18n/messages'
import type { AppTranslator } from './i18n/useAppTranslation'
import type { Locale } from './i18n/localePreference'
import { operationLabel, operationMessage } from './i18n/operationLabels'
import { useAppTranslation } from './i18n/useAppTranslation'
import { getShortcutModifier } from './platformShortcut'
import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { applyRepositoryStash, cherryPickRepositoryCommit, createRepositoryBranch, createRepositoryTag, deleteBranchPrefix, deleteRepositoryBranch, dropRepositoryStash, loadFileCommitDiff, loadRepository, loadRepositoryFileImage, loadRepositoryHistory, loadRepositoryCommitFiles, loadRepositoryCommitFileContent, loadRepositoryCommitTreeFiles, loadRepositoryCommitStats, loadRepositoryFileDiff, loadRepositoryStashFileDiff, loadRepositoryStashFiles, mergeRepositoryReference, previewBranchPrefix, pullRepositoryBranch, pushRepository, rebaseRepositoryOnto, resetRepositoryToCommit, revertRepositoryCommit, switchRepositoryBranch, undoLastCommit, type RepositoryCommitStats, type RepositoryDiffLine, type RepositoryFile, type RepositorySnapshot } from './repository'
import { ContextMenu } from './components/ContextMenu'
import { Button } from './components/Button'
import { LanguageSelect } from './components/LanguageSelect'
import { CompactSelect } from './components/CompactSelect'
import { useConfirmDialog } from './components/ConfirmDialog'
import { useRepositoryWorkspace } from './features/repository/useRepositoryWorkspace'
import { StagingPage } from './features/staging/StagingPage'
import { HistoryDrawer } from './features/history/HistoryDrawer'
import { DiffFileList } from './features/diff/DiffFileList'
import { DiffPanel } from './features/diff/DiffPanel'
import { ComparePanel } from './features/compare/ComparePanel'
import { CreateBranchDialog } from './features/branch/CreateBranchDialog'
import { GitConfigDialog } from './features/settings/GitConfigDialog'
import { CommandLogPanel } from './features/settings/CommandLogPanel'
import { MergeQueuePanel } from './features/merge/MergeQueuePanel'
import { RepositoryStructurePanel, type StructureView } from './features/repository/RepositoryStructurePanel'
import { RepositoryStructureTree } from './features/repository/RepositoryStructureTree'
import { RepositoryManagerPage } from './features/repository/RepositoryManagerPage'
import { RepositoryStartupScreen } from './features/repository/RepositoryStartupScreen'
import { RepositoryQuickSwitcher } from './features/repository/RepositoryQuickSwitcher'
import { resolveRepositoryStructureSelection, type RepositoryStructureSelection } from './features/repository/repositoryTree'
import { isRepositoryDescendant, sameRepositoryPath } from './features/repository/repositoryPaths'
import { StashPage } from './features/stash/StashPage'
import { RebaseDialog } from './features/operation/RebaseDialog'
import { CherryPickDialog } from './features/operation/CherryPickDialog'
import { buildCommitGraphLayout, lanePosition, type CommitGraphRow } from './features/graph/commitGraphLayout'
import { captureCommitAnchor, resolveCommitSelection, restoreCommitAnchor, type CommitViewportAnchor } from './features/history/historyRefresh'
import { trackedRemoteReference, visibleCommitReferences, type BranchTrackingMap } from './features/history/historyReferences'
import { matchingCommitIds, nextSearchMatch, retainUnchangedSearchSummary, visibleHistoryCommits, type HistorySearchMode, type HistorySearchSummary } from './features/history/historySearch'
import { createWorkingTreeCommit, resolveWorkingTreeParent, WORKING_TREE_COMMIT_ID } from './features/history/workingTreeCommit'
import { DEFAULT_HISTORY_LOAD_LIMIT, nextHistoryLoadLimit } from './features/history/historyDepth'
import { activeCommitFileIndex, buildCommitFileTree, commitFileContentRows, filterCommitFilesByPath } from './features/history/commitFileTree'
import { findParentCommit } from './features/history/parentNavigation'
import { findReferenceCommit } from './features/history/referenceNavigation'
import { formatLocalDateTime } from './dateTime'
import { isAutoPullBranchSettings, toggleAutoPullBranch as toggleConfiguredAutoPullBranch } from './features/repository/branchSwitch'
import { useAutoFastForward } from './features/repository/useAutoFastForward'
import { isBooleanRecord, usePersistentState } from './persistentState'
import { isThemePreference, nextThemePreference, resolveTheme, type ThemePreference } from './themePreference'
import { DEFAULT_HISTORY_COLUMN_WIDTHS, DEFAULT_HISTORY_VISIBLE_COLUMNS, isHistoryColumnWidths, isHistoryVisibleColumns } from './features/history/historyColumns'
import { committerInitials, committerName, isHistoryCommitVisibleOnSelectedBranches, matchesCommitterFilter, reachableHistoryCommitIds, toggleFilterValue, unloadedHistoryBranches } from './features/history/historyFilters'
import { acquireOperationLock, releaseOperationLock } from './features/operation/operationLock'
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
  FolderTree,
  Files,
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  GitFork,
  GitMerge,
  History,
  List,
  ListFilter,
  MoreHorizontal,
  Maximize2,
  Minimize2,
  Monitor,
  Minus,
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
  TerminalSquare,
  Undo2,
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
type ActiveOperation = { key: 'fetch' | 'pull' | 'push' | 'commit' | 'stash' | 'revert' | 'cherry-pick' | 'merge' | 'history'; label: MessageContent; detail: MessageContent }

const isSidebarWidth = (value: unknown): value is number => typeof value === 'number' && value >= 200 && value <= 360
const isInspectorWidth = (value: unknown): value is number => typeof value === 'number' && value >= 300 && value <= 520
const isDetailsHeight = (value: unknown): value is number => typeof value === 'number' && value >= 230 && value <= 560
const isFileMode = (value: unknown): value is 'list' | 'tree' | 'all' => value === 'list' || value === 'tree' || value === 'all'

function getResizeDeltaFromKey(event: { key: string; shiftKey: boolean; preventDefault: () => void }, orientation: 'vertical' | 'horizontal', reverse = false) {
  const direction = orientation === 'vertical'
    ? event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    : event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  if (!direction) return 0
  event.preventDefault()
  return direction * (reverse ? -1 : 1) * (event.shiftKey ? 36 : 12)
}

const OperationPanel = lazy(async () => ({ default: (await import('./features/operation/OperationPanel')).OperationPanel }))

function AppMark({ className }: { className?: string }) {
  return <img className={className} src="/app-icon.svg" alt="" aria-hidden="true"/>
}

const emptyCommit = (t: AppTranslator): Commit => ({
  id: '—', lane: 0, color: '#70d9d2', title: t('history:app.emptyRepository'), author: 'Git', avatar: 'GT', time: '—', files: 0, additions: 0, deletions: 0,
})

function formatCommitClipboard(commit: Commit, t: AppTranslator, locale: Locale) {
  const metadata = [
    t('history:app.clipboard.commit', { "id": commit.fullHash ?? commit.id }),
    t('history:app.clipboard.parent', { "parent": commit.parents?.join(', ') || commit.parent || '—' }),
    t('history:app.clipboard.author', { "author": commit.author, "email": commit.email ? ` <${commit.email}>` : '' }),
    t('history:app.clipboard.committer', { "author": commit.committer ?? commit.author, "committerEmail": commit.committerEmail ? ` <${commit.committerEmail}>` : '' }),
    t('history:app.clipboard.date', { "time": formatLocalDateTime(commit.commitTime ?? commit.time, true, locale) }),
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

function formatCommitListTime(commit: Commit, locale: Locale) {
  const timestamp = commitTimestamp(commit)
  return timestamp === null ? commit.time : new Intl.DateTimeFormat(locale, { year: new Date(timestamp).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(timestamp)
}

function BranchTree({ branches, remoteBranches = [], branchTracking = {}, worktreeBranches = {}, currentBranch, autoPullBranches = [], pullingBranches = [], onToggleAutoPull, onCreateBranch, onDeletePrefix, onJumpBranch, onSwitchBranch, onPullBranch, onMergeBranch, onDeleteBranch, onCopyBranch }: { branches: string[]; remoteBranches?: string[]; branchTracking?: Record<string, { upstream?: string; ahead: number; behind: number }>; worktreeBranches?: Record<string, string>; currentBranch?: string; autoPullBranches?: string[]; pullingBranches?: string[]; onToggleAutoPull: (branch: string) => void; onCreateBranch: (prefix?: string) => void; onDeletePrefix: (prefix: string) => void; onJumpBranch: (branch: string) => void; onSwitchBranch: (branch: string) => void; onPullBranch: (branch: string) => void; onMergeBranch: (branch: string) => void; onDeleteBranch: (branch: string) => void; onCopyBranch: (branch: string) => void }) {
  const { t, i18n } = useAppTranslation()
  const locale = (i18n.resolvedLanguage ?? 'zh-CN') as Locale

  const [open, setOpen] = usePersistentState('branchline.branchTreeOpen.v1', { local: true, feat: true, fix: true, remote: false }, isBooleanRecord)
  const [contextBranch, setContextBranch] = useState<{ branch: string; x: number; y: number } | null>(null)
  const [contextPrefix, setContextPrefix] = useState<{ prefix: string; x: number; y: number } | null>(null)
  const [branchQuery, setBranchQuery] = useState('')
  const normalizedBranchQuery = branchQuery.trim().toLocaleLowerCase()
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
    return count > 0 ? <Tooltip content={t('history:app.branches.incomingForBranch', { "branch": branch, "count": count })}><span className="branch-sync"  aria-label={t('history:app.branches.incoming', { "count": count })}>↓{new Intl.NumberFormat(locale).format(count)}</span></Tooltip> : null
  }
  const branchStatus = (branch: string) => <>{autoPullBranches.includes(branch) && <Tooltip content={t('history:app.branches.autoEnabled')}><span className="branch-auto-pull-mark" ><RefreshCw size={12}/></span></Tooltip>}{pullingBranches.includes(branch) && <Tooltip content={t('history:app.branches.pulling')}><span className="branch-pull-spinner spin" ><RefreshCw size={12}/></span></Tooltip>}</>
  const matchesBranch = (branch: string) => !normalizedBranchQuery || branch.toLocaleLowerCase().includes(normalizedBranchQuery)
  const branchNames = branches.filter((branch) => !remoteBranchSet.has(branch))
  const visibleBranchNames = branchNames.filter(matchesBranch)
  const visibleRemoteBranches = remoteBranches.filter(matchesBranch)
  const grouped = visibleBranchNames.reduce<Record<string, string[]>>((groups, branch) => {
    const [prefix, ...rest] = branch.split('/')
    const key = rest.length ? prefix : ''
    const value = rest.length ? rest.join('/') : branch
    groups[key] = [...(groups[key] ?? []), value]
    return groups
  }, {})
  const remoteGroups = visibleRemoteBranches.reduce<Record<string, string[]>>((groups, branch) => {
    const [remote, ...nameParts] = branch.split('/')
    if (!remote || !nameParts.length) return groups
    groups[remote] = [...(groups[remote] ?? []), nameParts.join('/')]
    return groups
  }, {})
  return <div className="nav-section branch-tree">
    <div className="section-title"><span>{t('history:app.branches.heading')}</span><Tooltip content={t('history:app.branches.create')}><button className="section-add" onClick={() => onCreateBranch()} aria-label={t('history:app.branches.create')}><Plus size={14}/></button></Tooltip></div>
    <label className="branch-filter"><Search size={13}/><input type="search" aria-label={t('history:app.branches.filter')} placeholder={t('history:app.branches.filter')} value={branchQuery} onChange={(event) => setBranchQuery(event.target.value)}/>{branchQuery && <button type="button" onClick={() => setBranchQuery('')} aria-label={t('history:app.branches.clearFilter')}><X size={13}/></button>}</label>
    <button className="tree-row group" onClick={() => toggle('local')}>{open.local || normalizedBranchQuery ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}<GitBranch size={14}/><span>{t('history:app.branches.local')}</span><span className="count">{new Intl.NumberFormat(locale).format(normalizedBranchQuery ? visibleBranchNames.length : branchNames.length)}</span></button>
    {(open.local || normalizedBranchQuery) && <div className="tree-children">
      {(grouped[''] ?? []).map((branch) => <Tooltip content={branch} key={branch}><button className={`tree-row ${branch === currentBranch ? 'active' : ''} ${pullingBranches.includes(branch) ? 'pulling' : ''}`}  onClick={() => onJumpBranch(branch)} onDoubleClick={() => { if (!pullingBranches.includes(branch)) onSwitchBranch(branch) }} onContextMenu={(event) => openContextMenu(event, branch)}  aria-disabled={pullingBranches.includes(branch)}><span className="tree-spacer"/><CircleDot size={12}/><span>{branch}</span>{branchStatus(branch)}{worktreeBranches[branch] && <Tooltip content={`Worktree: ${worktreeBranches[branch]}`}><span className="branch-worktree"  aria-label={`Worktree: ${worktreeBranches[branch]}`}><GitFork size={12}/></span></Tooltip>}{incomingBadge(branch)}</button></Tooltip>)}
      {Object.entries(grouped).filter(([prefix]) => prefix).map(([prefix, children]) => <div key={prefix}><Tooltip content={t('history:app.branches.groupHint')}><button className="tree-row group nested" onClick={() => toggle(prefix)} onContextMenu={(event) => openPrefixMenu(event, prefix)} >{open[prefix] || normalizedBranchQuery ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}<FolderGit2 size={13}/><span>{prefix}</span><span className="count">{new Intl.NumberFormat(locale).format(children.length)}</span></button></Tooltip>{(open[prefix] || normalizedBranchQuery) && <div className="tree-children compact">{children.map((branch) => { const fullBranch = `${prefix}/${branch}`; return <button className={`tree-row ${fullBranch === currentBranch ? 'active' : ''} ${pullingBranches.includes(fullBranch) ? 'pulling' : ''}`} key={fullBranch} onClick={() => onJumpBranch(fullBranch)} onDoubleClick={() => { if (!pullingBranches.includes(fullBranch)) onSwitchBranch(fullBranch) }} onContextMenu={(event) => openContextMenu(event, fullBranch)} aria-disabled={pullingBranches.includes(fullBranch)}><span className="tree-spacer"/><GitBranch size={12}/><span>{branch}</span>{branchStatus(fullBranch)}{worktreeBranches[fullBranch] && <Tooltip content={`Worktree: ${worktreeBranches[fullBranch]}`}><span className="branch-worktree"  aria-label={`Worktree: ${worktreeBranches[fullBranch]}`}><GitFork size={12}/></span></Tooltip>}{incomingBadge(fullBranch)}</button> })}</div>}</div>)}
    </div>}
    <button className="tree-row group" onClick={() => toggle('remote')}>{open.remote || normalizedBranchQuery ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}<CloudDownload size={14}/><span>{t('history:app.branches.remote')}</span><span className="count">{new Intl.NumberFormat(locale).format(normalizedBranchQuery ? visibleRemoteBranches.length : remoteBranches.length)}</span></button>
    {(open.remote || normalizedBranchQuery) && <div className="tree-children remote-tree">{Object.entries(remoteGroups).map(([remote, remoteBranchNames]) => {
      const remoteKey = `remote:${remote}`
      const groupedRemoteBranches = remoteBranchNames.reduce<Record<string, string[]>>((groups, branch) => {
        const [prefix, ...rest] = branch.split('/')
        const key = rest.length ? prefix : ''
        groups[key] = [...(groups[key] ?? []), rest.length ? rest.join('/') : branch]
        return groups
      }, {})
      return <div key={remote}><button className="tree-row group nested remote-root" onClick={() => toggle(remoteKey)}>{open[remoteKey] || normalizedBranchQuery ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}<CloudDownload size={13}/><span>{remote}</span><span className="count">{new Intl.NumberFormat(locale).format(remoteBranchNames.length)}</span></button>{(open[remoteKey] || normalizedBranchQuery) && <div className="tree-children compact remote-children">
        {(groupedRemoteBranches[''] ?? []).map((branch) => { const fullBranch = `${remote}/${branch}`; return <Tooltip content={fullBranch} key={fullBranch}><button className={`tree-row ${pullingBranches.includes(fullBranch) ? 'pulling' : ''}`}  onClick={() => onJumpBranch(fullBranch)} onDoubleClick={() => { if (!pullingBranches.includes(fullBranch)) onSwitchBranch(fullBranch) }} onContextMenu={(event) => openContextMenu(event, fullBranch)}  aria-disabled={pullingBranches.includes(fullBranch)}><span className="tree-spacer"/><GitBranch size={12}/><span>{branch}</span>{branchStatus(fullBranch)}</button></Tooltip> })}
        {Object.entries(groupedRemoteBranches).filter(([prefix]) => prefix).map(([prefix, children]) => { const prefixKey = `${remoteKey}:${prefix}`; return <div key={prefix}><button className="tree-row group remote-prefix" onClick={() => toggle(prefixKey)}>{open[prefixKey] ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}<FolderGit2 size={12}/><span>{prefix}</span><span className="count">{new Intl.NumberFormat(locale).format(children.length)}</span></button>{open[prefixKey] && <div className="tree-children compact remote-prefix-children">{children.map((branch) => { const fullBranch = `${remote}/${prefix}/${branch}`; return <button className={`tree-row ${pullingBranches.includes(fullBranch) ? 'pulling' : ''}`} key={fullBranch} onClick={() => onJumpBranch(fullBranch)} onDoubleClick={() => { if (!pullingBranches.includes(fullBranch)) onSwitchBranch(fullBranch) }} onContextMenu={(event) => openContextMenu(event, fullBranch)} aria-disabled={pullingBranches.includes(fullBranch)}><span className="tree-spacer"/><GitBranch size={12}/><span>{branch}</span>{branchStatus(fullBranch)}</button> })}</div>}</div> })}
      </div>}</div>
    })}</div>}
    {normalizedBranchQuery && !visibleBranchNames.length && !visibleRemoteBranches.length && <div className="branch-filter-empty">{t('history:app.branches.noMatches')}</div>}
    {contextBranch && <ContextMenu x={contextBranch.x} y={contextBranch.y} onClose={() => setContextBranch(null)}>
      <div className="context-menu-title"><GitBranch size={13}/><span>{contextBranch.branch}</span></div>
      {!remoteBranchSet.has(contextBranch.branch) && <button aria-pressed={autoPullBranches.includes(contextBranch.branch)} onClick={() => { onToggleAutoPull(contextBranch.branch); setContextBranch(null) }}><RefreshCw size={14}/><span>{t('history:app.branches.autoFastForward')}</span>{autoPullBranches.includes(contextBranch.branch) && <Check size={13}/>}</button>}
      <button onClick={() => { onPullBranch(contextBranch.branch); setContextBranch(null) }}><RefreshCw size={14}/><span>{t('history:app.branches.pull')}</span></button>
      <button onClick={() => { onMergeBranch(contextBranch.branch); setContextBranch(null) }} disabled={contextBranch.branch === currentBranch}><GitMerge size={14}/><span>{t('history:app.branches.mergeInto', { "currentBranch": currentBranch ?? t('history:app.branches.current') })}</span></button>
      <div className="context-menu-separator"/>
      <button onClick={() => { onCopyBranch(contextBranch.branch); setContextBranch(null) }}><Copy size={14}/><span>{t('history:app.branches.copyName')}</span></button>
      <Button variant="danger" onClick={() => { onDeleteBranch(contextBranch.branch); setContextBranch(null) }} disabled={contextBranch.branch === currentBranch}><Trash2 size={14}/><span>{t('history:app.branches.delete')}</span></Button>
    </ContextMenu>}
    {contextPrefix && <ContextMenu x={contextPrefix.x} y={contextPrefix.y} onClose={() => setContextPrefix(null)}>
      <div className="context-menu-title"><FolderGit2 size={13}/><span>{t('history:app.branches.group', { "prefix": contextPrefix.prefix })}</span></div>
      <button onClick={() => { toggle(contextPrefix.prefix); setContextPrefix(null) }}>{open[contextPrefix.prefix] ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}<span>{open[contextPrefix.prefix] ? t('history:app.branches.collapseGroup') : t('history:app.branches.expandGroup')}</span></button>
      <button onClick={() => { onCreateBranch(contextPrefix.prefix); setContextPrefix(null) }}><Plus size={14}/><span>{t('history:app.branches.createInGroup')}</span></button>
      <button onClick={() => { onCopyBranch(`${contextPrefix.prefix}/`); setContextPrefix(null) }}><Copy size={14}/><span>{t('history:app.branches.copyPrefix')}</span></button>
      <div className="context-menu-separator"/>
      <Button variant="danger" onClick={() => { onDeletePrefix(contextPrefix.prefix); setContextPrefix(null) }}><Trash2 size={14}/><span>{t('history:app.branches.deleteGroup')}</span></Button>
    </ContextMenu>}
  </div>
}

type SidebarProps = {
  repository: RepositorySnapshot | null
  structureRepository: RepositorySnapshot | null
  openingRepository: boolean
  activeView: WorkspaceView
  structureSelection: RepositoryStructureSelection
  onOpenRepository: () => void
  onOpenRepositoryPath: (path: string) => void
  onOpenSubmodulePath: (path: string) => void
  onCreateBranch: (prefix?: string) => void
  onDeleteBranchPrefix: (prefix: string) => void
  onJumpBranch: (branch: string) => void
  onSwitchBranch: (branch: string) => void
  onPullBranch: (branch: string) => void
  onMergeBranch: (branch: string) => void
  onDeleteBranch: (branch: string) => void
  onCopyBranch: (branch: string) => void
  autoPullBranches: string[]
  pullingBranches: string[]
  onToggleAutoPullBranch: (branch: string) => void
  onSelectView: (view: WorkspaceView) => void
  onSelectStructure: (selection: RepositoryStructureSelection) => void
  onOpenGitConfig: () => void
}

function Sidebar({ repository, structureRepository, openingRepository, activeView, structureSelection, onOpenRepository, onOpenRepositoryPath, onOpenSubmodulePath, onCreateBranch, onDeleteBranchPrefix, onJumpBranch, onSwitchBranch, onPullBranch, onMergeBranch, onDeleteBranch, onCopyBranch, autoPullBranches, pullingBranches, onToggleAutoPullBranch, onSelectView, onSelectStructure, onOpenGitConfig }: SidebarProps) {
  const { t, i18n } = useAppTranslation()
  const locale = (i18n.resolvedLanguage ?? 'zh-CN') as Locale

  return <aside className="sidebar">
    <nav>{repository ? <>
      <BranchTree branches={repository.branches} remoteBranches={repository.remoteBranches} branchTracking={repository.branchTracking} worktreeBranches={Object.fromEntries(repository.worktrees.filter((worktree) => worktree.branch && worktree.path.replace(/[\\/]+$/, '').toLocaleLowerCase() !== repository.path.replace(/[\\/]+$/, '').toLocaleLowerCase()).map((worktree) => [worktree.branch as string, worktree.path]))} currentBranch={repository.branch} autoPullBranches={autoPullBranches} pullingBranches={pullingBranches} onToggleAutoPull={onToggleAutoPullBranch} onCreateBranch={onCreateBranch} onDeletePrefix={onDeleteBranchPrefix} onJumpBranch={onJumpBranch} onSwitchBranch={onSwitchBranch} onPullBranch={onPullBranch} onMergeBranch={onMergeBranch} onDeleteBranch={onDeleteBranch} onCopyBranch={onCopyBranch}/>
      <RepositoryStructureTree repository={structureRepository ?? repository} activePath={repository.path} selection={structureSelection} onSelect={onSelectStructure} onOpenPath={(path, kind) => { if (kind === 'submodule') onOpenSubmodulePath(path); else onOpenRepositoryPath(path) }}/>
      <div className="nav-section structure-tags-section"><button className={`nav-row ${activeView === 'tags' ? 'active' : ''}`} onClick={() => onSelectView('tags')}><Tag size={15}/><span>{t('history:app.navigation.tags')}</span><span className="nav-badge muted">{new Intl.NumberFormat(locale).format(repository.tags.length)}</span></button></div>
    </> : <div className="sidebar-empty-state"><FolderOpen size={24}/><strong>{t('history:app.sidebar.noRepository')}</strong><span>{t('history:app.sidebar.openHint')}</span><button onClick={onOpenRepository} disabled={openingRepository}>{openingRepository ? t('history:app.sidebar.opening') : t('history:app.sidebar.open')}</button></div>}</nav>
    <div className="sidebar-footer"><Tooltip content={t('history:app.sidebar.openConfig')}><button className="profile" onClick={onOpenGitConfig}><Settings2 size={15}/><span>{t('history:app.sidebar.gitConfig')}</span><ChevronRight size={14}/></button></Tooltip></div>
  </aside>
}

function GraphLine({ commit, row, laneCount, graphWidth }: { commit: Commit; row: CommitGraphRow; laneCount: number; graphWidth: number }) {
  const { t, i18n } = useAppTranslation()
  const locale = (i18n.resolvedLanguage ?? 'zh-CN') as Locale

  const x = lanePosition(row.lane, laneCount, graphWidth)
  const isStash = commit.status === 'stash'
  const isWorking = commit.status === 'working'
  const isMerge = !isStash && !isWorking && (row.parentCount > 1 || commit.status === 'merge')
  const title = isWorking ? t('history:app.graph.working') : isStash ? t('history:app.graph.stash', { "id": commit.id }) : isMerge ? t('history:app.graph.merge', { "id": commit.id, "parentCount": row.parentCount }) : row.parentCount === 0 ? t('history:app.graph.endpoint', { "id": commit.id }) : t('history:app.graph.commitLane', { "id": commit.id, "lane1": row.lane + 1 })
  return <Tooltip content={title}><div className="graph-cell"  data-lane={row.lane} data-parent-count={row.parentCount}>
    <svg className="graph-segments" width={graphWidth} height="32" viewBox={`0 0 ${graphWidth} 32`} aria-hidden="true">
      {row.segments.map((segment) => <path key={segment.id} className={`graph-segment ${segment.kind}`} d={segment.path} stroke={segment.color}/>) }
    </svg>
    <span className={`commit-dot ${isMerge ? 'merge' : ''} ${isStash ? 'stash' : ''} ${isWorking ? 'working' : ''} ${row.parentCount === 0 ? 'terminal' : ''}`} style={{ left: x, borderColor: row.color, color: row.color, background: isMerge || isStash || isWorking ? 'transparent' : row.color }}/>
  </div></Tooltip>
}

type ColumnKey = 'branch' | 'graph' | 'time' | 'hash' | 'author'
const COMMIT_ROW_HEIGHT = 32

function commitDay(commit: Commit, locale: Locale) {
  const timestamp = commitTimestamp(commit)
  if (timestamp === null) return null
  const date = new Date(timestamp)
  return {
    key: `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
    label: new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(date),
  }
}

function CommitList({ revealSignal, commits, selected, onSelect, query, searchMode, searchAction, onSearchSummaryChange, branchFilter, timeFilter, currentBranch, remoteBranches, branchTracking, tags, stashReferences, inspectorCollapsed, onToggleInspector, onMergeCommit, onCherryPickCommit, onResetCommit, onRevertCommit, onRebaseCommit, onTagCommit, onCompareCommit, onCopyCommit, onApplyStash, onPopStash, onDropStash }: { revealSignal: number; commits: Commit[]; selected: string; onSelect: (id: string) => void; query: string; searchMode: HistorySearchMode; searchAction: SearchNavigationAction; onSearchSummaryChange: (summary: SearchSummary) => void; branchFilter: string[]; timeFilter: TimeFilter; currentBranch: string; remoteBranches: string[]; branchTracking: BranchTrackingMap; tags: string[]; stashReferences: Record<string, string>; inspectorCollapsed: boolean; onToggleInspector: () => void; onMergeCommit: (commit: Commit) => void; onCherryPickCommit: (commit: Commit) => void; onResetCommit: (commit: Commit) => void; onRevertCommit: (commit: Commit) => void; onRebaseCommit: (commit: Commit) => void; onTagCommit: (commit: Commit) => void; onCompareCommit: (commit: Commit) => void; onCopyCommit: (commit: Commit, mode: 'hash' | 'details') => void; onApplyStash: (reference: string) => void; onPopStash: (reference: string) => void; onDropStash: (reference: string) => void }) {
  const { t, i18n } = useAppTranslation()
  const locale = (i18n.resolvedLanguage ?? 'zh-CN') as Locale

  const [widths, setWidths] = usePersistentState('branchline.historyColumnWidths.v1', DEFAULT_HISTORY_COLUMN_WIDTHS, isHistoryColumnWidths)
  const [visibleColumns, setVisibleColumns] = usePersistentState('branchline.historyVisibleColumns.v1', DEFAULT_HISTORY_VISIBLE_COLUMNS, isHistoryVisibleColumns)
  const [columnMenuOpen, setColumnMenuOpen] = useState(false)
  const [committerFilter, setCommitterFilter] = useState<string[]>([])
  const [committerMenuOpen, setCommitterMenuOpen] = useState(false)
  useEffect(() => { setCommitterFilter([]) }, [revealSignal])
  const [contextCommit, setContextCommit] = useState<{ commit: Commit; x: number; y: number } | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [listHeight, setListHeight] = useState(600)
  const commitListRef = useRef<HTMLDivElement>(null)
  const columnsHeaderRef = useRef<HTMLDivElement>(null)
  const scrollFrame = useRef<number | null>(null)
  const pendingScrollTop = useRef(0)
  const viewportAnchor = useRef<CommitViewportAnchor | null>(null)
  const handledSearchAction = useRef(0)
  const autoLocatedSearch = useRef('')
  const deferredQuery = useDeferredValue(query)
  const committers = useMemo(() => Array.from(new Set(commits.filter((commit) => commit.status !== 'working').map((commit) => committerName(commit)))), [commits])
  const remoteBranchSet = useMemo(() => new Set(remoteBranches), [remoteBranches])
  const tagSet = useMemo(() => new Set(tags), [tags])
  const mergeBranch = contextCommit?.commit.branches?.find((reference) => remoteBranchSet.has(reference) || remoteBranchSet.has(reference.replace(/^refs\/remotes\//, '')))
  const mergeTargetLabel = mergeBranch ? t('history:app.references.branch', { "replacerefsremotes": mergeBranch.replace(/^refs\/remotes\//, '') }) : t('history:app.references.commit', { "id": contextCommit?.commit.id ?? '' })
  const contextStashReference = contextCommit?.commit.fullHash ? stashReferences[contextCommit.commit.fullHash] : undefined
  const branchCommitIds = useMemo(() => reachableHistoryCommitIds(commits, branchFilter), [branchFilter, commits])
  const baseFiltered = useMemo(() => {
    const timeWindow = timeFilter === 'day' ? 86_400_000 : timeFilter === 'week' ? 7 * 86_400_000 : timeFilter === 'month' ? 30 * 86_400_000 : null
    const threshold = timeWindow ? Date.now() - timeWindow : null
    return commits.filter((commit) => {
      const timestamp = threshold ? commitTimestamp(commit) : null
      const visibleOnBranch = isHistoryCommitVisibleOnSelectedBranches(commit, branchFilter, currentBranch, branchCommitIds)
      return matchesCommitterFilter(commit, committerFilter)
        && visibleOnBranch
        && (!threshold || timestamp === null || timestamp >= threshold)
    })
  }, [branchCommitIds, branchFilter, commits, committerFilter, currentBranch, timeFilter])
  const searchMatches = useMemo(() => matchingCommitIds(baseFiltered, deferredQuery), [baseFiltered, deferredQuery])
  const searchMatchSet = useMemo(() => new Set(searchMatches), [searchMatches])
  const filtered = useMemo(() => visibleHistoryCommits(baseFiltered, deferredQuery, searchMode), [baseFiltered, deferredQuery, searchMode])
  const selectedVisible = useMemo(() => filtered.some((commit) => commit.id === selected), [filtered, selected])
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
    const closeMenus = (event: PointerEvent) => {
      if (!columnsHeaderRef.current?.contains(event.target as Node)) {
        setColumnMenuOpen(false)
        setCommitterMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { setColumnMenuOpen(false); setCommitterMenuOpen(false) } }
    document.addEventListener('pointerdown', closeMenus)
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('pointerdown', closeMenus); document.removeEventListener('keydown', onKeyDown) }
  }, [])
  useEffect(() => {
    const searchKey = `${searchMode}\0${deferredQuery.trim()}`
    if (autoLocatedSearch.current === searchKey) return
    autoLocatedSearch.current = searchKey
    if (!deferredQuery.trim() || !searchMatches.length || searchMatchSet.has(selected)) return
    onSelect(searchMatches[0])
  }, [deferredQuery, onSelect, searchMatches, searchMatchSet, searchMode, selected])
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
  }, [revealSignal, selected, selectedVisible, deferredQuery])
  const committerColumnVisible = visibleColumns.committer ?? true
  const template = [`${widths.branch}px`, `${widths.graph}px`, 'minmax(180px, 1fr)', visibleColumns.time ? `${widths.time}px` : '', visibleColumns.hash ? `${widths.hash}px` : '', committerColumnVisible ? `${widths.author}px` : ''].filter(Boolean).join(' ')
  const committerFilterButton = <Button variant="icon" active={committerFilter.length > 0} onClick={() => { setCommitterMenuOpen((value) => !value); setColumnMenuOpen(false) }} tooltip={t('history:app.columns.filterCommitter')} aria-label={t('history:app.columns.filterCommitter')}><ListFilter size={14}/></Button>
  const committerFilterMenu = committerMenuOpen && <div className="column-config-menu author-filter-menu"><strong>{t('history:app.columns.filterCommitters')}</strong><button className={committerFilter.length === 0 ? 'active' : ''} onClick={() => setCommitterFilter([])}>{t('history:app.columns.allCommitters')}</button>{committers.map((committer) => <button className={committerFilter.includes(committer) ? 'active' : ''} key={committer} onClick={() => setCommitterFilter((values) => toggleFilterValue(values, committer))}><Check size={13} className={committerFilter.includes(committer) ? '' : 'filter-check-hidden'}/><span>{committer}</span></button>)}</div>
  const beginResize = (column: ColumnKey, event: React.PointerEvent<HTMLSpanElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = widths[column]
    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX
      const minimum = column === 'graph' ? 120 : column === 'author' ? 128 : column === 'time' ? 88 : column === 'branch' ? 90 : 68
      setWidths((current) => ({ ...current, [column]: Math.max(minimum, startWidth + delta) }))
    }
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  const resizer = (column: ColumnKey) => <span className="column-resizer" role="separator" aria-label={t('history:app.columns.resize')} onPointerDown={(event) => beginResize(column, event)}/>
  const refTag = (reference: string, color: string, references: string[]) => {
    const trackedRemote = trackedRemoteReference(reference, references, remoteBranchSet, branchTracking)
    const kind = reference === 'refs/stash' ? 'stash' : tagSet.has(reference) ? 'tag' : remoteBranchSet.has(reference) ? 'remote' : trackedRemote ? 'tracking' : 'local'
    const RefIcon = kind === 'stash' ? Archive : kind === 'tag' ? Tag : kind === 'remote' ? CloudDownload : GitBranch
    const kindLabel = kind === 'stash' ? t('history:app.references.stash') : kind === 'tag' ? t('history:app.navigation.tags') : kind === 'remote' ? t('history:app.references.remote') : kind === 'tracking' ? t('history:app.references.tracked') : t('history:app.references.local')
    const label = kind === 'stash' ? 'Stash' : reference
    const title = trackedRemote ? t('history:app.references.sameCommit', { "kindLabel": kindLabel, "reference": reference, "trackedRemote": trackedRemote }) : `${kindLabel}：${reference}`
    return <Tooltip content={title} key={reference}><span className={`ref ref-${kind}`} style={{ background: kind === 'stash' ? '#ffd666' : `color-mix(in srgb, ${color} 58%, white)` }}  ><RefIcon size={11}/>{trackedRemote && <CloudDownload size={11}/>}<span>{label}</span>{reference === currentBranch && <Check className="ref-current" size={11}/>}</span></Tooltip>
  }
  return <div className="commit-table">
    <div ref={columnsHeaderRef} className="commit-columns-header" style={{ gridTemplateColumns: template }}>
      <div className="column-label">{t('history:app.columns.references')}{resizer('branch')}</div>
      <div className="column-label">{t('history:app.columns.graph')}{resizer('graph')}</div>
      <div className="column-label message-label"><span className="column-title">{t('history:app.columns.message')}</span><div className="column-actions">{committerFilterButton}<Button variant="icon" onClick={() => { setColumnMenuOpen((value) => !value); setCommitterMenuOpen(false) }} tooltip={t('history:app.columns.configure')} aria-label={t('history:app.columns.configure')}><Settings2 size={14}/></Button></div>{columnMenuOpen && <div className="column-config-menu"><strong>{t('history:app.columns.show')}</strong><label><input type="checkbox" checked={visibleColumns.time} onChange={(event) => setVisibleColumns((value) => ({ ...value, time: event.target.checked }))}/>{t('history:app.columns.time')}</label><label><input type="checkbox" checked={visibleColumns.hash} onChange={(event) => setVisibleColumns((value) => ({ ...value, hash: event.target.checked }))}/>Hash</label><label><input type="checkbox" checked={committerColumnVisible} onChange={(event) => setVisibleColumns((value) => ({ ...value, committer: event.target.checked }))}/>{t('history:app.columns.committer')}</label></div>}{committerFilterMenu}</div>
      {visibleColumns.time && <div className="column-label">{t('history:app.columns.timeResizable')}{resizer('time')}</div>}
      {visibleColumns.hash && <div className="column-label">Hash{resizer('hash')}</div>}
      {committerColumnVisible && <div className="column-label author-label"><span className="column-title">{t('history:app.columns.committer')}</span>{resizer('author')}</div>}
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
      const currentDay = commitDay(commit, locale)
      const previousDay = visibleIndex > 0 ? commitDay(filtered[visibleIndex - 1], locale) : null
      const timeDivider = visibleIndex > 0 && currentDay && currentDay.key !== previousDay?.key ? currentDay.label : null
      const graphRow = graphLayout.rows[visibleIndex]
      const rowStyle = { gridTemplateColumns: template, '--time-divider-left': `${widths.branch + widths.graph + 8}px` } as React.CSSProperties
      return <button key={commit.id} data-commit-id={commit.id} className={`commit-row ${commit.status === 'working' ? 'working-tree' : ''} ${selected === commit.id ? 'selected' : ''} ${searchMatchSet.has(commit.id) ? 'search-match' : ''} ${selected === commit.id && searchMatchSet.has(commit.id) ? 'search-current' : ''} ${timeDivider ? 'time-break' : ''}`} style={rowStyle} onClick={() => onSelect(commit.id)} onContextMenu={(event) => { event.preventDefault(); if (commit.status === 'working') return; onSelect(commit.id); setContextCommit({ commit, x: event.clientX, y: event.clientY }) }}>
        {timeDivider && <span className="time-divider-label">{timeDivider}</span>}
        <div className="branch-cell">{commit.status === 'working' ? <span className="ref ref-working"><FileDiff size={11}/><span>{t('history:app.details.worktree')}</span></span> : visibleCommitReferences(commit.branches ?? [], remoteBranchSet, branchTracking).map((branch) => refTag(branch, graphRow.color, commit.branches ?? []))}</div>
        <GraphLine commit={commit} row={graphRow} laneCount={graphLayout.laneCount} graphWidth={widths.graph}/>
        <div className="commit-content message-cell">
          <div className="commit-subject"><span>{commit.title}</span></div>
        </div>
        {visibleColumns.time && <Tooltip content={formatLocalDateTime(commit.commitTime ?? commit.authorTime ?? commit.time, true, locale)}><div className="optional-cell time-cell" >{formatCommitListTime(commit, locale)}</div></Tooltip>}
        {visibleColumns.hash && <div className="optional-cell hash-cell">{commit.id}</div>}
        {committerColumnVisible && <div className={`author-cell ${committerFilter.includes(committerName(commit)) ? 'filtered-author' : ''}`}><div className="avatar tiny">{committerInitials(committerName(commit))}</div><span>{committerName(commit)}</span></div>}
      </button>
    })}
    {virtualRange.end < filtered.length && <div className="commit-list-spacer" style={{ height: (filtered.length - virtualRange.end) * COMMIT_ROW_HEIGHT }}/>}
    {filtered.length === 0 && <div className="empty-search">{commits.length ? <Search size={24}/> : <GitCommitHorizontal size={24}/>}<strong>{commits.length ? t('history:app.graph.noMatches') : t('history:app.emptyRepository')}</strong><span>{commits.length ? t('history:app.graph.searchHint') : t('history:app.graph.emptyHint')}</span></div>}
    </div>
    {contextCommit && <ContextMenu x={contextCommit.x} y={contextCommit.y} onClose={() => setContextCommit(null)}>
      {contextCommit.commit.status === 'stash' ? <>
        <div className="context-menu-title"><Archive size={13}/><span>{contextStashReference ?? 'Stash'} · {contextCommit.commit.title}</span></div>
        <button onClick={() => { if (inspectorCollapsed) onToggleInspector(); setContextCommit(null) }}><PanelRightOpen size={14}/><span>{t('history:app.graph.viewFiles')}</span></button>
        <button disabled={!contextStashReference} onClick={() => { if (contextStashReference) onApplyStash(contextStashReference); setContextCommit(null) }}><Check size={14}/><span>{t('history:app.stash.apply')}</span></button>
        <button disabled={!contextStashReference} onClick={() => { if (contextStashReference) onPopStash(contextStashReference); setContextCommit(null) }}><CornerDownLeft size={14}/><span>{t('history:app.stash.pop')}</span></button>
        <div className="context-menu-separator"/>
        <Button variant="danger" disabled={!contextStashReference} onClick={() => { if (contextStashReference) onDropStash(contextStashReference); setContextCommit(null) }}><Trash2 size={14}/><span>{t('history:app.stash.delete')}</span></Button>
        <div className="context-menu-separator"/>
        <button onClick={() => { onCopyCommit(contextCommit.commit, 'hash'); setContextCommit(null) }}><Copy size={14}/><span>{t('history:app.stash.copyHash')}</span></button>
        <button onClick={() => { onCopyCommit(contextCommit.commit, 'details'); setContextCommit(null) }}><FileText size={14}/><span>{t('history:app.stash.copyDetails')}</span></button>
      </> : <>
        <div className="context-menu-title"><GitCommitHorizontal size={13}/><span>{contextCommit.commit.id} · {contextCommit.commit.title}</span></div>
        <button onClick={() => { onCompareCommit(contextCommit.commit); setContextCommit(null) }}><GitCompareArrows size={14}/><span>{t('history:app.actions.compare')}</span></button>
        <button onClick={() => { onMergeCommit(contextCommit.commit); setContextCommit(null) }}><GitMerge size={14}/><span>{t('history:app.actions.merge', { "mergeTargetLabel": mergeTargetLabel, "currentBranch": currentBranch })}</span></button>
        <button onClick={() => { onCherryPickCommit(contextCommit.commit); setContextCommit(null) }}><GitCommitHorizontal size={14}/><span>{t('history:app.actions.cherryPick')}</span></button>
        <button onClick={() => { onRebaseCommit(contextCommit.commit); setContextCommit(null) }}><GitFork size={14}/><span>{t('history:app.actions.rebase')}</span></button>
        <button onClick={() => { onTagCommit(contextCommit.commit); setContextCommit(null) }}><Tag size={14}/><span>{t('history:app.actions.tag')}</span></button>
        <div className="context-menu-separator"/>
        <button onClick={() => { onRevertCommit(contextCommit.commit); setContextCommit(null) }}><Undo2 size={14}/><span>{t('history:app.actions.revert')}</span></button>
        <div className="context-menu-separator"/>
        <Button variant="danger" onClick={() => { onResetCommit(contextCommit.commit); setContextCommit(null) }}><RotateCcw size={14}/><span>{t('history:app.actions.reset')}</span></Button>
        <div className="context-menu-separator"/>
        <button onClick={() => { onCopyCommit(contextCommit.commit, 'hash'); setContextCommit(null) }}><Copy size={14}/><span>{t('history:app.actions.copyHash')}</span></button>
        <button onClick={() => { onCopyCommit(contextCommit.commit, 'details'); setContextCommit(null) }}><FileText size={14}/><span>{t('history:app.actions.copyDetails')}</span></button>
      </>}
    </ContextMenu>}
  </div>
}

function CommitDetails({ commit, stashReference, onClose, onOpenParent }: { commit: Commit; stashReference?: string | null; onClose: () => void; onOpenParent: (hash: string) => void }) {
  const { t, i18n } = useAppTranslation()
  const locale = (i18n.resolvedLanguage ?? 'zh-CN') as Locale

  const [copied, setCopied] = useState(false)
  const commitTextRef = useRef<HTMLTextAreaElement>(null)
  const isWorkingTree = commit.status === 'working'
  const isStash = commit.status === 'stash'
  const fullHash = isWorkingTree ? t('history:app.details.uncommitted') : commit.fullHash ?? `${commit.id}4b92d7e08f7e16f85b16d0c`
  const parents = commit.parents?.length ? commit.parents : commit.parent ? [commit.parent] : []
  const parentHash = parents.join(', ') || '—'
  const email = isWorkingTree ? t('history:app.details.localWorktree') : commit.email ?? 'zhou@example.com'
  const message = commit.message ?? (isWorkingTree ? t('history:app.details.uncommittedHint') : commit.title)
  const committer = commit.committer ?? commit.author
  const committerEmail = commit.committerEmail ?? email
  const commitTime = commit.commitTime ?? commit.time
  const commitText = (isWorkingTree ? [
    t('history:app.details.status'),
    t('history:app.details.base', { "parentHash": parentHash }),
    '',
    message,
  ] : isStash ? [
    `Stash：${stashReference ?? '—'}`,
    t('history:app.details.node', { "fullHash": fullHash }),
    t('history:app.details.base', { "parentHash": parentHash }),
    t('history:app.details.author', { "author": commit.author, "email": email }),
    t('history:app.details.saved', { "value1": formatLocalDateTime(commitTime, true, locale) }),
    '',
    message,
  ] : [
    t('history:app.details.commit', { "fullHash": fullHash }),
    t('history:app.details.parent', { "parentHash": parentHash }),
    t('history:app.details.author', { "author": commit.author, "email": email }),
    t('history:app.details.committer', { "committer": committer, "committerEmail": committerEmail }),
    t('history:app.details.date', { "value1": formatLocalDateTime(commitTime, true, locale) }),
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
  return <section className="commit-details">
    <div className="detail-heading"><div><span className="eyebrow">{isWorkingTree ? t('history:app.details.worktreeHeading') : isStash ? t('history:app.details.stashHeading') : t('history:app.details.commitHeading')}</span><h2>{commit.title}</h2></div><div className="detail-heading-actions"><Button variant="icon" onClick={onClose} tooltip={t('history:app.details.close')} aria-label={t('history:app.details.close')}><X size={17}/></Button></div></div>
    <div className="identity-row"><div className="avatar large">{commit.avatar}</div><div><strong>{commit.author}</strong><span>{isWorkingTree ? t('history:app.details.notCommitted', { "email": email }) : isStash ? `${stashReference ?? 'Stash'} · ${formatLocalDateTime(commitTime, true, locale)}` : `${email} · ${formatLocalDateTime(commitTime, true, locale)}`}</span></div>{!commit.fullHash && !isWorkingTree && <span className="verified"><Check size={11}/> {t('history:app.details.verified')}</span>}</div>
    {parents.length > 0 && <div className="commit-parent-links"><span>{t('history:app.details.parents')}</span>{parents.map((parent) => <Tooltip content={t('history:app.details.jumpParent', { "parent": parent })} key={parent}><button  type="button" onClick={() => onOpenParent(parent)} ><GitCommitHorizontal size={12}/><code>{parent.slice(0, 10)}</code></button></Tooltip>)}</div>}
    <div className="commit-text-panel">
      <div className="commit-text-toolbar"><div><FileText size={14}/><span>{isWorkingTree ? t('history:app.details.worktreeInfo') : isStash ? t('history:app.details.stashInfo') : t('history:app.details.fullInfo')}</span></div><Tooltip content={copied ? t('history:app.details.copied') : t('history:app.details.copyAll')}><button className="icon-tool-button" onClick={copy}  aria-label={copied ? t('history:app.details.copied') : t('history:app.details.copyAll')}>{copied ? <Check size={14}/> : <Copy size={14}/>}</button></Tooltip></div>
      <textarea ref={commitTextRef} aria-label={t('history:app.details.fullInfo')} readOnly value={commitText} onFocus={(event) => event.currentTarget.select()}/>
    </div>
  </section>
}

function ChangedFilesPanel({ files, treePaths, treeError, loading, activeFile, onOpenFile, onOpenHistory }: { files: RepositoryFile[]; treePaths?: string[]; treeError?: MessageContent; loading?: boolean; activeFile: number | null; onOpenFile: (index: number | null, file: RepositoryFile) => void; onOpenHistory: (path: string, tab: HistoryTarget['tab']) => void }) {
  const { t, i18n } = useAppTranslation()
  const locale = (i18n.resolvedLanguage ?? 'zh-CN') as Locale

  const [fileMode, setFileMode] = usePersistentState('branchline.changedFilesMode.v1', 'list', isFileMode)
  const [fileQuery, setFileQuery] = useState('')
  const allFilesTree = useMemo(() => fileMode === 'all' && treePaths ? buildCommitFileTree(treePaths, files, true) : null, [fileMode, treePaths, files])
  const displayFiles = fileMode === 'all' ? allFilesTree?.files ?? [] : files
  const filteredFiles = useMemo(() => filterCommitFilesByPath(displayFiles, fileQuery), [displayFiles, fileQuery])
  const changedPaths = useMemo(() => allFilesTree ? new Set(allFilesTree.files.filter((file) => file.changed).map((file) => file.path)) : undefined, [allFilesTree])
  const activeFilePath = activeFile === null ? null : fileMode === 'all'
    ? allFilesTree?.files.find((file) => file.changeIndex === activeFile)?.path ?? null
    : files[activeFile]?.path ?? null
  const activeFilteredFile = activeCommitFileIndex(filteredFiles, activeFilePath)
  const [moreMenu, setMoreMenu] = useState<{ x: number; y: number } | null>(null)
  const [contextFile, setContextFile] = useState<{ file: RepositoryFile; x: number; y: number } | null>(null)
  const [collapsedFolders, setCollapsedFolders] = usePersistentState('branchline.changedFilesCollapsedFolders.v1', {}, isBooleanRecord)
  const fileFolders = useMemo(() => {
    const folders = new Set<string>()
    displayFiles.forEach((file) => {
      const segments = file.path.split('/').filter(Boolean).slice(0, -1)
      segments.forEach((_, index) => folders.add(segments.slice(0, index + 1).join('/')))
    })
    return Array.from(folders)
  }, [displayFiles])
  return <section className={`changed-files-panel ${treeError ? 'has-tree-error' : ''}`}>
    <div className="changed-files-heading"><div className="changed-files-title"><FileDiff size={15}/><strong>{fileMode === 'all' ? t('history:app.files.all') : treePaths ? t('history:app.files.commit') : t('history:app.files.changed')}</strong><span>{loading ? '…' : new Intl.NumberFormat(locale).format(filteredFiles.length)}</span></div><div className="changed-files-actions">{treePaths && <div className="segmented compact-segmented icon-segmented" role="group" aria-label={t('history:app.files.view')}><Tooltip content={t('history:app.files.list')}><button type="button" className={fileMode === 'list' ? 'active' : ''} aria-pressed={fileMode === 'list'} onClick={() => setFileMode('list')}  aria-label={t('history:app.files.list')}><List size={14}/></button></Tooltip><Tooltip content={t('history:app.files.tree')}><button type="button" className={fileMode === 'tree' ? 'active' : ''} aria-pressed={fileMode === 'tree'} onClick={() => setFileMode('tree')}  aria-label={t('history:app.files.tree')}><FolderTree size={14}/></button></Tooltip><Tooltip content={t('history:app.files.showAll')}><button type="button" className={fileMode === 'all' ? 'active' : ''} aria-pressed={fileMode === 'all'} onClick={() => setFileMode('all')}  aria-label={t('history:app.files.showAll')}><Files size={14}/></button></Tooltip></div>}<Button variant="icon" disabled={loading || !displayFiles.length} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setMoreMenu({ x: rect.right - 220, y: rect.bottom + 4 }) }} tooltip={t('history:app.files.more')} aria-label={t('history:app.files.more')}><MoreHorizontal size={15}/></Button></div><div className="changed-files-search"><Search size={13}/><input type="text" value={fileQuery} onChange={(event) => setFileQuery(event.target.value)} placeholder={t('history:app.files.searchPlaceholder')} aria-label={t('history:app.files.filter')}/>{fileQuery && <Tooltip content={t('history:app.files.clearFilter')}><button type="button" onClick={() => setFileQuery('')}  aria-label={t('history:app.files.clearFilter')}><X size={13}/></button></Tooltip>}</div></div>
    {treeError && <div className="commit-tree-error" role="alert">{t('history:app.files.treeError', { "treeError": renderMessage(treeError, t) })}</div>}
    {loading ? <div className="changed-files-list"><div className="changed-files-empty"><RefreshCw className="spin" size={15}/><span>{t('history:app.files.loading')}</span></div></div>
      : !displayFiles.length ? <div className="changed-files-list"><div className="changed-files-empty"><FileDiff size={15}/><span>{fileMode === 'all' ? t('history:app.files.emptyAll') : t('history:app.files.emptyChanges')}</span></div></div>
        : !filteredFiles.length ? <div className="changed-files-list"><div className="changed-files-empty"><Search size={15}/><span>{t('history:app.files.noMatches')}</span></div></div>
          : <DiffFileList files={filteredFiles} activeFile={activeFilteredFile} mode={fileMode === 'list' ? 'list' : 'tree'} changedPaths={fileMode === 'all' ? changedPaths : undefined} onSelectFile={(index) => { const file = filteredFiles[index]; if (file) onOpenFile(fileMode === 'all' ? allFilesTree?.files.find((item) => item.path === file.path)?.changeIndex ?? null : files.indexOf(file), file) }} className="changed-files-list" fileRowHeight={44} folderRowHeight={25} collapsedFolders={collapsedFolders} onCollapsedFoldersChange={setCollapsedFolders} showOpenIndicator onFileContextMenu={(event, file) => { event.preventDefault(); setContextFile({ file, x: event.clientX, y: event.clientY }) }}/>}
    {moreMenu && <ContextMenu x={moreMenu.x} y={moreMenu.y} onClose={() => setMoreMenu(null)}><div className="context-menu-title"><FileDiff size={13}/><span>{t('history:app.files.actions')}</span></div><button onClick={() => { setCollapsedFolders({}); setMoreMenu(null) }}><ChevronDown size={14}/><span>{t('history:app.files.expandAll')}</span></button><button onClick={() => { setCollapsedFolders(Object.fromEntries(fileFolders.map((folder) => [folder, true]))); setMoreMenu(null) }}><ChevronRight size={14}/><span>{t('history:app.files.collapseAll')}</span></button><div className="context-menu-separator"/><button onClick={() => { navigator.clipboard?.writeText(filteredFiles.map((file) => file.path).join('\n')).catch(() => undefined); setMoreMenu(null) }}><Copy size={14}/><span>{t('history:app.files.copyPaths')}</span></button><button onClick={() => { navigator.clipboard?.writeText(files.map((file) => `${file.type} ${file.path} (+${file.add} -${file.del})`).join('\n')).catch(() => undefined); setMoreMenu(null) }}><FileText size={14}/><span>{t('history:app.files.copySummary')}</span></button></ContextMenu>}
    {contextFile && <ContextMenu x={contextFile.x} y={contextFile.y} onClose={() => setContextFile(null)}><div className="context-menu-title"><FileText size={13}/><span>{contextFile.file.path}</span></div><button onClick={() => { onOpenHistory(contextFile.file.path, 'history'); setContextFile(null) }}><History size={14}/><span>{t('history:app.files.history')}</span></button><button onClick={() => { onOpenHistory(contextFile.file.path, 'blame'); setContextFile(null) }}><Rows3 size={14}/><span>{t('history:app.files.blame')}</span></button><div className="context-menu-separator"/><button onClick={() => { navigator.clipboard?.writeText(contextFile.file.path).catch(() => undefined); setContextFile(null) }}><Copy size={14}/><span>{t('history:app.files.copyPath')}</span></button></ContextMenu>}
  </section>
}

function ShortcutOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useAppTranslation()
  const locale = (i18n.resolvedLanguage ?? 'zh-CN') as Locale

  if (!open) return null
  const modifier = getShortcutModifier()
  const shortcuts = [
    [`${modifier} F`, t('history:app.shortcuts.search')],
    [`${modifier} ⇧ F`, t('history:app.shortcuts.fetch')],
    [`${modifier} ↵`, t('history:app.shortcuts.changes')],
    ['T', t('history:app.shortcuts.fileView')],
    ['W', t('history:app.shortcuts.wideDiff')],
    [`${modifier} + / −`, t('history:app.shortcuts.diffFont')],
    [`${modifier} 0`, t('history:app.shortcuts.resetFont')],
    [`${modifier} /`, t('history:app.shortcuts.theme')],
    ['?', t('history:app.shortcuts.show')],
  ]
  return <div className="shortcut-backdrop" onClick={onClose}><section className="shortcut-dialog" onClick={(event) => event.stopPropagation()}>
    <div className="drawer-heading"><div><span className="eyebrow">{t('history:app.shortcuts.navigation')}</span><h2>{t('history:app.shortcuts.heading')}</h2></div><Button variant="icon" onClick={onClose}><X size={18}/></Button></div>
    <div className="shortcut-list">{shortcuts.map(([key, label]) => <div className="shortcut-row" key={key}><span>{label}</span><kbd>{key}</kbd></div>)}</div>
  </section></div>
}

export default function App() {
  const { t, i18n } = useAppTranslation()
  const locale = (i18n.resolvedLanguage ?? 'zh-CN') as Locale
  const { repository, structureRepository, parentRepository, recentRepositories, favoriteRepositories, registerRepository, toggleFavorite, forgetRepository, openingRepository, restoringRepository, fetching, repositoryNotice, pauseRepositoryNotice, resumeRepositoryNotice, setRepositoryNotice, applySnapshot, applyStructureSnapshot, openRepository, openRepositoryPath, openSubmodulePath, returnToParentRepository, fetchNow, autoFetchEnabled, fetchIntervalMinutes, localPollingEnabled, localPollingIntervalSeconds, setAutoFetchEnabled, setFetchIntervalMinutes, setLocalPollingEnabled, setLocalPollingIntervalSeconds, lastFetchAt, fetchCompletion } = useRepositoryWorkspace()
  const [repositoryManagerOpen, setRepositoryManagerOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistentState('branchline.sidebarCollapsed.v1', false, (value): value is boolean => typeof value === 'boolean')
  const [sidebarWidth, setSidebarWidth] = usePersistentState('branchline.sidebarWidth.v1', 252, isSidebarWidth)
  const [inspectorWidth, setInspectorWidth] = usePersistentState('branchline.inspectorWidth.v1', 360, isInspectorWidth)
  const [detailsHeight, setDetailsHeight] = usePersistentState('branchline.detailsHeight.v1', 330, isDetailsHeight)
  const [panelResizing, setPanelResizing] = useState<'sidebar' | 'inspector' | 'details' | null>(null)
  const [selected, setSelected] = useState('')
  const [undoCommitMessage, setUndoCommitMessage] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [searchMode, setSearchMode] = useState<HistorySearchMode>('locate')
  const [searchAction, setSearchAction] = useState<SearchNavigationAction>({ sequence: 0, direction: 1 })
  const [searchSummary, setSearchSummary] = useState<SearchSummary>({ current: 0, total: 0 })
  const handleSearchSummaryChange = useCallback((next: SearchSummary) => {
    setSearchSummary((current) => retainUnchangedSearchSummary(current, next))
  }, [])
  const [repositorySwitcherSignal, setRepositorySwitcherSignal] = useState(0)
  const [branchFilter, setBranchFilter] = useState<string[]>([])
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [filterMenu, setFilterMenu] = useState<{ kind: 'branch' | 'time'; x: number; y: number } | null>(null)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const notificationButtonRef = useRef<HTMLButtonElement>(null)
  const notificationPopoverRef = useRef<HTMLDivElement>(null)
  const [globalMenu, setGlobalMenu] = useState<{ x: number; y: number } | null>(null)
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('history')
  const [structureSelection, setStructureSelection] = useState<RepositoryStructureSelection>({ kind: 'root' })
  const [compareBase, setCompareBase] = useState<string | null>(null)
  const [branchDialog, setBranchDialog] = useState<{ prefix?: string } | null>(null)
  const [rebaseDialog, setRebaseDialog] = useState<{ commit: string; label: string } | null>(null)
  const [cherryPickDialog, setCherryPickDialog] = useState<{ commit: Commit; parents: Array<{ hash: string; title: MessageContent; author: MessageContent; time: string }> } | null>(null)
  const [gitConfigOpen, setGitConfigOpen] = useState(false)
  const [commandLogOpen, setCommandLogOpen] = useState(false)
  const { confirm, confirmDialog } = useConfirmDialog()
  const [wideDiff, setWideDiff] = useState(false)
  const [diffFile, setDiffFile] = useState<number | null>(null)
  const [inspectorCollapsed, setInspectorCollapsed] = usePersistentState('branchline.inspectorCollapsed.v2', true, (value): value is boolean => typeof value === 'boolean')
  const [theme, setTheme] = usePersistentState<ThemePreference>('branchline.theme.v1', 'light', isThemePreference)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
  const resolvedTheme = resolveTheme(theme, systemDark)
  const [windowMaximized, setWindowMaximized] = useState(false)
  const [autoPullBranchSettings, setAutoPullBranchSettings] = usePersistentState('branchline.autoPullBranches.v2', {}, isAutoPullBranchSettings)
  const autoPullBranches = repository ? autoPullBranchSettings[repository.path] ?? [] : []
  const [pullingBranches, setPullingBranches] = useState<string[]>([])
  const pullingBranchesRef = useRef(new Set<string>())
  const [treeFileView, setTreeFileView] = useState<{ path: string; commit: string; file: RepositoryFile } | null>(null)
  useEffect(() => {
    try {
      void getCurrentWindow().setTheme(resolvedTheme).catch(() => undefined)
    } catch {
      // The native window API is unavailable in the browser preview.
    }
  }, [resolvedTheme])
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    setSystemDark(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  useEffect(() => {
    let unlisten: (() => void) | undefined
    try {
      const appWindow = getCurrentWindow()
      void appWindow.isMaximized().then(setWindowMaximized).catch(() => undefined)
      void appWindow.onResized(() => { void appWindow.isMaximized().then(setWindowMaximized).catch(() => undefined) }).then((dispose) => { unlisten = dispose }).catch(() => undefined)
    } catch {
      // Browser preview keeps the custom bar but has no native window controls.
    }
    return () => unlisten?.()
  }, [])
  const [shortcutOpen, setShortcutOpen] = useState(false)
  const [autoFetchOpen, setAutoFetchOpen] = useState(false)
  const [historyTarget, setHistoryTarget] = useState<HistoryTarget | null>(null)
  const [activeOperation, setActiveOperation] = useState<ActiveOperation | null>(null)
  const mergeOperationLock = useRef(false)
  const [operationPath, setOperationPath] = useState<string | null>(null)
  const [historyConflictPath, setHistoryConflictPath] = useState<string | null>(null)
  const [commitStats, setCommitStats] = useState<Record<string, RepositoryCommitStats>>({})
  const [commitFiles, setCommitFiles] = useState<Record<string, RepositoryFile[]>>({})
  const [commitTrees, setCommitTrees] = useState<Record<string, { paths?: string[]; error?: MessageContent }>>({})
  const parentNavigationIdentity = useRef('')
  const [historyLoadLimit, setHistoryLoadLimit] = useState(DEFAULT_HISTORY_LOAD_LIMIT)
  const [historyRevealSignal, setHistoryRevealSignal] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const autoFetchRef = useRef<HTMLDivElement>(null)
  const expandedRepositoryPath = useRef<string | null>(null)
  const structureRepositoryPath = useRef<string | null>(null)
  const previousCommits = useRef<Commit[]>([])
  const historyLoadInProgress = useRef(false)
  const referenceNavigationRequest = useRef(0)
  const referenceNavigationIdentity = useRef({ path: repository?.path })
  if (referenceNavigationIdentity.current.path !== repository?.path) {
    referenceNavigationIdentity.current = { path: repository?.path }
  }

  useEffect(() => {
    if (!notificationOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (notificationButtonRef.current?.contains(event.target as Node)) return
      if (notificationPopoverRef.current?.contains(event.target as Node)) return
      setNotificationOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [notificationOpen])
  const workingTreeCommit = useMemo(() => repository
    ? createWorkingTreeCommit(repository.files, resolveWorkingTreeParent(repository), repository.operation, t)
    : null, [repository, t])
  const activeCommits = useMemo<Commit[]>(() => workingTreeCommit
    ? [workingTreeCommit, ...(repository?.commits ?? [])]
    : repository?.commits ?? [], [repository?.commits, workingTreeCommit])
  const unloadedBranchFilters = useMemo(
    () => unloadedHistoryBranches(repository?.commits ?? [], branchFilter),
    [repository?.commits, branchFilter],
  )
  const repositoryPath = repository?.path
  useEffect(() => {
    if (!repositoryPath || !unloadedBranchFilters.length || historyLoadInProgress.current) return
    const nextLimit = nextHistoryLoadLimit(historyLoadLimit)
    if (!nextLimit) return
    historyLoadInProgress.current = true
    setActiveOperation({ key: 'history', label: message('history:app.progress.expandHistory'), detail: message('history:app.progress.findBranches', { "count": nextLimit, "branches": unloadedBranchFilters.join(', ') }) })
    let cancelled = false
    loadRepositoryHistory(repositoryPath, nextLimit)
      .then((snapshot) => {
        if (cancelled) return
        setHistoryLoadLimit(nextLimit)
        applySnapshot(snapshot)
      })
      .catch((error) => {
        if (!cancelled) setRepositoryNotice(errorMessage(error))
      })
      .finally(() => {
        if (cancelled) return
        historyLoadInProgress.current = false
        setActiveOperation((current) => current?.key === 'history' ? null : current)
      })
    return () => {
      cancelled = true
      historyLoadInProgress.current = false
    }
  }, [applySnapshot, historyLoadLimit, repositoryPath, setRepositoryNotice, unloadedBranchFilters])
  const currentBranchHead = useMemo(
    () => activeCommits.find((commit) => commit.status !== 'working' && commit.branches?.includes(repository?.branch ?? ''))
      ?? activeCommits.find((commit) => commit.status !== 'working')
      ?? null,
    [activeCommits, repository?.branch],
  )
  const availableBranches = repository?.branches ?? []
  const tagSearchCount = repository?.tags.filter((tag) => !query.trim() || tag.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).length ?? 0
  const stashReferences = useMemo(() => Object.fromEntries((repository?.stashes ?? []).map((stash) => [stash.hash, stash.reference])), [repository?.stashes])
  const selectedCommitBase = activeCommits.find((commit) => commit.id === selected) ?? activeCommits[0] ?? emptyCommit(t)
  const selectedWorkingTree = selectedCommitBase.status === 'working'
  const selectedStatsKey = selectedCommitBase.fullHash ?? selectedCommitBase.id
  const selectedTreeKey = `${repository?.path}\0${selectedStatsKey}`
  parentNavigationIdentity.current = selectedTreeKey
  const selectedStashReference = selectedCommitBase.status === 'stash'
    ? repository?.stashes.find((stash) => stash.hash === selectedStatsKey)?.reference ?? null
    : null
  useEffect(() => {
    if (!structureRepository) {
      structureRepositoryPath.current = null
      setStructureSelection({ kind: 'root' })
      return
    }
    if (structureRepositoryPath.current !== structureRepository.path) {
      structureRepositoryPath.current = structureRepository.path
      setStructureSelection({ kind: 'root' })
      return
    }
    setStructureSelection((current) => resolveRepositoryStructureSelection(structureRepository, current))
  }, [structureRepository])
  const selectedStashFiles = selectedStashReference ? commitFiles[selectedStatsKey] : undefined
  const selectedCommit = selectedStashFiles
    ? { ...selectedCommitBase, files: selectedStashFiles.length, additions: selectedStashFiles.reduce((total, file) => total + file.add, 0), deletions: selectedStashFiles.reduce((total, file) => total + file.del, 0) }
    : !selectedWorkingTree && commitStats[selectedStatsKey]
      ? { ...selectedCommitBase, ...commitStats[selectedStatsKey] }
      : selectedCommitBase
  const selectedCommitFiles = selectedWorkingTree ? repository?.files ?? [] : repository ? (commitFiles[selectedStatsKey] ?? []) : []
  const selectedCommitFilesLoading = !selectedWorkingTree && Boolean(repository) && selectedCommitBase.id !== '—' && !Object.prototype.hasOwnProperty.call(commitFiles, selectedStatsKey)
  const usesCommitTree = !selectedWorkingTree && !selectedStashReference && selectedCommitBase.id !== '—'
  const selectedTree = commitTrees[selectedTreeKey]
  useEffect(() => {
    if (!repository || !usesCommitTree || selectedTree) return
    let cancelled = false
    loadRepositoryCommitTreeFiles(repository.path, selectedStatsKey)
      .then((paths) => { if (!cancelled) setCommitTrees((current) => ({ ...current, [selectedTreeKey]: { paths } })) })
      .catch((error) => { if (!cancelled) setCommitTrees((current) => ({ ...current, [selectedTreeKey]: { error: errorMessage(error) } })) })
    return () => { cancelled = true }
  }, [repository?.path, selectedStatsKey, selectedTreeKey, selectedTree, usesCommitTree])
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
      setSelected((current) => current === WORKING_TREE_COMMIT_ID && Boolean(repository?.files.length || repository?.operation)
        ? current
        : resolveCommitSelection(previousCommits.current, repository?.commits ?? [], current))
    }
    expandedRepositoryPath.current = path
    previousCommits.current = repository?.commits ?? []
  }, [repository?.commits, repository?.files.length, repository?.path])
  useEffect(() => {
    if (!repository || selectedWorkingTree || selectedStashReference || selectedCommitBase.id === '—' || commitStats[selectedStatsKey]) return
    let cancelled = false
    loadRepositoryCommitStats(repository.path, selectedStatsKey)
      .then((stats) => {
        if (!cancelled) setCommitStats((current) => ({ ...current, [selectedStatsKey]: stats }))
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [commitStats, repository?.path, selectedStashReference, selectedStatsKey, selectedWorkingTree])
  useEffect(() => {
    if (!repository || selectedWorkingTree || selectedCommitBase.id === '—' || Object.prototype.hasOwnProperty.call(commitFiles, selectedStatsKey)) return
    let cancelled = false
    const loadFiles = selectedStashReference
      ? loadRepositoryStashFiles(repository.path, selectedStashReference)
      : loadRepositoryCommitFiles(repository.path, selectedStatsKey)
    loadFiles
      .then((files) => {
        if (!cancelled) setCommitFiles((current) => ({ ...current, [selectedStatsKey]: files }))
      })
      .catch((error) => {
        if (cancelled) return
        setCommitFiles((current) => ({ ...current, [selectedStatsKey]: [] }))
        setRepositoryNotice(errorMessage(error))
      })
    return () => { cancelled = true }
  }, [commitFiles, repository?.path, selectedStashReference, selectedStatsKey, selectedWorkingTree])
  useEffect(() => {
    setDiffFile(null)
    setWideDiff(false)
    setTreeFileView(null)
    setHistoryConflictPath(null)
    setOperationPath(null)
  }, [selectedStatsKey])
  const loadSelectedCommitDiff = useCallback((filePath: string, _index: number | undefined, showWhitespace: boolean) => {
    if (!repository) return Promise.resolve([])
    if (selectedWorkingTree) return loadRepositoryFileDiff(repository.path, filePath, showWhitespace)
    return selectedStashReference
      ? loadRepositoryStashFileDiff(repository.path, selectedStashReference, filePath, showWhitespace)
      : loadFileCommitDiff(repository.path, selectedStatsKey, filePath, showWhitespace)
  }, [repository?.path, selectedStashReference, selectedStatsKey, selectedWorkingTree])
  const loadSelectedCommitFileContent = useCallback((filePath: string) => repository
    ? loadRepositoryCommitFileContent(repository.path, selectedStatsKey, filePath).then(commitFileContentRows)
    : Promise.resolve([]), [repository?.path, selectedStatsKey])
  const selectedCommitParent = selectedCommit.parents?.[0] ?? selectedCommit.parent
  const loadSelectedCommitImage = useCallback((filePath: string, side: 'old' | 'new') => {
    if (!repository) return Promise.resolve(null)
    if (selectedWorkingTree) {
      return side === 'old'
        ? loadRepositoryFileImage(repository.path, filePath, 'commit', 'HEAD')
        : loadRepositoryFileImage(repository.path, filePath, 'worktree')
    }
    if (selectedStashReference) {
      if (side === 'old') return loadRepositoryFileImage(repository.path, filePath, 'commit', `${selectedStashReference}^1`)
      return loadRepositoryFileImage(repository.path, filePath, 'commit', selectedStashReference)
        .then((image) => image ?? loadRepositoryFileImage(repository.path, filePath, 'commit', `${selectedStashReference}^3`).catch(() => null))
    }
    if (!selectedStatsKey || selectedStatsKey === '—') return Promise.resolve(null)
    if (side === 'old') return selectedCommitParent
      ? loadRepositoryFileImage(repository.path, filePath, 'commit', selectedCommitParent)
      : Promise.resolve(null)
    return loadRepositoryFileImage(repository.path, filePath, 'commit', selectedStatsKey)
  }, [repository?.path, selectedCommitParent, selectedStashReference, selectedStatsKey, selectedWorkingTree])
  const loadTreeFileImage = useCallback((filePath: string, side: 'old' | 'new') => {
    if (!repository || side !== 'new') return Promise.resolve(null)
    return loadRepositoryFileImage(repository.path, filePath, 'commit', treeFileView?.commit ?? selectedStatsKey)
  }, [repository?.path, selectedStatsKey, treeFileView?.commit])
  const handleOpenSnapshot = (snapshot: RepositorySnapshot | null) => {
    if (!snapshot) return
    setRepositoryManagerOpen(false)
    setUndoCommitMessage(snapshot.undoCommitMessage ?? null)
    setCommitStats({})
    setCommitFiles({})
    setSelected(snapshot.files.length ? WORKING_TREE_COMMIT_ID : snapshot.commits[0]?.id ?? '')
    setDiffFile(null)
    setWideDiff(false)
    setQuery('')
    setBranchFilter([])
    setTimeFilter('all')
    setWorkspaceView('history')
  }
  const handleOpenRepository = async () => handleOpenSnapshot(await openRepository())
  const handleOpenRepositoryPath = async (path: string) => {
    // Reopening the repository the sidebar already describes must not reset its structure selection.
    const keepsStructure = sameRepositoryPath(path, structureRepository?.path ?? null)
    const snapshot = await openRepositoryPath(path)
    if (snapshot && !keepsStructure) setStructureSelection({ kind: 'root' })
    handleOpenSnapshot(snapshot)
  }
  const handleOpenSubmodulePath = async (path: string) => {
    if (structureRepository) {
      const root = structureRepository.path.replace(/[\\/]+$/, '')
      const normalizedRoot = root.replace(/\\/g, '/').toLocaleLowerCase()
      const normalizedPath = path.replace(/\\/g, '/').replace(/[\\/]+$/, '')
      if (normalizedPath.toLocaleLowerCase().startsWith(`${normalizedRoot}/`)) {
        setStructureSelection({ kind: 'submodule', path: normalizedPath.slice(root.length + 1) })
      }
    }
    handleOpenSnapshot(await openSubmodulePath(path))
  }
  const handleReturnToParentRepository = async () => {
    const snapshot = await returnToParentRepository()
    if (snapshot) setStructureSelection({ kind: 'root' })
    handleOpenSnapshot(snapshot)
  }
  // The sidebar keeps describing the superproject while a submodule is open, so its root is one
  // click away even from a submodule nested several levels deep.
  const rootRepository = repository && structureRepository
    && !sameRepositoryPath(structureRepository.path, repository.path)
    && !sameRepositoryPath(structureRepository.path, parentRepository?.path)
    && isRepositoryDescendant(repository.path, structureRepository.path)
    ? structureRepository
    : null
  const handleReturnToRootRepository = async () => {
    if (!rootRepository) return
    const snapshot = await openRepositoryPath(rootRepository.path)
    if (snapshot) setStructureSelection({ kind: 'root' })
    handleOpenSnapshot(snapshot)
  }
  const handleSnapshot = (snapshot: RepositorySnapshot) => {
    setUndoCommitMessage(snapshot.undoCommitMessage ?? null)
    applySnapshot(snapshot)
    setSelected((current) => current === WORKING_TREE_COMMIT_ID && (snapshot.files.length || snapshot.operation)
      ? current
      : resolveCommitSelection(activeCommits, snapshot.commits, current))
    if (!snapshot.operation) {
      setHistoryConflictPath(null)
      setOperationPath(null)
      if (workspaceView === 'operation') setWorkspaceView('history')
    }
  }
  const handleDeleteBranchPrefix = async (prefix: string) => {
    if (!repository) return setRepositoryNotice(message('history:app.notice.openFirst'))
    try {
      const branches = await previewBranchPrefix(repository.path, prefix)
      if (!branches.length) return setRepositoryNotice(message('history:app.notice.noPrefixBranches', { "prefix": prefix }))
      // The current branch is checked out somewhere by definition, so it is skipped like any other
      // branch that a worktree holds rather than aborting the whole deletion.
      const checkedOutBranches = new Set(repository.worktrees.flatMap((worktree) => worktree.branch ? [worktree.branch] : []))
      if (repository.branch) checkedOutBranches.add(repository.branch)
      const skippedBranches = branches.filter((branch) => checkedOutBranches.has(branch))
      const deletableBranches = branches.filter((branch) => !checkedOutBranches.has(branch))
      if (!deletableBranches.length) return setRepositoryNotice(message('history:app.notice.prefixOccupied', { "prefix": prefix }))
      const skippedMessage = skippedBranches.length
        ? message('history:app.confirm.skippedBranches', { "skippedBranchesCount": skippedBranches.length, "joinn": skippedBranches.map((branch) => `• ${branch}`).join('\n') })
        : ''
      const confirmed = await confirm({ title: message('history:app.branches.delete'), message: message('history:app.confirm.deleteGroup', { "deletableBranchesCount": deletableBranches.length, "joinn": deletableBranches.join('\n'), "skippedMessage": skippedMessage }), confirmLabel: message('history:app.confirm.delete'), variant: 'danger' })
      if (!confirmed) return
      const snapshot = await deleteBranchPrefix(repository.path, prefix, branches)
      applySnapshot(snapshot, skippedBranches.length
        ? message('history:app.notice.prefixDeletedSkipped', { "deletableBranchesCount": deletableBranches.length, "prefix": prefix, "skippedBranchesCount": skippedBranches.length })
        : message('history:app.notice.prefixDeleted', { "deletableBranchesCount": deletableBranches.length, "prefix": prefix }))
    } catch (error) {
      const failure = errorMessage(error)
      try {
        const snapshot = await loadRepository(repository.path)
        applySnapshot(snapshot)
      } catch {
        // 保留原始 Git 操作错误，仓库可通过下一次刷新重新同步。
      }
      setRepositoryNotice(failure)
    }
  }
  const openCreateBranchDialog = (prefix?: string) => {
    if (!repository) return setRepositoryNotice(message('history:app.notice.createBranchOpenFirst'))
    setBranchDialog({ prefix })
  }
  const handleCreateBranch = async (branch: string) => {
    if (!repository) {
      setRepositoryNotice(message('history:app.notice.createBranchOpenFirst'))
      return false
    }
    try {
      const snapshot = await createRepositoryBranch(repository.path, branch)
      applySnapshot(snapshot, message('history:app.notice.branchCreated', { "branch": branch }))
      return true
    } catch (error) {
      setRepositoryNotice(errorMessage(error))
      return false
    }
  }
  const toggleAutoPullBranch = (branch: string) => {
    if (!repository) return
    setAutoPullBranchSettings((current) => toggleConfiguredAutoPullBranch(current, repository.path, branch))
  }
  const setBranchPulling = (branch: string, pulling: boolean) => {
    if (pulling) pullingBranchesRef.current.add(branch)
    else pullingBranchesRef.current.delete(branch)
    setPullingBranches([...pullingBranchesRef.current])
  }
  useAutoFastForward({
    repository,
    configuredBranches: autoPullBranches,
    fetchCompletion,
    busy: fetching || openingRepository || Boolean(activeOperation) || pullingBranches.length > 0,
    onSnapshot: applySnapshot,
    onNotice: setRepositoryNotice,
    onBranchPulling: setBranchPulling,
    onRunningChange: (branch) => {
      if (branch === null) setActiveOperation((current) => current?.key === 'pull' ? null : current)
      else setActiveOperation({
        key: 'pull',
        label: branch ? message('history:app.progress.autoFastForward', { "branch": branch }) : message('history:app.progress.checkAutoBranches'),
        detail: message('history:app.progress.autoDetail'),
      })
    },
  })
  const handleSwitchBranch = async (branch: string) => {
    if (!repository) return setRepositoryNotice(message('history:app.notice.switchOpenFirst'))
    if (pullingBranchesRef.current.has(branch)) return setRepositoryNotice(message('history:app.notice.branchBusy', { "branch": branch }))
    if (branch === repository.branch) return setRepositoryNotice(message('history:app.notice.alreadyOnBranch', { "branch": branch }))
    try {
      const snapshot = await switchRepositoryBranch(repository.path, branch)
      handleSnapshot(snapshot)
      setRepositoryManagerOpen(false)
      setWorkspaceView('history')
      setRepositoryNotice(message('history:app.notice.branchSwitched', { "branch": snapshot.branch }))
    } catch (error) {
      setRepositoryNotice(errorMessage(error))
    }
  }
  const executeRepositoryAction = async (action: (repositoryPath: string) => Promise<RepositorySnapshot>, success: MessageContent, operation?: ActiveOperation) => {
    if (!repository) {
      setRepositoryNotice(message('history:app.notice.actionOpenFirst'))
      return
    }
    if (operation && activeOperation) {
      setRepositoryNotice(message('history:app.notice.waitOperation', { "label": activeOperation.label }))
      return
    }
    if (operation) setActiveOperation(operation)
    try {
      const snapshot = await action(repository.path)
      handleSnapshot(snapshot)
      if (snapshot.operation) {
        const conflictPath = snapshot.operation.conflicts[0] ?? null
        setOperationPath(conflictPath)
        setHistoryConflictPath(conflictPath)
        setSelected(WORKING_TREE_COMMIT_ID)
        setInspectorCollapsed(false)
        setWorkspaceView(conflictPath ? 'history' : 'operation')
        setRepositoryNotice(conflictPath
          ? message('history:app.notice.conflictOpened', { "kindt": operationMessage(snapshot.operation.kind) })
          : message('history:app.notice.continueOperation', { "kindt": operationMessage(snapshot.operation.kind) }))
      } else {
        setRepositoryNotice(success)
      }
    } catch (error) {
      const failure = errorMessage(error)
      try {
        const snapshot = await loadRepository(repository.path)
        applySnapshot(snapshot)
      } catch {
        // 保留原始 Git 操作错误，仓库可通过下一次刷新重新同步。
      }
      setRepositoryNotice(failure)
    } finally {
      if (operation) setActiveOperation((current) => current?.key === operation.key ? null : current)
    }
  }
  const handleMergeReference = async (reference: string, label: MessageContent = reference) => {
    if (!repository) return setRepositoryNotice(message('history:app.notice.mergeOpenFirst'))
    if (repository.operation) return setRepositoryNotice(message('history:app.notice.finishOperation', { "kindt": operationMessage(repository.operation.kind) }))
    if (!acquireOperationLock(mergeOperationLock)) return setRepositoryNotice(message('history:app.notice.mergeBusy'))
    try {
      if (!await confirm({ title: message('history:app.confirm.mergeHeading'), message: message('history:app.confirm.merge', { "label": label, "branch": repository.branch }), confirmLabel: message('history:app.confirm.startMerge') })) return
      await executeRepositoryAction(
        (path) => mergeRepositoryReference(path, reference),
        message('history:app.notice.merged', { "label": label, "branch": repository.branch }),
        { key: 'merge', label: message('history:app.progress.merge'), detail: message('history:app.progress.mergeDetail', { "label": label, "branch": repository.branch }) },
      )
    } finally {
      releaseOperationLock(mergeOperationLock)
    }
  }
  const handleCherryPickCommit = async (commit: Commit) => {
    if (!repository) return setRepositoryNotice(message('history:app.notice.cherryPickOpenFirst'))
    if (repository.operation) return setRepositoryNotice(message('history:app.notice.finishOperation', { "kindt": operationMessage(repository.operation.kind) }))
    const parents = commit.parents ?? (commit.parent ? [commit.parent] : [])
    const parentDetails = parents.map((hash) => {
      const parentCommit = activeCommits.find((candidate) => candidate.fullHash === hash || candidate.id === hash)
      return {
        hash,
        title: parentCommit?.title ?? message('history:app.details.parentUnavailable'),
        author: parentCommit?.author ?? message('history:app.details.unknownAuthor'),
        time: parentCommit ? parentCommit.commitTime ?? parentCommit.authorTime ?? parentCommit.time : '—',
      }
    })
    setCherryPickDialog({ commit, parents: parentDetails })
  }
  const confirmCherryPick = async (mainline?: number) => {
    if (!repository || !cherryPickDialog) return
    await executeRepositoryAction(
      (path) => cherryPickRepositoryCommit(path, cherryPickDialog.commit.fullHash ?? cherryPickDialog.commit.id, mainline),
      message('history:app.notice.cherryPicked', { "id": cherryPickDialog.commit.id }),
      { key: 'cherry-pick', label: message('history:app.progress.cherryPick', { "id": cherryPickDialog.commit.id }), detail: message('history:app.progress.cherryPickDetail') },
    )
  }
  const handleResetCommit = async (commit: Commit) => {
    if (!repository) return setRepositoryNotice(message('history:app.notice.resetOpenFirst'))
    if (!await confirm({ title: message('history:app.confirm.resetHeading'), message: message('history:app.confirm.reset', { "branch": repository.branch, "id": commit.id }), confirmLabel: message('history:app.confirm.resetAction'), variant: 'danger' })) return
    await executeRepositoryAction((path) => resetRepositoryToCommit(path, commit.fullHash ?? commit.id), message('history:app.notice.reset', { "id": commit.id }))
  }
  const handleUndoLastCommit = async (commit: Commit) => {
    if (!repository) return setRepositoryNotice(message('history:app.notice.undoOpenFirst'))
    if (repository.operation) return setRepositoryNotice(message('history:app.notice.finishOperation', { "kindt": operationMessage(repository.operation.kind) }))
    if (!await confirm({ title: message('history:app.confirm.undoHeading'), message: message('history:app.confirm.undo', { "id": commit.id }), confirmLabel: message('history:app.confirm.undoAction'), variant: 'danger' })) return
    await executeRepositoryAction((path) => undoLastCommit(path), message('history:app.notice.undone', { "id": commit.id }))
    setWorkspaceView('changes')
  }
  const handleRevertCommit = async (commit: Commit) => {
    if (!repository) return setRepositoryNotice(message('history:app.notice.revertOpenFirst'))
    if (repository.operation) return setRepositoryNotice(message('history:app.notice.finishOperation', { "kindt": operationMessage(repository.operation.kind) }))
    const parents = commit.parents ?? (commit.parent ? [commit.parent] : [])
    const mainline = parents.length > 1 ? 1 : undefined
    const mergeHint = parents.length > 1 ? message('history:app.confirm.mergeRevertHint') : ''
    if (!await confirm({ title: message('history:app.confirm.revertHeading'), message: message('history:app.confirm.revert', { "id": commit.id, "mergeHint": mergeHint }), confirmLabel: message('history:app.confirm.revertAction') })) return
    await executeRepositoryAction(
      (path) => revertRepositoryCommit(path, commit.fullHash ?? commit.id, mainline),
      message('history:app.notice.reverted', { "id": commit.id }),
      { key: 'revert', label: message('history:app.progress.revert', { "id": commit.id }), detail: message('history:app.progress.revertDetail') },
    )
  }
  const handleRebaseCommit = async (commit: Commit) => {
    if (!repository) return setRepositoryNotice(message('history:app.notice.rebaseOpenFirst'))
    if (repository.operation) return setRepositoryNotice(message('history:app.notice.finishOperation', { "kindt": operationMessage(repository.operation.kind) }))
    setRebaseDialog({ commit: commit.fullHash ?? commit.id, label: commit.id })
  }
  const startRebase = async (onto: string) => {
    if (!repository) return
    await executeRepositoryAction((path) => rebaseRepositoryOnto(path, onto), message('history:app.notice.rebased', { "branch": repository.branch, "slice08": onto.slice(0, 8) }))
    setRebaseDialog(null)
  }
  const handleTagCommit = async (commit: Commit) => {
    if (!repository) return setRepositoryNotice(message('history:app.notice.tagOpenFirst'))
    const tagName = window.prompt(t('history:app.prompt.tagName', { "id": commit.id }))?.trim()
    if (!tagName) return
    await executeRepositoryAction((path) => createRepositoryTag(path, tagName, commit.fullHash ?? commit.id), message('history:app.notice.tagCreated', { "tagName": tagName }))
  }
  const handleCompareCommit = (commit: Commit) => {
    setCompareBase(commit.fullHash ?? commit.id)
    setWorkspaceView('compare')
  }
  const handleApplyStash = async (reference: string) => {
    await executeRepositoryAction(
      (path) => applyRepositoryStash(path, reference, false),
      message('history:app.notice.stashApplied', { "reference": reference }),
      { key: 'stash', label: message('history:app.progress.stashApply', { "reference": reference }), detail: message('history:app.progress.stashApplyDetail') },
    )
  }
  const handlePopStash = async (reference: string) => {
    if (!await confirm({ title: message('history:app.confirm.popHeading'), message: message('history:app.confirm.pop', { "reference": reference }), confirmLabel: message('history:app.confirm.popAction') })) return
    await executeRepositoryAction(
      (path) => applyRepositoryStash(path, reference, true),
      message('history:app.notice.stashPopped', { "reference": reference }),
      { key: 'stash', label: message('history:app.progress.stashPop', { "reference": reference }), detail: message('history:app.progress.stashPopDetail') },
    )
  }
  const handleDropStash = async (reference: string) => {
    if (!await confirm({ title: message('history:app.stash.delete'), message: message('history:app.confirm.drop', { "reference": reference }), confirmLabel: message('history:app.confirm.delete'), variant: 'danger' })) return
    await executeRepositoryAction(
      (path) => dropRepositoryStash(path, reference),
      message('history:app.notice.stashDeleted', { "reference": reference }),
      { key: 'stash', label: message('history:app.progress.stashDrop', { "reference": reference }), detail: message('history:app.progress.stashDropDetail') },
    )
  }
  const handleSelectStash = (reference: string) => {
    const stash = repository?.stashes.find((item) => item.reference === reference)
    const stashCommit = stash ? activeCommits.find((commit) => commit.fullHash === stash.hash) : undefined
    if (!stashCommit) {
      setRepositoryNotice(message('history:app.notice.noStashNode'))
      return
    }
    setQuery('')
    setBranchFilter([])
    setTimeFilter('all')
    setSelected(stashCommit.id)
    setWorkspaceView('history')
  }
  const handlePullBranch = async (branch: string) => {
    if (pullingBranchesRef.current.has(branch)) return setRepositoryNotice(message('history:app.notice.branchPulling', { "branch": branch }))
    const hasLocalChanges = branch === repository?.branch && Boolean(repository?.files.length)
    setBranchPulling(branch, true)
    try {
      await executeRepositoryAction(
        (path) => pullRepositoryBranch(path, branch),
        hasLocalChanges ? message('history:app.notice.pulledKeptChanges', { "branch": branch }) : message('history:app.notice.pulledFastForward', { "branch": branch }),
        { key: 'pull', label: hasLocalChanges ? message('history:app.progress.pullWithChanges', { "branch": branch }) : message('history:app.progress.pull', { "branch": branch }), detail: hasLocalChanges ? message('history:app.progress.pullChangesDetail') : message('history:app.progress.pullDetail') },
      )
    } finally {
      setBranchPulling(branch, false)
    }
  }
  const handlePush = async () => {
    await executeRepositoryAction((path) => pushRepository(path), message('history:app.notice.pushed', { "branch": repository?.branch ?? '' }), { key: 'push', label: message('history:app.progress.push', { "branch": repository?.branch ?? '' }), detail: message('history:app.progress.pushDetail') })
  }
  const handleFetch = useCallback(async () => {
    if (!repository || fetching || activeOperation) return
    setActiveOperation({ key: 'fetch', label: message('history:app.progress.fetch'), detail: message('history:app.progress.fetchDetail') })
    try {
      await fetchNow()
    } finally {
      setActiveOperation((current) => current?.key === 'fetch' ? null : current)
    }
  }, [activeOperation, fetchNow, fetching, repository])
  const handleDeleteBranch = async (branch: string) => {
    if (!repository) return setRepositoryNotice(message('history:app.notice.deleteBranchOpenFirst'))
    const remote = branch.includes('/') && branch.startsWith('origin/')
    if (!await confirm({ title: message('history:app.branches.delete'), message: message('history:app.confirm.deleteBranch', { "remote": message(remote ? 'history:app.branches.remote' : 'history:app.branches.local'), "branch": branch }), confirmLabel: message('history:app.confirm.delete'), variant: 'danger' })) return
    await executeRepositoryAction((path) => deleteRepositoryBranch(path, branch), message('history:app.notice.branchDeleted', { "branch": branch }))
  }
  const copyText = async (value: string, success: MessageContent) => {
    try {
      await navigator.clipboard.writeText(value)
      setRepositoryNotice(success)
    } catch {
      setRepositoryNotice(message('history:app.notice.copyFailed'))
    }
  }
  const handleOpenParent = async (hash: string) => {
    if (!repository || historyLoadInProgress.current) return
    const identity = selectedTreeKey
    historyLoadInProgress.current = true
    setActiveOperation({ key: 'history', label: message('history:app.progress.findParent'), detail: hash })
    try {
      let expandedSnapshot: RepositorySnapshot | null = null
      const result = await findParentCommit(activeCommits, hash, historyLoadLimit, async (limit) => {
        if (parentNavigationIdentity.current !== identity) throw new Error(t('history:app.navigation.selectionChanged'))
        const snapshot = await loadRepositoryHistory(repository.path, limit)
        expandedSnapshot = snapshot
        return snapshot.commits
      })
      if (parentNavigationIdentity.current !== identity) return
      if (!result.commit) {
        setRepositoryNotice(message('history:app.notice.parentNotFound', { "hash": hash }))
        return
      }
      if (expandedSnapshot) {
        setHistoryLoadLimit(result.limit)
        applySnapshot(expandedSnapshot)
      }
      setWorkspaceView('history')
      setQuery('')
      setBranchFilter([])
      setHistoryRevealSignal((value) => value + 1)
      setTimeFilter('all')
      setDiffFile(null)
      setWideDiff(false)
      setHistoryTarget(null)
      setHistoryConflictPath(null)
      setOperationPath(null)
      setSelected(result.commit.id)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-commit-id="${result.commit!.id}"]`)?.scrollIntoView({ block: 'center' })
      }))
    } catch (error) {
      if (parentNavigationIdentity.current === identity) setRepositoryNotice(errorMessage(error))
    } finally {
      historyLoadInProgress.current = false
      setActiveOperation((current) => current?.key === 'history' ? null : current)
    }
  }
  const handleJumpReference = async (reference: string, kind: 'branch' | 'tag') => {
    if (!repository) return
    let commit = activeCommits.find((item) => item.branches?.includes(reference))
    if (!commit && historyLoadInProgress.current) return
    const identity = referenceNavigationIdentity.current
    const request = ++referenceNavigationRequest.current
    const isSameRepository = () => referenceNavigationIdentity.current === identity
    const isCurrent = () => isSameRepository() && referenceNavigationRequest.current === request
    const loadsHistory = !commit
    if (loadsHistory) historyLoadInProgress.current = true
    try {
      if (!commit) {
        const result = await findReferenceCommit(activeCommits, reference, historyLoadLimit, async (limit) => {
          setActiveOperation({ key: 'history', label: message('history:app.progress.expandHistory'), detail: message('history:app.progress.findReference', { "count": limit, "kind": message(kind === 'branch' ? 'history:app.branches.heading' : 'history:app.navigation.tags'), "reference": reference }) })
          const snapshot = await loadRepositoryHistory(repository.path, limit)
          if (!isCurrent()) throw new Error(t('history:app.navigation.targetChanged'))
          setHistoryLoadLimit(limit)
          applySnapshot(snapshot)
          return snapshot.commits
        })
        commit = result.commit ?? undefined
      }
      if (!isCurrent()) return
      if (!commit) {
        setRepositoryNotice(message('history:app.notice.referenceNotFound', { "kind": message(kind === 'branch' ? 'history:app.branches.heading' : 'history:app.navigation.tags'), "reference": reference }))
        return
      }
      setRepositoryManagerOpen(false)
      setWorkspaceView('history')
      setQuery('')
      setBranchFilter([])
      setTimeFilter('all')
      setHistoryRevealSignal((value) => value + 1)
      setDiffFile(null)
      setTreeFileView(null)
      setWideDiff(false)
      setHistoryTarget(null)
      setHistoryConflictPath(null)
      setOperationPath(null)
      const commitId = commit.id
      setActiveOperation((current) => current?.key === 'history' ? null : current)
      setSelected(commitId)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!isCurrent()) return
        document.querySelector<HTMLElement>(`[data-commit-id="${commitId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }))
    } catch (error) {
      if (isCurrent()) setRepositoryNotice(errorMessage(error))
    } finally {
      if (loadsHistory && isSameRepository()) {
        historyLoadInProgress.current = false
        setActiveOperation((current) => current?.key === 'history' ? null : current)
      }
    }
  }
  const handleJumpBranch = (branch: string) => handleJumpReference(branch, 'branch')
  const handleJumpTag = (tag: string) => handleJumpReference(tag, 'tag')

  useEffect(() => {
    setHistoryLoadLimit(DEFAULT_HISTORY_LOAD_LIMIT)
    historyLoadInProgress.current = false
    setActiveOperation((current) => current?.key === 'history' ? null : current)
  }, [repository?.path])
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
      if (document.querySelector('.repository-add-dialog')) return
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        if (repositoryManagerOpen || !repository) {
          document.querySelector<HTMLInputElement>('.repository-catalog-search input')?.focus()
        } else {
          setRepositorySwitcherSignal((current) => current + 1)
        }
      }
      if (modifier && event.key === '/') { event.preventDefault(); setTheme((value) => value === 'system' ? resolvedTheme === 'dark' ? 'light' : 'dark' : value === 'dark' ? 'light' : 'dark') }
      if (repositoryManagerOpen || !repository) {
        if (modifier && !event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); document.querySelector<HTMLInputElement>('.repository-catalog-search input')?.focus() }
        return
      }
      if (modifier && event.key.toLowerCase() === 'f') { event.preventDefault(); searchRef.current?.focus() }
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); void handleFetch() }
      if (modifier && event.key === 'Enter') { event.preventDefault(); setWorkspaceView('changes') }
      if (event.key.toLowerCase() === 'w' && !modifier && document.activeElement?.tagName !== 'INPUT') { setWideDiff((value) => !value) }
      if (event.key.toLowerCase() === 't' && !modifier && document.activeElement?.tagName !== 'INPUT') {
        const activeView = document.querySelector<HTMLButtonElement>('.view-switch button.active')
        const nextView = activeView?.nextElementSibling ?? activeView?.parentElement?.querySelector('button')
        ;(nextView as HTMLButtonElement | null)?.click()
      }
      if (event.key === '?' && !modifier) { setShortcutOpen((value) => !value) }
      if (event.key === 'Escape') { setShortcutOpen(false); setHistoryTarget(null); setHistoryConflictPath(null); setDiffFile(null); setTreeFileView(null); setWideDiff(false); setFilterMenu(null); setNotificationOpen(false) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleFetch, repositoryManagerOpen, repository, resolvedTheme])
  const inspectorVisible = workspaceView === 'history' && !inspectorCollapsed && !(wideDiff && (diffFile !== null || treeFileView !== null))
  const timeFilterLabels: Record<TimeFilter, string> = { all: t('history:app.filters.allTime'), day: t('history:app.filters.day'), week: t('history:app.filters.week'), month: t('history:app.filters.month') }
  const branchFilterLabel = branchFilter.length === 0 ? t('history:app.filters.allBranches') : branchFilter.length === 1 ? branchFilter[0] : t('history:app.filters.branchCount', { "count": branchFilter.length })
  const minimizeWindow = () => { try { void getCurrentWindow().minimize().catch(() => undefined) } catch { /* Browser preview has no native window. */ } }
  const toggleWindowMaximize = () => { try { const appWindow = getCurrentWindow(); void appWindow.toggleMaximize().then(() => appWindow.isMaximized()).then(setWindowMaximized).catch(() => undefined) } catch { /* Browser preview has no native window. */ } }
  const closeWindow = () => { try { void getCurrentWindow().close().catch(() => undefined) } catch { /* Browser preview has no native window. */ } }
  const themeTitle = theme === 'system' ? t('history:app.theme.system', { "resolvedThemedark": t(resolvedTheme === 'dark' ? 'history:app.theme.dark' : 'history:app.theme.light') }) : t('history:app.theme.selected', { "themedark": t(theme === 'dark' ? 'history:app.theme.dark' : 'history:app.theme.light') })
  const ThemeIcon = theme === 'system' ? Monitor : theme === 'dark' ? Moon : Sun
  return <main className={`app-shell ${repository && !repositoryManagerOpen ? 'workbench-active' : ''} ${resolvedTheme === 'light' ? 'theme-light' : ''} ${panelResizing === 'details' ? 'panel-resizing-vertical' : panelResizing ? 'panel-resizing' : ''}`} style={repository && !repositoryManagerOpen ? { gridTemplateColumns: sidebarCollapsed ? '0px 0px minmax(0, 1fr)' : `${sidebarWidth}px 1px minmax(0, 1fr)` } : undefined}>
    <div className="app-titlebar" data-tauri-drag-region>
      <div className="titlebar-brand" data-tauri-drag-region><AppMark/><span>Branchline</span></div>
      {repository && !repositoryManagerOpen && <div className="titlebar-repository-controls">
        <RepositoryQuickSwitcher favorites={favoriteRepositories} onToggleFavorite={toggleFavorite} repository={repository} parentRepository={parentRepository} recentRepositories={recentRepositories} openingRepository={openingRepository} openSignal={repositorySwitcherSignal} onOpenRepository={handleOpenRepository} onOpenRepositoryPath={handleOpenRepositoryPath} onOpenSubmodulePath={handleOpenSubmodulePath} onReturnToParentRepository={handleReturnToParentRepository}/>
        <Button variant="icon" className="titlebar-manager-button" onClick={() => setRepositoryManagerOpen(true)} tooltip={t('repository:manager.title')} aria-label={t('repository:manager.title')}><FolderGit2 size={16}/></Button>
      </div>}
      <div className="titlebar-drag-region" data-tauri-drag-region/>
      <LanguageSelect/>
      <div className="window-controls">
        <Tooltip content={t('history:app.window.minimize')}><button type="button" onClick={minimizeWindow}  aria-label={t('history:app.window.minimize')}><Minus size={14}/></button></Tooltip>
        <Tooltip content={windowMaximized ? t('history:app.window.restore') : t('history:app.window.maximize')}><button type="button" onClick={toggleWindowMaximize}  aria-label={windowMaximized ? t('history:app.window.restore') : t('history:app.window.maximize')}>{windowMaximized ? <Minimize2 size={13}/> : <Maximize2 size={13}/>}</button></Tooltip>
        <Tooltip content={t('history:app.window.close')}><button className="window-close" type="button" onClick={closeWindow}  aria-label={t('history:app.window.close')}><X size={14}/></button></Tooltip>
      </div>
    </div>
    {repository && !repositoryManagerOpen && <>
      <div id="sidebar-panel" className={`sidebar-shell ${sidebarCollapsed ? 'collapsed' : ''}`} style={{ width: sidebarCollapsed ? 0 : sidebarWidth, flexBasis: sidebarCollapsed ? 0 : sidebarWidth }}>
        <Sidebar repository={repository} structureRepository={structureRepository} openingRepository={openingRepository} activeView={workspaceView} structureSelection={structureSelection} onOpenRepository={handleOpenRepository} onOpenRepositoryPath={handleOpenRepositoryPath} onOpenSubmodulePath={handleOpenSubmodulePath} onCreateBranch={openCreateBranchDialog} onDeleteBranchPrefix={(prefix) => void handleDeleteBranchPrefix(prefix)} onJumpBranch={handleJumpBranch} onSwitchBranch={(branch) => void handleSwitchBranch(branch)} onPullBranch={(branch) => void handlePullBranch(branch)} onMergeBranch={(branch) => void handleMergeReference(branch)} onDeleteBranch={(branch) => void handleDeleteBranch(branch)} onCopyBranch={(branch) => void copyText(branch, message('history:app.notice.branchNameCopied', { "branch": branch }))} autoPullBranches={autoPullBranches} pullingBranches={pullingBranches} onToggleAutoPullBranch={toggleAutoPullBranch} onSelectView={(view) => { setRepositoryManagerOpen(false); setWorkspaceView(view) }} onSelectStructure={(selection) => { setRepositoryManagerOpen(false); setStructureSelection(selection); setWorkspaceView('structure') }} onOpenGitConfig={() => setGitConfigOpen(true)}/>
      </div>
      <span className={`panel-resizer sidebar-resizer ${sidebarCollapsed ? 'hidden' : ''} ${panelResizing === 'sidebar' ? 'active' : ''}`} role="separator" tabIndex={0} aria-orientation="vertical" aria-valuemin={200} aria-valuemax={360} aria-valuenow={Math.round(sidebarWidth)} aria-controls="sidebar-panel" aria-label={t('history:app.layout.resizeSidebar')} onKeyDown={(event) => { const delta = getResizeDeltaFromKey(event, 'vertical'); if (delta) setSidebarWidth((value) => Math.min(360, Math.max(200, value + delta))) }} onPointerDown={(event) => beginPanelResize('sidebar', event)}/>
    </>}
    {repository && !repositoryManagerOpen && <header className="topbar">
        <div className="branch-context"><Button variant="icon" className="panel-toggle" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} tooltip={t(sidebarCollapsed ? 'history:app.sidebar.expand' : 'history:app.sidebar.collapse')} aria-label={t(sidebarCollapsed ? 'history:app.sidebar.expand' : 'history:app.sidebar.collapse')}>{sidebarCollapsed ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>}</Button>{parentRepository && <Tooltip content={t('history:app.navigation.parentRepo', { "path": parentRepository.path })}><button className="parent-repository-chip" onClick={() => void handleReturnToParentRepository()} ><ArrowLeft size={13}/><Box size={13}/><span>{parentRepository.name}</span></button></Tooltip>}{rootRepository && <Tooltip content={t('history:app.navigation.rootRepo', { "path": rootRepository.path })}><button className="parent-repository-chip root-repository-chip" onClick={() => void handleReturnToRootRepository()} ><FolderGit2 size={13}/><span>{t('history:app.navigation.rootRepoLabel', { "name": rootRepository.name })}</span></button></Tooltip>}</div>
          <div className={`global-search ${query ? 'has-query' : ''}`}><Search size={16}/><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && workspaceView === 'history') { event.preventDefault(); setSearchAction((current) => ({ sequence: current.sequence + 1, direction: event.shiftKey ? -1 : 1 })) } }} placeholder={workspaceView === 'tags' ? t('history:app.search.tags') : repository ? t('history:app.search.commits') : t('history:app.search.openFirst')} disabled={!repository}/>{query ? <><span className="search-result-count">{workspaceView === 'tags' ? t('history:app.search.tagCount', { "count": tagSearchCount }) : searchSummary.total ? `${new Intl.NumberFormat(locale).format(searchSummary.current || 1)}/${new Intl.NumberFormat(locale).format(searchSummary.total)}` : '0/0'}</span>{workspaceView === 'history' && <><Tooltip content={t('history:app.search.previous')}><button type="button" onClick={() => setSearchAction((current) => ({ sequence: current.sequence + 1, direction: -1 }))} disabled={!searchSummary.total} aria-label={t('history:app.search.previous')}><ChevronUp size={13}/></button></Tooltip><Tooltip content={t('history:app.search.next')}><button type="button" onClick={() => setSearchAction((current) => ({ sequence: current.sequence + 1, direction: 1 }))} disabled={!searchSummary.total} aria-label={t('history:app.search.next')}><ChevronDown size={13}/></button></Tooltip><Tooltip content={searchMode === 'locate' ? t('history:app.search.filterMode') : t('history:app.search.locateMode')}><button type="button" className={searchMode === 'filter' ? 'active' : ''} onClick={() => setSearchMode((current) => current === 'locate' ? 'filter' : 'locate')} aria-label={searchMode === 'locate' ? t('history:app.search.filterMode') : t('history:app.search.locateMode')}><ListFilter size={13}/></button></Tooltip></>}<Tooltip content={t('history:app.search.clear')}><button type="button" onClick={() => setQuery('')} aria-label={t('history:app.search.clear')}><X size={13}/></button></Tooltip></> : <kbd>{getShortcutModifier()} F</kbd>}</div>
          <div className="top-actions">
            <Button variant="secondary" className="fetch-button sync-action" aria-label={t('history:app.sync.fetch')} onClick={() => void handleFetch()} disabled={!repository || fetching || Boolean(activeOperation)} tooltip={t('history:app.sync.fetchHint')}><RefreshCw size={15} className={fetching ? 'spin' : ''}/><span>{fetching ? t('history:app.sync.fetching') : t('history:app.sync.fetch')}</span></Button>
            <Button variant="secondary" className="fetch-button sync-action" aria-label={t('history:app.sync.pull')} onClick={() => repository && void handlePullBranch(repository.branch)} disabled={!repository || Boolean(activeOperation) || Boolean(repository.operation)} tooltip={repository?.operation ? t('history:app.sync.finishOperation') : repository?.behind ? t('history:app.sync.pullCount', { "count": repository.behind }) : t('history:app.sync.pullHint')}>{activeOperation?.key === 'pull' ? <RefreshCw className="spin" size={15}/> : <CloudDownload size={15}/>}<span>{activeOperation?.key === 'pull' ? t('history:app.sync.pulling') : t('history:app.sync.pull')}</span>{Boolean(repository?.behind) && <small className="sync-count pull-count">{new Intl.NumberFormat(locale).format(repository!.behind)}</small>}</Button>
            <Button variant="secondary" className="fetch-button sync-action" aria-label={t('history:app.sync.push')} onClick={() => void handlePush()} disabled={!repository || Boolean(activeOperation) || Boolean(repository.operation)} tooltip={repository?.operation ? t('history:app.sync.finishOperation') : repository?.ahead ? t('history:app.sync.pushCount', { "count": repository.ahead }) : t('history:app.sync.pushHint')}>{activeOperation?.key === 'push' ? <RefreshCw className="spin" size={15}/> : <CloudUpload size={15}/>}<span>{activeOperation?.key === 'push' ? t('history:app.sync.pushing') : t('history:app.sync.push')}</span>{Boolean(repository?.ahead) && <small className="sync-count push-count">{new Intl.NumberFormat(locale).format(repository!.ahead)}</small>}</Button>
            <Button ref={notificationButtonRef} variant="icon" className="global-actions-menu-button" active={Boolean(globalMenu) || notificationOpen} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setNotificationOpen(false); setGlobalMenu((current) => current ? null : { x: rect.right - 220, y: rect.bottom + 4 }) }} tooltip={t('history:app.shortcuts.moreOptions')} aria-label={t('history:app.shortcuts.moreOptions')} aria-expanded={Boolean(globalMenu)}><MoreHorizontal size={17}/></Button>
            {globalMenu && <ContextMenu x={globalMenu.x} y={globalMenu.y} onClose={() => setGlobalMenu(null)}>
              <button onClick={() => setShortcutOpen(true)}><Command size={14}/><span>{t('history:app.shortcuts.view')}</span></button>
              <button onClick={() => setTheme(nextThemePreference)}><ThemeIcon size={14}/><span>{t('history:app.shortcuts.theme')}</span></button>
              <button onClick={() => setNotificationOpen(true)}><Bell size={14}/><span>{t('history:app.notifications.view')}</span></button>
            </ContextMenu>}
            {notificationOpen && <div ref={notificationPopoverRef} className="notification-popover">
              <div className="popover-heading"><strong>{t('history:app.notifications.heading')}</strong><Tooltip content={t('history:app.notifications.close')}><button onClick={() => setNotificationOpen(false)} aria-label={t('history:app.notifications.close')}><X size={13}/></button></Tooltip></div>
              <div className="notification-item unread"><span/><div><strong>{repository ? t('history:app.notifications.healthy') : t('history:app.sidebar.noRepository')}</strong><small>{repository ? t('history:app.notifications.tracking', { "branch": repository.branch, "ahead": repository.ahead, "behind": repository.behind }) : t('history:app.notifications.openHint')}</small></div></div>
              <div className="notification-item"><span/><div><strong>{repository ? (autoFetchEnabled ? t('history:app.notifications.autoEnabled') : t('history:app.notifications.autoDisabled')) : t('history:app.notifications.autoWaiting')}</strong><small>{repository ? (autoFetchEnabled ? t('history:app.notifications.autoInterval', { "fetchIntervalMinutes": fetchIntervalMinutes }) : t('history:app.notifications.enableHint')) : t('history:app.notifications.autoOpenHint')}</small></div></div>
              <div className="notification-item"><span/><div><strong>{t('history:app.notifications.submodules')}</strong><small>{repository ? t('history:app.notifications.submoduleCount', { "count": repository.submoduleCount }) : t('history:app.notifications.noData')}</small></div></div>
            </div>}
          </div>
      </header>
    }
    <div className={`workspace ${repository && !repositoryManagerOpen ? '' : 'empty-repository'}`}>
      {repository && !repositoryManagerOpen ? <><div className="content-tabs"><Tooltip content={t('history:app.navigation.historyHint')}><button className={workspaceView === 'history' ? 'active' : ''} onClick={() => setWorkspaceView('history')} ><GitCommitHorizontal size={14}/><span className="tab-label">{t('history:app.navigation.history')}</span></button></Tooltip><Tooltip content={t('history:app.navigation.changesHint')}><button className={workspaceView === 'changes' ? 'active' : ''} onClick={() => setWorkspaceView('changes')} ><FileDiff size={14}/><span className="tab-label">{t('history:app.navigation.changes')}</span></button></Tooltip><Tooltip content={t('history:app.navigation.stashHint')}><button className={workspaceView === 'stash' ? 'active' : ''} onClick={() => setWorkspaceView('stash')} ><Archive size={14}/><span className="tab-label">{t('history:app.navigation.stashes')}</span></button></Tooltip><Tooltip content={t('history:app.navigation.compareHint')}><button className={workspaceView === 'compare' ? 'active' : ''} onClick={() => { setCompareBase(null); setWorkspaceView('compare') }} ><GitCompareArrows size={14}/><span className="tab-label">{t('history:app.navigation.compare')}</span></button></Tooltip><Tooltip content={t('history:app.navigation.mergeHint')}><button className={workspaceView === 'merge' ? 'active' : ''} onClick={() => setWorkspaceView('merge')} ><GitMerge size={14}/><span className="tab-label">{t('history:app.navigation.merge')}</span></button></Tooltip>{repository.operation && <Tooltip content={t('history:app.navigation.operationHint')}><button className={`operation-tab ${workspaceView === 'operation' ? 'active' : ''}`} onClick={() => setWorkspaceView('operation')} ><CircleDot size={14}/><span className="tab-label">{repository.operation.kind === 'rebase' ? t('history:app.navigation.rebase') : repository.operation.conflicts.length ? t('history:app.navigation.conflicts') : repository.operation.kind === 'merge' ? t('history:app.navigation.mergeOperation') : repository.operation.kind === 'cherry-pick' ? t('history:app.navigation.cherryPick') : t('history:app.navigation.operation')}</span><span className="tab-badge">{repository.operation.conflicts.length ? new Intl.NumberFormat(locale).format(repository.operation.conflicts.length) : repository.operation.currentStep || '!'}</span></button></Tooltip>}<div className="tab-spacer"/>{workspaceView === 'history' && <><Button variant="danger" className="history-undo-button" aria-label={t('history:app.confirm.undoHeading')} disabledAnchorClassName="history-undo-anchor" disabled={!currentBranchHead || Boolean(repository.operation) || Boolean(activeOperation)} onClick={() => currentBranchHead && void handleUndoLastCommit(currentBranchHead)} tooltip={t('history:app.actions.undoHint')}><Undo2 size={14}/><span>{t('history:app.confirm.undoHeading')}</span></Button><Button variant="secondary" className="filter-button" aria-label={t('history:app.filters.branchHint', { branchFilterLabel })} active={branchFilter.length > 0} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setFilterMenu({ kind: 'branch', x: rect.right - 220, y: rect.bottom + 4 }) }} tooltip={t('history:app.filters.branchHint', { "branchFilterLabel": branchFilterLabel })}><ListFilter size={14}/><span>{branchFilterLabel}</span><ChevronDown size={12}/></Button><Button variant="secondary" className="filter-button" aria-label={t('history:app.filters.timeHint', { timeFilterLabelstimeFilter: timeFilterLabels[timeFilter] })} active={timeFilter !== 'all'} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setFilterMenu({ kind: 'time', x: rect.right - 220, y: rect.bottom + 4 }) }} tooltip={t('history:app.filters.timeHint', { "timeFilterLabelstimeFilter": timeFilterLabels[timeFilter] })}><Clock3 size={14}/><span>{timeFilterLabels[timeFilter]}</span><ChevronDown size={12}/></Button></>}</div>
      {filterMenu && <ContextMenu x={filterMenu.x} y={filterMenu.y} onClose={() => setFilterMenu(null)}>
        {filterMenu.kind === 'branch' ? <><div className="context-menu-title"><ListFilter size={13}/><span>{t('history:app.filters.branchHeading')}</span></div><div className="context-menu-options"><button className={branchFilter.length === 0 ? 'selected-option' : ''} onClick={() => { setBranchFilter([]); setFilterMenu(null) }}><Check size={14}/><span>{t('history:app.filters.allBranches')}</span></button>{availableBranches.map((branch) => <label className="history-filter-option" key={branch}><input type="checkbox" checked={branchFilter.includes(branch)} onChange={() => setBranchFilter((values) => toggleFilterValue(values, branch))}/><GitBranch size={14}/><span>{branch}</span></label>)}</div></> : <><div className="context-menu-title"><Clock3 size={13}/><span>{t('history:app.filters.timeHeading')}</span></div>{(['all', 'day', 'week', 'month'] as TimeFilter[]).map((value) => <button className={timeFilter === value ? 'selected-option' : ''} key={value} onClick={() => { setTimeFilter(value); setFilterMenu(null) }}><Clock3 size={14}/><span>{timeFilterLabels[value]}</span></button>)}</>}
      </ContextMenu>}
      <div className={`workspace-grid ${wideDiff && (diffFile !== null || treeFileView !== null) ? 'diff-wide' : ''} ${inspectorCollapsed ? 'inspector-collapsed' : ''}`} style={{ gridTemplateColumns: `minmax(0, 1fr) ${inspectorVisible ? 1 : 0}px ${inspectorVisible ? inspectorWidth : 0}px` }}>
        {workspaceView === 'history' && <section className="history-pane">
          <CommitList revealSignal={historyRevealSignal} key={repository.path} commits={activeCommits} selected={selected} onSelect={(id) => { setSelected(id); setInspectorCollapsed(false) }} query={query} searchMode={searchMode} searchAction={searchAction} onSearchSummaryChange={handleSearchSummaryChange} branchFilter={branchFilter} timeFilter={timeFilter} currentBranch={repository.branch} remoteBranches={repository.remoteBranches} branchTracking={repository.branchTracking} tags={repository.tags} stashReferences={stashReferences} inspectorCollapsed={inspectorCollapsed} onToggleInspector={() => setInspectorCollapsed((value) => !value)} onMergeCommit={(commit) => { const remote = commit.branches?.find((reference) => repository.remoteBranches.includes(reference) || repository.remoteBranches.includes(reference.replace(/^refs\/remotes\//, ''))); const normalized = remote?.replace(/^refs\/remotes\//, ''); void handleMergeReference(remote ?? commit.fullHash ?? commit.id, remote ? message('history:app.references.branchNormalized', { "normalized": normalized ?? remote ?? commit.id }) : message('history:app.references.commit', { "id": commit.id })) }} onCherryPickCommit={(commit) => void handleCherryPickCommit(commit)} onResetCommit={(commit) => void handleResetCommit(commit)} onRevertCommit={(commit) => void handleRevertCommit(commit)} onRebaseCommit={(commit) => void handleRebaseCommit(commit)} onTagCommit={(commit) => void handleTagCommit(commit)} onCompareCommit={handleCompareCommit} onCopyCommit={(commit, mode) => void copyText(mode === 'hash' ? commit.fullHash ?? commit.id : formatCommitClipboard(commit, t, locale), mode === 'hash' ? message('history:app.notice.hashCopied', { "statusstashStash": message(commit.status === 'stash' ? 'history:app.references.stash' : 'history:app.details.commitHeading'), "id": commit.id }) : message('history:app.notice.detailsCopied', { "id": commit.status === 'stash' ? 'Stash' : message('history:app.references.commit', { id: commit.id }) }))} onApplyStash={(reference) => void handleApplyStash(reference)} onPopStash={(reference) => void handlePopStash(reference)} onDropStash={(reference) => void handleDropStash(reference)}/>
          {diffFile !== null && <div className="history-diff-overlay"><DiffPanel files={selectedCommitFiles} repositoryPath={repository.path} wide={wideDiff} onWideChange={setWideDiff} initialFile={diffFile} onActiveFileChange={setDiffFile} hideFileList loadRows={loadSelectedCommitDiff} loadImage={loadSelectedCommitImage} onOpenLineHistory={(path, line, side) => setHistoryTarget({ path, line, tab: 'line', revision: selectedWorkingTree ? (side === 'old' ? selectedCommit.parent : undefined) : side === 'old' ? (selectedCommit.parents?.[0] ?? selectedCommit.parent ?? selectedStatsKey) : selectedStatsKey })} onClose={() => { setDiffFile(null); setWideDiff(false) }}/></div>}
          {treeFileView && <div className="history-diff-overlay"><DiffPanel key={`commit-file:${treeFileView.commit}:${treeFileView.path}`} files={[treeFileView.file]} wide={wideDiff} onWideChange={setWideDiff} hideFileList fileContentOnly loadRows={(path) => loadSelectedCommitFileContent(path)} loadImage={loadTreeFileImage} viewKey={treeFileView.commit} onOpenLineHistory={(path, line) => setHistoryTarget({ path, line, tab: 'line', revision: treeFileView.commit })} onClose={() => { setTreeFileView(null); setWideDiff(false) }}/></div>}
          {historyConflictPath && repository.operation && <div className="history-diff-overlay history-operation-overlay"><Suspense fallback={<section className="workspace-empty"><RefreshCw className="spin" size={28}/><strong>{t('history:app.progress.loadEditor')}</strong></section>}><OperationPanel repository={repository} onSnapshot={handleSnapshot} onNotice={setRepositoryNotice} initialPath={historyConflictPath} onReturnToChanges={() => { setHistoryConflictPath(null); setOperationPath(null) }} onClose={() => { setHistoryConflictPath(null); setOperationPath(null) }}/></Suspense></div>}
        </section>}
        {workspaceView === 'compare' && <ComparePanel repository={repository} initialBase={compareBase ?? undefined} initialTarget={compareBase ? repository?.branch : undefined} onNotice={setRepositoryNotice}/>}
        {workspaceView === 'merge' && <MergeQueuePanel repository={repository} onNotice={setRepositoryNotice} onSwitchBranch={handleSwitchBranch}/>}
         {workspaceView === 'operation' && <Suspense fallback={<section className="workspace-empty"><RefreshCw className="spin" size={28}/><strong>{t('history:app.progress.loadEditor')}</strong><span>{t('history:app.progress.editorHint')}</span></section>}><OperationPanel repository={repository} onSnapshot={handleSnapshot} onNotice={setRepositoryNotice} initialPath={operationPath} onReturnToChanges={() => setWorkspaceView('changes')} onClose={() => setWorkspaceView('history')}/></Suspense>}
        {workspaceView === 'changes' && (
          <StagingPage
            repository={repository}
            undoCommitMessage={undoCommitMessage}
            onSnapshot={handleSnapshot}
            onNotice={setRepositoryNotice}
            onOperationChange={(label) => setActiveOperation(label ? { key: 'commit', label, detail: message('history:app.progress.commitDetail') } : null)}
             onOpenHistory={(path, tab) => setHistoryTarget({ path, tab })}
             onOpenLineHistory={(path, line) => setHistoryTarget({ path, line, tab: 'line', revision: 'HEAD' })}
             onOpenConflict={(path) => { setOperationPath(path); setHistoryConflictPath(path); setSelected(WORKING_TREE_COMMIT_ID); setWorkspaceView('history') }}
           />
        )}
        {workspaceView === 'stash' && <StashPage repository={repository} onSelectStash={handleSelectStash} onSnapshot={(snapshot) => {
          handleSnapshot(snapshot)
          if (snapshot.operation) {
            setOperationPath(snapshot.operation.conflicts[0] ?? null)
            setSelected(WORKING_TREE_COMMIT_ID)
            setInspectorCollapsed(false)
            setWorkspaceView('history')
          }
        }} onNotice={setRepositoryNotice}/>}
        {(workspaceView === 'structure' || workspaceView === 'tags') && (
          <RepositoryStructurePanel
            repository={structureRepository ?? repository}
            activePath={repository.path}
            view={workspaceView}
            selection={structureSelection}
            onOpenPath={(path, kind) => void (kind === 'submodule' ? handleOpenSubmodulePath(path) : handleOpenRepositoryPath(path))}
            onOpenTag={handleJumpTag}
            query={query}
            onSnapshot={applyStructureSnapshot}
            onNotice={setRepositoryNotice}
          />
        )}
        <span className={`panel-resizer inspector-resizer ${inspectorVisible ? '' : 'hidden'} ${panelResizing === 'inspector' ? 'active' : ''}`} role="separator" tabIndex={inspectorVisible ? 0 : -1} aria-hidden={!inspectorVisible} aria-orientation="vertical" aria-valuemin={300} aria-valuemax={520} aria-valuenow={Math.round(inspectorWidth)} aria-controls="inspector-pane" aria-label={t('history:app.layout.resizeInspector')} onKeyDown={(event) => { const delta = getResizeDeltaFromKey(event, 'vertical', true); if (delta) setInspectorWidth((value) => Math.min(520, Math.max(300, value + delta))) }} onPointerDown={(event) => beginPanelResize('inspector', event)}/>
        {workspaceView === 'history' && !inspectorCollapsed && <section id="inspector-pane" className="inspector-pane" style={{ gridTemplateRows: `${detailsHeight}px 1px minmax(0, 1fr)` }}>
          <CommitDetails commit={selectedCommit} stashReference={selectedStashReference} onOpenParent={(hash) => void handleOpenParent(hash)} onClose={() => setInspectorCollapsed(true)}/>
          <span className={`panel-resizer inspector-vertical-resizer ${panelResizing === 'details' ? 'active' : ''}`} role="separator" tabIndex={0} aria-orientation="horizontal" aria-valuemin={230} aria-valuemax={560} aria-valuenow={Math.round(detailsHeight)} aria-label={t('history:app.layout.resizeDetails')} onKeyDown={(event) => { const delta = getResizeDeltaFromKey(event, 'horizontal'); if (delta) setDetailsHeight((value) => Math.min(560, Math.max(230, value + delta))) }} onPointerDown={beginDetailsResize}/>
          <ChangedFilesPanel key={selectedTreeKey} files={selectedCommitFiles} treePaths={usesCommitTree ? selectedTree?.paths : undefined} treeError={selectedTree?.error} loading={selectedCommitFilesLoading || (usesCommitTree && !selectedTree)} activeFile={diffFile} onOpenFile={(index, file) => {
            if (index === null) {
              setDiffFile(null)
              setWideDiff(false)
              setTreeFileView({ path: file.path, commit: selectedStatsKey, file })
              return
            }
            setTreeFileView(null)
            const isConflict = selectedWorkingTree && Boolean(file) && (file.type.toUpperCase() === 'U' || repository.operation?.conflicts.includes(file.path))
            if (isConflict) {
              setOperationPath(file.path)
              setHistoryConflictPath(file.path)
              setDiffFile(null)
              return
            }
            setDiffFile(index)
            setWideDiff(false)
          }} onOpenHistory={(path, tab) => setHistoryTarget({ path, tab, revision: selectedWorkingTree ? undefined : selectedStatsKey })}/>
        </section>}
      </div>
      <footer className="statusbar">
        <div><span className={repository.operation ? 'status-warning' : 'status-ok'}>{repository.operation ? <AlertTriangle size={11}/> : <Check size={11}/>}</span><span>{(repository.operation ? operationLabel(repository.operation.kind, t) : undefined) ?? t('history:app.notifications.healthy')}</span><span className="status-separator"/><GitBranch size={12}/><span>{repository.operation?.originalBranch ?? repository.branch}</span><span>↑{new Intl.NumberFormat(locale).format(repository.ahead)}</span><span>↓{new Intl.NumberFormat(locale).format(repository.behind)}</span></div>
        <div ref={autoFetchRef} className="statusbar-secondary"><Tooltip content={t('history:app.sidebar.openLog')}><button className="status-command-log" onClick={() => setCommandLogOpen(true)} ><TerminalSquare size={12}/><span>{t('history:app.status.commandLog')}</span></button></Tooltip><span className="status-separator"/><Tooltip content={t('history:app.status.configure')}><button className={`status-fetch-control ${autoFetchOpen ? 'active' : ''}`} onClick={() => setAutoFetchOpen((value) => !value)} aria-expanded={autoFetchOpen} aria-haspopup="dialog" ><TimerReset size={12}/><span>{t('history:app.status.autoFetch', { "value1": autoFetchEnabled ? t('history:app.status.everyMinutes', { count: fetchIntervalMinutes }) : t('history:app.status.disabled') })}</span></button></Tooltip><span className="status-separator"/><Box size={12}/><span>{t('history:app.notifications.submoduleCount', { "count": repository.submoduleCount })}</span><span className="status-separator"/><Code2 size={12}/><span>UTF-8</span>{autoFetchOpen && <div className="auto-fetch-popover" role="dialog" aria-label={t('history:app.status.settings')}><div className="auto-fetch-heading"><div><strong>{t('history:app.status.sync')}</strong><small>{t('history:app.status.syncHint')}</small></div><Button variant="icon" onClick={() => setAutoFetchOpen(false)} tooltip={t('history:app.status.close')} aria-label={t('history:app.status.close')}><X size={14}/></Button></div><label className="auto-fetch-toggle"><span><strong>{t('history:app.status.enableFetch')}</strong><small>{t('history:app.status.fetchHint')}</small></span><input type="checkbox" checked={autoFetchEnabled} onChange={(event) => setAutoFetchEnabled(event.target.checked)}/><span className="toggle-track" aria-hidden="true"><span/></span></label><div className="auto-fetch-field"><span>{t('history:app.status.fetchInterval')}</span><CompactSelect className="auto-fetch-interval-select" value={fetchIntervalMinutes} options={[1, 5, 10, 15, 30].map((minutes) => ({ value: minutes, label: t('history:app.status.minutes', { "count": minutes }) }))} onChange={setFetchIntervalMinutes} ariaLabel={t('history:app.status.selectFetch')} disabled={!autoFetchEnabled}/></div><div className="local-polling-settings"><label className="auto-fetch-toggle"><span><strong>{t('history:app.status.polling')}</strong><small>{t('history:app.status.pollHint')}</small></span><input type="checkbox" checked={localPollingEnabled} onChange={(event) => setLocalPollingEnabled(event.target.checked)}/><span className="toggle-track" aria-hidden="true"><span/></span></label><div className="auto-fetch-field"><span>{t('history:app.status.pollInterval')}</span><CompactSelect className="auto-fetch-interval-select" value={localPollingIntervalSeconds} options={[2, 5, 10, 30].map((seconds) => ({ value: seconds, label: t('history:app.status.seconds', { "count": seconds }) }))} onChange={setLocalPollingIntervalSeconds} ariaLabel={t('history:app.status.selectPolling')} disabled={!localPollingEnabled}/></div></div><div className="auto-fetch-meta"><span>{t('history:app.status.lastFetch')}</span><strong>{lastFetchAt ? new Date(lastFetchAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : t('history:app.status.neverFetched')}</strong></div><Button variant="secondary" className="auto-fetch-now" onClick={() => void handleFetch()} disabled={fetching || Boolean(activeOperation)}><RefreshCw size={13} className={fetching ? 'spin' : ''}/>{fetching ? t('history:app.sync.fetching') : t('history:app.shortcuts.fetch')}</Button></div>}</div>
      </footer></> : !repository && openingRepository ? <RepositoryStartupScreen repository={restoringRepository}/> : <RepositoryManagerPage recent={recentRepositories} favorites={favoriteRepositories} current={repository} opening={openingRepository} theme={theme} resolvedTheme={resolvedTheme} onToggleTheme={() => setTheme(nextThemePreference)} onBack={() => setRepositoryManagerOpen(false)} onOpen={(path) => void handleOpenRepositoryPath(path)} onRegister={registerRepository} onToggleFavorite={toggleFavorite} onForget={forgetRepository} onNotice={setRepositoryNotice}/>}
    </div>
    {openingRepository && repository && <div className="repository-loading" role="status" aria-live="polite"><div><RefreshCw className="spin" size={22}/><strong>{t('history:app.progress.loadingRepo')}</strong><span>{t('history:app.progress.loadingRepoDetail')}</span></div></div>}
    <div className={`operation-indicator ${activeOperation ? 'visible' : ''} ${activeOperation?.key === 'cherry-pick' ? 'cherry-pick' : ''}`} role="status" aria-live="polite" aria-hidden={!activeOperation}>{activeOperation && <><RefreshCw className="spin" size={17}/><div><strong>{renderMessage(activeOperation.label, t)}</strong><span>{renderMessage(activeOperation.detail, t)}</span></div></>}</div>
    <HistoryDrawer repositoryPath={repository?.path} filePath={historyTarget?.path ?? null} initialTab={historyTarget?.tab ?? 'history'} lineNumber={historyTarget?.line} revision={historyTarget?.revision} onClose={() => setHistoryTarget(null)}/>
    <CreateBranchDialog open={Boolean(branchDialog)} prefix={branchDialog?.prefix} currentBranch={repository?.branch ?? ''} onClose={() => setBranchDialog(null)} onCreate={handleCreateBranch}/>
    <RebaseDialog open={Boolean(rebaseDialog)} repository={repository} onto={rebaseDialog?.commit ?? null} targetLabel={rebaseDialog?.label ?? ''} onClose={() => setRebaseDialog(null)} onStart={startRebase}/>
    {cherryPickDialog && <CherryPickDialog
      open
      commit={{ id: cherryPickDialog.commit.id, title: cherryPickDialog.commit.title, parents: cherryPickDialog.parents }}
      currentBranch={repository?.branch ?? ''}
      onClose={() => setCherryPickDialog(null)}
      onConfirm={confirmCherryPick}
    />}
    <GitConfigDialog open={gitConfigOpen} onClose={() => setGitConfigOpen(false)} onNotice={setRepositoryNotice}/>
    <CommandLogPanel open={commandLogOpen} onClose={() => setCommandLogOpen(false)}/>
    <ShortcutOverlay open={shortcutOpen} onClose={() => setShortcutOpen(false)}/>
    {confirmDialog}
    {repositoryNotice && <button className="app-notice" onMouseEnter={pauseRepositoryNotice} onMouseLeave={resumeRepositoryNotice} onFocus={pauseRepositoryNotice} onBlur={resumeRepositoryNotice} onClick={() => setRepositoryNotice(null)}>{renderMessage(repositoryNotice, t)}<X size={14}/></button>}
  </main>
}
