import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, CircleAlert, ExternalLink, GitBranch, GitMerge, GitPullRequest, RotateCcw, SkipForward, Square, Trash2, X } from 'lucide-react'
import { ConflictCodeEditor, type ConflictCodeEditorHandle } from './ConflictCodeEditor'
import { abortRepositoryOperation, continueRepositoryOperation, launchConflictMergetool, loadConflictFile, resolveConflictBlock, resolveConflictFile, skipRepositoryOperation, type ConflictFileContent, type RepositorySnapshot } from '../../repository'
import { Button } from '../../components/Button'

type OperationPanelProps = {
  repository: RepositorySnapshot
  onSnapshot: (snapshot: RepositorySnapshot) => void
  onNotice: (message: string) => void
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

const resolutionLabels: Record<ResolutionStrategy, string> = {
  current: '采用当前更改',
  incoming: '采用传入的更改',
  both: '保留双方更改',
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
  const editorRef = useRef<ConflictCodeEditorHandle>(null)

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
        if (!cancelled) onNotice(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [onNotice, reloadToken, repository.path, selectedPath])

  const runOperation = async (action: () => Promise<RepositorySnapshot>, success: string) => {
    setLoading(true)
    try {
      const snapshot = await action()
      onSnapshot(snapshot)
      setReloadToken((value) => value + 1)
      onNotice(snapshot.operation ? `${snapshot.operation.label}：${snapshot.operation.conflicts.length ? `还有 ${snapshot.operation.conflicts.length} 个冲突` : '可以继续操作'}` : success)
      return true
    } catch (error) {
      onNotice(error instanceof Error ? error.message : String(error))
      return false
    } finally {
      setLoading(false)
    }
  }

  const resolveFile = (strategy: ResolutionStrategy | 'delete' | 'result') => {
    if (!selectedPath) return
    void runOperation(
      () => resolveConflictFile(repository.path, selectedPath, strategy, strategy === 'result' ? draft : undefined),
      `已解决 ${selectedPath}`,
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
        onNotice(`已应用第 ${blockIndex + 1} 个冲突块：${resolutionLabels[strategy]}`)
      })
      .catch((error) => onNotice(error instanceof Error ? error.message : String(error)))
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

  if (!operation) return <section className="workspace-empty"><Check size={36}/><strong>没有待处理的 Git 操作</strong><span>合并、变基或 Cherry-pick 产生冲突后，会在这里逐文件处理。</span></section>

  return <section className="operation-page workspace-page">
    <div className="operation-heading operation-statusbar">
      <div className="operation-heading-title">
        <span className={`operation-kind operation-kind-${operation.kind}`}>{operation.kind === 'rebase' ? <GitPullRequest size={15}/> : operation.kind === 'merge' ? <GitMerge size={15}/> : <CircleAlert size={15}/>}</span>
        <strong>{operation.label}</strong>
        <span className="operation-status-meta">{operation.kind === 'rebase' ? `${completedSteps} / ${operation.steps.length || totalSteps} 个提交` : `${conflicts.length} 个冲突文件`}</span>
      </div>
      <div className="operation-actions">
        <Button variant="secondary" onClick={() => void runOperation(() => continueRepositoryOperation(repository.path), '操作已继续')} disabled={loading || conflicts.length > 0 || operation.kind === 'conflict'}><ChevronRight size={14}/>{operation.kind === 'rebase' ? '继续变基' : '继续操作'}</Button>
        {(operation.kind === 'rebase' || operation.kind === 'cherry-pick') && <Button variant="secondary" onClick={() => void runOperation(() => skipRepositoryOperation(repository.path), '已跳过当前提交')} disabled={loading}><SkipForward size={14}/>跳过提交</Button>}
        <Button variant="danger" onClick={() => { if (window.confirm('确定中止当前 Git 操作？未完成的合并或变基将被撤销。')) void runOperation(() => abortRepositoryOperation(repository.path), '已中止 Git 操作') }} disabled={loading || operation.kind === 'conflict'}><Square size={13}/>中止</Button>
        {onClose && <Button variant="icon" onClick={onClose} title="返回提交图谱"><X size={15}/></Button>}
      </div>
    </div>

    {operation.kind === 'rebase' && operation.steps.length > 0 && <details className="rebase-route"><summary><GitBranch size={13}/>变基线路 <span>{currentStep && totalSteps ? `第 ${currentStep} / ${totalSteps} 步` : '准备中'}</span></summary><div className="rebase-steps">{operation.steps.map((step) => <div className={`rebase-step ${step.status}`} key={step.hash}><span className="rebase-step-line"/><span className="rebase-step-dot"/><div><strong>{step.title}</strong><small>{step.shortHash} · {step.author}</small></div><span className="rebase-step-status">{step.status === 'applied' ? '已完成' : step.status === 'current' ? '当前冲突' : '待处理'}</span></div>)}</div></details>}

    <div className="conflict-workspace">
      <div className="conflict-editor inline-resolution">
        <div className="conflict-editor-toolbar"><strong>{file?.path ?? '没有待处理的冲突文件'}</strong><div className="conflict-navigation"><button onClick={() => jumpFile(-1)} disabled={!conflicts.length} title="上一个冲突文件"><ChevronLeft size={14}/></button><span>{conflicts.length ? `${Math.max(0, conflicts.indexOf(selectedPath ?? conflicts[0]) + 1)} / ${conflicts.length}` : '0 / 0'}</span><button onClick={() => jumpFile(1)} disabled={!conflicts.length} title="下一个冲突文件"><ChevronRight size={14}/></button></div><div className="conflict-navigation"><button onClick={() => jumpBlock(-1)} disabled={!blocks.length} title="上一处冲突"><ChevronLeft size={14}/></button><span>{blocks.length ? `${activeBlock + 1} / ${blocks.length}` : '0 / 0'}</span><button onClick={() => jumpBlock(1)} disabled={!blocks.length} title="下一处冲突"><ChevronRight size={14}/></button></div><button className="icon-tool-button" onClick={() => { if (file) void runOperation(() => launchConflictMergetool(repository.path, file.path), '外部合并工具已完成') }} disabled={!file || loading} title="使用已配置的 Git 外部合并工具"><ExternalLink size={14}/></button></div>
        {!file && <div className="conflict-editor-empty"><AlertTriangle size={30}/><strong>{conflicts.length ? '请从工作区变更的“冲突”分组打开文件' : '所有冲突已解决'}</strong><span>{conflicts.length ? '也可使用上方按钮在冲突文件之间切换。' : '点击“继续”让 Git 进入下一步。'}</span></div>}
        {file?.binary && <div className="conflict-binary"><AlertTriangle size={28}/><strong>{file.gitlink ? '此文件是 Gitlink / Submodule 引用' : '此文件包含二进制内容'}</strong><span>无法进行文本编辑，请选择一侧、删除文件或使用外部合并工具。</span><div><Button variant="secondary" onClick={() => resolveFile('current')} disabled={loading || file.current == null}><RotateCcw size={13}/>采用当前</Button><Button variant="secondary" onClick={() => resolveFile('incoming')} disabled={loading || file.incoming == null}><GitPullRequest size={13}/>采用对方</Button><Button variant="danger" onClick={() => resolveFile('delete')} disabled={loading}><Trash2 size={13}/>删除文件</Button></div></div>}
        {file && !file.binary && <div className="conflict-result">
            <div className="conflict-result-heading">
              <div><strong>合并结果</strong><span>{lastResolution ? `刚刚已应用第 ${lastResolution.block + 1} 个冲突块：${resolutionLabels[lastResolution.strategy]}` : blocks.length ? `第 ${Math.min(activeBlock + 1, blocks.length)} / ${blocks.length} 个冲突块` : '没有未处理的冲突标记'}</span></div>
              <div className="conflict-navigation"><button onClick={() => jumpBlock(-1)} disabled={!blocks.length} title="上一处冲突"><ChevronLeft size={14}/></button><span>{blocks.length ? `${activeBlock + 1} / ${blocks.length}` : '0 / 0'}</span><button onClick={() => jumpBlock(1)} disabled={!blocks.length} title="下一处冲突"><ChevronRight size={14}/></button></div>
              {blocks.length > 0 && <div className="conflict-active-actions"><Button variant="secondary" onClick={() => resolveBlock(activeBlock, 'current')} disabled={loading}>采用当前更改</Button><Button variant="secondary" onClick={() => resolveBlock(activeBlock, 'incoming')} disabled={loading}>采用传入的更改</Button><Button variant="secondary" onClick={() => resolveBlock(activeBlock, 'both')} disabled={loading}>保留双方更改</Button></div>}
            </div>
            <ConflictCodeEditor ref={editorRef} value={draft} filePath={file.path} blocks={blocks} activeBlock={activeBlock} resolvedRanges={resolvedRanges} disabled={loading} onChange={(value) => { setDraft(value); if (value !== draft) setLastResolution(null) }} onResolveBlock={resolveBlock} onSave={() => resolveFile('result')} saveLabel={blocks.length ? '保存结果' : '标记已解决'}/>
          </div>}
      </div>
    </div>
  </section>
}
