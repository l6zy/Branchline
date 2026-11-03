import { Tooltip } from '../../components/tooltip'
import { message, errorMessage, type MessageContent, type TranslationKey } from '../../i18n/messages'
import { operationLabel } from '../../i18n/operationLabels'
import { useAppTranslation } from '../../i18n/useAppTranslation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, CircleAlert, ExternalLink, GitBranch, GitMerge, GitPullRequest, RefreshCw, RotateCcw, SkipForward, Square, Trash2, X } from 'lucide-react'
import { ConflictCodeEditor, type ConflictCodeEditorHandle } from './ConflictCodeEditor'
import { abortRepositoryOperation, continueRepositoryOperation, launchConflictMergetool, loadConflictFile, resolveConflictBlock, resolveConflictFile, skipRepositoryOperation, type ConflictFileContent, type RepositorySnapshot } from '../../repository'
import { Button } from '../../components/Button'
import { useConfirmDialog } from '../../components/ConfirmDialog'
import { acquireOperationLock, releaseOperationLock } from './operationLock'

type OperationPanelProps = {
  repository: RepositorySnapshot
  onSnapshot: (snapshot: RepositorySnapshot) => void
  onNotice: (message: MessageContent) => void
  initialPath?: string | null
  onReturnToChanges: () => void
  onClose?: () => void
}

type ConflictBlock = {
  index: number
  offset: number
  currentEnd: number
  separatorStart: number
  separatorEnd: number
  incomingEnd: number
  endOffset: number
}

type ResolutionStrategy = 'current' | 'incoming' | 'both'

const resolutionKeys: Record<ResolutionStrategy, TranslationKey> = {
  current: 'operations:resolution.current',
  incoming: 'operations:resolution.incoming',
  both: 'operations:resolution.both',
}

function parseConflictBlocks(value: string): ConflictBlock[] {
  const blocks: ConflictBlock[] = []
  const lines = value.split(/\r?\n/)
  let offset = 0
  let index = 0
  while (index < lines.length) {
    const start = lines[index]
    if (!start.startsWith('<<<<<<<')) {
      offset += start.length + 1
      index += 1
      continue
    }
    const separator = lines.findIndex((line, lineIndex) => lineIndex > index && line.startsWith('======='))
    const end = lines.findIndex((line, lineIndex) => lineIndex > separator && line.startsWith('>>>>>>>'))
    if (separator < 0 || end < 0) break
    let currentEnd = offset
    for (let lineIndex = index; lineIndex < separator; lineIndex += 1) currentEnd += lines[lineIndex].length + 1
    const separatorStart = currentEnd
    const separatorEnd = separatorStart + lines[separator].length + 1
    let incomingEnd = separatorEnd
    for (let lineIndex = separator + 1; lineIndex < end; lineIndex += 1) incomingEnd += lines[lineIndex].length + 1
    blocks.push({ index: blocks.length, offset, currentEnd, separatorStart, separatorEnd, incomingEnd, endOffset: offset + lines.slice(index, end + 1).join('\n').length })
    for (let lineIndex = index; lineIndex <= end; lineIndex += 1) offset += lines[lineIndex].length + 1
    index = end + 1
  }
  return blocks
}

export function OperationPanel({ repository, onSnapshot, onNotice, initialPath, onReturnToChanges, onClose }: OperationPanelProps) {
  const { t } = useAppTranslation()
  const operation = repository.operation
  const conflicts = operation?.conflicts ?? []
  const [selectedPath, setSelectedPath] = useState<string | null>(conflicts[0] ?? null)
  const [file, setFile] = useState<ConflictFileContent | null>(null)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [activeBlock, setActiveBlock] = useState(0)
  const [lastResolution, setLastResolution] = useState<{ block: number; strategy: ResolutionStrategy; from: number; to: number } | null>(null)
  const [resolvedRanges, setResolvedRanges] = useState<Array<{ from: number; to: number }>>([])
  const { confirm, confirmDialog } = useConfirmDialog()
  const editorRef = useRef<ConflictCodeEditorHandle>(null)
  const operationLock = useRef(false)

  useEffect(() => {
    if (initialPath && conflicts.includes(initialPath)) setSelectedPath(initialPath)
  }, [conflicts, initialPath])

  useEffect(() => {
    if (!selectedPath || !conflicts.includes(selectedPath)) setSelectedPath(conflicts[0] ?? null)
  }, [conflicts, selectedPath])

  useEffect(() => {
    if (!selectedPath) {
      setFile(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setActiveBlock(0)
    setLastResolution(null)
    setResolvedRanges([])
    loadConflictFile(repository.path, selectedPath)
      .then((value) => {
        if (!cancelled) {
          setFile(value)
          setDraft(value.result.replace(/\r\n/g, '\n'))
        }
      })
      .catch((error) => {
        if (!cancelled) onNotice(errorMessage(error))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [onNotice, reloadToken, repository.path, selectedPath])

  const runOperation = async (action: () => Promise<RepositorySnapshot>, success: MessageContent) => {
    if (!acquireOperationLock(operationLock)) return false
    setLoading(true)
    try {
      const snapshot = await action()
      onSnapshot(snapshot)
      setReloadToken((value) => value + 1)
      onNotice(snapshot.operation ? message(snapshot.operation.conflicts.length ? 'operations:panel.remainingConflicts' : 'operations:panel.canContinue', { operation: message(`operations:kind.${snapshot.operation.kind}`), count: snapshot.operation.conflicts.length }) : success)
      return true
    } catch (error) {
      onNotice(errorMessage(error))
      return false
    } finally {
      releaseOperationLock(operationLock)
      setLoading(false)
    }
  }

  const resolveFile = (strategy: ResolutionStrategy | 'delete' | 'result') => {
    if (!selectedPath) return
    void runOperation(
      () => resolveConflictFile(repository.path, selectedPath, strategy, strategy === 'result' ? draft : undefined),
      message('operations:panel.fileResolved', { path: selectedPath }),
    ).then((resolved) => { if (resolved) onReturnToChanges() })
  }
  const blocks = useMemo(() => parseConflictBlocks(draft), [draft])
  const resolveBlock = (blockIndex: number, strategy: ResolutionStrategy) => {
    if (!selectedPath || loading) return
    const currentBlocks = parseConflictBlocks(draft)
    const currentTarget = currentBlocks[blockIndex]
    setLoading(true)
    void resolveConflictBlock(repository.path, selectedPath, blockIndex, strategy)
      .then((value) => {
        const nextDraft = value.replace(/\r\n/g, '\n')
        const nextBlocks = parseConflictBlocks(nextDraft)
        const nextIndex = nextBlocks.length ? Math.min(blockIndex, nextBlocks.length - 1) : 0
        const nextTarget = nextBlocks[nextIndex]
        // Keep the viewport anchored to the resolved block; the result may be shorter than its markers.
        const focusOffset = Math.min(currentTarget?.offset ?? nextTarget?.offset ?? 0, nextDraft.length)
        const removedLength = currentTarget ? currentTarget.endOffset - currentTarget.offset : 0
        const resolvedLength = Math.max(0, nextDraft.length - (draft.length - removedLength))
        const resolvedTo = Math.min(focusOffset + resolvedLength, nextDraft.length)
        const delta = resolvedLength - removedLength
        const mappedRanges = resolvedRanges.map((range) => {
          if (range.to <= currentTarget.offset) return range
          if (range.from >= currentTarget.endOffset) return { from: range.from + delta, to: range.to + delta }
          return { from: Math.min(range.from, currentTarget.offset), to: Math.min(range.to, currentTarget.offset + resolvedLength) }
        })
        setDraft(nextDraft)
        setActiveBlock(nextIndex)
        setLastResolution({ block: blockIndex, strategy, from: focusOffset, to: resolvedTo })
        setResolvedRanges([...mappedRanges, { from: focusOffset, to: resolvedTo }])
        onNotice(message('operations:panel.blockResolved', { block: blockIndex + 1, strategy: message(resolutionKeys[strategy]) }))
      })
      .catch((error) => onNotice(errorMessage(error)))
      .finally(() => setLoading(false))
  }

  const jumpBlock = (direction: -1 | 1) => {
    if (!blocks.length) return
    const next = (activeBlock + direction + blocks.length) % blocks.length
    const target = blocks[next]
    setActiveBlock(next)
    requestAnimationFrame(() => editorRef.current?.focusBlock(target.offset, target.endOffset))
  }
  const jumpFile = (direction: -1 | 1) => {
    if (!conflicts.length) return
    const current = Math.max(0, conflicts.indexOf(selectedPath ?? conflicts[0]))
    setSelectedPath(conflicts[(current + direction + conflicts.length) % conflicts.length])
  }

  const currentStep = operation?.currentStep ?? 0
  const totalSteps = operation?.totalSteps ?? 0
  const completedSteps = useMemo(() => operation?.steps.filter((step) => step.status === 'applied').length ?? 0, [operation?.steps])

  if (!operation) return <section className="workspace-empty"><Check size={36}/><strong>{t('operations:panel.empty')}</strong><span>{t('operations:panel.emptyHint')}</span></section>

  return <section className={`operation-page workspace-page ${loading ? 'operation-busy' : ''}`} aria-busy={loading}>
    <div className="operation-heading operation-statusbar">
      <div className="operation-heading-title">
        <span className={`operation-kind operation-kind-${operation.kind}`}>{operation.kind === 'rebase' ? <GitPullRequest size={15}/> : operation.kind === 'merge' ? <GitMerge size={15}/> : <CircleAlert size={15}/>}</span>
        <strong>{operationLabel(operation.kind, t)}</strong>
        <span className="operation-status-meta">{operation.kind === 'rebase' ? t('operations:panel.commitProgress', { completed: completedSteps, total: operation.steps.length || totalSteps }) : t('operations:panel.conflictCount', { count: conflicts.length })}</span>
      </div>
      <div className="operation-actions">
        <Button variant="secondary" onClick={() => void runOperation(() => continueRepositoryOperation(repository.path), message('operations:panel.continued'))} disabled={loading || conflicts.length > 0 || operation.kind === 'conflict'}>{loading ? <RefreshCw className="spin" size={14}/> : <ChevronRight size={14}/>} {loading ? t('operations:panel.continuing') : operation.kind === 'rebase' ? t('operations:panel.continueRebase') : t('operations:panel.continue')}</Button>
        {(operation.kind === 'rebase' || operation.kind === 'cherry-pick') && <Button variant="secondary" onClick={() => void runOperation(() => skipRepositoryOperation(repository.path), message('operations:panel.skipped'))} disabled={loading}><SkipForward size={14}/>{t('operations:panel.skip')}</Button>}
        <Button variant="danger" onClick={() => void (async () => { if (await confirm({ title: message('operations:panel.abortTitle'), message: message('operations:panel.abortConfirm'), confirmLabel: message('operations:panel.abort'), variant: 'danger' })) await runOperation(() => abortRepositoryOperation(repository.path), message('operations:panel.aborted')) })()} disabled={loading || operation.kind === 'conflict'}><Square size={13}/>{t('operations:panel.abort')}</Button>
        {onClose && <Button variant="icon" onClick={onClose} disabled={loading} tooltip={t('operations:panel.backToGraph')} aria-label={t('operations:panel.backToGraph')}><X size={15}/></Button>}
      </div>
    </div>

    {operation.kind === 'rebase' && operation.steps.length > 0 && <details className="rebase-route"><summary><GitBranch size={13}/>{t('operations:panel.route')} <span>{currentStep && totalSteps ? t('operations:panel.step', { current: currentStep, total: totalSteps }) : t('operations:panel.preparing')}</span></summary><div className="rebase-steps">{operation.steps.map((step) => <div className={`rebase-step ${step.status}`} key={step.hash}><span className="rebase-step-line"/><span className="rebase-step-dot"/><div><strong>{step.title}</strong><small>{step.shortHash} · {step.author}</small></div><span className="rebase-step-status">{step.status === 'applied' ? t('operations:panel.applied') : step.status === 'current' ? t('operations:panel.currentConflict') : t('operations:panel.pending')}</span></div>)}</div></details>}

    <div className="conflict-workspace">
      <div className="conflict-editor inline-resolution">
        <div className="conflict-editor-toolbar"><strong>{file?.path ?? t('operations:panel.noConflictFile')}</strong><div className="conflict-navigation"><Tooltip content={t('operations:panel.previousFile')}><button onClick={() => jumpFile(-1)} disabled={!conflicts.length} aria-label={t('operations:panel.previousFile')}><ChevronLeft size={14}/></button></Tooltip><span>{conflicts.length ? `${Math.max(0, conflicts.indexOf(selectedPath ?? conflicts[0]) + 1)} / ${conflicts.length}` : '0 / 0'}</span><Tooltip content={t('operations:panel.nextFile')}><button onClick={() => jumpFile(1)} disabled={!conflicts.length} aria-label={t('operations:panel.nextFile')}><ChevronRight size={14}/></button></Tooltip></div><div className="conflict-navigation"><Tooltip content={t('operations:panel.previousBlock')}><button onClick={() => jumpBlock(-1)} disabled={!blocks.length} aria-label={t('operations:panel.previousBlock')}><ChevronLeft size={14}/></button></Tooltip><span>{blocks.length ? `${activeBlock + 1} / ${blocks.length}` : '0 / 0'}</span><Tooltip content={t('operations:panel.nextBlock')}><button onClick={() => jumpBlock(1)} disabled={!blocks.length} aria-label={t('operations:panel.nextBlock')}><ChevronRight size={14}/></button></Tooltip></div><Tooltip content={t('operations:panel.mergetoolHint')}><button className="icon-tool-button" onClick={() => { if (file) void runOperation(() => launchConflictMergetool(repository.path, file.path), message('operations:panel.mergetoolDone')) }} disabled={!file || loading} aria-label={t('operations:panel.mergetoolHint')}><ExternalLink size={14}/></button></Tooltip></div>
        {!file && <div className="conflict-editor-empty"><AlertTriangle size={30}/><strong>{conflicts.length ? t('operations:panel.selectConflict') : t('operations:panel.resolvedAll')}</strong><span>{conflicts.length ? t('operations:panel.navigateHint') : t('operations:panel.continueHint')}</span></div>}
        {file?.binary && <div className="conflict-binary"><AlertTriangle size={28}/><strong>{file.gitlink ? t('operations:panel.gitlink') : t('operations:panel.binary')}</strong><span>{t('operations:panel.binaryHint')}</span><div><Button variant="secondary" onClick={() => resolveFile('current')} disabled={loading || file.current == null}><RotateCcw size={13}/>{t('operations:panel.acceptCurrent')}</Button><Button variant="secondary" onClick={() => resolveFile('incoming')} disabled={loading || file.incoming == null}><GitPullRequest size={13}/>{t('operations:panel.acceptIncoming')}</Button><Button variant="danger" onClick={() => resolveFile('delete')} disabled={loading}><Trash2 size={13}/>{t('operations:panel.deleteFile')}</Button></div></div>}
        {file && !file.binary && <div className="conflict-result">
            <div className="conflict-result-heading">
              <div><strong>{t('operations:panel.result')}</strong><span>{lastResolution ? t('operations:panel.lastResolution', { block: lastResolution.block + 1, strategy: t(resolutionKeys[lastResolution.strategy]) }) : blocks.length ? t('operations:panel.blockProgress', { current: Math.min(activeBlock + 1, blocks.length), total: blocks.length }) : t('operations:panel.noMarkers')}</span></div>
              <div className="conflict-navigation"><Tooltip content={t('operations:panel.previousBlock')}><button onClick={() => jumpBlock(-1)} disabled={!blocks.length} aria-label={t('operations:panel.previousBlock')}><ChevronLeft size={14}/></button></Tooltip><span>{blocks.length ? `${activeBlock + 1} / ${blocks.length}` : '0 / 0'}</span><Tooltip content={t('operations:panel.nextBlock')}><button onClick={() => jumpBlock(1)} disabled={!blocks.length} aria-label={t('operations:panel.nextBlock')}><ChevronRight size={14}/></button></Tooltip></div>
              {blocks.length > 0 && <div className="conflict-active-actions"><Button variant="secondary" onClick={() => resolveBlock(activeBlock, 'current')} disabled={loading}>{t('operations:resolution.current')}</Button><Button variant="secondary" onClick={() => resolveBlock(activeBlock, 'incoming')} disabled={loading}>{t('operations:resolution.incoming')}</Button><Button variant="secondary" onClick={() => resolveBlock(activeBlock, 'both')} disabled={loading}>{t('operations:resolution.both')}</Button></div>}
            </div>
            <ConflictCodeEditor ref={editorRef} value={draft} filePath={file.path} blocks={blocks} activeBlock={activeBlock} resolvedRanges={resolvedRanges} disabled={loading} onChange={(value) => { setDraft(value); if (value !== draft) setLastResolution(null) }} onResolveBlock={resolveBlock} onSave={() => resolveFile('result')} saveLabel={blocks.length ? t('operations:panel.save') : t('operations:panel.markResolved')}/>
          </div>}
      </div>
    </div>
    {confirmDialog}
  </section>
}
