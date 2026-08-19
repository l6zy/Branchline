import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Archive, ArrowDown, Check, Copy, FileCode2, FileText, GitCommitHorizontal, History, Minus, Plus, Rows3, Trash2 } from 'lucide-react'
import { ContextMenu } from '../../components/ContextMenu'
import { Button } from '../../components/Button'
import {
  commitRepository,
  createScopedRepositoryStash,
  discardRepositoryFiles,
  loadRepository,
  loadRepositoryFileDiff,
  loadRepositoryUnstagedFileDiff,
  restoreRepositoryPatch,
  stageRepositoryFiles,
  stageRepositoryPatch,
  unstageRepositoryFiles,
  type RepositoryFile,
  type RepositorySnapshot,
} from '../../repository'
import { DiffPanel } from '../diff/DiffPanel'
import { useResizablePane } from '../../components/useResizablePane'

type StagingPageProps = {
  repository: RepositorySnapshot | null
  onSnapshot: (snapshot: RepositorySnapshot) => void
  onNotice: (message: string) => void
  onOperationChange?: (label: string | null) => void
  onOpenHistory: (path: string, tab: 'history' | 'blame') => void
  onOpenLineHistory: (path: string, line: number) => void
  onOpenConflict?: (path: string) => void
}

function parseCommitTemplate(content: string) {
  const lines = content.split(/\r?\n/).filter((line) => !line.trimStart().startsWith('#'))
  const titleIndex = lines.findIndex((line) => line.trim())
  if (titleIndex < 0) return { title: '', body: '' }
  return {
    title: lines[titleIndex].trimEnd(),
    body: lines.slice(titleIndex + 1).join('\n').trim(),
  }
}

function fileName(path: string) {
  return path.split(/[\\/]/).pop() || path
}

const fileStatusMeta: Record<string, { label: string; className: string; description: string }> = {
  A: { label: '新增', className: 'added', description: '新增文件' },
  M: { label: '修改', className: 'modified', description: '修改文件' },
  D: { label: '删除', className: 'deleted', description: '删除文件' },
  R: { label: '重命名', className: 'renamed', description: '重命名文件' },
  C: { label: '复制', className: 'copied', description: '复制文件' },
  U: { label: '冲突', className: 'conflicted', description: '存在冲突' },
}
const UNMERGED_FILE_TYPES = new Set(['U', 'DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])

function getFileStatus(type: string) {
  const code = type.trim().charAt(0).toUpperCase()
  return fileStatusMeta[code] ?? { label: type || '变更', className: 'modified', description: '文件变更' }
}

export function StagingPage({ repository, onSnapshot, onNotice, onOperationChange, onOpenHistory, onOpenLineHistory, onOpenConflict }: StagingPageProps) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [amend, setAmend] = useState(false)
  const [sign, setSign] = useState(false)
  const [busy, setBusy] = useState(false)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [contextFile, setContextFile] = useState<{ file: RepositoryFile; scope: 'staged' | 'unstaged'; x: number; y: number } | null>(null)
  const [widePreview, setWidePreview] = useState(false)
  const stagingWidth = useResizablePane('branchline.stagingWidth.v1', 430, 300, 720, 'horizontal')
  const filesHeight = useResizablePane('branchline.stagingFilesHeight.v1', 360, 150, 720, 'vertical')
  const appliedTemplateKey = useRef<string | null>(null)
  const files = repository?.files ?? []
  const conflictFilePaths = useMemo(() => {
    const paths = new Set(repository?.operation?.conflicts ?? [])
    files.forEach((file) => {
      const type = file.type.trim().toUpperCase()
      if (UNMERGED_FILE_TYPES.has(type)) paths.add(file.path)
    })
    return paths
  }, [files, repository?.operation?.conflicts])
  const conflictFiles = useMemo(() => files.filter((file) => conflictFilePaths.has(file.path)), [conflictFilePaths, files])
  const stagedFiles = useMemo(() => files.filter((file) => file.staged && !conflictFilePaths.has(file.path)), [conflictFilePaths, files])
  const unstagedFiles = useMemo(() => files.filter((file) => !conflictFilePaths.has(file.path) && (file.unstaged || (!file.staged && !file.unstaged))), [conflictFilePaths, files])
  const selectedIndex = Math.max(0, files.findIndex((file) => file.path === selectedPath))
  const loadStagingRows = useCallback((path: string) => {
    const file = files.find((item) => item.path === path)
    return file?.unstaged
      ? loadRepositoryUnstagedFileDiff(repository?.path ?? '', path)
      : loadRepositoryFileDiff(repository?.path ?? '', path)
  }, [files, repository?.path])

  useEffect(() => {
    if (!selectedPath || !files.some((file) => file.path === selectedPath)) setSelectedPath(files[0]?.path ?? null)
  }, [files, selectedPath])

  const applyConfiguredTemplate = () => {
    const parsed = parseCommitTemplate(repository?.commitTemplate?.content ?? '')
    setTitle(parsed.title)
    setBody(parsed.body)
  }

  useEffect(() => {
    const template = repository?.commitTemplate
    const key = `${repository?.path ?? 'empty'}\u0000${template?.path ?? ''}\u0000${template?.content ?? ''}`
    if (appliedTemplateKey.current === key) return
    appliedTemplateKey.current = key
    const parsed = parseCommitTemplate(template?.content ?? '')
    setTitle(parsed.title)
    setBody(parsed.body)
  }, [repository?.commitTemplate?.content, repository?.commitTemplate?.path, repository?.path])

  const run = async (action: () => Promise<RepositorySnapshot>, success: string, operationLabel?: string) => {
    setBusy(true)
    if (operationLabel) onOperationChange?.(operationLabel)
    try {
      const snapshot = await action()
      onSnapshot(snapshot)
      onNotice(success)
    } catch (error) {
      onNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
      if (operationLabel) onOperationChange?.(null)
    }
  }
  const updateStaging = async (paths: string[], mode: 'stage' | 'unstage', force = false) => {
    if (!repository) return onNotice('请先打开本地仓库')
    const pathSet = new Set(paths)
    const previousSnapshot = repository
    const optimisticFiles = files.map((file) => pathSet.has(file.path)
      ? { ...file, staged: mode === 'stage', unstaged: mode === 'unstage' }
      : file)
    setBusy(true)
    onSnapshot({ ...repository, files: optimisticFiles })
    try {
      const updatedFiles = mode === 'stage'
        ? await stageRepositoryFiles(repository.path, paths, force)
        : await unstageRepositoryFiles(repository.path, paths)
      if (mode === 'stage' && force) {
        try {
          const snapshot = await loadRepository(repository.path)
          onSnapshot(snapshot)
          onNotice(snapshot.operation?.conflicts.length
            ? `已强制暂存，仍有 ${snapshot.operation.conflicts.length} 个冲突文件待处理`
            : `已强制暂存 ${paths.length} 个冲突文件`)
        } catch {
          const remainingConflicts = repository.operation?.conflicts.filter((path) => !pathSet.has(path)) ?? []
          const operation = repository.operation?.kind === 'conflict' && remainingConflicts.length === 0
            ? undefined
            : repository.operation ? { ...repository.operation, conflicts: remainingConflicts } : undefined
          onSnapshot({ ...repository, files: updatedFiles, operation })
          onNotice(`已强制暂存 ${paths.length} 个冲突文件，仓库操作状态将在下次刷新时同步`)
        }
      } else {
        onSnapshot({ ...repository, files: updatedFiles })
        onNotice(mode === 'stage' ? `已暂存 ${paths.length} 个文件` : `已取消暂存 ${paths.length} 个文件`)
      }
    } catch (error) {
      onSnapshot(previousSnapshot)
      onNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  const stage = (paths: string[], force = false) => updateStaging(paths, 'stage', force)
  const unstage = (paths: string[]) => updateStaging(paths, 'unstage')
  const stagePatch = async (_filePath: string, patch: string, description: string) => {
    if (!repository || !patch) return
    setBusy(true)
    try {
      const updatedFiles = await stageRepositoryPatch(repository.path, patch)
      onSnapshot({ ...repository, files: updatedFiles })
      onNotice(`已暂存${description}`)
    } catch (error) {
      onNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  const restorePatch = async (_filePath: string, patch: string, description: string) => {
    if (!repository || !patch) return
    setBusy(true)
    try {
      const updatedFiles = await restoreRepositoryPatch(repository.path, patch)
      onSnapshot({ ...repository, files: updatedFiles })
      onNotice(`已还原${description}`)
    } catch (error) {
      onNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  const discard = async (paths: string[]) => {
    if (!repository) return onNotice('请先打开本地仓库')
    if (!paths.length) return
    const confirmed = window.confirm(`确定丢弃选中的 ${paths.length} 个文件的未暂存改动？\n\n跟踪文件会恢复到当前暂存区版本，已暂存内容会保留；未跟踪文件会从磁盘永久删除。此操作无法撤销。`)
    if (!confirmed) return
    setBusy(true)
    try {
      const updatedFiles = await discardRepositoryFiles(repository.path, paths)
      onSnapshot({ ...repository, files: updatedFiles })
      onNotice(`已丢弃 ${paths.length} 个文件的未暂存改动`)
    } catch (error) {
      onNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  const quickStash = (scope: 'staged' | 'unstaged', count: number) => repository
    ? run(() => createScopedRepositoryStash(repository.path, scope, `快速 Stash：${scope === 'staged' ? '已暂存' : '未暂存'}变更`), `已将 ${count} 个${scope === 'staged' ? '已暂存' : '未暂存'}文件保存到 Stash`)
    : onNotice('快速 Stash 需要先打开本地仓库')
  const commit = () => {
    if (!repository) return onNotice('请先打开本地仓库')
    const message = [title.trim(), body.trim()].filter(Boolean).join('\n\n')
    if (!message) return onNotice('提交信息不能为空')
    return run(() => commitRepository(repository.path, message, amend, sign), '提交完成，工作区已刷新', '正在创建提交…')
  }
  const fileRow = (file: RepositoryFile, action: () => void, icon: 'add' | 'remove', scope: 'staged' | 'unstaged') => {
    const Icon = icon === 'add' ? Plus : Minus
    const FileIcon = file.path.includes('.') ? FileCode2 : FileText
    const status = getFileStatus(file.type)
    return <div className={`stage-file ${selectedPath === file.path ? 'active' : ''}`} key={`${icon}-${file.path}`} onContextMenu={(event) => { event.preventDefault(); setSelectedPath(file.path); setContextFile({ file, scope, x: event.clientX, y: event.clientY }) }}>
      <button className={`stage-file-open ${file.incoming ? 'has-incoming' : ''}`} onClick={() => { setSelectedPath(file.path); setWidePreview(false) }} title={`点击查看 ${file.path} 的变更，右键查看更多操作`}><FileIcon size={15}/><span className={`stage-file-status ${status.className}`} title={status.description}>{status.label}</span><span className="stage-file-path">{file.path}</span>{file.incoming && <span className="stage-file-incoming" title="远端待拉取提交也修改了此文件"><ArrowDown size={13}/></span>}<span className="stage-file-stats"><small className="additions">+{file.add}</small><small className="deletions">-{file.del}</small></span></button>
      <div className="stage-file-actions">
        {scope === 'unstaged' && <Button variant="danger" className="stage-file-action" onClick={() => void discard([file.path])} disabled={busy} title="丢弃未暂存改动"><Trash2 size={13}/></Button>}
        <button className="stage-file-action" onClick={action} disabled={busy} title={icon === 'add' ? '暂存文件' : '取消暂存'}><Icon size={13}/></button>
      </div>
    </div>
  }

  const forceStageConflict = (file: RepositoryFile) => {
    if (!window.confirm(`“${file.path}”仍处于冲突状态。\n\n强行暂存会将当前工作区内容写入暂存区，包括未处理的冲突标记。确定继续吗？`)) return
    void stage([file.path], true)
  }

  const conflictRow = (file: RepositoryFile) => <div className="stage-file conflict-file" key={`conflict-${file.path}`}>
    <button className="stage-file-open" onClick={() => onOpenConflict?.(file.path)} title={`处理 ${file.path} 的冲突`}><FileCode2 size={15}/><span className="stage-file-status conflicted">冲突</span><span className="stage-file-path">{file.path}</span><span className="stage-file-stats"><small className="additions">+{file.add}</small><small className="deletions">-{file.del}</small></span></button>
    <div className="stage-file-actions"><button className="stage-file-action force-stage" onClick={() => forceStageConflict(file)} disabled={busy} title="强制暂存冲突文件" aria-label="强制暂存冲突文件"><Plus size={14}/></button></div>
  </div>

  const workspaceStyle = { '--staging-control-width': `${stagingWidth.value}px` } as CSSProperties
  const resizingClass = filesHeight.resizing ? 'pane-resizing-vertical' : stagingWidth.resizing ? 'pane-resizing' : ''
  return <section className={`workspace-page staging-page ${resizingClass}`}>
    <div className={`staging-workspace ${widePreview ? 'preview-wide' : ''}`} style={workspaceStyle}>
      <div className="staging-control-pane" style={{ gridTemplateRows: `${filesHeight.value}px 1px minmax(230px, 1fr)` }}>
        <div className="staging-file-sections">
          {conflictFiles.length > 0 && <div className="stage-section conflict-section">
            <div className="stage-section-header"><div className="stage-section-name"><span className="stage-section-marker"/><strong>冲突</strong><span className="stage-section-count">{conflictFiles.length}</span></div><span className="stage-section-hint">解决后可暂存</span></div>
            <div className="stage-section-files">{conflictFiles.map(conflictRow)}</div>
          </div>}
          <div className="stage-section staged-section">
            <div className="stage-section-header"><div className="stage-section-name"><span className="stage-section-marker"/><strong>已暂存</strong><span className="stage-section-count">{stagedFiles.length}</span></div><div className="stage-section-actions"><button className="icon-tool-button" onClick={() => quickStash('staged', stagedFiles.length)} disabled={!stagedFiles.length || busy} title="快速 Stash 已暂存变更" aria-label="快速 Stash 已暂存变更"><Archive size={14}/></button><button className="icon-tool-button" onClick={() => unstage(stagedFiles.map((file) => file.path))} disabled={!stagedFiles.length || busy} title="全部取消暂存" aria-label="全部取消暂存"><Minus size={14}/></button></div></div>
            <div className="stage-section-files">{stagedFiles.length ? stagedFiles.map((file) => fileRow(file, () => unstage([file.path]), 'remove', 'staged')) : <div className="stage-empty">暂无已暂存文件</div>}</div>
          </div>
          <div className="stage-section unstaged-section">
            <div className="stage-section-header"><div className="stage-section-name"><span className="stage-section-marker"/><strong>未暂存</strong><span className="stage-section-count">{unstagedFiles.length}</span></div><div className="stage-section-actions"><Button variant="danger" className="icon-tool-button" onClick={() => void discard(unstagedFiles.map((file) => file.path))} disabled={!unstagedFiles.length || busy} title="全部丢弃未暂存改动" aria-label="全部丢弃未暂存改动"><Trash2 size={14}/></Button><button className="icon-tool-button" onClick={() => quickStash('unstaged', unstagedFiles.length)} disabled={!unstagedFiles.length || busy} title="快速 Stash 未暂存变更" aria-label="快速 Stash 未暂存变更"><Archive size={14}/></button><button className="icon-tool-button" onClick={() => stage(unstagedFiles.map((file) => file.path))} disabled={!unstagedFiles.length || busy} title="全部暂存" aria-label="全部暂存"><Plus size={14}/></button></div></div>
            <div className="stage-section-files">{unstagedFiles.length ? unstagedFiles.map((file) => fileRow(file, () => stage([file.path]), 'add', 'unstaged')) : <div className="stage-empty"><Check size={14}/> 工作区干净</div>}</div>
          </div>
        </div>
        <span className={`workspace-resizer workspace-resizer-row ${filesHeight.resizing ? 'active' : ''}`} role="separator" aria-label="拖动调整文件列表和提交面板高度" onPointerDown={filesHeight.beginResize}/>
        <div className="commit-compose"><div className="template-row"><span title={repository?.commitTemplate?.path}><FileText size={14}/> {repository?.commitTemplate ? `模板：${fileName(repository.commitTemplate.path)}` : '未配置 commit.template'}</span><button type="button" onClick={applyConfiguredTemplate} disabled={!repository?.commitTemplate}>重新应用模板</button></div><input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="提交标题" placeholder="提交标题"/><textarea value={body} onChange={(event) => setBody(event.target.value)} aria-label="提交正文" placeholder="补充提交说明（可选）"/><div className="commit-options"><label><input type="checkbox" checked={amend} onChange={(event) => setAmend(event.target.checked)}/> Amend</label><label><input type="checkbox" checked={sign} onChange={(event) => setSign(event.target.checked)}/> 签名</label></div><Button variant="primary" onClick={commit} disabled={!stagedFiles.length || busy}><GitCommitHorizontal size={16}/> {busy ? '处理中…' : `提交 ${stagedFiles.length} 个文件`} <span>⌘↵</span></Button></div>
      </div>
      <span className={`workspace-resizer workspace-resizer-column ${stagingWidth.resizing ? 'active' : ''}`} role="separator" aria-label="拖动调整文件面板和 Diff 宽度" onPointerDown={stagingWidth.beginResize}/>
      <div className="staging-preview-pane">{selectedPath && files.length ? <DiffPanel files={files} repositoryPath={repository?.path} loadRows={loadStagingRows} wide={widePreview} onWideChange={setWidePreview} initialFile={selectedIndex} hideFileList allowStage={Boolean(files[selectedIndex]?.unstaged)} onStagePatch={(path, patch, description) => void stagePatch(path, patch, description)} onRestorePatch={(path, patch, description) => void restorePatch(path, patch, description)} onOpenLineHistory={(path, line, _side, row) => { if (row.kind === 'add') onNotice('未提交的新增或修改行尚无提交历史，请查询对应旧版本行或提交后再查看'); else onOpenLineHistory(path, row.old ?? line) }}/>: <div className="drawer-preview-empty"><FileCode2 size={30}/><strong>选择文件查看变更</strong><span>点击左侧文件即可查看完整内容、统一 Diff 或并排 Diff。</span></div>}</div>
    </div>
    {contextFile && <ContextMenu x={contextFile.x} y={contextFile.y} onClose={() => setContextFile(null)}><div className="context-menu-title"><FileText size={13}/><span>{contextFile.file.path}</span></div><button onClick={() => { onOpenHistory(contextFile.file.path, 'history'); setContextFile(null) }}><History size={14}/><span>查看文件历史</span></button><button onClick={() => { onOpenHistory(contextFile.file.path, 'blame'); setContextFile(null) }}><Rows3 size={14}/><span>查看逐行归属（Blame）</span></button><div className="context-menu-separator"/><button onClick={() => { navigator.clipboard?.writeText(contextFile.file.path).catch(() => undefined); setContextFile(null) }}><Copy size={14}/><span>复制文件路径</span></button>{contextFile.scope === 'unstaged' && <><div className="context-menu-separator"/><Button variant="danger" onClick={() => { const path = contextFile.file.path; setContextFile(null); void discard([path]) }}><Trash2 size={14}/><span>丢弃未暂存改动…</span></Button></>}</ContextMenu>}
  </section>
}
