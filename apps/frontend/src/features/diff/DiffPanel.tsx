import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { AlignJustify, ArrowDown, ArrowUp, ChevronDown, Columns2, Copy, FileCode2, FileText, FolderOpen, History, List, Maximize2, Minimize2, Minus, Plus, ScanText, X } from 'lucide-react'
import { ContextMenu } from '../../components/ContextMenu'
import { loadRepositoryFileDiff, type RepositoryDiffLine, type RepositoryFile } from '../../repository'
import { DiffFileList } from './DiffFileList'
import { HighlightedCode } from './HighlightedCode'

type SplitDiffRow = { left?: RepositoryDiffLine; right?: RepositoryDiffLine }
export type DiffLineSide = 'old' | 'new'
type PendingDiffJump = { edge: 'first' | 'last'; direction: -1 | 1; remaining: number }

const DIFF_FONT_SIZE_KEY = 'branchline.diffFontSize.v1'
const DEFAULT_DIFF_FONT_SIZE = 12
const MIN_DIFF_FONT_SIZE = 9
const MAX_DIFF_FONT_SIZE = 22
const EMPTY_FALLBACK_ROWS: Record<string, RepositoryDiffLine[]> = {}
const EMPTY_DIFF_ROWS: RepositoryDiffLine[] = []

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

type DiffPanelProps = {
  files: RepositoryFile[]
  repositoryPath?: string
  wide: boolean
  onWideChange: (value: boolean) => void
  initialFile?: number
  onClose?: () => void
  hideFileList?: boolean
  loadRows?: (filePath: string) => Promise<RepositoryDiffLine[]>
  fallbackRows?: Record<string, RepositoryDiffLine[]>
  fallbackChangeRows?: RepositoryDiffLine[]
  onOpenLineHistory?: (filePath: string, line: number, side: DiffLineSide, row: RepositoryDiffLine) => void
  defaultFontSize?: number
  fontSizeStorageKey?: string
}

export function DiffPanel({ files, repositoryPath, wide, onWideChange, initialFile = 0, onClose, hideFileList = false, loadRows, fallbackRows = EMPTY_FALLBACK_ROWS, fallbackChangeRows = EMPTY_DIFF_ROWS, onOpenLineHistory, defaultFontSize = DEFAULT_DIFF_FONT_SIZE, fontSizeStorageKey = DIFF_FONT_SIZE_KEY }: DiffPanelProps) {
  const [activeFile, setActiveFile] = useState(initialFile)
  const [view, setView] = useState<'unified' | 'split'>('unified')
  const [scope, setScope] = useState<'file' | 'changes'>('changes')
  const [fileMode, setFileMode] = useState<'list' | 'tree'>('tree')
  const [repositoryRows, setRepositoryRows] = useState<RepositoryDiffLine[]>([])
  const [loadedFilePath, setLoadedFilePath] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [diffFontSize, setDiffFontSize] = useState(() => initialDiffFontSize(fontSizeStorageKey, defaultFontSize))
  const [lineMenu, setLineMenu] = useState<{ rowIndex: number; side: DiffLineSide; line: number; code: string; x: number; y: number } | null>(null)
  const [activeChange, setActiveChange] = useState<{ fileIndex: number; rowIndex: number } | null>(null)
  const [pendingJump, setPendingJump] = useState<PendingDiffJump | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  const pointerInside = useRef(false)
  const rowsCache = useRef(new Map<string, RepositoryDiffLine[]>())
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
  const rowsToRender = useMemo(() => scope === 'file' ? sourceRows : sourceRows.filter((row) => row.kind !== 'same'), [scope, sourceRows])
  const sourceSplitRows = useMemo(() => buildSplitRows(sourceRows), [sourceRows])
  const splitRows = useMemo(() => scope === 'file' ? sourceSplitRows : sourceSplitRows.filter((row) => row.left?.kind !== 'same' || row.right?.kind !== 'same'), [scope, sourceSplitRows])
  const changeIndices = useMemo(() => {
    const targets: number[] = []
    if (view === 'unified') {
      let renderedIndex = -1
      sourceRows.forEach((row, sourceIndex) => {
        if (scope === 'file' || row.kind !== 'same') renderedIndex += 1
        if (row.kind !== 'same' && (sourceIndex === 0 || sourceRows[sourceIndex - 1].kind === 'same')) targets.push(renderedIndex)
      })
      return targets
    }
    let renderedIndex = -1
    sourceSplitRows.forEach((row, sourceIndex) => {
      const same = row.left?.kind === 'same' && row.right?.kind === 'same'
      if (scope === 'file' || !same) renderedIndex += 1
      const previous = sourceSplitRows[sourceIndex - 1]
      const previousSame = !previous || (previous.left?.kind === 'same' && previous.right?.kind === 'same')
      if (!same && previousSame) targets.push(renderedIndex)
    })
    return targets
  }, [scope, sourceRows, sourceSplitRows, view])
  useEffect(() => {
    setLineMenu(null)
    setActiveChange(null)
    setPendingJump(null)
  }, [scope, view])
  const selectFile = useCallback((index: number) => {
    setPendingJump(null)
    setActiveChange(null)
    setActiveFile(index)
  }, [])
  const openLineMenu = (event: MouseEvent, row: RepositoryDiffLine | undefined, rowIndex: number, side: DiffLineSide) => {
    const line = side === 'old' ? row?.old : row?.next
    if (!row || !line) return
    event.preventDefault()
    setLineMenu({ rowIndex, side, line, code: row.code, x: event.clientX, y: event.clientY })
  }
  const scrollToChange = (rowIndex: number) => {
    setActiveChange({ fileIndex: activeFile, rowIndex })
    requestAnimationFrame(() => requestAnimationFrame(() => {
      panelRef.current?.querySelectorAll<HTMLElement>(`[data-diff-row-index="${rowIndex}"]`).forEach((element) => element.scrollIntoView({ block: 'center', behavior: 'smooth' }))
    }))
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
    setActiveFile(adjacentFile(activeFile, direction))
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
      setActiveFile((index) => adjacentFile(index, pendingJump.direction))
      return
    }
    setPendingJump(null)
  }, [activeFileInfo, changeIndices, diffLoading, files.length, loadedFilePath, pendingJump, usesLoader])
  const diffStyle = { '--diff-font-size': `${diffFontSize}px` } as CSSProperties
  return <section ref={panelRef} className={`diff-panel ${wide ? 'wide' : ''}`} style={diffStyle} onPointerEnter={() => { pointerInside.current = true }} onPointerLeave={() => { pointerInside.current = false }}>
    <div className="diff-toolbar">
      <div className="diff-title"><FileCode2 size={16}/><strong>{hideFileList ? 'Diff' : '变更文件'}</strong>{!hideFileList && <span>{files.length}</span>}</div>
      {!hideFileList && <div className="segmented icon-segmented view-switch"><button className={fileMode === 'tree' ? 'active' : ''} onClick={() => setFileMode('tree')} title="树形视图" aria-label="树形视图"><FolderOpen size={14}/></button><button className={fileMode === 'list' ? 'active' : ''} onClick={() => setFileMode('list')} title="列表视图" aria-label="列表视图"><List size={14}/></button></div>}
      <div className="segmented icon-segmented diff-scope"><button className={scope === 'file' ? 'active' : ''} onClick={() => setScope('file')} title="显示完整文件" aria-label="显示完整文件"><FileText size={14}/></button><button className={scope === 'changes' ? 'active' : ''} onClick={() => setScope('changes')} title="仅显示改动" aria-label="仅显示改动"><ScanText size={14}/></button></div>
      <div className="segmented icon-segmented"><button className={view === 'unified' ? 'active' : ''} onClick={() => setView('unified')} title="统一 Diff" aria-label="统一 Diff"><AlignJustify size={14}/></button><button className={view === 'split' ? 'active' : ''} onClick={() => setView('split')} title="并排 Diff" aria-label="并排 Diff"><Columns2 size={14}/></button></div>
      <div className="segmented icon-segmented diff-navigation"><button onClick={() => jumpToChange(-1)} disabled={!files.length || diffLoading} title="上一处改动（跨文件）" aria-label="上一处改动"><ArrowUp size={14}/></button><button onClick={() => jumpToChange(1)} disabled={!files.length || diffLoading} title="下一处改动（跨文件）" aria-label="下一处改动"><ArrowDown size={14}/></button></div>
      <div className="diff-font-controls" title="Diff 字体大小 · Ctrl/⌘ + 或 -"><button onClick={() => setDiffFontSize((value) => Math.max(MIN_DIFF_FONT_SIZE, value - 1))} disabled={diffFontSize <= MIN_DIFF_FONT_SIZE} aria-label="缩小 Diff 字体"><Minus size={13}/></button><button className="diff-font-size" onClick={() => setDiffFontSize(defaultFontSize)} title="恢复默认字号 · Ctrl/⌘ 0">{diffFontSize}px</button><button onClick={() => setDiffFontSize((value) => Math.min(MAX_DIFF_FONT_SIZE, value + 1))} disabled={diffFontSize >= MAX_DIFF_FONT_SIZE} aria-label="放大 Diff 字体"><Plus size={13}/></button></div>
      <button className="icon-button" onClick={() => onWideChange(!wide)} title={wide ? '退出宽屏 Diff' : '宽屏查看 Diff'}>{wide ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}</button>
      {onClose && <button className="icon-button" onClick={onClose} title="关闭 Diff"><X size={15}/></button>}
    </div>
    <div className={`diff-body ${hideFileList ? 'code-only' : ''}`}>
      {!hideFileList && <DiffFileList files={files} activeFile={activeFile} mode={fileMode} onSelectFile={selectFile}/>} 
      <div className={`code-diff ${view}`}>
        <div className="file-header"><div><ChevronDown size={14}/><code>{activeFileInfo?.path ?? '暂无变更文件'}</code></div>{activeFileInfo && <span><i>+{activeFileInfo.add}</i> <b>-{activeFileInfo.del}</b></span>}</div>
        {scope === 'changes' && !usesLoader && <div className="hunk">@@ 完整改动 @@</div>}
        {diffLoading && <div className="diff-message">正在读取 Diff…</div>}
        {diffError && <div className="diff-message error">{diffError}</div>}
        {!diffLoading && !diffError && rowsToRender.length === 0 && <div className="diff-message">该文件没有可展示的文本差异</div>}
        {!diffLoading && !diffError && view === 'unified' && rowsToRender.map((row, index) => { const side: DiffLineSide = row.kind === 'del' ? 'old' : 'new'; return <div data-diff-row-index={index} className={`code-row ${row.kind} ${lineMenu?.rowIndex === index && lineMenu.side === side ? 'line-context-active' : ''} ${activeChange?.fileIndex === activeFile && activeChange.rowIndex === index ? 'diff-navigation-active' : ''}`} key={index} onContextMenu={(event) => openLineMenu(event, row, index, side)} title="右键查看该行历史">
          <span className="line-no">{row.old ?? row.next ?? ''}</span><span className="change-sign">{row.kind === 'add' ? '+' : row.kind === 'del' ? '−' : ''}</span><HighlightedCode code={row.code} filePath={activeFileInfo?.path ?? ''}/>
        </div> })}
        {!diffLoading && !diffError && view === 'split' && <div className="split-diff-panes">
          <div className="split-diff-pane split-left" aria-label="旧版本代码"><div className="split-diff-content">{splitRows.map((row, index) => <div data-diff-row-index={index} className={`split-code-side ${row.left?.kind ?? 'empty'} ${lineMenu?.rowIndex === index && lineMenu.side === 'old' ? 'line-context-active' : ''} ${activeChange?.fileIndex === activeFile && activeChange.rowIndex === index ? 'diff-navigation-active' : ''}`} key={index} onContextMenu={(event) => openLineMenu(event, row.left, index, 'old')} title={row.left ? '右键查看该行历史' : undefined}><span className="line-no">{row.left?.old ?? ''}</span><span className="change-sign">{row.left?.kind === 'del' ? '−' : ''}</span>{row.left ? <HighlightedCode code={row.left.code} filePath={activeFileInfo?.path ?? ''}/> : <code/>}</div>)}</div></div>
          <div className="split-diff-pane split-right" aria-label="新版本代码"><div className="split-diff-content">{splitRows.map((row, index) => <div data-diff-row-index={index} className={`split-code-side ${row.right?.kind ?? 'empty'} ${lineMenu?.rowIndex === index && lineMenu.side === 'new' ? 'line-context-active' : ''} ${activeChange?.fileIndex === activeFile && activeChange.rowIndex === index ? 'diff-navigation-active' : ''}`} key={index} onContextMenu={(event) => openLineMenu(event, row.right, index, 'new')} title={row.right ? '右键查看该行历史' : undefined}><span className="line-no">{row.right?.next ?? ''}</span><span className="change-sign">{row.right?.kind === 'add' ? '+' : ''}</span>{row.right ? <HighlightedCode code={row.right.code} filePath={activeFileInfo?.path ?? ''}/> : <code/>}</div>)}</div></div>
        </div>}
      </div>
    </div>
    {lineMenu && activeFileInfo && <ContextMenu x={lineMenu.x} y={lineMenu.y} onClose={() => setLineMenu(null)}><div className="context-menu-title"><FileCode2 size={13}/><span>{activeFileInfo.path}:{lineMenu.line} · {lineMenu.side === 'old' ? '旧版本' : '新版本'}</span></div>{onOpenLineHistory && <button onClick={() => { const row = view === 'unified' ? rowsToRender[lineMenu.rowIndex] : lineMenu.side === 'old' ? splitRows[lineMenu.rowIndex]?.left : splitRows[lineMenu.rowIndex]?.right; if (row) onOpenLineHistory(activeFileInfo.path, lineMenu.line, lineMenu.side, row); setLineMenu(null) }}><History size={14}/><span>查看第 {lineMenu.line} 行历史</span></button>}<button onClick={() => { navigator.clipboard?.writeText(lineMenu.code).catch(() => undefined); setLineMenu(null) }}><Copy size={14}/><span>复制本行内容</span></button></ContextMenu>}
  </section>
}
