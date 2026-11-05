import { Tooltip } from '../../components/tooltip'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GitCommitHorizontal, History, Rows3, X } from 'lucide-react'
import { useAppTranslation } from '../../i18n/useAppTranslation'
import { errorMessage, renderMessage, type MessageContent } from '../../i18n/messages'
import { Button } from '../../components/Button'
import { loadFileBlame, loadFileCommitDiff, loadFileHistory, loadLineHistory, loadRepositoryFileImage, type BlameLine, type FileHistoryEntry } from '../../repository'
import { DiffPanel } from '../diff/DiffPanel'
import { formatLocalDateTime } from '../../dateTime'
import { BLAME_VIRTUALIZATION_THRESHOLD, getBlameVirtualRange } from './blameVirtualization'

type HistoryDrawerProps = {
  repositoryPath?: string
  filePath: string | null
  initialTab?: 'history' | 'blame' | 'line'
  lineNumber?: number
  revision?: string
  onClose: () => void
}

function formatBlameTime(value: string, locale: string) {
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp)) return value
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp * 1000))
}

export function HistoryDrawer({ repositoryPath, filePath, initialTab = 'history', lineNumber, revision, onClose }: HistoryDrawerProps) {
  const { t, i18n } = useAppTranslation()
  const locale = i18n.resolvedLanguage === 'en-US' ? 'en-US' : 'zh-CN'
  const numbers = new Intl.NumberFormat(locale)
  const [tab, setTab] = useState<'history' | 'blame' | 'line'>('history')
  const [history, setHistory] = useState<FileHistoryEntry[]>([])
  const [lineHistory, setLineHistory] = useState<FileHistoryEntry[]>([])
  const [blame, setBlame] = useState<BlameLine[]>([])
  const [loading, setLoading] = useState(false)
  const [historyError, setHistoryError] = useState<MessageContent | null>(null)
  const [blameError, setBlameError] = useState<MessageContent | null>(null)
  const [lineHistoryError, setLineHistoryError] = useState<MessageContent | null>(null)
  const [selectedHash, setSelectedHash] = useState<string | null>(null)
  const [selectedBlame, setSelectedBlame] = useState<BlameLine | null>(null)
  const [activeLineNumber, setActiveLineNumber] = useState<number | undefined>(lineNumber)
  const [blameLineLoading, setBlameLineLoading] = useState(false)
  const [wideDiff, setWideDiff] = useState(false)
  const [blameListWidth, setBlameListWidth] = useState(55)
  const [blameResizing, setBlameResizing] = useState(false)
  const [blameRangeState, setBlameRangeState] = useState({ start: 0, end: 0 })
  const blameListRef = useRef<HTMLDivElement>(null)

  const changeTab = useCallback((nextTab: 'history' | 'blame' | 'line') => {
    setWideDiff(false)
    setTab(nextTab)
  }, [])

  const updateBlameRange = useCallback((list: HTMLDivElement) => {
    if (blame.length <= BLAME_VIRTUALIZATION_THRESHOLD) return
    const next = getBlameVirtualRange(blame.length, list.scrollTop, list.clientHeight)
    setBlameRangeState((current) => current.start === next.start && current.end === next.end ? current : next)
  }, [blame.length])

  useEffect(() => {
    if (tab !== 'blame') return
    const list = blameListRef.current
    if (!list) return
    list.scrollTop = 0
    updateBlameRange(list)
    const observer = new ResizeObserver(() => updateBlameRange(list))
    observer.observe(list)
    return () => observer.disconnect()
  }, [filePath, tab, updateBlameRange])

  const beginBlameResize = (event: React.PointerEvent<HTMLSpanElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = blameListWidth
    const workspace = event.currentTarget.parentElement
    const width = workspace?.clientWidth ?? window.innerWidth
    setBlameResizing(true)
    const onMove = (moveEvent: PointerEvent) => setBlameListWidth(Math.max(30, Math.min(70, startWidth + (moveEvent.clientX - startX) / width * 100)))
    const onUp = () => {
      setBlameResizing(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  useEffect(() => {
    changeTab(initialTab)
    setActiveLineNumber(lineNumber)
    setSelectedBlame(null)
  }, [changeTab, filePath, initialTab, lineNumber])

  useEffect(() => {
    if (!repositoryPath || !filePath) return
    let cancelled = false
    setLoading(true)
    setHistory([])
    setLineHistory([])
    setBlame([])
    setSelectedHash(null)
    setHistoryError(null)
    setBlameError(null)
    setLineHistoryError(null)
    Promise.allSettled([
      loadFileHistory(repositoryPath, filePath),
      loadFileBlame(repositoryPath, filePath, revision),
      lineNumber ? loadLineHistory(repositoryPath, filePath, lineNumber, revision) : Promise.resolve([]),
    ]).then(([historyResult, blameResult, lineHistoryResult]) => {
      if (cancelled) return
      let fileEntries: FileHistoryEntry[] = []
      let lineEntries: FileHistoryEntry[] = []
      if (historyResult.status === 'fulfilled') {
        fileEntries = historyResult.value
        setHistory(fileEntries)
      }
      else setHistoryError(errorMessage(historyResult.reason))
      if (blameResult.status === 'fulfilled') setBlame(blameResult.value)
      else setBlameError(errorMessage(blameResult.reason))
      if (lineHistoryResult.status === 'fulfilled') {
        lineEntries = lineHistoryResult.value
        setLineHistory(lineEntries)
      }
      else setLineHistoryError(errorMessage(lineHistoryResult.reason))
      setSelectedHash((initialTab === 'line' ? lineEntries[0] : fileEntries[0])?.hash ?? fileEntries[0]?.hash ?? null)
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [filePath, initialTab, lineNumber, repositoryPath, revision])

  useEffect(() => {
    if (!repositoryPath || !filePath || !selectedBlame) return
    let cancelled = false
    setBlameLineLoading(true)
    setLineHistory([])
    setLineHistoryError(null)
    loadLineHistory(repositoryPath, filePath, selectedBlame.line, revision)
      .then((entries) => {
        if (cancelled) return
        setLineHistory(entries)
        setSelectedHash(entries.find((entry) => entry.hash === selectedBlame.hash)?.hash ?? entries[0]?.hash ?? null)
      })
      .catch((error) => { if (!cancelled) setLineHistoryError(errorMessage(error)) })
      .finally(() => { if (!cancelled) setBlameLineLoading(false) })
    return () => { cancelled = true }
  }, [filePath, repositoryPath, revision, selectedBlame])

  const activeHistory = tab === 'line' ? lineHistory : history
  const selectedEntry = useMemo(() => activeHistory.find((entry) => entry.hash === selectedHash) ?? activeHistory[0], [activeHistory, selectedHash])
  const selectedBlameEntry = useMemo(() => selectedBlame
    ? lineHistory.find((entry) => entry.hash === selectedBlame.hash) ?? history.find((entry) => entry.hash === selectedBlame.hash) ?? lineHistory[0]
    : undefined, [history, lineHistory, selectedBlame])
  const blameVirtualized = blame.length > BLAME_VIRTUALIZATION_THRESHOLD
  const blameRange = blameVirtualized
    ? blameRangeState
    : { start: 0, end: blame.length }
  const displayedEntry = tab === 'blame' ? selectedBlameEntry : selectedEntry
  const selectedFile = useMemo(() => filePath ? [{ path: filePath, type: 'M', add: 0, del: 0 }] : [], [filePath])
  const loadSelectedDiff = useCallback((path: string, _index: number | undefined, showWhitespace: boolean) => {
    if (!repositoryPath || !displayedEntry) return Promise.resolve([])
    return loadFileCommitDiff(repositoryPath, displayedEntry.hash, path, showWhitespace)
  }, [displayedEntry?.hash, repositoryPath])
  const loadSelectedImage = useCallback((path: string, side: 'old' | 'new') => {
    if (!repositoryPath || !displayedEntry) return Promise.resolve(null)
    if (side === 'old') {
      const parent = displayedEntry.parents[0]
      return parent ? loadRepositoryFileImage(repositoryPath, path, 'commit', parent) : Promise.resolve(null)
    }
    return loadRepositoryFileImage(repositoryPath, path, 'commit', displayedEntry.hash)
  }, [displayedEntry?.hash, displayedEntry?.parents[0], repositoryPath])

  if (!filePath) return null
  const fileName = filePath.split(/[\\/]/).pop() || filePath
  return <div className="drawer-backdrop history-drawer-backdrop" onClick={onClose}><aside className={`history-drawer ${wideDiff ? 'wide-diff' : ''}`} onClick={(event) => event.stopPropagation()}>
    <div className="drawer-heading"><div className="history-drawer-title"><span className="eyebrow">{tab === 'line' ? t('history:drawer.lineHistory', { line: activeLineNumber ?? 0 }) : t('history:drawer.tracking')}</span><Tooltip content={filePath}><h2>{fileName}</h2></Tooltip><Tooltip content={filePath}><span className="history-file-path">{filePath}{tab === 'line' && activeLineNumber ? ` · ${t('history:drawer.line', { line: activeLineNumber })}${revision ? ` · ${revision.slice(0, 12)}` : ''}` : ''}</span></Tooltip></div><Button variant="icon" onClick={onClose} tooltip={t('history:drawer.close')} aria-label={t('history:drawer.close')}><X size={18}/></Button></div>
    <div className="history-tabs"><button className={tab === 'history' ? 'active' : ''} onClick={() => changeTab('history')}><History size={14}/>{t('history:drawer.fileHistory')} <span>{numbers.format(history.length)}</span></button><button className={tab === 'blame' ? 'active' : ''} onClick={() => changeTab('blame')}><Rows3 size={14}/>{t('history:drawer.blame')} <span>{numbers.format(blame.length)}</span></button>{activeLineNumber && <button className={tab === 'line' ? 'active' : ''} onClick={() => changeTab('line')}><GitCommitHorizontal size={14}/>{t('history:drawer.lineHistory', { line: activeLineNumber })} <span>{numbers.format(lineHistory.length)}</span></button>}</div>
    {loading && <div className="history-empty">{t('history:drawer.loading')}</div>}
    {!loading && (tab === 'history' || tab === 'line') && <div className={`file-history-workspace ${wideDiff ? 'wide' : ''}`}>
      <div className="file-history-list">
        {tab === 'line' && blameLineLoading && <div className="history-empty">{t('history:drawer.loadingLineHistory', { line: activeLineNumber ?? 0 })}</div>}
        {!(tab === 'line' && blameLineLoading) && (tab === 'line' ? lineHistoryError : historyError) && <div className="history-empty error">{renderMessage(tab === 'line' ? lineHistoryError : historyError, t)}</div>}
        {!(tab === 'line' && blameLineLoading) && !(tab === 'line' ? lineHistoryError : historyError) && activeHistory.map((entry) => <button className={`file-history-row ${selectedEntry?.hash === entry.hash ? 'active' : ''}`} key={entry.hash} onClick={() => { setSelectedHash(entry.hash); setWideDiff(false) }}><span className="history-node"><GitCommitHorizontal size={12}/></span><div><Tooltip content={entry.title}><strong>{entry.title}</strong></Tooltip><Tooltip content={`${entry.author} · ${formatLocalDateTime(entry.commitTime || entry.time, true, locale)}`}><span>{entry.author} · {formatLocalDateTime(entry.commitTime || entry.time, false, locale)}</span></Tooltip></div><Tooltip content={entry.hash}><code>{entry.shortHash}</code></Tooltip></button>)}
        {!(tab === 'line' && blameLineLoading) && !(tab === 'line' ? lineHistoryError : historyError) && !activeHistory.length && <div className="history-empty">{tab === 'line' ? t('history:drawer.noLineHistory', { line: activeLineNumber ?? 0 }) : t('history:drawer.noHistory')}</div>}
      </div>
      {selectedEntry ? <section className="file-history-detail">
        <div className="file-history-commit"><div><strong>{selectedEntry.title}</strong><code>{selectedEntry.hash}</code></div><dl><div><dt>{t('history:metadata.author')}</dt><dd>{selectedEntry.author} &lt;{selectedEntry.email}&gt;</dd></div><div><dt>{t('history:metadata.committer')}</dt><dd>{selectedEntry.committer} &lt;{selectedEntry.committerEmail}&gt;</dd></div><div><dt>{t('history:metadata.commitTime')}</dt><dd>{formatLocalDateTime(selectedEntry.commitTime || selectedEntry.time, true, locale)}</dd></div><div><dt>{t('history:metadata.parents')}</dt><dd>{selectedEntry.parents.length ? selectedEntry.parents.join(', ') : t('history:metadata.rootCommit')}</dd></div></dl><pre>{selectedEntry.message}</pre></div>
        <div className="file-history-diff"><DiffPanel key={selectedEntry.hash} files={selectedFile} wide={wideDiff} onWideChange={setWideDiff} hideFileList loadRows={loadSelectedDiff} loadImage={loadSelectedImage}/></div>
      </section> : <div className="history-empty">{t('history:drawer.selectCommit')}</div>}
    </div>}
    {!loading && tab === 'blame' && <div className={`blame-workspace ${wideDiff ? 'wide' : ''} ${blameResizing ? 'resizing' : ''}`} style={{ gridTemplateColumns: wideDiff ? undefined : `${blameListWidth}% 7px minmax(360px, 1fr)` }}>
      <div className="blame-list" ref={blameListRef} onScroll={(event) => updateBlameRange(event.currentTarget)}>
        {blameError && <div className="history-empty error">{renderMessage(blameError, t)}</div>}
        {!blameError && blameVirtualized && <div className="blame-virtual-spacer" aria-hidden="true" style={{ height: blameRange.start * 26 }} />}
        {!blameError && blame.slice(blameRange.start, blameRange.end).map((line) => <Tooltip content={t('history:blame.openLineHint', { line: line.line ?? 0 })} key={`${line.hash}-${line.line}`}><button className={`blame-row ${selectedBlame?.line === line.line ? 'selected' : ''}`} onClick={() => { setSelectedBlame(line); setActiveLineNumber(line.line); setWideDiff(false) }}><span className="blame-line-number">{line.line}</span><Tooltip content={line.hash}><code className="blame-hash">{line.shortHash}</code></Tooltip><Tooltip content={line.email}><span className="blame-author">{line.author}</span></Tooltip><time>{formatBlameTime(line.time, locale)}</time><code className="blame-content">{line.content || ' '}</code></button></Tooltip>)}
        {!blameError && blameVirtualized && <div className="blame-virtual-spacer" aria-hidden="true" style={{ height: (blame.length - blameRange.end) * 26 }} />}
        {!blameError && !blame.length && <div className="history-empty">{t('history:blame.empty')}</div>}
      </div>
      <span className="panel-resizer blame-resizer" role="separator" aria-label={t('history:blame.resize')} aria-orientation="vertical" onPointerDown={beginBlameResize}/>
      {selectedBlame ? <section className="file-history-detail blame-detail">
        {blameLineLoading && !selectedBlameEntry ? <div className="history-empty">{t('history:blame.loadingCommit', { line: selectedBlame.line })}</div> : selectedBlameEntry ? <>
          <div className="file-history-commit"><div><strong>{selectedBlameEntry.title}</strong><code>{selectedBlameEntry.hash}</code></div><dl><div><dt>{t('history:metadata.author')}</dt><dd>{selectedBlameEntry.author} &lt;{selectedBlameEntry.email}&gt;</dd></div><div><dt>{t('history:metadata.committer')}</dt><dd>{selectedBlameEntry.committer} &lt;{selectedBlameEntry.committerEmail}&gt;</dd></div><div><dt>{t('history:metadata.commitTime')}</dt><dd>{formatLocalDateTime(selectedBlameEntry.commitTime || selectedBlameEntry.time, true, locale)}</dd></div><div><dt>{t('history:metadata.parents')}</dt><dd>{selectedBlameEntry.parents.length ? selectedBlameEntry.parents.join(', ') : t('history:metadata.rootCommit')}</dd></div></dl><pre>{selectedBlameEntry.message}</pre><button className="line-history-button" disabled={blameLineLoading || !lineHistory.length} onClick={() => { setSelectedHash(lineHistory.find((entry) => entry.hash === selectedBlame.hash)?.hash ?? lineHistory[0]?.hash ?? null); changeTab('line') }}><History size={14}/>{t('history:blame.fullHistory', { line: selectedBlame.line })} <span>{numbers.format(lineHistory.length)}</span></button></div>
          <div className="file-history-diff"><DiffPanel key={selectedBlameEntry.hash} files={selectedFile} wide={wideDiff} onWideChange={setWideDiff} hideFileList loadRows={loadSelectedDiff} loadImage={loadSelectedImage}/></div>
        </> : <div className="history-empty error">{lineHistoryError ? renderMessage(lineHistoryError, t) : t('history:blame.uncommitted')}</div>}
      </section> : <div className="history-empty blame-detail-empty"><Rows3 size={28}/><strong>{t('history:blame.selectLine')}</strong><span>{t('history:blame.selectDescription')}</span></div>}
    </div>}
  </aside></div>
}
