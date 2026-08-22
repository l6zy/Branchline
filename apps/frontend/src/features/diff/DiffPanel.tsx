import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type UIEvent } from 'react'
import { AlignJustify, ArrowDown, ArrowUp, ChevronDown, Columns2, Copy, FileCode2, FileText, FolderOpen, History, List, Maximize2, Minimize2, Minus, Plus, RotateCcw, ScanText, Search, X } from 'lucide-react'
import { ContextMenu } from '../../components/ContextMenu'
import { Button } from '../../components/Button'
import { loadRepositoryFileDiff, type RepositoryDiffLine, type RepositoryFile } from '../../repository'
import { DiffFileList } from './DiffFileList'
import { HighlightedCode } from './HighlightedCode'
import { buildDiffContextEntries, type DiffContextEntry } from './diffContext'
import { isBooleanRecord, usePersistentState } from '../../persistentState'

type SplitDiffRow = { left?: RepositoryDiffLine; right?: RepositoryDiffLine }
type SplitDiffEntry = { kind: 'row'; row: SplitDiffRow } | { kind: 'omitted'; count: number }
export type DiffLineSide = 'old' | 'new'
type PendingDiffJump = { edge: 'first' | 'last'; direction: -1 | 1; remaining: number }

export function buildStagePatch(filePath: string, rows: RepositoryDiffLine[], fileType?: string) {
  const selected = rows.filter((row) => row.kind !== 'same')
  if (!selected.length) return ''
  const oldValues = selected.filter((row) => row.kind === 'del' || row.kind === 'same')
  const newValues = selected.filter((row) => row.kind === 'add' || row.kind === 'same')
  const first = selected[0]
  const oldStart = first.old ?? first.next ?? 1
  const newStart = first.next ?? Math.max(1, first.old ?? 1)
  const oldCount = oldValues.length
  const newCount = newValues.length
  const body = selected.map((row) => `${row.kind === 'add' ? '+' : '-'}${row.code}`).join('\n')
  const isNewFile = fileType === 'A' && selected.every((row) => row.kind === 'add')
  const isDeletedFile = fileType === 'D' && selected.every((row) => row.kind === 'del')
  const header = isNewFile
    ? `new file mode 100644\n--- /dev/null\n+++ b/${filePath}`
    : isDeletedFile
      ? `deleted file mode 100644\n--- a/${filePath}\n+++ /dev/null`
      : `--- a/${filePath}\n+++ b/${filePath}`
  return `diff --git a/${filePath} b/${filePath}\n${header}\n@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n${body}\n`
}

function changeBlock(rows: RepositoryDiffLine[], index: number) {
  if (rows[index]?.kind === 'same') return []
  let start = index
  let end = index
  while (start > 0 && rows[start - 1].kind !== 'same') start -= 1
  while (end + 1 < rows.length && rows[end + 1].kind !== 'same') end += 1
  return rows.slice(start, end + 1)
}

const DIFF_FONT_SIZE_KEY = 'branchline.diffFontSize.v1'
const DEFAULT_DIFF_FONT_SIZE = 12
const MIN_DIFF_FONT_SIZE = 9
const MAX_DIFF_FONT_SIZE = 22
const DIFF_VIRTUALIZATION_THRESHOLD = 300
const DIFF_VIRTUAL_OVERSCAN = 24
const EMPTY_FALLBACK_ROWS: Record<string, RepositoryDiffLine[]> = {}
const EMPTY_DIFF_ROWS: RepositoryDiffLine[] = []

const isFileMode = (value: unknown): value is 'list' | 'tree' => value === 'list' || value === 'tree'
const isDiffView = (value: unknown): value is 'unified' | 'split' => value === 'unified' || value === 'split'
const isDiffScope = (value: unknown): value is 'file' | 'changes' => value === 'file' || value === 'changes'

function initialDiffFontSize(storageKey: string, defaultSize: number) {
  const stored = Number(window.localStorage.getItem(storageKey))
  return Number.isFinite(stored) && stored >= MIN_DIFF_FONT_SIZE && stored <= MAX_DIFF_FONT_SIZE
    ? stored
    : Math.min(MAX_DIFF_FONT_SIZE, Math.max(MIN_DIFF_FONT_SIZE, defaultSize))
}

function buildSplitRows(rows: RepositoryDiffLine[]): SplitDiffRow[] {
  const result: SplitDiffRow[] = []
  let index = 0
  while (index < rows.length) {
    const row = rows[index]
    if (row.kind === 'same') {
      result.push({ left: row, right: row })
      index += 1
      continue
    }
    const deleted: RepositoryDiffLine[] = []
    const added: RepositoryDiffLine[] = []
    while (index < rows.length && rows[index].kind !== 'same') {
      if (rows[index].kind === 'del') deleted.push(rows[index])
      else added.push(rows[index])
      index += 1
    }
    for (let offset = 0; offset < Math.max(deleted.length, added.length); offset += 1) {
      result.push({ left: deleted[offset], right: added[offset] })
    }
  }
  return result
}

function buildSplitEntries(entries: DiffContextEntry[]): SplitDiffEntry[] {
  const result: SplitDiffEntry[] = []
  let buffer: RepositoryDiffLine[] = []
  const flush = () => {
    if (!buffer.length) return
    buildSplitRows(buffer).forEach((row) => result.push({ kind: 'row', row }))
    buffer = []
  }
  entries.forEach((entry) => {
    if (entry.kind === 'omitted') {
      flush()
      result.push(entry)
    } else {
      buffer.push(entry.row)
    }
  })
  flush()
  return result
}

function unifiedEntryRow(entries: DiffContextEntry[], index: number) {
  const entry = entries[index]
  return entry?.kind === 'line' ? entry.row : undefined
}

function splitEntryRow(entries: SplitDiffEntry[], index: number, side: DiffLineSide) {
  const entry = entries[index]
  if (entry?.kind !== 'row') return undefined
  return side === 'old' ? entry.row.left : entry.row.right
}

type DiffPanelProps = {
  files: RepositoryFile[]
  repositoryPath?: string
  wide: boolean
  onWideChange: (value: boolean) => void
  initialFile?: number
  onActiveFileChange?: (index: number) => void
  onClose?: () => void
  hideFileList?: boolean
  loadRows?: (filePath: string) => Promise<RepositoryDiffLine[]>
  fallbackRows?: Record<string, RepositoryDiffLine[]>
  fallbackChangeRows?: RepositoryDiffLine[]
  onOpenLineHistory?: (filePath: string, line: number, side: DiffLineSide, row: RepositoryDiffLine) => void
  onStagePatch?: (filePath: string, patch: string, description: string) => void
  onRestorePatch?: (filePath: string, patch: string, description: string) => void
  allowStage?: boolean
  defaultFontSize?: number
  fontSizeStorageKey?: string
}

export function DiffPanel({ files, repositoryPath, wide, onWideChange, initialFile = 0, onActiveFileChange, onClose, hideFileList = false, loadRows, fallbackRows = EMPTY_FALLBACK_ROWS, fallbackChangeRows = EMPTY_DIFF_ROWS, onOpenLineHistory, onStagePatch, onRestorePatch, allowStage = false, defaultFontSize = DEFAULT_DIFF_FONT_SIZE, fontSizeStorageKey = DIFF_FONT_SIZE_KEY }: DiffPanelProps) {
  const [activeFile, setActiveFile] = useState(initialFile)
  const [view, setView] = usePersistentState('branchline.diffView.v1', 'unified', isDiffView)
  const [scope, setScope] = usePersistentState('branchline.diffScope.v1', 'changes', isDiffScope)
  const [fileMode, setFileMode] = usePersistentState('branchline.diffFileMode.v1', 'list', isFileMode)
  const [collapsedFolders, setCollapsedFolders] = usePersistentState('branchline.diffCollapsedFolders.v1', {}, isBooleanRecord)
  const [repositoryRows, setRepositoryRows] = useState<RepositoryDiffLine[]>([])
  const [loadedFilePath, setLoadedFilePath] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [diffFontSize, setDiffFontSize] = useState(() => initialDiffFontSize(fontSizeStorageKey, defaultFontSize))
  const [lineMenu, setLineMenu] = useState<{ rowIndex: number; side: DiffLineSide; line: number; code: string; x: number; y: number } | null>(null)
  const [activeChange, setActiveChange] = useState<{ fileIndex: number; rowIndex: number } | null>(null)
  const [pendingJump, setPendingJump] = useState<PendingDiffJump | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchIndex, setSearchIndex] = useState(0)
  const [virtualScrollTop, setVirtualScrollTop] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const codeDiffRef = useRef<HTMLDivElement>(null)
  const pointerInside = useRef(false)
  const rowsCache = useRef(new Map<string, RepositoryDiffLine[]>())
  const splitLeftRef = useRef<HTMLDivElement>(null)
  const splitRightRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setActiveFile(initialFile)
    setActiveChange(null)
    setPendingJump(null)
  }, [initialFile])
  useEffect(() => {
    rowsCache.current.clear()
  }, [files, loadRows, repositoryPath])
  useEffect(() => {
    const file = files[activeFile]
    const loader = loadRows ?? (repositoryPath ? (path: string) => loadRepositoryFileDiff(repositoryPath, path) : null)
    if (!file || !loader) {
      setRepositoryRows([])
      setLoadedFilePath(null)
      setDiffError(null)
      setDiffLoading(false)
      return
    }
    const cachedRows = rowsCache.current.get(file.path)
    if (cachedRows) {
      setRepositoryRows(cachedRows)
      setLoadedFilePath(file.path)
      setDiffError(null)
      setDiffLoading(false)
      return
    }
    let cancelled = false
    setDiffLoading(true)
    setDiffError(null)
    setRepositoryRows([])
    setLoadedFilePath(null)
    loader(file.path)
      .then((rows) => { if (!cancelled) { rowsCache.current.set(file.path, rows); setRepositoryRows(rows); setLoadedFilePath(file.path) } })
      .catch((error) => { if (!cancelled) { setDiffError(error instanceof Error ? error.message : String(error)); setLoadedFilePath(file.path) } })
      .finally(() => { if (!cancelled) setDiffLoading(false) })
    return () => { cancelled = true }
  }, [activeFile, files, loadRows, repositoryPath])
  useEffect(() => {
    window.localStorage.setItem(fontSizeStorageKey, String(diffFontSize))
  }, [diffFontSize, fontSizeStorageKey])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey
      if (!modifier) return
      const panel = panelRef.current
      const activePanel = pointerInside.current || Boolean(panel?.contains(document.activeElement)) || document.querySelectorAll('.diff-panel').length === 1
      if (!activePanel) return
      const increase = event.key === '+' || event.key === '=' || event.code === 'NumpadAdd'
      const decrease = event.key === '-' || event.code === 'NumpadSubtract'
      const reset = event.key === '0' || event.code === 'Numpad0'
      if (!increase && !decrease && !reset) return
      event.preventDefault()
      if (reset) setDiffFontSize(defaultFontSize)
      else setDiffFontSize((value) => Math.min(MAX_DIFF_FONT_SIZE, Math.max(MIN_DIFF_FONT_SIZE, value + (increase ? 1 : -1))))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [defaultFontSize])
  const activeFileInfo = files[activeFile]
  const usesLoader = Boolean(loadRows || repositoryPath)
  const sourceRows = usesLoader ? repositoryRows : (activeFileInfo ? (fallbackRows[activeFileInfo.path] ?? fallbackChangeRows) : EMPTY_DIFF_ROWS)
  const stageActionsEnabled = allowStage && Boolean(onStagePatch || onRestorePatch)
  const lineNumberDigits = sourceRows.reduce((digits, row) => Math.max(digits, String(Math.max(row.old ?? 0, row.next ?? 0)).length), 1)
  const contextEntries = useMemo(() => buildDiffContextEntries(sourceRows), [sourceRows])
  const unifiedEntries = useMemo<DiffContextEntry[]>(() => scope === 'file'
    ? sourceRows.map((row, sourceIndex) => ({ kind: 'line', row, sourceIndex }))
    : contextEntries, [contextEntries, scope, sourceRows])
  const sourceSplitRows = useMemo(() => buildSplitRows(sourceRows), [sourceRows])
  const splitEntries = useMemo<SplitDiffEntry[]>(() => scope === 'file'
    ? sourceSplitRows.map((row) => ({ kind: 'row', row }))
    : buildSplitEntries(contextEntries), [contextEntries, scope, sourceSplitRows])
  const changeIndices = useMemo(() => {
    const targets: number[] = []
    if (view === 'unified') {
      unifiedEntries.forEach((entry, renderedIndex) => {
        if (entry.kind === 'line' && entry.row.kind !== 'same' && (entry.sourceIndex === 0 || sourceRows[entry.sourceIndex - 1]?.kind === 'same')) targets.push(renderedIndex)
      })
      return targets
    }
    splitEntries.forEach((entry, renderedIndex) => {
      if (entry.kind !== 'row') return
      const same = entry.row.left?.kind === 'same' && entry.row.right?.kind === 'same'
      const previous = splitEntries[renderedIndex - 1]
      const previousSame = !previous || previous.kind === 'omitted' || (previous.row.left?.kind === 'same' && previous.row.right?.kind === 'same')
      if (!same && previousSame) targets.push(renderedIndex)
    })
    return targets
  }, [sourceRows, splitEntries, unifiedEntries, view])
  const visibleEntryCount = view === 'unified' ? unifiedEntries.length : splitEntries.length
  const virtualized = visibleEntryCount > DIFF_VIRTUALIZATION_THRESHOLD
  const virtualRowHeight = view === 'split'
    ? Math.max(24, Math.ceil(diffFontSize * 1.5 + 6))
    : Math.max(22, Math.ceil(diffFontSize * 1.5 + 6))
  const virtualHeaderHeight = view === 'unified' ? 34 + (scope === 'changes' && !usesLoader ? 24 : 0) : 0
  const virtualStart = virtualized ? Math.max(0, Math.floor(Math.max(0, virtualScrollTop - virtualHeaderHeight) / virtualRowHeight) - DIFF_VIRTUAL_OVERSCAN) : 0
  const virtualEnd = virtualized ? Math.min(visibleEntryCount, virtualStart + DIFF_VIRTUAL_OVERSCAN * 2 + 80) : visibleEntryCount
  const virtualTopHeight = virtualStart * virtualRowHeight
  const virtualBottomHeight = Math.max(0, (visibleEntryCount - virtualEnd) * virtualRowHeight)
  const searchMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return []
    if (view === 'unified') return unifiedEntries.flatMap((entry, index) => entry.kind === 'line' && entry.row.code.toLowerCase().includes(query) ? [index] : [])
    return splitEntries.flatMap((entry, index) => {
      if (entry.kind !== 'row') return []
      return entry.row.left?.code.toLowerCase().includes(query) || entry.row.right?.code.toLowerCase().includes(query) ? [index] : []
    })
  }, [searchQuery, splitEntries, unifiedEntries, view])
  useEffect(() => {
    setSearchIndex((current) => searchMatches.length ? Math.min(current, searchMatches.length - 1) : 0)
  }, [searchMatches.length])
  useEffect(() => {
    setLineMenu(null)
    setActiveChange(null)
    setPendingJump(null)
    setVirtualScrollTop(0)
    requestAnimationFrame(() => {
      if (codeDiffRef.current) codeDiffRef.current.scrollTop = 0
      if (splitLeftRef.current) splitLeftRef.current.scrollTop = 0
      if (splitRightRef.current) splitRightRef.current.scrollTop = 0
    })
  }, [scope, view])
  useEffect(() => {
    setVirtualScrollTop(0)
    requestAnimationFrame(() => {
      if (codeDiffRef.current) codeDiffRef.current.scrollTop = 0
      if (splitLeftRef.current) splitLeftRef.current.scrollTop = 0
      if (splitRightRef.current) splitRightRef.current.scrollTop = 0
    })
  }, [activeFile])
  useEffect(() => {
    if (view !== 'split') return
    requestAnimationFrame(() => {
      const left = splitLeftRef.current
      const right = splitRightRef.current
      if (left && right) right.scrollTop = left.scrollTop
    })
  }, [activeFile, diffLoading, splitEntries.length, view])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'f') return
      const panel = panelRef.current
      const activePanel = pointerInside.current || Boolean(panel?.contains(document.activeElement)) || document.querySelectorAll('.diff-panel').length === 1
      if (!activePanel) return
      event.preventDefault()
      setSearchOpen(true)
      requestAnimationFrame(() => searchInputRef.current?.focus())
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  const activateFile = useCallback((index: number) => {
    setActiveFile(index)
    onActiveFileChange?.(index)
  }, [onActiveFileChange])
  const selectFile = useCallback((index: number) => {
    setPendingJump(null)
    setActiveChange(null)
    activateFile(index)
  }, [activateFile])
  const openLineMenu = (event: MouseEvent, row: RepositoryDiffLine | undefined, rowIndex: number, side: DiffLineSide) => {
    const line = side === 'old' ? row?.old : row?.next
    if (!row || !line) return
    event.preventDefault()
    setLineMenu({ rowIndex, side, line, code: row.code, x: event.clientX, y: event.clientY })
  }
  const handleCodeDiffScroll = (event: UIEvent<HTMLDivElement>) => {
    setVirtualScrollTop(event.currentTarget.scrollTop)
  }
  const scrollToVirtualEntry = (rowIndex: number) => {
    const offset = rowIndex * virtualRowHeight + (view === 'unified' ? virtualHeaderHeight : 0)
    if (view === 'split') {
      const left = splitLeftRef.current
      const right = splitRightRef.current
      const top = Math.max(0, offset - (left?.clientHeight ?? right?.clientHeight ?? 400) / 2)
      if (left) left.scrollTop = top
      if (right) right.scrollTop = top
      setVirtualScrollTop(top)
      return
    }
    const container = codeDiffRef.current
    if (!container) return
    container.scrollTop = Math.max(0, offset - container.clientHeight / 2)
    setVirtualScrollTop(container.scrollTop)
  }
  const scrollToChange = (rowIndex: number) => {
    setActiveChange({ fileIndex: activeFile, rowIndex })
    if (virtualized) {
      scrollToVirtualEntry(rowIndex)
      return
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      panelRef.current?.querySelectorAll<HTMLElement>(`[data-diff-row-index="${rowIndex}"]`).forEach((element) => element.scrollIntoView({ block: 'center', behavior: 'smooth' }))
    }))
  }
  const scrollToSearch = (rowIndex: number) => {
    if (virtualized) {
      scrollToVirtualEntry(rowIndex)
      return
    }
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>(`[data-diff-row-index="${rowIndex}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
  }
  const syncSplitScroll = (side: 'left' | 'right') => {
    if (view !== 'split') return
    const source = side === 'left' ? splitLeftRef.current : splitRightRef.current
    const target = side === 'left' ? splitRightRef.current : splitLeftRef.current
    if (!source || !target || target.scrollTop === source.scrollTop) return
    target.scrollTop = source.scrollTop
    setVirtualScrollTop(source.scrollTop)
  }
  const jumpSearch = (direction: -1 | 1) => {
    if (!searchMatches.length) return
    const next = (searchIndex + direction + searchMatches.length) % searchMatches.length
    setSearchIndex(next)
    scrollToSearch(searchMatches[next])
  }
  const adjacentFile = (index: number, direction: -1 | 1) => (index + direction + files.length) % files.length
  const jumpToChange = (direction: -1 | 1) => {
    if (!files.length || diffLoading) return
    const currentPosition = activeChange?.fileIndex === activeFile ? changeIndices.indexOf(activeChange.rowIndex) : -1
    const targetPosition = direction === 1
      ? (currentPosition >= 0 ? currentPosition + 1 : 0)
      : (currentPosition >= 0 ? currentPosition - 1 : changeIndices.length - 1)
    if (targetPosition >= 0 && targetPosition < changeIndices.length) {
      scrollToChange(changeIndices[targetPosition])
      return
    }
    if (files.length === 1) {
      if (changeIndices.length) scrollToChange(changeIndices[direction === 1 ? 0 : changeIndices.length - 1])
      return
    }
    setActiveChange(null)
    setPendingJump({ edge: direction === 1 ? 'first' : 'last', direction, remaining: files.length - 1 })
    activateFile(adjacentFile(activeFile, direction))
  }
  useEffect(() => {
    if (!pendingJump || diffLoading || !activeFileInfo) return
    if (usesLoader && loadedFilePath !== activeFileInfo.path) return
    if (changeIndices.length) {
      scrollToChange(changeIndices[pendingJump.edge === 'first' ? 0 : changeIndices.length - 1])
      setPendingJump(null)
      return
    }
    if (pendingJump.remaining > 1 && files.length > 1) {
      setPendingJump({ ...pendingJump, remaining: pendingJump.remaining - 1 })
      activateFile(adjacentFile(activeFile, pendingJump.direction))
      return
    }
    setPendingJump(null)
  }, [activateFile, activeFile, activeFileInfo, changeIndices, diffLoading, files.length, loadedFilePath, pendingJump, usesLoader])
  const diffStyle = { '--diff-font-size': `${diffFontSize}px`, '--diff-line-number-width': `${Math.max(3, lineNumberDigits + 1)}ch` } as CSSProperties
  const renderStageActions = (block: RepositoryDiffLine[], isBlockStart: boolean) => <span className="diff-stage-slot">{allowStage && isBlockStart && onStagePatch && <button className="diff-stage-action" onClick={(event) => { event.stopPropagation(); onStagePatch(activeFileInfo?.path ?? '', buildStagePatch(activeFileInfo?.path ?? '', block, activeFileInfo?.type), '修改块') }} title="暂存此修改块">暂存</button>}{allowStage && isBlockStart && onRestorePatch && <button className="diff-restore-action" onClick={(event) => { event.stopPropagation(); onRestorePatch(activeFileInfo?.path ?? '', buildStagePatch(activeFileInfo?.path ?? '', block), '修改块') }} title="还原此修改块"><RotateCcw size={11}/></button>}</span>
  const renderUnifiedEntry = (entry: DiffContextEntry, index: number) => entry.kind === 'omitted'
    ? <div className="hunk diff-omitted" style={virtualized ? { height: virtualRowHeight } : undefined} key={`omitted-${index}`}>省略 {entry.count} 行未修改源码</div>
    : (() => { const row = entry.row; const side: DiffLineSide = row.kind === 'del' ? 'old' : 'new'; const block = row.kind !== 'same' ? changeBlock(sourceRows, entry.sourceIndex) : []; const isBlockStart = block.length > 0 && (entry.sourceIndex === 0 || sourceRows[entry.sourceIndex - 1]?.kind === 'same'); return <div data-diff-row-index={index} style={virtualized ? { height: virtualRowHeight } : undefined} className={`code-row ${row.kind} ${searchMatches.includes(index) ? 'diff-search-match' : ''} ${searchMatches[searchIndex] === index ? 'diff-search-current' : ''} ${lineMenu?.rowIndex === index && lineMenu.side === side ? 'line-context-active' : ''} ${activeChange?.fileIndex === activeFile && activeChange.rowIndex === index ? 'diff-navigation-active' : ''}`} key={index} onContextMenu={(event) => openLineMenu(event, row, index, side)} title="右键查看该行历史">
      {renderStageActions(block, isBlockStart)}<span className="line-no">{row.old ?? row.next ?? ''}</span><span className="change-sign">{row.kind === 'add' ? '+' : row.kind === 'del' ? '−' : ''}</span><HighlightedCode code={row.code} filePath={activeFileInfo?.path ?? ''}/>
    </div> })()
  const renderSplitEntry = (entry: SplitDiffEntry, index: number, side: DiffLineSide) => entry.kind === 'omitted'
    ? <div className="hunk diff-omitted" style={virtualized ? { height: virtualRowHeight } : undefined} key={`omitted-${side}-${index}`}>省略 {entry.count} 行未修改源码</div>
    : (() => { const row = side === 'old' ? entry.row.left : entry.row.right; const sourceIndex = row ? sourceRows.indexOf(row) : -1; const block = sourceIndex >= 0 ? changeBlock(sourceRows, sourceIndex) : []; const isBlockStart = Boolean(row && block.length && (sourceIndex === 0 || sourceRows[sourceIndex - 1]?.kind === 'same')); return <div data-diff-row-index={index} style={virtualized ? { height: virtualRowHeight } : undefined} className={`split-code-side ${row?.kind ?? 'empty'} ${searchMatches.includes(index) ? 'diff-search-match' : ''} ${searchMatches[searchIndex] === index ? 'diff-search-current' : ''} ${lineMenu?.rowIndex === index && lineMenu.side === side ? 'line-context-active' : ''} ${activeChange?.fileIndex === activeFile && activeChange.rowIndex === index ? 'diff-navigation-active' : ''}`} key={`${side}-${index}`} onContextMenu={(event) => openLineMenu(event, row, index, side)} title={row ? '右键查看该行历史' : undefined}><span className="line-no">{side === 'old' ? row?.old ?? '' : row?.next ?? ''}</span><span className="change-sign">{side === 'old' ? row?.kind === 'del' ? '−' : '' : row?.kind === 'add' ? '+' : ''}</span>{row ? <HighlightedCode code={row.code} filePath={activeFileInfo?.path ?? ''}/> : <code/>}{renderStageActions(block, isBlockStart && (side === 'old' || !entry.row.left))}</div> })()
  return <section ref={panelRef} className={`diff-panel ${wide ? 'wide' : ''} ${stageActionsEnabled ? 'stage-actions-enabled' : ''}`} style={diffStyle} onPointerEnter={() => { pointerInside.current = true }} onPointerLeave={() => { pointerInside.current = false }}>
    <div className="diff-toolbar">
      <div className="diff-title"><FileCode2 size={16}/><strong>{hideFileList ? 'Diff' : '变更文件'}</strong>{!hideFileList && <span>{files.length}</span>}</div>
      {!hideFileList && <div className="segmented icon-segmented view-switch"><button className={fileMode === 'tree' ? 'active' : ''} onClick={() => setFileMode('tree')} title="树形视图" aria-label="树形视图"><FolderOpen size={14}/></button><button className={fileMode === 'list' ? 'active' : ''} onClick={() => setFileMode('list')} title="列表视图" aria-label="列表视图"><List size={14}/></button></div>}
      <div className="segmented icon-segmented diff-scope"><button className={scope === 'file' ? 'active' : ''} onClick={() => setScope('file')} title="显示完整文件" aria-label="显示完整文件"><FileText size={14}/></button><button className={scope === 'changes' ? 'active' : ''} onClick={() => setScope('changes')} title="仅显示改动" aria-label="仅显示改动"><ScanText size={14}/></button></div>
      <div className="segmented icon-segmented"><button className={view === 'unified' ? 'active' : ''} onClick={() => setView('unified')} title="统一 Diff" aria-label="统一 Diff"><AlignJustify size={14}/></button><button className={view === 'split' ? 'active' : ''} onClick={() => setView('split')} title="并排 Diff" aria-label="并排 Diff"><Columns2 size={14}/></button></div>
      <div className="segmented icon-segmented diff-navigation"><button onClick={() => jumpToChange(-1)} disabled={!files.length || diffLoading} title="上一处改动（跨文件）" aria-label="上一处改动"><ArrowUp size={14}/></button><button onClick={() => jumpToChange(1)} disabled={!files.length || diffLoading} title="下一处改动（跨文件）" aria-label="下一处改动"><ArrowDown size={14}/></button></div>
      {searchOpen ? <div className="diff-search-bar" role="search"><Search size={14}/><input ref={searchInputRef} value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setSearchIndex(0) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); jumpSearch(event.shiftKey ? -1 : 1) } if (event.key === 'Escape') { event.preventDefault(); setSearchOpen(false) } }} placeholder="搜索 Diff" aria-label="搜索 Diff"/><span>{searchQuery ? (searchMatches.length ? `${searchIndex + 1} / ${searchMatches.length}` : '无匹配') : '输入关键词'}</span><button type="button" onClick={() => jumpSearch(-1)} disabled={!searchMatches.length} title="上一个匹配"><ArrowUp size={13}/></button><button type="button" onClick={() => jumpSearch(1)} disabled={!searchMatches.length} title="下一个匹配"><ArrowDown size={13}/></button><button type="button" onClick={() => { setSearchOpen(false); setSearchQuery('') }} title="关闭搜索" aria-label="关闭搜索"><X size={13}/></button></div> : <Button variant="icon" onClick={() => { setSearchOpen(true); requestAnimationFrame(() => searchInputRef.current?.focus()) }} title="搜索 Diff（Ctrl/Cmd+F）" aria-label="搜索 Diff"><Search size={15}/></Button>}
      <div className="diff-font-controls" title="Diff 字体大小 · Ctrl/⌘ + 或 -"><button onClick={() => setDiffFontSize((value) => Math.max(MIN_DIFF_FONT_SIZE, value - 1))} disabled={diffFontSize <= MIN_DIFF_FONT_SIZE} aria-label="缩小 Diff 字体"><Minus size={13}/></button><button className="diff-font-size" onClick={() => setDiffFontSize(defaultFontSize)} title="恢复默认字号 · Ctrl/⌘ 0">{diffFontSize}px</button><button onClick={() => setDiffFontSize((value) => Math.min(MAX_DIFF_FONT_SIZE, value + 1))} disabled={diffFontSize >= MAX_DIFF_FONT_SIZE} aria-label="放大 Diff 字体"><Plus size={13}/></button></div>
      <Button variant="icon" onClick={() => onWideChange(!wide)} title={wide ? '退出宽屏 Diff' : '宽屏查看 Diff'}>{wide ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}</Button>
      {onClose && <Button variant="icon" onClick={onClose} title="关闭 Diff"><X size={15}/></Button>}
    </div>
    <div className={`diff-body ${hideFileList ? 'code-only' : ''}`}>
      {!hideFileList && <DiffFileList files={files} activeFile={activeFile} mode={fileMode} onSelectFile={selectFile} collapsedFolders={collapsedFolders} onCollapsedFoldersChange={setCollapsedFolders}/>}
      <div ref={codeDiffRef} className={`code-diff ${view}`} onScroll={view === 'unified' ? handleCodeDiffScroll : undefined}>
        <div className="file-header"><div className="file-header-path" title={activeFileInfo?.path}><ChevronDown size={14}/><code title={activeFileInfo?.path}>{activeFileInfo?.path ?? '暂无变更文件'}</code></div>{activeFileInfo && <span className="file-header-stats"><i>+{activeFileInfo.add}</i> <b>-{activeFileInfo.del}</b></span>}</div>
        {scope === 'changes' && !usesLoader && <div className="hunk">@@ 完整改动 @@</div>}
        {diffLoading && <div className="diff-message">正在读取 Diff…</div>}
        {diffError && <div className="diff-message error">{diffError}</div>}
        {!diffLoading && !diffError && visibleEntryCount === 0 && <div className="diff-message">该文件没有可展示的文本差异</div>}
        {!diffLoading && !diffError && view === 'unified' && <div className={`unified-diff-content${virtualized ? ' virtual-diff-list' : ''}`} style={virtualized ? { paddingTop: virtualTopHeight, paddingBottom: virtualBottomHeight } : undefined}>{unifiedEntries.slice(virtualStart, virtualEnd).map((entry, index) => renderUnifiedEntry(entry, index + virtualStart))}</div>}
        {!diffLoading && !diffError && view === 'split' && <div className="split-diff-panes">
          <div ref={splitLeftRef} className="split-diff-pane split-left" aria-label="旧版本代码" onScroll={() => syncSplitScroll('left')}><div className="split-diff-content">{virtualized && <div style={{ height: virtualTopHeight }}/>} {splitEntries.slice(virtualStart, virtualEnd).map((entry, index) => renderSplitEntry(entry, index + virtualStart, 'old'))} {virtualized && <div style={{ height: virtualBottomHeight }}/>}</div></div>
          <div ref={splitRightRef} className="split-diff-pane split-right" aria-label="新版本代码" onScroll={() => syncSplitScroll('right')}><div className="split-diff-content">{virtualized && <div style={{ height: virtualTopHeight }}/>} {splitEntries.slice(virtualStart, virtualEnd).map((entry, index) => renderSplitEntry(entry, index + virtualStart, 'new'))} {virtualized && <div style={{ height: virtualBottomHeight }}/>}</div></div>
        </div>}
      </div>
    </div>
    {lineMenu && activeFileInfo && <ContextMenu x={lineMenu.x} y={lineMenu.y} onClose={() => setLineMenu(null)}><div className="context-menu-title"><FileCode2 size={13}/><span>{activeFileInfo.path}:{lineMenu.line} · {lineMenu.side === 'old' ? '旧版本' : '新版本'}</span></div>{allowStage && onStagePatch && (view === 'unified' ? unifiedEntryRow(unifiedEntries, lineMenu.rowIndex)?.kind !== 'same' : splitEntryRow(splitEntries, lineMenu.rowIndex, lineMenu.side)?.kind !== 'same') && <button onClick={() => { const row = view === 'unified' ? unifiedEntryRow(unifiedEntries, lineMenu.rowIndex) : splitEntryRow(splitEntries, lineMenu.rowIndex, lineMenu.side); if (row) onStagePatch(activeFileInfo.path, buildStagePatch(activeFileInfo.path, [row], activeFileInfo.type), '单行'); setLineMenu(null) }}><Plus size={14}/><span>暂存此行</span></button>}{allowStage && onRestorePatch && (view === 'unified' ? unifiedEntryRow(unifiedEntries, lineMenu.rowIndex)?.kind !== 'same' : splitEntryRow(splitEntries, lineMenu.rowIndex, lineMenu.side)?.kind !== 'same') && <button onClick={() => { const row = view === 'unified' ? unifiedEntryRow(unifiedEntries, lineMenu.rowIndex) : splitEntryRow(splitEntries, lineMenu.rowIndex, lineMenu.side); if (row) onRestorePatch(activeFileInfo.path, buildStagePatch(activeFileInfo.path, [row]), '单行'); setLineMenu(null) }}><RotateCcw size={14}/><span>还原此行</span></button>}{onOpenLineHistory && <button onClick={() => { const row = view === 'unified' ? unifiedEntryRow(unifiedEntries, lineMenu.rowIndex) : splitEntryRow(splitEntries, lineMenu.rowIndex, lineMenu.side); if (row) onOpenLineHistory(activeFileInfo.path, lineMenu.line, lineMenu.side, row); setLineMenu(null) }}><History size={14}/><span>查看第 {lineMenu.line} 行历史</span></button>}<button onClick={() => { navigator.clipboard?.writeText(lineMenu.code).catch(() => undefined); setLineMenu(null) }}><Copy size={14}/><span>复制本行内容</span></button></ContextMenu>}
  </section>
}
