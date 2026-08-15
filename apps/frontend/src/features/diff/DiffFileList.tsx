import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type UIEvent } from 'react'
import { ChevronDown, ChevronRight, FolderOpen } from 'lucide-react'
import type { RepositoryFile } from '../../repository'

type IndexedFile = {
  file: RepositoryFile
  index: number
  folder: string
  name: string
}

type FileListEntry =
  | { kind: 'folder'; key: string; folder: string; count: number; height: number }
  | { kind: 'file'; key: string; item: IndexedFile; nested: boolean; height: number }

type DiffFileListProps = {
  files: RepositoryFile[]
  activeFile: number
  mode: 'list' | 'tree'
  onSelectFile: (index: number) => void
  className?: string
  fileRowHeight?: number
  folderRowHeight?: number
  collapsedFolders?: Record<string, boolean>
  onCollapsedFoldersChange?: (value: Record<string, boolean>) => void
  onFileContextMenu?: (event: MouseEvent<HTMLButtonElement>, file: RepositoryFile) => void
  showOpenIndicator?: boolean
}

const FILE_ROW_HEIGHT = 40
const FOLDER_ROW_HEIGHT = 26
const VIRTUAL_OVERSCAN = 280

function entryAtOffset(offsets: number[], offset: number) {
  let low = 0
  let high = Math.max(0, offsets.length - 2)
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (offsets[middle + 1] <= offset) low = middle + 1
    else high = middle
  }
  return low
}

export const DiffFileList = memo(function DiffFileList({ files, activeFile, mode, onSelectFile, className = 'file-list', fileRowHeight = FILE_ROW_HEIGHT, folderRowHeight = FOLDER_ROW_HEIGHT, collapsedFolders: controlledCollapsedFolders, onCollapsedFoldersChange, onFileContextMenu, showOpenIndicator = false }: DiffFileListProps) {
  const [internalCollapsedFolders, setInternalCollapsedFolders] = useState<Record<string, boolean>>({})
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 600 })
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollFrame = useRef<number | null>(null)
  const collapsedFolders = controlledCollapsedFolders ?? internalCollapsedFolders

  const indexedFiles = useMemo(() => files.map((file, index) => {
    const segments = file.path.split('/')
    return {
      file,
      index,
      folder: segments.slice(0, -1).join('/') || '根目录',
      name: segments[segments.length - 1] ?? file.path,
    }
  }), [files])

  const groups = useMemo(() => {
    const result = new Map<string, IndexedFile[]>()
    indexedFiles.forEach((item) => {
      const group = result.get(item.folder)
      if (group) group.push(item)
      else result.set(item.folder, [item])
    })
    return result
  }, [indexedFiles])

  const entries = useMemo<FileListEntry[]>(() => {
    if (mode === 'list') {
      return indexedFiles.map((item) => ({ kind: 'file', key: `file:${item.file.path}`, item, nested: false, height: fileRowHeight }))
    }
    const result: FileListEntry[] = []
    groups.forEach((group, folder) => {
      result.push({ kind: 'folder', key: `folder:${folder}`, folder, count: group.length, height: folderRowHeight })
      if (!collapsedFolders[folder]) {
        group.forEach((item) => result.push({ kind: 'file', key: `file:${item.file.path}`, item, nested: true, height: fileRowHeight }))
      }
    })
    return result
  }, [collapsedFolders, fileRowHeight, folderRowHeight, groups, indexedFiles, mode])

  const offsets = useMemo(() => {
    const result = [0]
    entries.forEach((entry) => result.push(result[result.length - 1] + entry.height))
    return result
  }, [entries])
  const totalHeight = offsets[offsets.length - 1] ?? 0
  const entryIndexByFile = useMemo(() => {
    const result = new Map<number, number>()
    entries.forEach((entry, index) => {
      if (entry.kind === 'file') result.set(entry.item.index, index)
    })
    return result
  }, [entries])
  const range = useMemo(() => {
    if (!entries.length) return { start: 0, end: 0 }
    const start = entryAtOffset(offsets, Math.max(0, viewport.scrollTop - VIRTUAL_OVERSCAN))
    const end = Math.min(entries.length, entryAtOffset(offsets, viewport.scrollTop + viewport.height + VIRTUAL_OVERSCAN) + 1)
    return { start, end }
  }, [entries.length, offsets, viewport])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const updateHeight = () => setViewport((value) => ({ ...value, height: container.clientHeight }))
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const container = containerRef.current
    const entryIndex = entryIndexByFile.get(activeFile) ?? -1
    if (!container || entryIndex < 0) return
    const top = offsets[entryIndex]
    const bottom = offsets[entryIndex + 1]
    if (top < container.scrollTop) container.scrollTop = top
    else if (bottom > container.scrollTop + container.clientHeight) container.scrollTop = bottom - container.clientHeight
  }, [activeFile, entryIndexByFile, offsets])

  useEffect(() => () => {
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current)
  }, [])

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current)
    scrollFrame.current = requestAnimationFrame(() => {
      setViewport({ scrollTop: target.scrollTop, height: target.clientHeight })
      scrollFrame.current = null
    })
  }

  const toggleFolder = (folder: string) => {
    const next = { ...collapsedFolders, [folder]: !collapsedFolders[folder] }
    if (onCollapsedFoldersChange) onCollapsedFoldersChange(next)
    else setInternalCollapsedFolders(next)
  }

  return <div className={className} ref={containerRef} onScroll={handleScroll}>
    <div className="virtual-file-list" style={{ height: totalHeight }}>
      {entries.slice(range.start, range.end).map((entry, localIndex) => {
        const entryIndex = range.start + localIndex
        const style = { top: offsets[entryIndex], height: entry.height } as CSSProperties
        if (entry.kind === 'folder') {
          const collapsed = Boolean(collapsedFolders[entry.folder])
          return <div className="virtual-file-entry folder" key={entry.key} style={style}>
            <button className="file-tree-folder" onClick={() => toggleFolder(entry.folder)} title={collapsed ? `展开 ${entry.folder}` : `收起 ${entry.folder}`}>
              {collapsed ? <ChevronRight size={12}/> : <ChevronDown size={12}/>}<FolderOpen size={13}/><span>{entry.folder}</span><small>{entry.count}</small>
            </button>
          </div>
        }
        const { file, index, folder, name } = entry.item
        return <div className="virtual-file-entry" key={entry.key} style={style}>
          <button className={`${activeFile === index ? 'active' : ''} ${entry.nested ? 'nested-file' : ''}`} onClick={() => onSelectFile(index)} onContextMenu={(event) => onFileContextMenu?.(event, file)}>
            <span className={`file-state ${file.type.toLowerCase()}`}>{file.type}</span><div><strong>{name}</strong><span>{folder === '根目录' ? '' : `${folder}/`}</span></div><span className="stats"><i>+{file.add}</i><b>-{file.del}</b></span>{showOpenIndicator && <ChevronRight size={13}/>} 
          </button>
        </div>
      })}
    </div>
  </div>
})
