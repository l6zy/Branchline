import { Tooltip } from '../../components/tooltip'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type UIEvent } from 'react'
import { AlignJustify, ArrowDown, ArrowRight, ArrowUp, ChevronDown, ChevronUp, Columns2, Copy, FileCode2, FileText, FolderOpen, History, Image as ImageIcon, List, Maximize2, Minimize2, Minus, Plus, RotateCcw, Undo2, ScanText, Search, X, Pilcrow, WrapText, ZoomIn, ZoomOut } from 'lucide-react'
import { useAppTranslation } from '../../i18n/useAppTranslation'
import { errorMessage, message, renderMessage, type MessageContent } from '../../i18n/messages'
import { ContextMenu } from '../../components/ContextMenu'
import { Button } from '../../components/Button'
import { loadRepositoryFileDiff, type RepositoryDiffLine, type RepositoryFile, type RepositoryImage } from '../../repository'
import { DiffFileList } from './DiffFileList'
import { HighlightedCode } from './HighlightedCode'
import { buildDiffPresentation } from './inlineDiff'
import type { SplitDiffRow } from './diffAlignment'
import { buildDiffContextEntries, diffContextExpansionKey, expandDiffContextOmissionByDirections, type DiffContextEntry } from './diffContext'
import { fittedImageSize, imageDataUrl, isImagePath, isSvgPath } from './imagePreview'
import { isBooleanRecord, usePersistentState } from '../../persistentState'

type SplitDiffEntry = { kind: 'row'; row: SplitDiffRow } | Extract<DiffContextEntry, { kind: 'omitted' }>
export type DiffLineSide = 'old' | 'new'
export type DiffImageSide = 'old' | 'new'
export type DiffImageLoader = (filePath: string, side: DiffImageSide) => Promise<RepositoryImage | null>
type PendingDiffJump = { edge: 'first' | 'last'; direction: -1 | 1; remaining: number }

export function buildStagePatch(filePath: string, rows: RepositoryDiffLine[], fileType?: string, operation: 'stage' | 'restore' | 'unstage' = 'stage', sourceRows?: RepositoryDiffLine[], alignedRows?: readonly SplitDiffRow[]) {
  if (sourceRows) {
    // A large unchanged interval may be omitted by Git. Preserve those gaps
    // as separate hunks rather than concatenating distant file coordinates.
    const segments: RepositoryDiffLine[][] = [[]]
    let previousOld: number | null = null
    let previousNew: number | null = null
    for (const row of sourceRows) {
      if ((row.old != null && previousOld != null && row.old > previousOld + 1)
        || (row.next != null && previousNew != null && row.next > previousNew + 1)) segments.push([])
      segments[segments.length - 1].push(row)
      if (row.old != null) previousOld = row.old
      if (row.next != null) previousNew = row.next
    }
    if (segments.length > 1) {
      const selectedRows = new Set(rows.filter((row) => row.kind !== 'same'))
      const patches: string[] = segments.flatMap((segment) => {
        const selected = segment.filter((row) => selectedRows.has(row))
        const segmentRows = new Set(segment)
        return selected.length ? [buildStagePatch(filePath, selected, undefined, operation, segment, alignedRows?.filter((pair) => (pair.left && segmentRows.has(pair.left)) || (pair.right && segmentRows.has(pair.right))))] : []
      })
      return patches.map((patch, index) => index ? patch.slice(patch.indexOf('\n@@') + 1) : patch).join('')
    }
    const selected = new Set(rows.filter((row) => row.kind !== 'same'))
    const reverse = operation !== 'stage'
    const context = (row: RepositoryDiffLine): RepositoryDiffLine => ({
      ...row, kind: 'same',
      code: reverse ? row.newCode ?? row.code : row.oldCode ?? row.code,
      oldCode: reverse ? row.newCode ?? row.code : row.oldCode ?? row.code,
      newCode: reverse ? row.newCode ?? row.code : row.oldCode ?? row.code,
      oldNoNewline: reverse ? row.newNoNewline : row.oldNoNewline,
      newNoNewline: reverse ? row.newNoNewline : row.oldNoNewline,
    })
    const patchRows: RepositoryDiffLine[] = []
    for (const { left: oldRow, right: newRow } of alignedRows ?? buildDiffPresentation(sourceRows).splitRows) {
      if (oldRow?.kind === 'same') { patchRows.push(context(oldRow)); continue }
      if (oldRow && selected.has(oldRow)) patchRows.push(oldRow)
      else if (oldRow && !reverse) patchRows.push(context(oldRow))
      if (newRow && selected.has(newRow)) patchRows.push(newRow)
      else if (newRow && reverse) patchRows.push(context(newRow))
    }
    let lastOld = -1
    let lastNew = -1
    patchRows.forEach((row, index) => {
      if (row.kind !== 'add') lastOld = index
      if (row.kind !== 'del') lastNew = index
    })
    const normalized = patchRows.flatMap((row, index): RepositoryDiffLine[] => {
      const oldNoNewline = index === lastOld && Boolean(row.oldNoNewline)
      const newNoNewline = index === lastNew && Boolean(row.newNoNewline)
      // A formerly unterminated last line needs a newline when another selected
      // line follows it. Encode that boundary change instead of concatenating.
      if (row.kind === 'same' && oldNoNewline !== newNoNewline) return [
        { ...row, kind: 'del', oldNoNewline, newNoNewline: false },
        { ...row, kind: 'add', oldNoNewline: false, newNoNewline },
      ]
      return [{ ...row, oldNoNewline, newNoNewline }]
    })
    // Rebase both sides onto the actual apply target. Unselected additions or
    // deletions must not leak their original line offsets into a partial patch.
    let oldLine = sourceRows.find((row) => row.old != null)?.old ?? 1
    let newLine = reverse ? sourceRows.find((row) => row.next != null)?.next ?? 1 : oldLine
    if (reverse) oldLine = newLine
    const rebased = normalized.map((row) => ({ ...row, old: row.kind === 'add' ? null : oldLine++, next: row.kind === 'del' ? null : newLine++ }))
    return buildStagePatch(filePath, rebased, fileType, operation)
  }
  const selected = rows.filter((row) => row.kind !== 'same')
  if (!selected.length) return ''
  const oldValues = rows.filter((row) => row.kind === 'del' || row.kind === 'same')
  const newValues = rows.filter((row) => row.kind === 'add' || row.kind === 'same')
  const first = rows[0] ?? selected[0]
  // A zero-length unified-diff range points at the line before the insertion/deletion.
  const oldCount = oldValues.length
  const newCount = newValues.length
  const firstOldLine = rows.find((row) => row.old != null)?.old
  const firstNewLine = rows.find((row) => row.next != null)?.next
  const oldStart = oldCount ? (firstOldLine ?? 1) : Math.max(0, (first.next ?? 1) - 1)
  const newStart = newCount ? (firstNewLine ?? 1) : Math.max(0, (first.old ?? 1) - 1)
  const body = rows.map((row) => {
    const code = row.kind === 'same'
      ? operation === 'stage' ? row.oldCode ?? row.code : row.newCode ?? row.code
      : row.kind === 'del' ? row.oldCode ?? row.code : row.newCode ?? row.code
    const noNewline = row.kind === 'del' ? row.oldNoNewline : row.kind === 'add' ? row.newNoNewline : operation === 'stage' ? row.oldNoNewline : row.newNoNewline
    return `${row.kind === 'add' ? '+' : row.kind === 'del' ? '-' : ' '}${code}${noNewline ? '\n\\ No newline at end of file' : ''}`
  }).join('\n')
  const isNewFile = fileType === 'A' && oldCount === 0
  const isDeletedFile = fileType === 'D' && newCount === 0
  const header = isNewFile
    ? `new file mode 100644\n--- /dev/null\n+++ b/${filePath}`
    : isDeletedFile
      ? `deleted file mode 100644\n--- a/${filePath}\n+++ /dev/null`
      : `--- a/${filePath}\n+++ b/${filePath}`
  return `diff --git a/${filePath} b/${filePath}\n${header}\n@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n${body}\n`
}

export function changeBlock(rows: RepositoryDiffLine[], index: number) {
  if (!rows[index] || rows[index].kind === 'same') return []
  let start = index
  let end = index
  while (start > 0 && rows[start - 1].kind !== 'same') start -= 1
  while (end + 1 < rows.length && rows[end + 1].kind !== 'same') end += 1
  // Keep a small amount of surrounding context so Git can anchor the patch
  // at the exact hunk instead of applying a context-free change elsewhere.
  const context = 3
  let contextStart = start
  let contextEnd = end
  while (contextStart > 0 && start - contextStart < context && rows[contextStart - 1].kind === 'same') contextStart -= 1
  while (contextEnd + 1 < rows.length && contextEnd - end < context && rows[contextEnd + 1].kind === 'same') contextEnd += 1
  return rows.slice(contextStart, contextEnd + 1)
}

export function changeLine(rows: RepositoryDiffLine[], index: number, counterparts?: ReadonlyMap<RepositoryDiffLine, RepositoryDiffLine | undefined>) {
  const changed = rows[index]
  if (!changed || changed.kind === 'same') return []
  let changeStart = index
  let changeEnd = index
  while (changeStart > 0 && rows[changeStart - 1].kind !== 'same') changeStart -= 1
  while (changeEnd + 1 < rows.length && rows[changeEnd + 1].kind !== 'same') changeEnd += 1

  const changedRows = rows.slice(changeStart, changeEnd + 1)
  const counterpart = (counterparts ?? buildDiffPresentation(rows).counterparts).get(changed)
  const selected = new Set([changed, counterpart].filter((row): row is RepositoryDiffLine => Boolean(row)))

  // A multi-line change needs a precise row patch. Add context only when the
  // selected row already represents the complete contiguous change segment.
  if (selected.size !== changedRows.length) return changedRows.filter((row) => selected.has(row))

  const context = 3
  const before: RepositoryDiffLine[] = []
  for (let cursor = changeStart - 1; cursor >= 0 && before.length < context; cursor -= 1) {
    if (rows[cursor].kind !== 'same') break
    before.unshift(rows[cursor])
  }
  const selectedRows = changedRows.filter((row) => selected.has(row))
  const after: RepositoryDiffLine[] = []
  for (let cursor = changeEnd + 1; cursor < rows.length && after.length < context; cursor += 1) {
    if (rows[cursor].kind !== 'same') break
    after.push(rows[cursor])
  }
  return [...before, ...selectedRows, ...after]
}

const DIFF_FONT_SIZE_KEY = 'branchline.diffFontSize.v1'
const DEFAULT_DIFF_FONT_SIZE = 12
const MIN_DIFF_FONT_SIZE = 9
const MAX_DIFF_FONT_SIZE = 22
const MIN_IMAGE_ZOOM = 25
const MAX_IMAGE_ZOOM = 400
const IMAGE_ZOOM_STEP = 25
const IMAGE_CANVAS_PADDING = 28
const DIFF_VIRTUALIZATION_THRESHOLD = 300
const DIFF_VIRTUAL_OVERSCAN = 40
const DIFF_VIRTUAL_RECENTER_ROWS = 32
const DIFF_BLOCK_ACTION_HEIGHT = 40
const EMPTY_FALLBACK_ROWS: Record<string, RepositoryDiffLine[]> = {}
const EMPTY_DIFF_ROWS: RepositoryDiffLine[] = []

export function diffActionEdgeSpace(rowHeight: number, toolbarHeight: number) {
  return Math.max(0, toolbarHeight - rowHeight)
}

export function diffSplitRowHeight(fontSize: number, stageActionsEnabled = true) {
  return Math.max(stageActionsEnabled ? 24 : 20, Math.ceil(fontSize * 1.5 + 6))
}

export function shouldRenderLoadedRows(usesLoader: boolean, loadedIdentity: string | null, activeIdentity: string | null) {
  return !usesLoader || Boolean(activeIdentity && loadedIdentity === activeIdentity)
}

export type DiffOverviewEntry =
  | { kind: 'same' | 'add' | 'del'; height?: number }
  | { oldKind: 'same' | 'add' | 'del'; newKind: 'same' | 'add' | 'del'; height?: number }

export type DiffOverviewMarker = {
  index: number
  top: number
  height: number
  kind: 'add' | 'del'
  column: 'unified' | 'old' | 'new'
}

function overviewSideKind(entry: DiffOverviewEntry, side: 'old' | 'new' | 'unified') {
  if (side === 'unified' && 'kind' in entry) return entry.kind
  if (side === 'old' && 'oldKind' in entry) return entry.oldKind
  if (side === 'new' && 'newKind' in entry) return entry.newKind
  return 'same' as const
}

function overviewMarkersForSide(entries: DiffOverviewEntry[], side: 'old' | 'new' | 'unified'): DiffOverviewMarker[] {
  if (!entries.length) return []
  const markers: DiffOverviewMarker[] = []
  const weights = entries.map((entry) => Number.isFinite(entry.height) && (entry.height ?? 0) > 0 ? entry.height! : 1)
  const totalHeight = weights.reduce((total, height) => total + height, 0)
  let start = -1
  let kind: 'add' | 'del' | null = null
  let startOffset = 0
  let segmentHeight = 0
  let offset = 0
  const flush = () => {
    if (start < 0 || !kind) return
    markers.push({
      index: start,
      top: Number((startOffset / totalHeight * 100).toFixed(1)),
      height: Number((segmentHeight / totalHeight * 100).toFixed(1)),
      kind,
      column: side,
    })
    start = -1
    kind = null
    segmentHeight = 0
  }
  entries.forEach((entry, index) => {
    const nextKind = overviewSideKind(entry, side)
    if (nextKind === 'same') {
      flush()
      offset += weights[index]
      return
    }
    if (start >= 0 && kind !== nextKind) flush()
    if (start < 0) {
      start = index
      kind = nextKind
      startOffset = offset
    }
    segmentHeight += weights[index]
    offset += weights[index]
  })
  flush()
  return markers
}

export function diffOverviewMarkers(entries: DiffOverviewEntry[], view: 'unified' | 'split'): DiffOverviewMarker[] {
  return view === 'unified'
    ? overviewMarkersForSide(entries, 'unified')
    : [...overviewMarkersForSide(entries, 'old'), ...overviewMarkersForSide(entries, 'new')]
}

export function diffOverviewViewport(scrollTop: number, scrollHeight: number, clientHeight: number, headerHeight = 0) {
  const contentHeight = Math.max(0, scrollHeight - headerHeight)
  const viewportHeight = Math.max(0, clientHeight - headerHeight)
  const scrollable = Math.max(0, scrollHeight - clientHeight)
  if (contentHeight <= 0 || viewportHeight >= contentHeight || scrollable <= 0) return { top: 0, height: 100 }
  const height = Math.min(100, viewportHeight / contentHeight * 100)
  const top = Math.max(0, Math.min(100 - height, scrollTop / scrollable * (100 - height)))
  return { top, height }
}

export function diffOverviewThumb(scrollTop: number, scrollHeight: number, clientHeight: number, trackHeight: number, minimumHeight = 28) {
  const track = Math.max(0, trackHeight)
  const scrollable = Math.max(0, scrollHeight - clientHeight)
  if (track <= 0) return { top: 0, height: 0 }
  if (scrollable <= 0) return { top: 0, height: track }
  const proportional = Math.min(1, clientHeight / Math.max(1, scrollHeight))
  const height = Math.min(track, Math.max(minimumHeight, track * proportional))
  const ratio = Math.max(0, Math.min(1, scrollTop / scrollable))
  return { top: (track - height) * ratio, height }
}

export function shouldShowDiffOverviewViewport(scrollHeight: number, clientHeight: number) {
  return scrollHeight > clientHeight
}

export function diffOverviewBounds(viewerTop: number, viewerHeight: number, paneTop: number, paneBorderTop: number, paneClientHeight: number, headerHeight: number) {
  const viewportTop = paneTop - viewerTop + paneBorderTop
  return {
    top: Math.max(0, viewportTop + headerHeight),
    bottom: Math.max(0, viewerHeight - viewportTop - paneClientHeight),
  }
}

export function shouldJumpToFirstChange(scope: 'file' | 'changes', identity: string, previousIdentity: string | null, hasPendingJump = false, canRenderRows = true) {
  return scope === 'file' && !hasPendingJump && canRenderRows && identity !== previousIdentity
}


const isFileMode = (value: unknown): value is 'list' | 'tree' => value === 'list' || value === 'tree'
const isDiffView = (value: unknown): value is 'unified' | 'split' => value === 'unified' || value === 'split'
const isDiffScope = (value: unknown): value is 'file' | 'changes' => value === 'file' || value === 'changes'

function initialDiffFontSize(storageKey: string, defaultSize: number) {
  const stored = Number(window.localStorage.getItem(storageKey))
  return Number.isFinite(stored) && stored >= MIN_DIFF_FONT_SIZE && stored <= MAX_DIFF_FONT_SIZE
    ? stored
    : Math.min(MAX_DIFF_FONT_SIZE, Math.max(MIN_DIFF_FONT_SIZE, defaultSize))
}

function formatImageBytes(bytes: number, locale: string | undefined) {
  if (bytes >= 1024 * 1024) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`
  if (bytes >= 1024) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(bytes / 1024)} KB`
  return `${new Intl.NumberFormat(locale).format(bytes)} B`
}

function entryIndexAtOffset(offsets: readonly number[], top: number) {
  let low = 0
  let high = Math.max(0, offsets.length - 2)
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (offsets[middle] <= top) low = middle
    else high = middle - 1
  }
  return low
}

function buildSplitEntries(entries: DiffContextEntry[], alignedRows: SplitDiffRow[]): SplitDiffEntry[] {
  const result: SplitDiffEntry[] = []
  const positions = new Map<RepositoryDiffLine, number>()
  alignedRows.forEach((pair, index) => {
    if (pair.left) positions.set(pair.left, index)
    if (pair.right) positions.set(pair.right, index)
  })
  let first = Infinity
  let last = -1
  const flush = () => {
    for (let index = first; index <= last; index += 1) result.push({ kind: 'row', row: alignedRows[index] })
    first = Infinity
    last = -1
  }
  entries.forEach((entry) => {
    if (entry.kind === 'omitted') {
      flush()
      result.push(entry)
    } else {
      const position = positions.get(entry.row)
      if (position != null) { first = Math.min(first, position); last = Math.max(last, position) }
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

type DiffImageCardProps = {
  image: RepositoryImage
  alt: string
  label: string
  sizeLabel: string
  zoom: number
}

function DiffImageCard({ image, alt, label, sizeLabel, zoom }: DiffImageCardProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const [canvas, setCanvas] = useState({ width: 0, height: 0 })
  useEffect(() => { setNatural(null) }, [image.data])
  useEffect(() => {
    const node = canvasRef.current
    if (!node) return
    const update = () => setCanvas({ width: node.clientWidth, height: node.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const fitted = natural
    ? fittedImageSize(natural.width, natural.height, canvas.width - IMAGE_CANVAS_PADDING, canvas.height - IMAGE_CANVAS_PADDING, zoom)
    : null
  return <figure className="diff-image-card">
    <figcaption>{label}<span>{sizeLabel}</span></figcaption>
    <div className="diff-image-canvas" ref={canvasRef}>
      <img
        src={imageDataUrl(image)}
        alt={alt}
        draggable={false}
        onLoad={(event) => {
          const node = event.currentTarget
          setNatural({ width: node.naturalWidth || node.width || 300, height: node.naturalHeight || node.height || 200 })
        }}
        style={fitted ? { width: fitted.width, height: fitted.height, maxWidth: 'none', maxHeight: 'none' } : undefined}
      />
    </div>
  </figure>
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
  fileContentOnly?: boolean
  loadRows?: (filePath: string, fileIndex: number | undefined, showWhitespace: boolean) => Promise<RepositoryDiffLine[]>
  loadImage?: DiffImageLoader
  viewKey?: string
  reloadKey?: string
  fallbackRows?: Record<string, RepositoryDiffLine[]>
  fallbackChangeRows?: RepositoryDiffLine[]
  onOpenLineHistory?: (filePath: string, line: number, side: DiffLineSide, row: RepositoryDiffLine) => void
  onStagePatch?: (filePath: string, patch: string, description: MessageContent) => void
  onRestorePatch?: (filePath: string, patch: string, description: MessageContent) => void
  onUnstagePatch?: (filePath: string, patch: string, description: MessageContent) => void
  actionScope?: 'staged' | 'unstaged'
  actionsBusy?: boolean
  allowStage?: boolean
  defaultFontSize?: number
  fontSizeStorageKey?: string
}

export function DiffPanel({ files, repositoryPath, wide, onWideChange, initialFile = 0, onActiveFileChange, onClose, hideFileList = false, fileContentOnly = false, loadRows, loadImage, viewKey = '', reloadKey = '', fallbackRows = EMPTY_FALLBACK_ROWS, fallbackChangeRows = EMPTY_DIFF_ROWS, onOpenLineHistory, onStagePatch, onRestorePatch, onUnstagePatch, actionScope, actionsBusy = false, allowStage = false, defaultFontSize = DEFAULT_DIFF_FONT_SIZE, fontSizeStorageKey = DIFF_FONT_SIZE_KEY }: DiffPanelProps) {
  const { t, i18n } = useAppTranslation()
  const numbers = new Intl.NumberFormat(i18n.resolvedLanguage)
  const [activeFile, setActiveFile] = useState(initialFile)
  const [view, setView] = usePersistentState('branchline.diffView.v1', 'unified', isDiffView)
  const [showWhitespace, setShowWhitespace] = usePersistentState('branchline.diffShowWhitespace.v1', true, (value): value is boolean => typeof value === 'boolean')
  const [wrap, setWrap] = usePersistentState('branchline.diffWrap.v1', false, (value): value is boolean => typeof value === 'boolean')
  const [scope, setScope] = usePersistentState('branchline.diffScope.v1', 'changes', isDiffScope)
  const activeScope = fileContentOnly ? 'file' : scope
  const [contextLineCount, setContextLineCount] = useState(3)
  const [expandedContext, setExpandedContext] = useState<Record<string, number>>({})
  const [fileMode, setFileMode] = usePersistentState('branchline.diffFileMode.v1', 'list', isFileMode)
  const [collapsedFolders, setCollapsedFolders] = usePersistentState('branchline.diffCollapsedFolders.v1', {}, isBooleanRecord)
  const [repositoryRows, setRepositoryRows] = useState<RepositoryDiffLine[]>([])
  const [loadedFileIdentity, setLoadedFileIdentity] = useState<string | null>(null)
  const [loadedRowsKey, setLoadedRowsKey] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState<MessageContent | null>(null)
  const [imageMode, setImageMode] = useState<'preview' | 'source'>('preview')
  const [imageZoom, setImageZoom] = useState(100)
  const [imageSides, setImageSides] = useState<{ old: RepositoryImage | null; new: RepositoryImage | null } | null>(null)
  const [imageLoading, setImageLoading] = useState(false)
  const [imageError, setImageError] = useState<MessageContent | null>(null)
  const [diffFontSize, setDiffFontSize] = useState(() => initialDiffFontSize(fontSizeStorageKey, defaultFontSize))
  const [lineMenu, setLineMenu] = useState<{ rowIndex: number; sourceIndex: number; side: DiffLineSide; line: number; code: string; x: number; y: number } | null>(null)
  const [activeChange, setActiveChange] = useState<{ fileIndex: number; rowIndex: number } | null>(null)
  const [pendingJump, setPendingJump] = useState<PendingDiffJump | null>(null)
  const autoJumpIdentity = useRef<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchIndex, setSearchIndex] = useState(0)
  const [virtualScrollTop, setVirtualScrollTop] = useState(0)
  const [overviewCanScroll, setOverviewCanScroll] = useState(false)
  const [overviewBounds, setOverviewBounds] = useState({ top: 0, bottom: 0 })
  const searchInputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const codeDiffRef = useRef<HTMLDivElement>(null)
  const pointerInside = useRef(false)
  const rowsCache = useRef(new Map<string, RepositoryDiffLine[]>())
  const splitScrollerRef = useRef<HTMLDivElement | null>(null)
  const overviewRef = useRef<HTMLDivElement>(null)
  const overviewViewportRef = useRef<HTMLSpanElement>(null)
  const overviewDragging = useRef(false)
  const overviewDragOffset = useRef<number | null>(null)
  const virtualScrollFrame = useRef(0)
  const virtualScrollPending = useRef(false)
  const overviewFrame = useRef(0)
  const overviewPending = useRef(false)
  const pendingVirtualScrollTop = useRef(0)
  const virtualScrollTopRef = useRef(0)
  useEffect(() => {
    setActiveFile(initialFile)
    setActiveChange(null)
    setPendingJump(null)
    setImageMode('preview')
  }, [initialFile])
  useEffect(() => {
    rowsCache.current.clear()
  }, [loadRows, repositoryPath])
  useEffect(() => {
    const file = files[activeFile]
    const loader = loadRows ?? (repositoryPath ? (path: string, _index: number | undefined, whitespace: boolean) => loadRepositoryFileDiff(repositoryPath, path, whitespace) : null)
    if (!file || !loader) {
      setRepositoryRows([])
      setLoadedFileIdentity(null)
      setDiffError(null)
      setDiffLoading(false)
      return
    }
    const fileIdentity = `${viewKey}\0${activeFile}\0${file.path}`
    const cacheKey = `${fileIdentity}\0${reloadKey}\0${showWhitespace}`
    const cachedRows = rowsCache.current.get(cacheKey)
    if (cachedRows) {
      setRepositoryRows(cachedRows)
      setLoadedFileIdentity(fileIdentity)
      setLoadedRowsKey(cacheKey)
      setDiffError(null)
      setDiffLoading(false)
      return
    }
    let cancelled = false
    setDiffLoading(true)
    setDiffError(null)
    loader(file.path, activeFile, showWhitespace)
      .then((rows) => { if (!cancelled) { rowsCache.current.set(cacheKey, rows); setRepositoryRows(rows); setLoadedFileIdentity(fileIdentity); setLoadedRowsKey(cacheKey) } })
      .catch((error) => { if (!cancelled) setDiffError(errorMessage(error)) })
      .finally(() => { if (!cancelled) setDiffLoading(false) })
    return () => { cancelled = true }
  }, [activeFile, files, loadRows, reloadKey, repositoryPath, showWhitespace, viewKey])
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
  const activeFileIdentity = activeFileInfo ? `${viewKey}\0${activeFile}\0${activeFileInfo.path}` : null
  const activeIsImage = isImagePath(activeFileInfo?.path)
  const activeIsSvg = isSvgPath(activeFileInfo?.path)
  const imagePreviewAvailable = Boolean(activeIsImage && loadImage)
  const showImagePreview = imagePreviewAvailable && imageMode === 'preview'
  useEffect(() => {
    setImageMode('preview')
  }, [activeFileInfo?.path])
  useEffect(() => {
    if (!activeFileInfo || !activeIsImage || !loadImage || imageMode !== 'preview') {
      setImageSides(null)
      setImageError(null)
      setImageLoading(false)
      return
    }
    const path = activeFileInfo.path
    let cancelled = false
    setImageSides(null)
    setImageError(null)
    setImageLoading(true)
    const oldImage = fileContentOnly ? Promise.resolve(null) : loadImage(path, 'old')
    Promise.all([oldImage, loadImage(path, 'new')])
      .then(([old, next]) => { if (!cancelled) setImageSides({ old, new: next }) })
      .catch((error) => { if (!cancelled) setImageError(errorMessage(error)) })
      .finally(() => { if (!cancelled) setImageLoading(false) })
    return () => { cancelled = true }
  }, [activeFileInfo?.path, activeIsImage, fileContentOnly, imageMode, loadImage, reloadKey, viewKey])
  const usesLoader = Boolean(loadRows || repositoryPath)
  const sourceRows = usesLoader ? repositoryRows : (activeFileInfo ? (fallbackRows[activeFileInfo.path] ?? fallbackChangeRows) : EMPTY_DIFF_ROWS)
  const canStage = actionScope !== 'staged' && (allowStage || actionScope === 'unstaged')
  const canUnstage = actionScope === 'staged' && Boolean(onUnstagePatch)
  const stageActionsEnabled = canUnstage || (canStage && Boolean(onStagePatch || onRestorePatch))
  const expectedRowsKey = [activeFileIdentity, reloadKey, showWhitespace].join('\0')
  const actionsDisabled = actionsBusy || diffLoading || (usesLoader && loadedRowsKey !== expectedRowsKey)
  const sourceIndexMap = useMemo(() => new Map(sourceRows.map((row, index) => [row, index] as const)), [sourceRows])
  const diffPresentation = useMemo(() => buildDiffPresentation(sourceRows, showWhitespace), [sourceRows, showWhitespace])
  const { inlineRanges: inlineDiffRanges, splitRows: sourceSplitRows, counterparts } = diffPresentation
  const lineNumberDigits = useMemo(() => sourceRows.reduce((digits, row) => Math.max(digits, String(Math.max(row.old ?? 0, row.next ?? 0)).length), 1), [sourceRows])
  const contextEntries = useMemo(() => buildDiffContextEntries(sourceRows, contextLineCount), [sourceRows, contextLineCount])
  const expandedContextEntries = useMemo(() => {
    return contextEntries.flatMap((entry) => {
      if (entry.kind !== 'omitted') return [entry]
      const keyed = { ...entry, gapKey: `${entry.sourceStart}:${entry.sourceEnd}` }
      const startSteps = expandedContext[diffContextExpansionKey(activeFileIdentity, contextLineCount, keyed, 'start')] ?? 0
      const endSteps = expandedContext[diffContextExpansionKey(activeFileIdentity, contextLineCount, keyed, 'end')] ?? 0
      return startSteps || endSteps ? expandDiffContextOmissionByDirections(sourceRows, keyed, startSteps, endSteps) : [keyed]
    })
  }, [activeFileIdentity, contextEntries, contextLineCount, expandedContext, sourceRows])
  const unifiedEntries = useMemo<DiffContextEntry[]>(() => activeScope === 'file'
    ? sourceRows.map((row, sourceIndex) => ({ kind: 'line', row, sourceIndex }))
    : expandedContextEntries, [activeScope, expandedContextEntries, sourceRows])
  const splitEntries = useMemo<SplitDiffEntry[]>(() => activeScope === 'file'
    ? sourceSplitRows.map((row) => ({ kind: 'row', row }))
    : buildSplitEntries(expandedContextEntries, sourceSplitRows), [activeScope, expandedContextEntries, sourceSplitRows])
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
  const virtualized = !wrap && visibleEntryCount > DIFF_VIRTUALIZATION_THRESHOLD
  const virtualRowHeight = view === 'split'
    ? diffSplitRowHeight(diffFontSize, stageActionsEnabled)
    : Math.max(stageActionsEnabled ? 24 : 20, Math.ceil(diffFontSize * 1.5 + 6))
  const blockActionCount = Number(canStage && Boolean(onStagePatch)) + Number(canStage && Boolean(onRestorePatch)) + Number(canUnstage)
  const actionEdgeSpace = blockActionCount ? diffActionEdgeSpace(virtualRowHeight, DIFF_BLOCK_ACTION_HEIGHT) : 0
  const entryMetrics = useMemo(() => {
    const entries = view === 'unified' ? unifiedEntries : splitEntries
    const heights = entries.map((entry, index) => entry.kind === 'omitted' && index > 0 && index + 1 < entries.length
      ? virtualRowHeight * 2
      : virtualRowHeight)
    const offsets = [0]
    heights.forEach((height) => offsets.push(offsets[offsets.length - 1] + height))
    return { heights, offsets, total: offsets[offsets.length - 1] ?? 0 }
  }, [splitEntries, unifiedEntries, view, virtualRowHeight])
  // Anchor each action stack at the visual center of its whole change block.
  // The stack is positioned outside row flow, so larger buttons never stretch code.
  const blockActionAnchors = useMemo(() => {
    const entries = view === 'unified' ? unifiedEntries : splitEntries
    const changed = entries.map((entry) => entry.kind === 'line'
      ? entry.row.kind !== 'same'
      : entry.kind === 'row' && Boolean((entry.row.left && entry.row.left.kind !== 'same') || (entry.row.right && entry.row.right.kind !== 'same')))
    const anchors = new Map<number, { center: number; toolbarCenter: number; height: number }>()
    const toolbarHalfHeight = blockActionCount * 20 / 2
    const offsets = entryMetrics.offsets
    for (let start = 0; start < changed.length; start++) {
      if (!changed[start]) continue
      let end = start
      while (end + 1 < changed.length && changed[end + 1]) end++
      const anchor = Math.floor((start + end) / 2)
      const center = (offsets[start] + offsets[end + 1]) / 2
      // Small blocks keep both actions visible. Clamp only at file edges, so
      // their toolbar never starts above the first row or grows the scroll area.
      const toolbarCenter = Math.max(toolbarHalfHeight, Math.min(center, offsets[entries.length] + actionEdgeSpace - toolbarHalfHeight))
      anchors.set(anchor, { center: center - offsets[anchor], toolbarCenter: toolbarCenter - offsets[anchor], height: offsets[end + 1] - offsets[start] })
      start = end
    }
    return anchors
  }, [unifiedEntries, splitEntries, view, virtualRowHeight, virtualized, blockActionCount, actionEdgeSpace, entryMetrics])
  const canRenderLoadedRows = shouldRenderLoadedRows(usesLoader, loadedFileIdentity, activeFileIdentity)
  const virtualStart = virtualized ? Math.max(0, entryIndexAtOffset(entryMetrics.offsets, virtualScrollTop) - DIFF_VIRTUAL_OVERSCAN) : 0
  const virtualEnd = virtualized ? Math.min(visibleEntryCount, virtualStart + DIFF_VIRTUAL_OVERSCAN * 2 + 80) : visibleEntryCount
  const virtualTopHeight = virtualized ? entryMetrics.offsets[virtualStart] : 0
  const virtualBottomHeight = Math.max(0, entryMetrics.total - (entryMetrics.offsets[virtualEnd] ?? entryMetrics.total)) + actionEdgeSpace
  const splitTotalHeight = entryMetrics.total + actionEdgeSpace
  const overviewEntries = useMemo<DiffOverviewEntry[]>(() => {
    if (view === 'unified') {
      return [...(activeScope === 'changes' && !usesLoader ? [{ kind: 'same' as const, height: 24 }] : []), ...unifiedEntries.map((entry, index) => ({ kind: entry.kind === 'line' ? entry.row.kind : 'same' as const, height: entryMetrics.heights[index] ?? virtualRowHeight })), ...(actionEdgeSpace ? [{ kind: 'same' as const, height: actionEdgeSpace }] : [])]
    }
    const entries: DiffOverviewEntry[] = splitEntries.map((entry, index) => entry.kind === 'row'
      ? { oldKind: entry.row.left?.kind ?? 'same', newKind: entry.row.right?.kind ?? 'same', height: entryMetrics.heights[index] ?? virtualRowHeight }
      : { oldKind: 'same', newKind: 'same', height: entryMetrics.heights[index] ?? virtualRowHeight })
    if (actionEdgeSpace) entries.push({ oldKind: 'same', newKind: 'same', height: actionEdgeSpace })
    return entries
  }, [activeScope, splitEntries, unifiedEntries, usesLoader, view, virtualRowHeight, virtualized, actionEdgeSpace, entryMetrics])
  const overviewMarkers = useMemo(() => diffOverviewMarkers(overviewEntries, view), [overviewEntries, view])
  const searchMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return []
    if (view === 'unified') return unifiedEntries.flatMap((entry, index) => entry.kind === 'line' && entry.row.code.toLowerCase().includes(query) ? [index] : [])
    return splitEntries.flatMap((entry, index) => {
      if (entry.kind !== 'row') return []
      return entry.row.left?.code.toLowerCase().includes(query) || entry.row.right?.code.toLowerCase().includes(query) ? [index] : []
    })
  }, [searchQuery, splitEntries, unifiedEntries, view])
  const searchMatchSet = useMemo(() => new Set(searchMatches), [searchMatches])
  useEffect(() => {
    setSearchIndex((current) => searchMatches.length ? Math.min(current, searchMatches.length - 1) : 0)
  }, [searchMatches.length])
  useEffect(() => {
    setLineMenu(null)
    setActiveChange(null)
    setPendingJump(null)
    virtualScrollTopRef.current = 0
    setVirtualScrollTop(0)
    setImageZoom(100)
    requestAnimationFrame(() => {
      if (codeDiffRef.current) codeDiffRef.current.scrollTop = 0
      const scroller = splitScrollerRef.current
      if (scroller) {
        scroller.scrollTop = 0
        scroller.style.setProperty('--split-scroll-top', '0px')
      }
    })
  }, [activeScope, view, contextLineCount, showImagePreview])
  useEffect(() => {
    virtualScrollTopRef.current = 0
    setVirtualScrollTop(0)
    setImageMode('preview')
    setImageZoom(100)
    requestAnimationFrame(() => {
      if (codeDiffRef.current) codeDiffRef.current.scrollTop = 0
      const scroller = splitScrollerRef.current
      if (scroller) {
        scroller.scrollTop = 0
        scroller.style.setProperty('--split-scroll-top', '0px')
      }
    })
  }, [activeFile])
  useEffect(() => {
    const top = view === 'split'
      ? splitScrollerRef.current?.scrollTop ?? 0
      : codeDiffRef.current?.scrollTop ?? 0
    if (view === 'split') splitScrollerRef.current?.style.setProperty('--split-scroll-top', `${top}px`)
    virtualScrollTopRef.current = top
    setVirtualScrollTop(top)
  }, [view, wrap])
  useEffect(() => {
    if (view !== 'split') return
    const scroller = splitScrollerRef.current
    if (!scroller) return
    const frame = requestAnimationFrame(() => {
      const top = scroller.scrollTop
      scroller.style.setProperty('--split-scroll-top', `${top}px`)
      if (virtualized) {
        virtualScrollTopRef.current = top
        setVirtualScrollTop(top)
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [view, splitTotalHeight, activeFileIdentity, reloadKey, virtualized])
  useEffect(() => {
    if (view !== 'split') return
    const scroller = splitScrollerRef.current
    if (!scroller) return
    const pane = scroller.querySelector<HTMLElement>('.split-diff-pane')
    const update = () => {
      scroller.style.setProperty('--split-content-height', `${pane?.clientHeight ?? scroller.clientHeight}px`)
      scroller.style.setProperty('--split-scroll-top', `${scroller.scrollTop}px`)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(scroller)
    if (pane) observer.observe(pane)
    return () => observer.disconnect()
  }, [view, canRenderLoadedRows, diffError, showImagePreview, wrap])
  useEffect(() => () => {
    if (virtualScrollFrame.current) cancelAnimationFrame(virtualScrollFrame.current)
    if (overviewFrame.current) cancelAnimationFrame(overviewFrame.current)
  }, [])
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
    setImageMode('preview')
    onActiveFileChange?.(index)
  }, [onActiveFileChange])
  const selectFile = useCallback((index: number) => {
    setPendingJump(null)
    setActiveChange(null)
    activateFile(index)
  }, [activateFile])
  const setSplitScroller = useCallback((node: HTMLDivElement | null) => {
    splitScrollerRef.current = node
    if (!node) return
    node.style.setProperty('--split-scroll-top', `${node.scrollTop}px`)
    const pane = node.querySelector<HTMLElement>('.split-diff-pane')
    node.style.setProperty('--split-content-height', `${pane?.clientHeight ?? node.clientHeight}px`)
  }, [])
  const openLineMenu = (event: MouseEvent, row: RepositoryDiffLine | undefined, rowIndex: number, side: DiffLineSide, sourceIndex: number) => {
    const line = side === 'old' ? row?.old : row?.next
    if (!row || !line) return
    event.preventDefault()
    setLineMenu({ rowIndex, sourceIndex, side, line, code: row.code, x: event.clientX, y: event.clientY })
  }
  // A wheel or drag produces several scroll events per frame. Only recenter the
  // virtual window after the viewport has moved far enough to approach the
  // rendered buffer edge; everything in between is native browser scrolling.
  const queueVirtualScrollTop = (top: number) => {
    if (!virtualized) return
    pendingVirtualScrollTop.current = top
    if (virtualScrollPending.current) return
    virtualScrollPending.current = true
    virtualScrollFrame.current = requestAnimationFrame(() => {
      virtualScrollPending.current = false
      virtualScrollFrame.current = 0
      const currentRow = Math.floor(virtualScrollTopRef.current / virtualRowHeight)
      const nextRow = Math.floor(pendingVirtualScrollTop.current / virtualRowHeight)
      if (Math.abs(nextRow - currentRow) < DIFF_VIRTUAL_RECENTER_ROWS) return
      virtualScrollTopRef.current = pendingVirtualScrollTop.current
      setVirtualScrollTop(pendingVirtualScrollTop.current)
    })
  }
  const applySplitScrollTop = (top: number, forceRecenter = false) => {
    const scroller = splitScrollerRef.current
    if (!scroller) return
    const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    const next = Math.max(0, Math.min(max, top))
    scroller.scrollTop = next
    scroller.style.setProperty('--split-scroll-top', `${next}px`)
    if (virtualized) {
      if (forceRecenter) {
        virtualScrollTopRef.current = next
        setVirtualScrollTop(next)
      } else {
        queueVirtualScrollTop(next)
      }
    }
    queueOverviewViewport()
  }
  const handleSplitScroll = (event: UIEvent<HTMLDivElement>) => {
    const scroller = event.currentTarget
    scroller.style.setProperty('--split-scroll-top', `${scroller.scrollTop}px`)
    queueOverviewViewport()
    queueVirtualScrollTop(scroller.scrollTop)
  }
  // The overview sits beside the right pane, whose horizontal scrollbar may differ from the left.
  const activeScrollPane = () => view === 'unified' ? codeDiffRef.current : splitScrollerRef.current
  const updateOverviewViewport = () => {
    const node = overviewViewportRef.current
    const track = node?.parentElement
    if (!node || !track) return
    const pane = activeScrollPane()
    if (!pane) return
    const thumb = diffOverviewThumb(pane.scrollTop, pane.scrollHeight, pane.clientHeight, track.clientHeight)
    node.style.top = `${thumb.top}px`
    node.style.height = `${thumb.height}px`
    const maxTop = Math.max(0, track.clientHeight - thumb.height)
    track.setAttribute('aria-valuenow', String(maxTop > 0 ? Math.round(thumb.top / maxTop * 100) : 0))
  }
  const queueOverviewViewport = () => {
    if (!overviewViewportRef.current || overviewPending.current) return
    overviewPending.current = true
    overviewFrame.current = requestAnimationFrame(() => {
      overviewPending.current = false
      overviewFrame.current = 0
      updateOverviewViewport()
    })
  }
  const updateOverviewMetrics = () => {
    const pane = activeScrollPane()
    const viewer = overviewRef.current
    if (!pane || !viewer) return
    const bounds = diffOverviewBounds(
      viewer.getBoundingClientRect().top, viewer.clientHeight,
      pane.getBoundingClientRect().top, pane.clientTop, pane.clientHeight,
      0,
    )
    setOverviewBounds((previous) => previous.top === bounds.top && previous.bottom === bounds.bottom ? previous : bounds)
    const canScroll = shouldShowDiffOverviewViewport(pane.scrollHeight, pane.clientHeight)
    setOverviewCanScroll((previous) => previous === canScroll ? previous : canScroll)
    updateOverviewViewport()
  }
  const applyOverviewScrollTarget = (target: number) => {
    const pane = activeScrollPane()
    if (!pane) return
    if (view === 'unified') {
      pane.scrollTop = target
      handleCodeDiffScroll({ currentTarget: pane } as UIEvent<HTMLDivElement>)
    } else {
      applySplitScrollTop(target)
    }
    updateOverviewViewport()
  }
  const scrollOverviewTo = (clientY: number, element: HTMLDivElement) => {
    const pane = activeScrollPane()
    if (!pane) return
    const bounds = element.getBoundingClientRect()
    const percent = Math.max(0, Math.min(1, (clientY - bounds.top) / Math.max(1, bounds.height)))
    applyOverviewScrollTarget(Math.max(0, pane.scrollHeight - pane.clientHeight) * percent)
  }
  const scrollOverviewThumbTo = (clientY: number, element: HTMLDivElement) => {
    const pane = activeScrollPane()
    const thumb = overviewViewportRef.current
    if (!pane || !thumb) return
    const bounds = element.getBoundingClientRect()
    const maxThumbTop = Math.max(0, bounds.height - thumb.getBoundingClientRect().height)
    if (!maxThumbTop) return
    const desired = Math.max(0, Math.min(maxThumbTop, clientY - bounds.top - (overviewDragOffset.current ?? 0)))
    applyOverviewScrollTarget(Math.max(0, pane.scrollHeight - pane.clientHeight) * desired / maxThumbTop)
  }
  const beginOverviewDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    overviewDragging.current = true
    const thumb = event.target instanceof Element ? event.target.closest('.diff-overview-viewport') : null
    overviewDragOffset.current = thumb ? event.clientY - thumb.getBoundingClientRect().top : null
    if (!thumb) scrollOverviewTo(event.clientY, event.currentTarget)
  }
  const moveOverviewDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!overviewDragging.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    if (overviewDragOffset.current === null) scrollOverviewTo(event.clientY, event.currentTarget)
    else scrollOverviewThumbTo(event.clientY, event.currentTarget)
  }
  const endOverviewDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    overviewDragging.current = false
    overviewDragOffset.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const handleOverviewKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const pane = activeScrollPane()
    if (!pane) return
    const max = Math.max(0, pane.scrollHeight - pane.clientHeight)
    let target: number
    if (event.key === 'ArrowUp') target = pane.scrollTop - virtualRowHeight * 3
    else if (event.key === 'ArrowDown') target = pane.scrollTop + virtualRowHeight * 3
    else if (event.key === 'PageUp') target = pane.scrollTop - pane.clientHeight * 0.9
    else if (event.key === 'PageDown') target = pane.scrollTop + pane.clientHeight * 0.9
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = max
    else return
    event.preventDefault()
    applyOverviewScrollTarget(Math.max(0, Math.min(max, target)))
  }
  useEffect(() => {
    const viewer = overviewRef.current
    if (!viewer) return
    updateOverviewMetrics()
    const observer = new ResizeObserver(updateOverviewMetrics)
    observer.observe(viewer)
    const pane = activeScrollPane()
    if (pane) {
      observer.observe(pane)
      // Virtualization and font changes can add/remove horizontal overflow without resizing the viewer.
      for (const child of Array.from(pane.children)) observer.observe(child)
    }
    return () => observer.disconnect()
  }, [activeFile, diffLoading, diffError, visibleEntryCount, view, virtualized, diffFontSize, activeScope, showWhitespace, canRenderLoadedRows, overviewCanScroll, showImagePreview, wrap])
  const handleCodeDiffScroll = (event: UIEvent<HTMLDivElement>) => {
    queueVirtualScrollTop(event.currentTarget.scrollTop)
    queueOverviewViewport()
  }
  const scrollToVirtualEntry = (rowIndex: number) => {
    const offset = entryMetrics.offsets[rowIndex] ?? rowIndex * virtualRowHeight
    if (view === 'split') {
      const top = Math.max(0, offset - (splitScrollerRef.current?.clientHeight ?? 400) / 2)
      applySplitScrollTop(top, true)
      return
    }
    const container = codeDiffRef.current
    if (!container) return
    container.scrollTop = Math.max(0, offset - container.clientHeight / 2)
    virtualScrollTopRef.current = container.scrollTop
    setVirtualScrollTop(container.scrollTop)
    queueOverviewViewport()
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
    if (!pendingJump || diffLoading || !activeFileInfo || !activeFileIdentity) return
    if (!canRenderLoadedRows) return
    if (changeIndices.length) {
      autoJumpIdentity.current = activeFileIdentity
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
  }, [activateFile, activeFile, activeFileIdentity, activeFileInfo, canRenderLoadedRows, changeIndices, diffLoading, files.length, pendingJump])
  useEffect(() => {
    if (activeScope !== 'file') {
      autoJumpIdentity.current = null
      return
    }
    if (diffLoading || !activeFileInfo || !activeFileIdentity || !changeIndices.length) return
    const identity = activeFileIdentity
    if (!shouldJumpToFirstChange(activeScope, identity, autoJumpIdentity.current, Boolean(pendingJump), canRenderLoadedRows)) return
    autoJumpIdentity.current = identity
    scrollToChange(changeIndices[0])
  }, [activeFileIdentity, activeFileInfo, canRenderLoadedRows, changeIndices, diffLoading, pendingJump, activeScope])
  const diffStyle = { '--diff-font-size': `${t('diff:font.size', { size: numbers.format(diffFontSize) })}`, '--diff-row-height': `${virtualRowHeight}px`, '--diff-line-number-width': `${Math.max(2, lineNumberDigits + 1.8)}ch` } as CSSProperties
  const applyPatch = (operation: 'stage' | 'restore' | 'unstage', rows: RepositoryDiffLine[], description: MessageContent) => {
    if (actionsDisabled || !activeFileInfo) return
    const callback = operation === 'stage' ? onStagePatch : operation === 'restore' ? onRestorePatch : onUnstagePatch
    callback?.(activeFileInfo.path, buildStagePatch(activeFileInfo.path, rows, activeFileInfo.type, operation, sourceRows, sourceSplitRows), description)
  }
  const expandOmission = (entry: Extract<DiffContextEntry, { kind: 'omitted' }>, direction: 'start' | 'end', anchorSourceIndex?: number) => {
    const key = diffContextExpansionKey(activeFileIdentity, contextLineCount, entry, direction)
    const scroller = view === 'split' ? splitScrollerRef.current : codeDiffRef.current
    const anchor = anchorSourceIndex !== undefined && anchorSourceIndex >= 0
      ? panelRef.current?.querySelector<HTMLElement>(`[data-diff-source-index="${anchorSourceIndex}"]`)
      : null
    const anchorRect = anchor?.getBoundingClientRect()
    const scrollerRect = scroller?.getBoundingClientRect()
    const anchorTop = anchorRect && scrollerRect && anchorRect.bottom > scrollerRect.top && anchorRect.top < scrollerRect.bottom
      ? anchorRect.top
      : null
    setExpandedContext((previous) => ({ ...previous, [key]: (previous[key] ?? 0) + 1 }))
    if (anchorTop === null || anchorSourceIndex === undefined || anchorSourceIndex < 0) return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const currentScroller = view === 'split' ? splitScrollerRef.current : codeDiffRef.current
        const currentAnchor = panelRef.current?.querySelector<HTMLElement>(`[data-diff-source-index="${anchorSourceIndex}"]`)
        if (!currentScroller || !currentAnchor) return
        const delta = currentAnchor.getBoundingClientRect().top - anchorTop
        if (Math.abs(delta) < 0.5) return
        currentScroller.scrollTop += delta
        if (view === 'split') currentScroller.style.setProperty('--split-scroll-top', `${currentScroller.scrollTop}px`)
      })
    })
  }
  const renderStageActions = (block: RepositoryDiffLine[], anchor: { center: number; toolbarCenter: number; height: number } | undefined, layout: 'unified' | 'split' = 'unified') => {
    return <span className={'diff-stage-slot ' + (layout === 'split' ? 'split' : '')}>
      {anchor && <>
        <span className="diff-block-range" aria-hidden="true" style={{ top: anchor.center - anchor.height / 2, height: anchor.height }}/>
        <span className="diff-block-actions" role="toolbar" aria-label={t('diff:actions.block')} aria-orientation="vertical" style={{ top: anchor.toolbarCenter }}>
          {canStage && onRestorePatch && <Tooltip content={t('diff:actions.restoreBlock')} disabledAnchorClassName="diff-block-action-anchor" disabledAnchorStyle={{ width: 24, height: 20, flexShrink: 0 }}><button type="button" disabled={actionsDisabled} className="diff-restore-action" onClick={(event) => { event.stopPropagation(); applyPatch('restore', block, message('diff:scope.block')) }} aria-label={t('diff:actions.restoreBlock')}>{layout === 'split' ? <ArrowRight size={16}/> : <Undo2 size={16}/>}</button></Tooltip>}
          {canStage && onStagePatch && <Tooltip content={t('diff:actions.stageBlock')} disabledAnchorClassName="diff-block-action-anchor" disabledAnchorStyle={{ width: 24, height: 20, flexShrink: 0 }}><button type="button" disabled={actionsDisabled} className="diff-stage-action" onClick={(event) => { event.stopPropagation(); applyPatch('stage', block, message('diff:scope.block')) }} aria-label={t('diff:actions.stageBlock')}><Plus size={16}/></button></Tooltip>}
          {canUnstage && <Tooltip content={t('diff:actions.unstageBlock')} disabledAnchorClassName="diff-block-action-anchor" disabledAnchorStyle={{ width: 24, height: 20, flexShrink: 0 }}><button type="button" disabled={actionsDisabled} className="diff-stage-action" onClick={(event) => { event.stopPropagation(); applyPatch('unstage', block, message('diff:scope.block')) }} aria-label={t('diff:actions.unstageBlock')}><Minus size={16}/></button></Tooltip>}
        </span>
      </>}
    </span>
  }
  const renderLineAction = (row: RepositoryDiffLine | undefined, sourceIndex: number) => {
    const sign = row?.kind === 'add' ? '+' : row?.kind === 'del' ? '−' : ''
    if (!row || row.kind === 'same') return <span className="change-sign">{sign}</span>
    const operation = canUnstage ? 'unstage' : canStage && row.kind === 'add' && onStagePatch ? 'stage' : canStage && row.kind === 'del' && onRestorePatch ? 'restore' : null
    if (!operation) return <span className="change-sign">{sign}</span>
    const label = operation === 'unstage' ? t('diff:actions.unstageLine') : operation === 'stage' ? t('diff:actions.stageLine') : t('diff:actions.restoreLine')
    return <Tooltip content={t('diff:actions.lineHint', { action: label })} disabledAnchorStyle={{ width: 20, height: 20, margin: 'auto' }}><button type="button" disabled={actionsDisabled} className={'change-sign line-action-' + row.kind} onClick={(event) => { event.stopPropagation(); applyPatch(operation, changeLine(sourceRows, sourceIndex, counterparts), message('diff:scope.line')) }} aria-label={label}>{sign}</button></Tooltip>
  }
  const renderLineNumber = (line: number | null | undefined) => {
    const number = <span className="line-no">{line ?? ''}</span>
    return <Tooltip content={onOpenLineHistory && line != null ? t('diff:actions.lineHistoryHint') : undefined}>{number}</Tooltip>
  }
  const renderWrapBlockActions = (block: RepositoryDiffLine[]) => block.length ? <div className="diff-wrap-block-actions">
    {canStage && onRestorePatch && <button type="button" disabled={actionsDisabled} className="diff-restore-action" onClick={(event) => { event.stopPropagation(); applyPatch('restore', block, message('diff:scope.block')) }} aria-label={t('diff:actions.restoreBlock')}><ArrowRight size={15}/></button>}
    {canStage && onStagePatch && <button type="button" disabled={actionsDisabled} className="diff-stage-action" onClick={(event) => { event.stopPropagation(); applyPatch('stage', block, message('diff:scope.block')) }} aria-label={t('diff:actions.stageBlock')}><Plus size={15}/></button>}
    {canUnstage && <button type="button" disabled={actionsDisabled} className="diff-stage-action" onClick={(event) => { event.stopPropagation(); applyPatch('unstage', block, message('diff:scope.block')) }} aria-label={t('diff:actions.unstageBlock')}><Minus size={15}/></button>}
  </div> : null
  const renderOmission = (entry: Extract<DiffContextEntry, { kind: 'omitted' }>, key: string, canExpandUp: boolean, canExpandDown: boolean, anchorSourceIndex?: number) => {
    const count = Math.min(20, entry.count)
    const remaining = numbers.format(entry.count)
    const actions = Number(canExpandUp) + Number(canExpandDown)
    return <div className={`hunk diff-omitted ${actions === 2 ? 'two-actions' : 'one-action'}`} key={key} style={wrap ? undefined : { height: virtualRowHeight * (actions === 2 ? 2 : 1) }}>
      {canExpandDown && <Tooltip content={t('diff:context.expandDownHint', { count, remaining })}>
        <button type="button" className="diff-omitted-action" onClick={() => expandOmission(entry, 'start', anchorSourceIndex)} aria-label={t('diff:context.expandDown', { count })}><ChevronDown size={14}/></button>
      </Tooltip>}
      {canExpandUp && <Tooltip content={t('diff:context.expandUpHint', { count, remaining })}>
        <button type="button" className="diff-omitted-action" onClick={() => expandOmission(entry, 'end', anchorSourceIndex)} aria-label={t('diff:context.expandUp', { count })}><ChevronUp size={14}/></button>
      </Tooltip>}
    </div>
  }
  const renderUnifiedEntry = (entry: DiffContextEntry, index: number) => entry.kind === 'omitted'
    ? (() => { const next = unifiedEntries[index + 1]; return renderOmission(entry, `omitted-${index}`, next?.kind === 'line', unifiedEntries[index - 1]?.kind === 'line', next?.kind === 'line' ? next.sourceIndex : undefined) })()
    : (() => { const row = entry.row; const side: DiffLineSide = row.kind === 'del' ? 'old' : 'new'; const block = row.kind !== 'same' && blockActionAnchors.has(index) ? changeBlock(sourceRows, entry.sourceIndex) : []; return <div key={index} data-diff-row-index={index} data-diff-source-index={entry.sourceIndex} style={wrap ? undefined : { height: virtualRowHeight }} className={`code-row${wrap ? ' wrap' : ''} ${row.kind} ${searchMatchSet.has(index) ? 'diff-search-match' : ''} ${searchMatches[searchIndex] === index ? 'diff-search-current' : ''} ${lineMenu?.rowIndex === index && lineMenu.side === side ? 'line-context-active' : ''} ${activeChange?.fileIndex === activeFile && activeChange.rowIndex === index ? 'diff-navigation-active' : ''}`} onContextMenu={(event) => openLineMenu(event, row, index, side, entry.sourceIndex)}>
      {wrap ? (stageActionsEnabled ? <span className="diff-stage-slot diff-stage-slot-wrap">{renderWrapBlockActions(block)}</span> : null) : renderStageActions(block, blockActionAnchors.get(index))}{renderLineNumber(row.old ?? row.next)}{renderLineAction(row, entry.sourceIndex)}<HighlightedCode code={row.code} filePath={activeFileInfo?.path ?? ''} changedRanges={inlineDiffRanges.get(row)}/>
    </div> })()
  const renderSplitEntry = (entry: SplitDiffEntry, index: number, side: DiffLineSide) => entry.kind === 'omitted'
    ? (() => { const next = splitEntries[index + 1]; const nextRow = next?.kind === 'row' ? next.row.left ?? next.row.right : undefined; return renderOmission(entry, `omitted-${side}-${index}`, next?.kind === 'row', splitEntries[index - 1]?.kind === 'row', nextRow ? sourceIndexMap.get(nextRow) : undefined) })()
    : (() => { const row = side === 'old' ? entry.row.left : entry.row.right; const sourceIndex = row ? sourceIndexMap.get(row) ?? -1 : -1; const action = renderLineAction(row, sourceIndex); return <div key={`${side}-${index}`} data-diff-row-index={index} data-diff-source-index={sourceIndex} style={wrap ? undefined : { height: virtualRowHeight }} className={`split-code-side${wrap ? ' wrap' : ''} ${row?.kind ?? 'empty'} ${searchMatchSet.has(index) ? 'diff-search-match' : ''} ${searchMatches[searchIndex] === index ? 'diff-search-current' : ''} ${lineMenu?.rowIndex === index && lineMenu.side === side ? 'line-context-active' : ''} ${activeChange?.fileIndex === activeFile && activeChange.rowIndex === index ? 'diff-navigation-active' : ''}`} onContextMenu={(event) => openLineMenu(event, row, index, side, sourceIndex)}>{renderLineNumber(side === 'old' ? row?.old : row?.next)}{action}{row ? <HighlightedCode code={row.code} filePath={activeFileInfo?.path ?? ''} changedRanges={inlineDiffRanges.get(row)}/> : <code/>}</div> })()
  const renderSplitActions = (entry: SplitDiffEntry, index: number) => {
    if (entry.kind === 'omitted') return <div className="split-action-row" style={{ height: virtualRowHeight * (index > 0 && index + 1 < splitEntries.length ? 2 : 1) }} key={`actions-${index}`}/>
    const row = entry.row.left ?? entry.row.right
    const sourceIndex = row ? sourceIndexMap.get(row) ?? -1 : -1
    const blockStart = blockActionAnchors.has(index)
    const block = blockStart && sourceIndex >= 0 ? changeBlock(sourceRows, sourceIndex) : []
    return <div className="split-action-row" style={{ height: virtualRowHeight }} key={`actions-${index}`}>
      {blockStart && renderStageActions(block, blockActionAnchors.get(index), 'split')}
    </div>
  }
  const renderWrapSplit = () => <div ref={setSplitScroller} className="split-diff-panes split-wrap-panes" onScroll={handleSplitScroll}>
    <div className={`split-wrap-list${stageActionsEnabled ? ' with-actions' : ''}`}>
      {splitEntries.map((entry, index) => {
        if (entry.kind === 'omitted') return <div className="split-wrap-omission" key={`wrap-omitted-${index}`}>{(() => { const next = splitEntries[index + 1]; const nextRow = next?.kind === 'row' ? next.row.left ?? next.row.right : undefined; return renderOmission(entry, `wrap-omitted-${index}`, next?.kind === 'row', splitEntries[index - 1]?.kind === 'row', nextRow ? sourceIndexMap.get(nextRow) : undefined) })()}</div>
        const row = entry.row.left ?? entry.row.right
        const sourceIndex = row ? sourceIndexMap.get(row) ?? -1 : -1
        const block = blockActionAnchors.has(index) && sourceIndex >= 0 ? changeBlock(sourceRows, sourceIndex) : []
        return <div className="split-wrap-row" key={`wrap-${index}`}>
          <div className="split-wrap-cell">{renderSplitEntry(entry, index, 'old')}</div>
          {stageActionsEnabled && <div className="split-wrap-actions">{renderWrapBlockActions(block)}</div>}
          <div className="split-wrap-cell">{renderSplitEntry(entry, index, 'new')}</div>
        </div>
      })}
    </div>
  </div>
  const contextMenuRow = lineMenu
    ? view === 'unified'
      ? unifiedEntryRow(unifiedEntries, lineMenu.rowIndex)
      : splitEntryRow(splitEntries, lineMenu.rowIndex, lineMenu.side)
    : undefined
  const contextMenuActionRows = lineMenu && lineMenu.sourceIndex >= 0 ? changeLine(sourceRows, lineMenu.sourceIndex, counterparts) : []
  const renderImagePreview = () => {
    if (imageLoading) return <div className="diff-image-state"><ImageIcon size={26}/><span>{t('diff:image.loading')}</span></div>
    if (imageError) return <div className="diff-image-state error">{renderMessage(imageError, t)}</div>
    if (!imageSides) return <div className="diff-image-state"><ImageIcon size={26}/><span>{t('diff:image.loading')}</span></div>
    const sides = [
      !fileContentOnly && imageSides.old ? { key: 'old' as const, image: imageSides.old } : null,
      imageSides.new ? { key: 'new' as const, image: imageSides.new } : null,
    ].filter((side): side is { key: 'old' | 'new'; image: RepositoryImage } => Boolean(side))
    if (!sides.length) return <div className="diff-image-state"><ImageIcon size={26}/><span>{t('diff:image.unavailable')}</span></div>
    return <div className="diff-image-preview">
      <div className={`diff-image-grid ${sides.length === 1 ? 'single' : ''}`}>
        {sides.map(({ key, image }) => {
          const label = t(fileContentOnly ? 'diff:image.file' : key === 'old' ? 'diff:image.old' : 'diff:image.new')
          return <DiffImageCard
            key={key}
            image={image}
            label={label}
            sizeLabel={formatImageBytes(image.byteLength, i18n.resolvedLanguage)}
            alt={t('diff:image.alt', { path: activeFileInfo?.path ?? '', side: label })}
            zoom={imageZoom}
          />
        })}
      </div>
    </div>
  }
  return <section ref={panelRef} className={`diff-panel ${wide ? 'wide' : ''} ${stageActionsEnabled ? 'stage-actions-enabled' : ''}`} style={diffStyle} onPointerEnter={() => { pointerInside.current = true }} onPointerLeave={() => { pointerInside.current = false }}>
    <div className="diff-toolbar">
      <div className="diff-title"><FileCode2 size={16}/><strong>{hideFileList ? t('diff:panel.title') : t('diff:panel.changedFiles')}</strong>{!hideFileList && <span>{numbers.format(files.length)}</span>}</div>
      {!hideFileList && <div className="segmented icon-segmented view-switch"><Tooltip content={t('diff:view.tree')}><button className={fileMode === 'tree' ? 'active' : ''} onClick={() => setFileMode('tree')} aria-label={t('diff:view.tree')}><FolderOpen size={14}/></button></Tooltip><Tooltip content={t('diff:view.list')}><button className={fileMode === 'list' ? 'active' : ''} onClick={() => setFileMode('list')} aria-label={t('diff:view.list')}><List size={14}/></button></Tooltip></div>}
      {!fileContentOnly && !showImagePreview && <div className="segmented icon-segmented diff-scope"><Tooltip content={t('diff:view.fullFile')}><button className={activeScope === 'file' ? 'active' : ''} onClick={() => setScope('file')} aria-label={t('diff:view.fullFile')}><FileText size={14}/></button></Tooltip><Tooltip content={t('diff:view.changes')}><button className={activeScope === 'changes' ? 'active' : ''} onClick={() => setScope('changes')} aria-label={t('diff:view.changes')}><ScanText size={14}/></button></Tooltip></div>}
      {!fileContentOnly && !showImagePreview && activeScope === 'changes' && <Tooltip content={t('diff:context.hint')}><label className="diff-context-control"><span>{t('diff:context.label')}</span><input type="number" min={0} max={100} step={1} value={contextLineCount} aria-label={t('diff:context.lines')} onChange={(event) => setContextLineCount(Math.trunc(Math.max(0, Math.min(100, Number(event.currentTarget.value) || 0))))}/></label></Tooltip>}
      {!fileContentOnly && !showImagePreview && <Tooltip content={showWhitespace ? t('diff:whitespace.hide') : t('diff:whitespace.show')}><button type="button" className={`diff-whitespace-toggle ${showWhitespace ? 'active' : ''}`} onClick={() => setShowWhitespace((value) => !value)} aria-label={t('diff:whitespace.show')} aria-pressed={showWhitespace}><Pilcrow size={13}/></button></Tooltip>}
      {!fileContentOnly && !showImagePreview && <Tooltip content={wrap ? t('diff:wrap.disable') : t('diff:wrap.enable')}><button type="button" className={`diff-whitespace-toggle diff-wrap-toggle ${wrap ? 'active' : ''}`} onClick={() => setWrap((value) => !value)} aria-label={wrap ? t('diff:wrap.disable') : t('diff:wrap.enable')} aria-pressed={wrap}><WrapText size={13}/></button></Tooltip>}
      {!showImagePreview && <div className="segmented icon-segmented"><Tooltip content={t('diff:view.unified')}><button className={view === 'unified' ? 'active' : ''} onClick={() => setView('unified')} aria-label={t('diff:view.unified')}><AlignJustify size={14}/></button></Tooltip><Tooltip content={t('diff:view.split')}><button className={view === 'split' ? 'active' : ''} onClick={() => setView('split')} aria-label={t('diff:view.split')}><Columns2 size={14}/></button></Tooltip></div>}
      {activeIsSvg && imagePreviewAvailable && <div className="segmented icon-segmented diff-image-view"><Tooltip content={t('diff:image.previewHint')}><button type="button" className={imageMode === 'preview' ? 'active' : ''} onClick={() => setImageMode('preview')} aria-label={t('diff:image.preview')} aria-pressed={imageMode === 'preview'}><ImageIcon size={14}/></button></Tooltip><Tooltip content={t('diff:image.sourceHint')}><button type="button" className={imageMode === 'source' ? 'active' : ''} onClick={() => setImageMode('source')} aria-label={t('diff:image.source')} aria-pressed={imageMode === 'source'}><FileCode2 size={14}/></button></Tooltip></div>}
      {showImagePreview && <div className="diff-font-controls diff-image-zoom-controls"><Tooltip content={t('diff:image.zoomOutHint')}><button type="button" onClick={() => setImageZoom((value) => Math.max(MIN_IMAGE_ZOOM, value - IMAGE_ZOOM_STEP))} disabled={imageZoom <= MIN_IMAGE_ZOOM} aria-label={t('diff:image.zoomOut')}><ZoomOut size={13}/></button></Tooltip><Tooltip content={t('diff:image.zoomResetHint')}><button type="button" className="diff-font-size" onClick={() => setImageZoom(100)} aria-label={t('diff:image.zoomReset')}>{numbers.format(imageZoom)}%</button></Tooltip><Tooltip content={t('diff:image.zoomInHint')}><button type="button" onClick={() => setImageZoom((value) => Math.min(MAX_IMAGE_ZOOM, value + IMAGE_ZOOM_STEP))} disabled={imageZoom >= MAX_IMAGE_ZOOM} aria-label={t('diff:image.zoomIn')}><ZoomIn size={13}/></button></Tooltip></div>}
      {!fileContentOnly && !showImagePreview && <div className="segmented icon-segmented diff-navigation"><Tooltip content={t('diff:navigation.previousHint')}><button onClick={() => jumpToChange(-1)} disabled={!files.length || diffLoading} aria-label={t('diff:navigation.previous')}><ArrowUp size={14}/></button></Tooltip><Tooltip content={t('diff:navigation.nextHint')}><button onClick={() => jumpToChange(1)} disabled={!files.length || diffLoading} aria-label={t('diff:navigation.next')}><ArrowDown size={14}/></button></Tooltip></div>}
      {!showImagePreview && (searchOpen ? <div className="diff-search-bar" role="search"><Search size={14}/><input ref={searchInputRef} value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setSearchIndex(0) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); jumpSearch(event.shiftKey ? -1 : 1) } if (event.key === 'Escape') { event.preventDefault(); setSearchOpen(false) } }} placeholder={t('diff:search.label')} aria-label={t('diff:search.label')}/><span>{searchQuery ? (searchMatches.length ? t('diff:search.position', { current: numbers.format(searchIndex + 1), total: numbers.format(searchMatches.length) }) : t('diff:search.noMatches')) : t('diff:search.prompt')}</span><Tooltip content={t('diff:search.previous')} disabledAnchorStyle={{ minWidth: 23, width: 23, height: 23 }}><button type="button" onClick={() => jumpSearch(-1)} disabled={!searchMatches.length} aria-label={t('diff:search.previous')}><ArrowUp size={13}/></button></Tooltip><Tooltip content={t('diff:search.next')} disabledAnchorStyle={{ minWidth: 23, width: 23, height: 23 }}><button type="button" onClick={() => jumpSearch(1)} disabled={!searchMatches.length} aria-label={t('diff:search.next')}><ArrowDown size={13}/></button></Tooltip><Tooltip content={t('diff:search.close')}><button type="button" onClick={() => { setSearchOpen(false); setSearchQuery('') }} aria-label={t('diff:search.close')}><X size={13}/></button></Tooltip></div> : <Button variant="icon" onClick={() => { setSearchOpen(true); requestAnimationFrame(() => searchInputRef.current?.focus()) }} tooltip={t('diff:search.hint')} aria-label={t('diff:search.label')}><Search size={15}/></Button>)}
      {!showImagePreview && <Tooltip content={t('diff:font.hint')}><div className="diff-font-controls"><button onClick={() => setDiffFontSize((value) => Math.max(MIN_DIFF_FONT_SIZE, value - 1))} disabled={diffFontSize <= MIN_DIFF_FONT_SIZE} aria-label={t('diff:font.smaller')}><Minus size={13}/></button><Tooltip content={t('diff:font.reset')}><button className="diff-font-size" onClick={() => setDiffFontSize(defaultFontSize)} aria-label={t('diff:font.reset')}>{t('diff:font.size', { size: numbers.format(diffFontSize) })}</button></Tooltip><button onClick={() => setDiffFontSize((value) => Math.min(MAX_DIFF_FONT_SIZE, value + 1))} disabled={diffFontSize >= MAX_DIFF_FONT_SIZE} aria-label={t('diff:font.larger')}><Plus size={13}/></button></div></Tooltip>}
      <Button variant="icon" onClick={() => onWideChange(!wide)} tooltip={wide ? t('diff:view.exitWide') : t('diff:view.enterWide')} aria-label={wide ? t('diff:view.exitWide') : t('diff:view.enterWide')}>{wide ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}</Button>
      {onClose && <Button variant="icon" className="diff-close-control" onClick={onClose} tooltip={t('diff:view.close')} aria-label={t('diff:view.close')}><X size={15}/></Button>}
    </div>
    <div className={`diff-body ${hideFileList ? 'code-only' : ''}`}>
      {!hideFileList && <DiffFileList files={files} activeFile={activeFile} mode={fileMode} onSelectFile={selectFile} collapsedFolders={collapsedFolders} onCollapsedFoldersChange={setCollapsedFolders}/>}
      <div className="diff-viewer" ref={overviewRef}>
      <div className={`code-diff ${view}${wrap ? ' wrap' : ''}`}>
        <div className="file-header"><Tooltip content={activeFileInfo?.path}><div className="file-header-path"><Tooltip content={activeFileInfo?.path}><code>{activeFileInfo?.path ?? t('diff:panel.noFiles')}</code></Tooltip></div></Tooltip>{activeFileInfo && !fileContentOnly && !showImagePreview && <span className="file-header-stats"><i>+{numbers.format(activeFileInfo.add)}</i> <b>-{numbers.format(activeFileInfo.del)}</b></span>}</div>
        {showImagePreview ? renderImagePreview() : <>
          {activeScope === 'changes' && !usesLoader && <div className="hunk">{t('diff:panel.fullChange')}</div>}
          {diffLoading && !canRenderLoadedRows && <div className="diff-message">{t('diff:panel.loading')}</div>}
          {diffError && <div className="diff-message error">{renderMessage(diffError, t)}</div>}
          {!diffLoading && !diffError && visibleEntryCount === 0 && <div className="diff-message">{t('diff:panel.noTextDiff')}</div>}
          {canRenderLoadedRows && !diffError && view === 'unified' && <div className={`unified-diff-pane${wrap ? ' wrap' : ''}`} ref={codeDiffRef} onScroll={handleCodeDiffScroll}><div className={`unified-diff-content${virtualized ? ' virtual-diff-list' : ''}`} style={{ paddingTop: virtualized ? virtualTopHeight : undefined, paddingBottom: virtualBottomHeight }}>{unifiedEntries.slice(virtualStart, virtualEnd).map((entry, index) => renderUnifiedEntry(entry, index + virtualStart))}</div></div>}
          {canRenderLoadedRows && !diffError && view === 'split' && (wrap ? renderWrapSplit() : <div ref={setSplitScroller} className="split-diff-panes" onScroll={handleSplitScroll}>
            <div className="split-diff-viewport">
              <div className="split-diff-pane split-left" aria-label={t('diff:code.old')}><div className={`split-diff-content${virtualized ? ' virtual-diff-list' : ''}`} style={{ paddingTop: virtualized ? virtualTopHeight : undefined, paddingBottom: virtualBottomHeight }}>{splitEntries.slice(virtualStart, virtualEnd).map((entry, index) => renderSplitEntry(entry, index + virtualStart, 'old'))}</div></div>
              {stageActionsEnabled && <div className="split-diff-actions" aria-label={t('diff:actions.label')}><div className={`split-diff-content${virtualized ? ' virtual-diff-list' : ''}`} style={{ paddingTop: virtualized ? virtualTopHeight : undefined, paddingBottom: virtualBottomHeight }}>{splitEntries.slice(virtualStart, virtualEnd).map((entry, index) => renderSplitActions(entry, index + virtualStart))}</div></div>}
              <div className="split-diff-pane split-right" aria-label={t('diff:code.new')}><div className={`split-diff-content${virtualized ? ' virtual-diff-list' : ''}`} style={{ paddingTop: virtualized ? virtualTopHeight : undefined, paddingBottom: virtualBottomHeight }}>{splitEntries.slice(virtualStart, virtualEnd).map((entry, index) => renderSplitEntry(entry, index + virtualStart, 'new'))}</div></div>
            </div>
            <div className="split-diff-spacer" style={{ height: `max(0px, calc(${splitTotalHeight}px - var(--split-content-height, 0px)))` }}/>
          </div>)}
        </>}
      </div>
      {!showImagePreview && (overviewCanScroll || overviewMarkers.length > 0) && <Tooltip content={t('diff:overview.hint')}><div className={`diff-overview ${view === 'split' ? 'split' : ''}`} style={overviewBounds} role="scrollbar" aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100} aria-label={t('diff:overview.label')} tabIndex={0} onPointerDown={beginOverviewDrag} onPointerMove={moveOverviewDrag} onPointerUp={endOverviewDrag} onPointerCancel={endOverviewDrag} onKeyDown={handleOverviewKeyDown}>
        {overviewMarkers.map(({ index, top, height, kind, column }) => <span className={`diff-overview-marker ${kind} ${column}`} key={`${column}-${index}`} style={{ top: `max(0px, min(${top}%, calc(100% - 3px)))`, height: `${height}%` }}/>) }
        {overviewCanScroll && <span ref={overviewViewportRef} className="diff-overview-viewport" style={{ top: '0px', height: '0px' }}/>}
      </div></Tooltip>}
      </div>
    </div>
    {lineMenu && activeFileInfo && <ContextMenu x={lineMenu.x} y={lineMenu.y} onClose={() => setLineMenu(null)}><div className="context-menu-title"><FileCode2 size={13}/><span>{activeFileInfo.path}:{lineMenu.line} · {lineMenu.side === 'old' ? t('diff:code.oldVersion') : t('diff:code.newVersion')}</span></div>{canStage && onStagePatch && contextMenuRow?.kind !== 'same' && <button disabled={actionsDisabled} onClick={() => { applyPatch('stage', contextMenuActionRows, message('diff:scope.line')); setLineMenu(null) }}><Plus size={14}/><span>{t('diff:actions.stageLine')}</span></button>}{canStage && onRestorePatch && contextMenuRow?.kind !== 'same' && <button disabled={actionsDisabled} onClick={() => { applyPatch('restore', contextMenuActionRows, message('diff:scope.line')); setLineMenu(null) }}><RotateCcw size={14}/><span>{t('diff:actions.restoreLine')}</span></button>}{canUnstage && contextMenuRow?.kind !== 'same' && <button disabled={actionsDisabled} onClick={() => { applyPatch('unstage', contextMenuActionRows, message('diff:scope.line')); setLineMenu(null) }}><Minus size={14}/><span>{t('diff:actions.unstageLine')}</span></button>}{onOpenLineHistory && <button onClick={() => { if (contextMenuRow) onOpenLineHistory(activeFileInfo.path, lineMenu.line, lineMenu.side, contextMenuRow); setLineMenu(null) }}><History size={14}/><span>{t('diff:actions.lineHistory', { line: lineMenu.line })}</span></button>}<button onClick={() => { navigator.clipboard?.writeText(lineMenu.code).catch(() => undefined); setLineMenu(null) }}><Copy size={14}/><span>{t('diff:actions.copyLine')}</span></button></ContextMenu>}
  </section>
}
