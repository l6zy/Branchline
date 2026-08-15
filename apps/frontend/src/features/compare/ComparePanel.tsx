import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, ChevronDown, GitBranch, GitCompareArrows, Play, RefreshCw, Search } from 'lucide-react'
import { compareRepositoryRefs, loadRepositoryCompareFileDiff, type RepositoryComparison, type RepositorySnapshot } from '../../repository'
import { DiffPanel } from '../diff/DiffPanel'

type ReferenceSelectProps = {
  label: string
  value: string
  references: string[]
  localBranches: string[]
  remoteBranches: string[]
  onChange: (reference: string) => void
}

function ReferenceSelect({ label, value, references, localBranches, remoteBranches, onChange }: ReferenceSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleReferences = references.filter((reference) => reference.toLocaleLowerCase().includes(normalizedQuery))
  const canUseQuery = Boolean(query.trim()) && !references.some((reference) => reference.toLocaleLowerCase() === normalizedQuery)

  useEffect(() => {
    if (!open) return
    const closeWhenOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeWhenOutside)
    window.addEventListener('keydown', closeOnEscape)
    requestAnimationFrame(() => searchRef.current?.focus())
    return () => {
      document.removeEventListener('pointerdown', closeWhenOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const choose = (reference: string) => {
    onChange(reference)
    setOpen(false)
    setQuery('')
  }
  const referenceKind = (reference: string) => {
    if (localBranches.includes(reference)) return '本地'
    if (remoteBranches.includes(reference)) return '远程'
    return '提交'
  }

  return <div className="reference-field">
    <span>{label}</span>
    <div className={`reference-select ${open ? 'open' : ''}`} ref={rootRef}>
      <button type="button" className="reference-select-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <GitBranch size={15}/><strong>{value || '请选择引用'}</strong><ChevronDown size={14}/>
      </button>
      {open && <div className="reference-select-popover">
        <div className="reference-select-search"><Search size={14}/><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && canUseQuery) choose(query.trim()) }} placeholder="搜索分支或输入提交 Hash" spellCheck={false}/></div>
        <div className="reference-select-options" role="listbox" aria-label={label}>
          {visibleReferences.map((reference) => <button type="button" role="option" aria-selected={reference === value} className={`reference-select-option ${reference === value ? 'selected' : ''}`} key={reference} onClick={() => choose(reference)}>
            <span className="reference-option-icon"><GitBranch size={14}/></span><span className="reference-option-name">{reference}</span><small>{referenceKind(reference)}</small>{reference === value && <Check size={14}/>}</button>)}
          {canUseQuery && <button type="button" className="reference-select-option custom-reference" onClick={() => choose(query.trim())}><span className="reference-option-icon"><GitCompareArrows size={14}/></span><span className="reference-option-name">使用 “{query.trim()}”</span><small>提交引用</small></button>}
          {!visibleReferences.length && !canUseQuery && <div className="reference-select-empty">没有匹配的分支</div>}
        </div>
      </div>}
    </div>
  </div>
}

export function ComparePanel({ repository, initialBase, initialTarget, onNotice }: { repository: RepositorySnapshot | null; initialBase?: string; initialTarget?: string; onNotice: (message: string) => void }) {
  const refs = useMemo(() => repository ? Array.from(new Set([repository.branch, ...repository.branches, ...repository.remoteBranches, initialBase, initialTarget].filter((value): value is string => Boolean(value)))) : [], [initialBase, initialTarget, repository])
  const [base, setBase] = useState('')
  const [target, setTarget] = useState('')
  const [comparison, setComparison] = useState<RepositoryComparison | null>(null)
  const [loading, setLoading] = useState(false)
  const [wide, setWide] = useState(false)

  useEffect(() => {
    if (!repository) return
    const nextBase = initialBase ?? repository.branch
    const nextTarget = initialTarget ?? refs.find((reference) => reference !== nextBase) ?? repository.branch
    setBase(nextBase)
    setTarget(nextTarget)
    setComparison(null)
    if (!initialBase) return
    setLoading(true)
    compareRepositoryRefs(repository.path, nextBase, nextTarget)
      .then(setComparison)
      .catch((error) => onNotice(error instanceof Error ? error.message : String(error)))
      .finally(() => setLoading(false))
  }, [initialBase, initialTarget, repository?.path])

  const compare = async () => {
    if (!repository) return onNotice('Diff 比较需要先打开本地仓库')
    if (!base || !target) return onNotice('请选择用于比较的两个分支或提交')
    setLoading(true)
    try {
      setComparison(await compareRepositoryRefs(repository.path, base, target))
    } catch (error) {
      onNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }
  const loadRows = useCallback((filePath: string) => {
    if (!repository || !comparison) return Promise.resolve([])
    return loadRepositoryCompareFileDiff(repository.path, comparison.base, comparison.target, filePath)
  }, [comparison, repository?.path])

  if (!repository) return <section className="workspace-empty"><GitCompareArrows size={34}/><strong>比较分支或提交</strong><span>打开本地仓库后，可选择两个引用并查看完整 Diff。</span></section>
  return <section className="compare-panel workspace-page">
    <div className="workspace-page-heading"><div><span className="eyebrow">Diff 比较</span><h2>比较两个分支或提交</h2><p>直接比较两端提交快照，显示目标引用相对基础引用的全部变化。</p></div><button className="secondary-button" onClick={() => void compare()} disabled={loading}><Play size={14}/>{loading ? '正在比较…' : '开始比较'}</button></div>
    <div className="compare-controls">
      <ReferenceSelect label="基础引用" value={base} references={refs} localBranches={repository.branches} remoteBranches={repository.remoteBranches} onChange={(reference) => { setBase(reference); setComparison(null) }}/>
      <ArrowRight size={18}/>
      <ReferenceSelect label="目标引用" value={target} references={refs} localBranches={repository.branches} remoteBranches={repository.remoteBranches} onChange={(reference) => { setTarget(reference); setComparison(null) }}/>
      <button className="icon-button compare-swap" title="交换比较方向" onClick={() => { setBase(target); setTarget(base); setComparison(null) }}><RefreshCw size={15}/></button>
    </div>
    {!comparison && <div className="workspace-hint"><GitCompareArrows size={28}/><strong>选择引用后开始比较</strong><span>支持本地分支、远程分支以及仓库中的提交引用。</span></div>}
    {comparison && <div className="comparison-result">
      <div className="comparison-summary"><div><strong>{comparison.files.length}</strong><span>变更文件</span></div><div><strong>{comparison.ahead}</strong><span>领先提交</span></div><div><strong>{comparison.behind}</strong><span>落后提交</span></div><code>{comparison.base} → {comparison.target}</code></div>
      {comparison.files.length > 0
        ? <DiffPanel files={comparison.files} repositoryPath={repository.path} wide={wide} onWideChange={setWide} loadRows={loadRows} defaultFontSize={13} fontSizeStorageKey="branchline.compareDiffFontSize.v1"/>
        : <div className="comparison-empty"><GitCompareArrows size={30}/><strong>两个引用没有文件差异</strong><span>{comparison.ahead === 0 && comparison.behind === 0 ? '两端可能指向同一个提交或相同的文件快照。' : '提交历史不同，但最终文件内容一致。'}</span></div>}
    </div>}
  </section>
}
