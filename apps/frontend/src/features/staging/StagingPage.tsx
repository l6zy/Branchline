import { Tooltip } from '../../components/tooltip'
import { message, errorMessage, type MessageContent, type TranslationKey } from '../../i18n/messages'
import { useAppTranslation, type AppTranslator } from '../../i18n/useAppTranslation'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Archive, ArrowDown, CheckCircle2, ChevronDown, Copy, FileCode2, FileText, GitCommitHorizontal, History, Minus, Pencil, Pilcrow, Plus, RefreshCw, Rows3, Trash2 } from 'lucide-react'
import { ContextMenu } from '../../components/ContextMenu'
import { Button } from '../../components/Button'
import { useConfirmDialog } from '../../components/ConfirmDialog'
import {
  ApplicationError,
  commitRepository,
  createScopedRepositoryStash,
  discardRepositoryFiles,
  loadRepository,
  loadRepositoryFileImage,
  loadRepositoryUnstagedFileDiff,
  loadRepositoryStagedFileDiff,
  restoreRepositoryPatch,
  clearRepositoryCommitTemplate,
  stageRepositoryFiles,
  stageRepositoryPatch,
  updateRepositoryCommitTemplate,
  unstageRepositoryFiles,
  unstageRepositoryPatch,
  type RepositoryFile,
  type RepositorySnapshot,
} from '../../repository'
import { DiffPanel } from '../diff/DiffPanel'
import { useResizablePane } from '../../components/useResizablePane'
import { initialCommitMessage, templateMessage } from './commitMessage'
import { buildNonWhitespacePatch, isSubmodulePointerChange } from './nonWhitespaceStaging'
import { isBooleanRecord, usePersistentState } from '../../persistentState'
import { hasStagingChanges, stageSelectionKey, visibleStagingSections, type StageSelection } from './stagingSelection'

type StagingPageProps = {
  repository: RepositorySnapshot | null
  undoCommitMessage?: string | null
  onSnapshot: (snapshot: RepositorySnapshot) => void
  onNotice: (message: MessageContent) => void
  onOperationChange?: (label: MessageContent | null) => void
  onOpenHistory: (path: string, tab: 'history' | 'blame') => void
  onOpenLineHistory: (path: string, line: number) => void
  onOpenConflict?: (path: string) => void
}

function fileName(path: string) {
  return path.split(/[\\/]/).pop() || path
}

function fileDirectory(path: string) {
  const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return separator >= 0 ? path.slice(0, separator + 1) : ''
}

function isBinaryPreviewError(error: unknown) {
  return error instanceof ApplicationError && error.data.code === 'file.binaryPreview'
}

function StageFilePath({ path }: { path: string }) {
  const directory = fileDirectory(path)
  return <Tooltip content={path}><span className={`stage-file-path${directory ? ' has-directory' : ''}`} >
    <span className="stage-file-name">{fileName(path)}</span>
    {directory && <span className="stage-file-directory">{directory}</span>}
  </span></Tooltip>
}

const fileStatusMeta: Record<string, { label: TranslationKey; className: string; description: TranslationKey }> = {
  A: { label: 'staging:status.added', className: 'added', description: 'staging:status.addedHint' },
  M: { label: 'staging:status.modified', className: 'modified', description: 'staging:status.modifiedHint' },
  D: { label: 'staging:status.deleted', className: 'deleted', description: 'staging:status.deletedHint' },
  R: { label: 'staging:status.renamed', className: 'renamed', description: 'staging:status.renamedHint' },
  C: { label: 'staging:status.copied', className: 'copied', description: 'staging:status.copiedHint' },
  U: { label: 'staging:status.conflicted', className: 'conflicted', description: 'staging:status.conflictedHint' },
}
const UNMERGED_FILE_TYPES = new Set(['U', 'DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])

function getFileStatus(type: string, t: AppTranslator) {
  const code = type.trim().charAt(0).toUpperCase()
  const meta = fileStatusMeta[code]
  return meta ? { ...meta, label: t(meta.label), description: t(meta.description) } : { label: type || t('staging:status.changed'), className: 'modified', description: t('staging:status.changedHint') }
}

export function StagingPage({ repository, undoCommitMessage, onSnapshot, onNotice, onOperationChange, onOpenHistory, onOpenLineHistory, onOpenConflict }: StagingPageProps) {
  const { t, i18n } = useAppTranslation()
  const displayNumber = (value: number) => new Intl.NumberFormat(i18n.resolvedLanguage).format(value)
  const [fullMessage, setFullMessage] = useState('')
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false)
  const [templateDraft, setTemplateDraft] = useState('')
  const [amend, setAmend] = useState(false)
  const [sign, setSign] = useState(false)
  const [busy, setBusy] = useState(false)
  const patchBusy = useRef(false)
  const [selectedFile, setSelectedFile] = useState<StageSelection | null>(null)
  const [diffRevision, setDiffRevision] = useState(0)
  const [sectionOpen, setSectionOpen] = usePersistentState('branchline.stagingSectionsOpen.v1', { staged: true, unstaged: true }, isBooleanRecord)
  const [contextFile, setContextFile] = useState<{ file: RepositoryFile; scope: 'staged' | 'unstaged'; x: number; y: number } | null>(null)
  const { confirm, confirmDialog } = useConfirmDialog()
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
  const visibleSections = visibleStagingSections(stagedFiles.length, unstagedFiles.length)
  const hasChanges = hasStagingChanges(stagedFiles.length, unstagedFiles.length, conflictFiles.length)
  const diffFileEntries = useMemo(() => [
    ...stagedFiles.map((file) => ({ file, scope: 'staged' as const })),
    ...unstagedFiles.map((file) => ({ file, scope: 'unstaged' as const })),
  ], [stagedFiles, unstagedFiles])
  const selectedDiffEntry = useMemo(() => diffFileEntries.find((entry) => stageSelectionKey({ path: entry.file.path, scope: entry.scope }) === stageSelectionKey(selectedFile)) ?? null, [diffFileEntries, selectedFile])
  const loadStagingRows = useCallback((path: string, _index: number | undefined, showWhitespace: boolean) => selectedFile?.scope === 'unstaged'
    ? loadRepositoryUnstagedFileDiff(repository?.path ?? '', path, showWhitespace)
    : loadRepositoryStagedFileDiff(repository?.path ?? '', path, showWhitespace), [repository?.path, selectedFile?.scope])
  const loadStagingImage = useCallback((path: string, side: 'old' | 'new') => {
    if (!repository?.path) return Promise.resolve(null)
    if (selectedFile?.scope === 'staged') {
      return side === 'old'
        ? loadRepositoryFileImage(repository.path, path, 'commit', 'HEAD')
        : loadRepositoryFileImage(repository.path, path, 'index')
    }
    return side === 'old'
      ? loadRepositoryFileImage(repository.path, path, 'index')
      : loadRepositoryFileImage(repository.path, path, 'worktree')
  }, [repository?.path, selectedFile?.scope])

  useEffect(() => {
    if (!selectedDiffEntry) setSelectedFile(diffFileEntries[0] ? { path: diffFileEntries[0].file.path, scope: diffFileEntries[0].scope } : null)
  }, [diffFileEntries, selectedDiffEntry])

  const applyConfiguredTemplate = () => {
    const content = repository?.commitTemplate?.content ?? ''
    setFullMessage(templateMessage(content))
  }

  useEffect(() => {
    const template = repository?.commitTemplate
    const operation = repository?.operation
    const operationWithMessage = operation && operation.kind !== 'conflict' && operation.message?.trim() ? operation : undefined
    const key = operationWithMessage
      ? `${repository?.path ?? 'empty'}\u0000${operationWithMessage.kind}\u0000${operationWithMessage.currentCommit ?? operationWithMessage.message ?? ''}`
      : `${repository?.path ?? 'empty'}\u0000template\u0000${template?.path ?? ''}\u0000${template?.content ?? ''}`
    if (appliedTemplateKey.current === key) return
    appliedTemplateKey.current = key
    setFullMessage(initialCommitMessage(template?.content ?? '', operationWithMessage))
    setTemplateDraft(template?.content ?? '')
  }, [repository?.commitTemplate?.content, repository?.commitTemplate?.path, repository?.operation?.currentCommit, repository?.operation?.kind, repository?.operation?.message, repository?.path])

  useEffect(() => {
    if (undoCommitMessage !== null && undoCommitMessage !== undefined) setFullMessage(undoCommitMessage)
  }, [undoCommitMessage])

  const run = async (action: () => Promise<RepositorySnapshot>, success: MessageContent, operationLabel?: MessageContent) => {
    setBusy(true)
    if (operationLabel) onOperationChange?.(operationLabel)
    try {
      const snapshot = await action()
      onSnapshot(snapshot)
      onNotice(success)
    } catch (error) {
      onNotice(errorMessage(error))
    } finally {
      setBusy(false)
      if (operationLabel) onOperationChange?.(null)
      applyConfiguredTemplate()
    }
  }
  const updateStaging = async (paths: string[], mode: 'stage' | 'unstage', force = false) => {
    if (!repository) return onNotice(message('staging:openRequired'))
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
            ? message('staging:forceRemaining', { count: snapshot.operation.conflicts.length })
            : message('staging:forceStaged', { count: paths.length }))
        } catch (error) {
          const remainingConflicts = repository.operation?.conflicts.filter((path) => !pathSet.has(path)) ?? []
          const operation = repository.operation?.kind === 'conflict' && remainingConflicts.length === 0
            ? undefined
            : repository.operation ? { ...repository.operation, conflicts: remainingConflicts } : undefined
          onSnapshot({ ...repository, files: updatedFiles, operation })
          onNotice(message('staging:forceRefresh', { count: paths.length, error: errorMessage(error) }))
        }
      } else {
        onSnapshot({ ...repository, files: updatedFiles })
        setDiffRevision((value) => value + 1)
        onNotice(message(mode === 'stage' ? 'staging:filesStaged' : 'staging:filesUnstaged', { count: paths.length }))
      }
    } catch (error) {
      onSnapshot(previousSnapshot)
      onNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  const stageNonWhitespace = async (paths: string[]) => {
    if (!repository) return onNotice(message('staging:openRequired'))
    if (!paths.length) return
    setBusy(true)
    onOperationChange?.(message('staging:stagingNonWhitespace'))
    try {
      const patches: string[] = []
      const directPaths: string[] = []
      let skipped = 0
      for (const path of paths) {
        const file = files.find((candidate) => candidate.path === path)
        // With changes on only one side there is no replacement that could be
        // whitespace-only, and direct staging preserves modes, renames, and
        // deletions.
        if (file && (file.unstagedAdd === 0 || file.unstagedDel === 0)) {
          directPaths.push(path)
          continue
        }
        let rows
        try {
          rows = await loadRepositoryUnstagedFileDiff(repository.path, path, false)
        } catch (error) {
          if (isBinaryPreviewError(error)) { directPaths.push(path); continue }
          throw error
        }
        // An empty row set means the textual diff cannot describe this change
        // (binary content or a mode-only change), so fall back to the regular
        // staging path for it. Gitlink pointer updates are staged the same way
        // because Git cannot apply them as text patches.
        if (!rows.length || isSubmodulePointerChange(rows)) { directPaths.push(path); continue }
        const patch = buildNonWhitespacePatch(path, rows, file?.type)
        if (!patch) { skipped += 1; continue }
        patches.push(patch)
      }
      if (patches.length) {
        const updatedFiles = await stageRepositoryPatch(repository.path, patches.join(''))
        onSnapshot({ ...repository, files: updatedFiles })
      }
      if (directPaths.length) await stageRepositoryFiles(repository.path, directPaths)
      const snapshot = await loadRepository(repository.path)
      onSnapshot(snapshot)
      setDiffRevision((value) => value + 1)
      const staged = paths.length - skipped
      if (!staged) onNotice(message('staging:nonWhitespaceNone', { count: skipped }))
      else if (skipped) onNotice(message('staging:nonWhitespaceStagedSkipped', { count: staged, skipped }))
      else onNotice(message('staging:nonWhitespaceStaged', { count: staged }))
    } catch (error) {
      try { onSnapshot(await loadRepository(repository.path)) } catch { /* Keep the current snapshot. */ }
      onNotice(errorMessage(error))
    } finally {
      setBusy(false)
      onOperationChange?.(null)
    }
  }
  const stage = (paths: string[], force = false) => updateStaging(paths, 'stage', force)
  const unstage = (paths: string[]) => updateStaging(paths, 'unstage')
  const applySelectedPatch = async (mode: 'stage' | 'restore' | 'unstage', patch: string, description: MessageContent) => {
    if (!repository || !patch || busy || patchBusy.current) return
    patchBusy.current = true
    setBusy(true)
    try {
      const action = mode === 'stage' ? stageRepositoryPatch : mode === 'restore' ? restoreRepositoryPatch : unstageRepositoryPatch
      const updatedFiles = await action(repository.path, patch)
      onSnapshot({ ...repository, files: updatedFiles })
      setDiffRevision((value) => value + 1)
      onNotice(message(mode === 'stage' ? 'staging:patchStaged' : mode === 'restore' ? 'staging:patchRestored' : 'staging:patchUnstaged', { description }))
    } catch (error) {
      onNotice(errorMessage(error))
    } finally {
      patchBusy.current = false
      setBusy(false)
    }
  }
  const discard = async (paths: string[]) => {
    if (!repository) return onNotice(message('staging:openRequired'))
    if (!paths.length) return
    const confirmed = await confirm({ title: message('staging:discardTitle'), message: message('staging:discardConfirm', { count: paths.length }), confirmLabel: message('staging:discard'), variant: 'danger' })
    if (!confirmed) return
    setBusy(true)
    try {
      const updatedFiles = await discardRepositoryFiles(repository.path, paths)
      onSnapshot({ ...repository, files: updatedFiles })
      setDiffRevision((value) => value + 1)
      onNotice(message('staging:discarded', { count: paths.length }))
    } catch (error) {
      onNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  const quickStash = (scope: 'staged' | 'unstaged', count: number) => repository
    ? run(() => createScopedRepositoryStash(repository.path, scope, t('staging:quickStashMessage', { scope: t(scope === 'staged' ? 'staging:scope.staged' : 'staging:scope.unstaged') })), message('staging:quickStashed', { count, scope: message(scope === 'staged' ? 'staging:scope.staged' : 'staging:scope.unstaged') }))
    : onNotice(message('staging:quickStashOpenRequired'))
  const commit = () => {
    if (!repository) return onNotice(message('staging:openRequired'))
    const commitMessage = fullMessage
    if (!commitMessage.trim()) return onNotice(message('staging:commitRequired'))
    return run(() => commitRepository(repository.path, commitMessage, amend, sign), message('staging:committed'), message('staging:committing'))
  }
  const saveRepositoryTemplate = async () => {
    if (!repository) return
    setBusy(true)
    try {
      const snapshot = await updateRepositoryCommitTemplate(repository.path, templateDraft)
      onSnapshot(snapshot)
      setTemplateEditorOpen(false)
      onNotice(message('staging:templateSaved'))
    } catch (error) {
      onNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  const restoreGlobalTemplate = async () => {
    if (!repository) return
    setBusy(true)
    try {
      const snapshot = await clearRepositoryCommitTemplate(repository.path)
      onSnapshot(snapshot)
      setTemplateEditorOpen(false)
      onNotice(message('staging:globalTemplateRestored'))
    } catch (error) {
      onNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  const fileRow = (file: RepositoryFile, action: () => void, icon: 'add' | 'remove', scope: 'staged' | 'unstaged') => {
    const Icon = icon === 'add' ? Plus : Minus
    const FileIcon = file.path.includes('.') ? FileCode2 : FileText
    const status = getFileStatus(file.type, t)
    const additions = scope === 'staged' ? file.stagedAdd ?? file.add : file.unstagedAdd ?? file.add
    const deletions = scope === 'staged' ? file.stagedDel ?? file.del : file.unstagedDel ?? file.del
    const selection = { path: file.path, scope }
    return <div className={`stage-file ${stageSelectionKey(selectedFile) === stageSelectionKey(selection) ? 'active' : ''}`} key={`${scope}-${file.path}`} onContextMenu={(event) => { event.preventDefault(); setSelectedFile(selection); setContextFile({ file, scope, x: event.clientX, y: event.clientY }) }}>
      <Tooltip content={t('staging:fileHint', { path: file.path })}><button className={`stage-file-open ${file.incoming ? 'has-incoming' : ''}`} onClick={() => { setSelectedFile(selection); setWidePreview(false) }} ><FileIcon size={15}/><Tooltip content={status.description}><span className={`stage-file-status ${status.className}`} >{status.label}</span></Tooltip><StageFilePath path={file.path}/>{file.incoming && <Tooltip content={t('staging:incomingHint')}><span className="stage-file-incoming" ><ArrowDown size={13}/></span></Tooltip>}<span className="stage-file-stats"><small className="additions">+{displayNumber(additions)}</small><small className="deletions">-{displayNumber(deletions)}</small></span></button></Tooltip>
      <div className="stage-file-actions">
        {scope === 'unstaged' && <Button variant="danger" className="stage-file-action" onClick={() => void discard([file.path])} disabled={busy} tooltip={t('staging:discardUnstaged')} aria-label={t('staging:discardUnstaged')}><Trash2 size={13}/></Button>}
        {scope === 'unstaged' && <Tooltip content={t('staging:stageFileNonWhitespaceHint')}><button className="stage-file-action" onClick={() => void stageNonWhitespace([file.path])} disabled={busy} aria-label={t('staging:stageFileNonWhitespace')}><Pilcrow size={13}/></button></Tooltip>}
        <Tooltip content={icon === 'add' ? t('staging:stageFile') : t('staging:unstage')}><button className="stage-file-action" onClick={action} disabled={busy} aria-label={icon === 'add' ? t('staging:stageFile') : t('staging:unstage')}><Icon size={13}/></button></Tooltip>
      </div>
    </div>
  }

  const forceStageConflict = async (file: RepositoryFile) => {
    if (!await confirm({ title: message('staging:forceTitle'), message: message('staging:forceConfirm', { path: file.path }), confirmLabel: message('staging:forceStage'), variant: 'danger' })) return
    await stage([file.path], true)
  }

  const conflictRow = (file: RepositoryFile) => <div className="stage-file conflict-file" key={`conflict-${file.path}`}>
    <Tooltip content={t('staging:resolveHint', { path: file.path })}><button className="stage-file-open" onClick={() => onOpenConflict?.(file.path)} ><FileCode2 size={15}/><span className="stage-file-status conflicted">{t('staging:status.conflicted')}</span><StageFilePath path={file.path}/><span className="stage-file-stats"><small className="additions">+{displayNumber(file.add)}</small><small className="deletions">-{displayNumber(file.del)}</small></span></button></Tooltip>
    <div className="stage-file-actions"><Tooltip content={t('staging:forceTitle')}><button className="stage-file-action force-stage" onClick={() => forceStageConflict(file)} disabled={busy}  aria-label={t('staging:forceTitle')}><Plus size={14}/></button></Tooltip></div>
  </div>

  const workspaceStyle = { '--staging-control-width': `${stagingWidth.value}px` } as CSSProperties
  const resizingClass = filesHeight.resizing ? 'pane-resizing-vertical' : stagingWidth.resizing ? 'pane-resizing' : ''
  return <section className={`workspace-page staging-page ${resizingClass}`}>
    <div className={`staging-workspace ${widePreview ? 'preview-wide' : ''}`} style={workspaceStyle}>
      <div className="staging-control-pane" style={{ gridTemplateRows: `${filesHeight.value}px 1px minmax(230px, 1fr)` }}>
        <div className="staging-file-sections">
          {repository && !hasChanges && <div className="stage-clean-empty"><CheckCircle2 size={23}/><strong>{t('staging:clean')}</strong><span>{t('staging:cleanHint')}</span></div>}
          {conflictFiles.length > 0 && <div className="stage-section conflict-section">
            <div className="stage-section-header"><div className="stage-section-name"><span className="stage-section-marker"/><strong>{t('staging:conflicts')}</strong><span className="stage-section-count">{displayNumber(conflictFiles.length)}</span></div><span className="stage-section-hint">{t('staging:canStage')}</span></div>
            <div className="stage-section-files">{conflictFiles.map(conflictRow)}</div>
          </div>}
          {visibleSections.includes('staged') && <div className={`stage-section staged-section ${sectionOpen.staged ? '' : 'collapsed'}`}>
            <div className="stage-section-header"><Tooltip content={sectionOpen.staged ? t('staging:collapseStaged') : t('staging:expandStaged')}><button type="button" className="stage-section-toggle" onClick={() => setSectionOpen((value) => ({ ...value, staged: !value.staged }))} aria-expanded={sectionOpen.staged} aria-label={sectionOpen.staged ? t('staging:collapseStaged') : t('staging:expandStaged')}><ChevronDown size={14}/></button></Tooltip><div className="stage-section-name"><span className="stage-section-marker"/><strong>{t('staging:staged')}</strong><span className="stage-section-count">{displayNumber(stagedFiles.length)}</span></div><div className="stage-section-actions"><Tooltip content={t('staging:quickStashStaged')}><button className="icon-tool-button" onClick={() => quickStash('staged', stagedFiles.length)} disabled={!stagedFiles.length || busy}  aria-label={t('staging:quickStashStaged')}><Archive size={14}/></button></Tooltip><Tooltip content={t('staging:unstageAll')}><button className="icon-tool-button" onClick={() => unstage(stagedFiles.map((file) => file.path))} disabled={!stagedFiles.length || busy}  aria-label={t('staging:unstageAll')}><Minus size={14}/></button></Tooltip></div></div>
            {sectionOpen.staged && <div className="stage-section-files">{stagedFiles.map((file) => fileRow(file, () => unstage([file.path]), 'remove', 'staged'))}</div>}
          </div>}
          {visibleSections.includes('unstaged') && <div className={`stage-section unstaged-section ${sectionOpen.unstaged ? '' : 'collapsed'}`}>
            <div className="stage-section-header"><Tooltip content={sectionOpen.unstaged ? t('staging:collapseUnstaged') : t('staging:expandUnstaged')}><button type="button" className="stage-section-toggle" onClick={() => setSectionOpen((value) => ({ ...value, unstaged: !value.unstaged }))} aria-expanded={sectionOpen.unstaged} aria-label={sectionOpen.unstaged ? t('staging:collapseUnstaged') : t('staging:expandUnstaged')}><ChevronDown size={14}/></button></Tooltip><div className="stage-section-name"><span className="stage-section-marker"/><strong>{t('staging:unstaged')}</strong><span className="stage-section-count">{displayNumber(unstagedFiles.length)}</span></div><div className="stage-section-actions"><Button variant="danger" className="icon-tool-button" onClick={() => void discard(unstagedFiles.map((file) => file.path))} disabled={!unstagedFiles.length || busy} tooltip={t('staging:discardAll')} aria-label={t('staging:discardAll')}><Trash2 size={14}/></Button><Tooltip content={t('staging:quickStashUnstaged')}><button className="icon-tool-button" onClick={() => quickStash('unstaged', unstagedFiles.length)} disabled={!unstagedFiles.length || busy}  aria-label={t('staging:quickStashUnstaged')}><Archive size={14}/></button></Tooltip><Tooltip content={t('staging:stageAllNonWhitespaceHint')}><button className="icon-tool-button" onClick={() => void stageNonWhitespace(unstagedFiles.map((file) => file.path))} disabled={!unstagedFiles.length || busy}  aria-label={t('staging:stageAllNonWhitespace')}><Pilcrow size={14}/></button></Tooltip><Tooltip content={t('staging:stageAll')}><button className="icon-tool-button" onClick={() => stage(unstagedFiles.map((file) => file.path))} disabled={!unstagedFiles.length || busy}  aria-label={t('staging:stageAll')}><Plus size={14}/></button></Tooltip></div></div>
            {sectionOpen.unstaged && <div className="stage-section-files">{unstagedFiles.map((file) => fileRow(file, () => stage([file.path]), 'add', 'unstaged'))}</div>}
          </div>}
        </div>
        <span className={`workspace-resizer workspace-resizer-row ${filesHeight.resizing ? 'active' : ''}`} role="separator" aria-label={t('staging:resizeHeight')} onPointerDown={filesHeight.beginResize}/>
        <div className="commit-compose"><div className="template-row"><Tooltip content={repository?.commitTemplate?.path}><span ><FileText size={14}/> {repository?.commitTemplate ? t('staging:templateName', { name: fileName(repository.commitTemplate.path) }) : t('staging:noTemplate')}</span></Tooltip><div className="template-row-actions"><Tooltip content={t('staging:reapplyTemplate')}><button type="button" className="template-icon-button" onClick={applyConfiguredTemplate} disabled={!repository?.commitTemplate}  aria-label={t('staging:reapplyTemplate')}><RefreshCw size={14}/></button></Tooltip><Tooltip content={t('staging:editTemplate')}><button type="button" className="template-icon-button" onClick={() => { setTemplateDraft(repository?.commitTemplate?.content ?? ''); setTemplateEditorOpen(true) }}  aria-label={t('staging:editTemplate')}><Pencil size={14}/></button></Tooltip></div></div><textarea className="commit-full-message" value={fullMessage} onChange={(event) => setFullMessage(event.target.value)} aria-label={t('staging:commitMessage')} placeholder={t('staging:commitPlaceholder')} spellCheck={false}/><div className="commit-options"><label><input type="checkbox" checked={amend} onChange={(event) => setAmend(event.target.checked)}/> {t('staging:amend')}</label><label><input type="checkbox" checked={sign} onChange={(event) => setSign(event.target.checked)}/> {t('staging:sign')}</label></div><Button variant="primary" onClick={commit} disabled={!stagedFiles.length || busy}><GitCommitHorizontal size={16}/> {busy ? t('staging:busy') : t('staging:commitFiles', { count: stagedFiles.length })} <span>⌘↵</span></Button></div>
      </div>
      <span className={`workspace-resizer workspace-resizer-column ${stagingWidth.resizing ? 'active' : ''}`} role="separator" aria-label={t('staging:resizeWidth')} onPointerDown={stagingWidth.beginResize}/>
      <div className="staging-preview-pane">{selectedDiffEntry ? <DiffPanel files={[selectedDiffEntry.file]} repositoryPath={repository?.path} loadRows={loadStagingRows} loadImage={loadStagingImage} viewKey={stageSelectionKey(selectedFile)} reloadKey={String(diffRevision)} wide={widePreview} onWideChange={setWidePreview} hideFileList actionScope={selectedDiffEntry.scope} actionsBusy={busy} onStagePatch={(_path, patch, description) => void applySelectedPatch('stage', patch, description)} onRestorePatch={(_path, patch, description) => void applySelectedPatch('restore', patch, description)} onUnstagePatch={(_path, patch, description) => void applySelectedPatch('unstage', patch, description)} onOpenLineHistory={(path, line, _side, row) => { if (row.kind === 'add') onNotice(message('staging:noLineHistory')); else onOpenLineHistory(path, row.old ?? line) }}/>: <div className="drawer-preview-empty"><FileCode2 size={30}/><strong>{t('staging:selectFile')}</strong><span>{t('staging:selectFileHint')}</span></div>}</div>
    </div>
    {templateEditorOpen && <div className="template-editor-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget && !busy) setTemplateEditorOpen(false) }}><section className="template-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="template-editor-title"><header className="template-editor-heading"><div><h2 id="template-editor-title">{t('staging:editCommitTemplate')}</h2><Tooltip content={repository?.commitTemplate?.path}><span >{repository?.commitTemplate?.path ?? t('staging:repositoryTemplate')}</span></Tooltip></div><button type="button" className="template-editor-close" onClick={() => setTemplateEditorOpen(false)} disabled={busy} aria-label={t('staging:closeTemplate')}>×</button></header><div className="template-editor-body"><textarea value={templateDraft} onChange={(event) => setTemplateDraft(event.target.value)} aria-label={t('staging:templateContent')} placeholder={t('staging:templatePlaceholder')} spellCheck={false} autoFocus /></div><footer className="template-editor-actions"><Button variant="secondary" onClick={() => setTemplateEditorOpen(false)} disabled={busy}>{t('common:cancel')}</Button><Button variant="secondary" onClick={() => void restoreGlobalTemplate()} disabled={busy}>{t('staging:restoreGlobal')}</Button><Button variant="primary" onClick={() => void saveRepositoryTemplate()} disabled={busy}>{t('staging:saveTemplate')}</Button></footer></section></div>}
    {contextFile && <ContextMenu x={contextFile.x} y={contextFile.y} onClose={() => setContextFile(null)}><div className="context-menu-title"><FileText size={13}/><span>{contextFile.file.path}</span></div><button onClick={() => { onOpenHistory(contextFile.file.path, 'history'); setContextFile(null) }}><History size={14}/><span>{t('staging:fileHistory')}</span></button><button onClick={() => { onOpenHistory(contextFile.file.path, 'blame'); setContextFile(null) }}><Rows3 size={14}/><span>{t('staging:blame')}</span></button><div className="context-menu-separator"/><button onClick={() => { navigator.clipboard?.writeText(contextFile.file.path).catch(() => undefined); setContextFile(null) }}><Copy size={14}/><span>{t('staging:copyPath')}</span></button>{contextFile.scope === 'unstaged' && <><div className="context-menu-separator"/><button onClick={() => { const path = contextFile.file.path; setContextFile(null); void stageNonWhitespace([path]) }}><Pilcrow size={14}/><span>{t('staging:stageFileNonWhitespace')}</span></button><Button variant="danger" onClick={() => { const path = contextFile.file.path; setContextFile(null); void discard([path]) }}><Trash2 size={14}/><span>{t('staging:discardMenu')}</span></Button></>}</ContextMenu>}
    {confirmDialog}
  </section>
}
