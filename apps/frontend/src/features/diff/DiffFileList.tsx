import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type UIEvent } from 'react'
import { ChevronDown, ChevronRight, FolderOpen } from 'lucide-react'
import type { RepositoryFile } from '../../repository'

type IndexedFile = {
  file: RepositoryFile
  index: number
  folder: string
  name: string
}

type FolderNode = {
  kind: 'folder'
  path: string
  name: string
  children: TreeNode[]
  count: number
}

type FileNode = {
  kind: 'file'
  item: IndexedFile
}

type TreeNode = FolderNode | FileNode

type FileListEntry =
  | { kind: 'folder'; key: string; folder: string; name: string; count: number; depth: number; height: number }
  | { kind: 'file'; key: string; item: IndexedFile; nested: boolean; depth: number; height: number }

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
      folder: segments.slice(0, -1).join('/'),
      name: segments[segments.length - 1] ?? file.path,
    }
  }), [files])

  const tree = useMemo(() => {
    const roots: TreeNode[] = []
    const folders = new Map<string, FolderNode>()
    indexedFiles.forEach((item) => {
      const segments = item.file.path.split('/').filter(Boolean)
      const folderSegments = segments.slice(0, -1)
      let parent: FolderNode | null = null
      for (let segmentIndex = 0; segmentIndex < folderSegments.length; segmentIndex += 1) {
        const segment = folderSegments[segmentIndex]
        const path = folderSegments.slice(0, segmentIndex + 1).join('/')
        let folder = folders.get(path)
        if (!folder) {
          folder = { kind: 'folder', path, name: segment, children: [], count: 0 }
          folders.set(path, folder)
          if (parent) parent.children.push(folder)
          else roots.push(folder)
        }
        folder.count += 1
        parent = folder
      }
      const fileNode: FileNode = { kind: 'file', item }
      if (parent) parent.children.push(fileNode)
      else roots.push(fileNode)
    })
    return roots
  }, [indexedFiles])

  const entries = useMemo<FileListEntry[]>(() => {
    if (mode === 'list') {
      return indexedFiles.map((item) => ({ kind: 'file', key: `file:${item.file.path}`, item, nested: false, depth: 0, height: fileRowHeight }))
    }
    const result: FileListEntry[] = []
    const flatten = (nodes: TreeNode[], depth: number) => {
      nodes.forEach((node) => {
        if (node.kind === 'folder') {
          result.push({ kind: 'folder', key: `folder:${node.path}`, folder: node.path, name: node.name, count: node.count, depth, height: folderRowHeight })
          if (!collapsedFolders[node.path]) flatten(node.children, depth + 1)
          return
        }
        result.push({ kind: 'file', key: `file:${node.item.file.path}`, item: node.item, nested: depth > 0, depth, height: fileRowHeight })
      })
    }
    flatten(tree, 0)
    return result
  }, [collapsedFolders, fileRowHeight, folderRowHeight, indexedFiles, mode, tree])

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
        const style = { top: offsets[entryIndex], height: entry.height, '--tree-depth': entry.depth } as CSSProperties
        if (entry.kind === 'folder') {
          const collapsed = Boolean(collapsedFolders[entry.folder])
          return <div className="virtual-file-entry folder" key={entry.key} style={style}>
            <button className="file-tree-folder" onClick={() => toggleFolder(entry.folder)} title={collapsed ? `展开 ${entry.folder}` : `收起 ${entry.folder}`}>
              {collapsed ? <ChevronRight size={12}/> : <ChevronDown size={12}/>}<FolderOpen size={13}/><span>{entry.name}</span><small>{entry.count}</small>
            </button>
          </div>
        }
        const { file, index, folder, name } = entry.item
        return <div className="virtual-file-entry" key={entry.key} style={style}>
          <button className={`${activeFile === index ? 'active' : ''} ${entry.nested ? 'nested-file' : ''}`} onClick={() => onSelectFile(index)} onContextMenu={(event) => onFileContextMenu?.(event, file)}>
            <span className={`file-state ${file.type.toLowerCase()}`}>{file.type}</span><div><strong>{name}</strong><span>{folder ? `${folder}/` : ''}</span></div><span className="stats"><i>+{file.add}</i><b>-{file.del}</b></span>{showOpenIndicator && <ChevronRight size={13}/>}
          </button>
        </div>
      })}
    </div>
  </div>
})
