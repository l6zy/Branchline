import { Tooltip } from '../../components/tooltip'
import { errorMessage, message, type MessageContent } from '../../i18n/messages'
import { useAppTranslation } from '../../i18n/useAppTranslation'
import { useState } from 'react'
import { Box, Check, ChevronRight, FolderGit2, GitFork, Lock, LockOpen, Plus, RefreshCw, RotateCcw, Tag, Trash2 } from 'lucide-react'
import {
  createRepositoryWorktree,
  deinitializeRepositorySubmodule,
  initializeRepositorySubmodule,
  pruneRepositoryWorktrees,
  removeRepositoryWorktree,
  setRepositoryWorktreeLock,
  syncRepositorySubmodules,
  updateRepositorySubmodule,
  type RepositorySnapshot,
} from '../../repository'
import { CreateWorktreeDialog } from './CreateWorktreeDialog'
import { submoduleAbsolutePath, type RepositoryStructureSelection } from './repositoryTree'
import { Button } from '../../components/Button'
import { useConfirmDialog } from '../../components/ConfirmDialog'

export type StructureView = 'structure' | 'tags'

const statusLabels = { ok: 'repository:status.ok', modified: 'repository:status.modified', uninitialized: 'repository:status.uninitialized', missing: 'repository:status.missing', unknown: 'repository:status.unknownShort' } as const
const samePath = (left: string, right: string | null | undefined) => Boolean(right) && left.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase() === right!.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>
}

export function RepositoryStructurePanel({ repository, activePath, view, query = '', selection, onOpenPath, onOpenTag, onSnapshot, onNotice }: {
  repository: RepositorySnapshot | null
  // The repository currently open in the workspace, which can differ from the structure repository.
  activePath: string | null
  view: StructureView
  query?: string
  selection: RepositoryStructureSelection
  onOpenPath: (path: string, kind: 'worktree' | 'submodule') => void
  onOpenTag: (tag: string) => void
  onSnapshot: (snapshot: RepositorySnapshot) => void
  onNotice: (message: MessageContent) => void
}) {
  const { t, i18n } = useAppTranslation()
  const formatNumber = new Intl.NumberFormat(i18n.resolvedLanguage).format
  const [busy, setBusy] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const { confirm, confirmDialog } = useConfirmDialog()
  if (!repository) return <section className="workspace-empty"><FolderGit2 size={34}/><strong>{t('repository:structure.title')}</strong><span>{t('repository:structure.openFirst')}</span></section>

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleTags = repository.tags.filter((tag) => !normalizedQuery || tag.toLocaleLowerCase().includes(normalizedQuery))

  if (view === 'tags') return <section className="structure-panel workspace-page">
    <div className="workspace-page-heading"><div><span className="eyebrow">{t('repository:structure.title')}</span><h2>{t('repository:tags.title')}</h2><p>{t('repository:tags.description')}</p></div></div>
    <div className="structure-list">{visibleTags.map((tag) => <Tooltip content={t('repository:tags.locate', { tag })} key={tag}><button className="tag-row" onClick={() => onOpenTag(tag)}><span className="structure-icon"><Tag size={15}/></span><span><strong>{tag}</strong></span><ChevronRight size={15}/></button></Tooltip>)}{repository.tags.length === 0 && <div className="workspace-hint"><Tag size={26}/><strong>{t('repository:tags.empty')}</strong></div>}{repository.tags.length > 0 && visibleTags.length === 0 && <div className="workspace-hint"><Tag size={26}/><strong>{t('repository:tags.noMatch')}</strong><span>{t('repository:tags.searchHint')}</span></div>}</div>
  </section>

  const run = async (key: string, action: () => Promise<RepositorySnapshot>, notice: MessageContent) => {
    setBusy(key)
    try {
      const snapshot = await action()
      onSnapshot(snapshot)
      onNotice(notice)
      return true
    } catch (error) {
      onNotice(errorMessage(error))
      return false
    } finally {
      setBusy(null)
    }
  }
  const worktree = selection.kind === 'worktree' ? repository.worktrees.find((item) => samePath(item.path, selection.path)) : undefined
  const submodule = selection.kind === 'submodule' ? repository.submodules.find((item) => item.path.replace(/\\/g, '/') === selection.path.replace(/\\/g, '/')) : undefined
  const folderSubmodules = selection.kind === 'submodule-folder' ? repository.submodules.filter((item) => item.path.replace(/\\/g, '/').startsWith(`${selection.path.replace(/\\/g, '/')}/`)) : []
  const currentWorktree = worktree ? samePath(worktree.path, activePath ?? repository.path) : false
  // Git refuses to lock or remove the main worktree, so those actions stay disabled for it.
  const primaryWorktree = worktree ? samePath(worktree.path, repository.path) : false
  const currentSubmodule = submodule ? samePath(submoduleAbsolutePath(repository.path, submodule.path), activePath) : false
  const availableSubmodule = submodule && submodule.status !== 'uninitialized' && submodule.status !== 'missing'
  const title = selection.kind === 'worktrees' ? t('repository:worktrees') : selection.kind === 'worktree' ? (worktree?.path.split(/[\\/]/).pop() || t('repository:worktree.singular')) : selection.kind === 'submodules' ? t('repository:submodules.title') : selection.kind === 'submodule-folder' ? selection.path : selection.kind === 'submodule' ? (submodule?.path || t('repository:submodules.singular')) : repository.name
  const description = selection.kind === 'worktrees' ? t('repository:structure.worktreesHint') : selection.kind === 'submodules' ? t('repository:structure.submodulesHint') : selection.kind === 'worktree' ? t('repository:structure.worktreeHint') : selection.kind === 'submodule' ? t('repository:structure.submoduleHint') : selection.kind === 'submodule-folder' ? t('repository:structure.folderHint') : t('repository:structure.rootHint')
  const removeWorktree = async (path: string) => {
    if (await confirm({ title: message('repository:worktree.remove'), message: message('repository:worktree.removeConfirm', { path }), confirmLabel: message('repository:worktree.forceRemove'), variant: 'danger' })) await run('remove', () => removeRepositoryWorktree(repository.path, path), message('repository:worktree.removed'))
  }
  const deinitializeSubmodule = async (path: string) => {
    if (await confirm({ title: message('repository:submodules.deinitialize'), message: message('repository:submodules.deinitializeConfirm', { path }), confirmLabel: message('repository:submodules.deinitializeAction'), variant: 'danger' })) await run('deinit', () => deinitializeRepositorySubmodule(repository.path, path), message('repository:submodules.deinitialized'))
  }

  return <section className="structure-panel workspace-page repository-structure-workspace">
    <div className="workspace-page-heading"><div><span className="eyebrow">{t('repository:structure.title')}</span><h2>{title}</h2><p>{description}</p></div>{selection.kind === 'worktrees' && <Button variant="primary" className="structure-heading-action" onClick={() => setCreateOpen(true)}><Plus size={14}/>{t('repository:worktree.create')}</Button>}</div>

    {selection.kind === 'root' && <div className="structure-detail-grid">
      <article className="structure-detail-card"><span className="structure-icon"><FolderGit2 size={18}/></span><h3>{repository.name}</h3><dl><DetailField label={t('repository:structure.path')}><code>{repository.path}</code></DetailField><DetailField label={t('repository:structure.currentBranch')}><strong>{repository.branch}</strong></DetailField><DetailField label={t('repository:worktrees')}>{formatNumber(repository.worktreeCount)}</DetailField><DetailField label={t('repository:submodules.title')}>{formatNumber(repository.submoduleCount)}</DetailField><DetailField label={t('repository:structure.sync')}>{t('repository:structure.syncCounts', { ahead: formatNumber(repository.ahead), behind: formatNumber(repository.behind) })}</DetailField></dl></article>
      <article className="structure-summary-card"><h3>{t('repository:structure.summary')}</h3><div><span>{t('repository:structure.changes')}</span><strong>{formatNumber(repository.files.length)}</strong></div><div><span>{t('repository:structure.lockedWorktrees')}</span><strong>{formatNumber(repository.worktrees.filter((item) => item.locked).length)}</strong></div><div><span>{t('repository:structure.unhealthySubmodules')}</span><strong>{formatNumber(repository.submodules.filter((item) => item.status !== 'ok').length)}</strong></div></article>
    </div>}

    {selection.kind === 'worktrees' && <div className="structure-detail-grid">
      <article className="structure-detail-card"><span className="structure-icon"><GitFork size={18}/></span><h3>{t('repository:worktrees')}</h3><dl><DetailField label={t('repository:structure.total')}>{formatNumber(repository.worktrees.length)}</DetailField><DetailField label={t('repository:worktree.detached')}>{formatNumber(repository.worktrees.filter((item) => !item.branch).length)}</DetailField><DetailField label={t('repository:worktree.locked')}>{formatNumber(repository.worktrees.filter((item) => item.locked).length)}</DetailField><DetailField label={t('repository:worktree.prunable')}>{formatNumber(repository.worktrees.filter((item) => item.prunable).length)}</DetailField></dl><div className="structure-actions"><Button variant="primary" onClick={() => setCreateOpen(true)}><Plus size={14}/>{t('repository:worktree.create')}</Button><Button variant="secondary" disabled={busy !== null} onClick={() => void run('prune', () => pruneRepositoryWorktrees(repository.path), message('repository:worktree.pruned'))}><RotateCcw size={14}/>{busy === 'prune' ? t('repository:worktree.pruning') : t('repository:worktree.prune')}</Button></div></article>
    </div>}

    {selection.kind === 'worktree' && worktree && <div className="structure-detail-grid"><article className="structure-detail-card"><span className="structure-icon"><GitFork size={18}/></span><h3>{worktree.path.split(/[\\/]/).pop() || worktree.path}</h3><dl><DetailField label={t('repository:structure.directory')}><code>{worktree.path}</code></DetailField><DetailField label={t('repository:branches')}>{worktree.branch ?? t('repository:worktree.detachedHead')}</DetailField><DetailField label={t('repository:structure.head')}><code>{worktree.head ?? '—'}</code></DetailField><DetailField label={t('repository:structure.status')}>{currentWorktree ? t('repository:tree.currentWorktree') : worktree.locked ? t('repository:worktree.lockedReason', { reason: worktree.locked }) : worktree.prunable ? t('repository:worktree.prunableReason', { reason: worktree.prunable }) : primaryWorktree ? t('repository:worktree.main') : t('repository:worktree.available')}</DetailField></dl><div className="structure-actions"><Button variant="primary" disabled={currentWorktree} onClick={() => onOpenPath(worktree.path, 'worktree')}><FolderGit2 size={14}/>{currentWorktree ? t('repository:manager.current') : t('repository:openRepository')}</Button><Button variant="secondary" disabled={busy !== null || currentWorktree || primaryWorktree} onClick={() => void run('lock', () => setRepositoryWorktreeLock(repository.path, worktree.path, !worktree.locked), worktree.locked ? message('repository:worktree.unlocked') : message('repository:worktree.lockedNotice'))}>{worktree.locked ? <LockOpen size={14}/> : <Lock size={14}/>} {worktree.locked ? t('repository:worktree.unlock') : t('repository:worktree.lock')}</Button><Button variant="danger" disabled={busy !== null || currentWorktree || primaryWorktree} onClick={() => void removeWorktree(worktree.path)}><Trash2 size={14}/>{t('repository:remove')}</Button></div></article></div>}

    {(selection.kind === 'submodules' || selection.kind === 'submodule-folder') && <div className="structure-detail-grid"><article className="structure-detail-card"><span className="structure-icon"><Box size={18}/></span><h3>{selection.kind === 'submodules' ? t('repository:submodules.title') : selection.path}</h3><dl><DetailField label={t('repository:structure.total')}>{formatNumber(selection.kind === 'submodules' ? repository.submodules.length : folderSubmodules.length)}</DetailField><DetailField label={t('repository:status.ok')}>{formatNumber((selection.kind === 'submodules' ? repository.submodules : folderSubmodules).filter((item) => item.status === 'ok').length)}</DetailField><DetailField label={t('repository:status.modified')}>{formatNumber((selection.kind === 'submodules' ? repository.submodules : folderSubmodules).filter((item) => item.status === 'modified').length)}</DetailField><DetailField label={t('repository:submodules.unavailable')}>{formatNumber((selection.kind === 'submodules' ? repository.submodules : folderSubmodules).filter((item) => item.status === 'uninitialized' || item.status === 'missing').length)}</DetailField></dl><div className="structure-actions"><Button variant="primary" disabled={busy !== null} onClick={() => void run('update-all', () => updateRepositorySubmodule(repository.path), message('repository:submodules.updatedAll'))}><RefreshCw className={busy === 'update-all' ? 'spin' : ''} size={14}/>{busy === 'update-all' ? t('repository:submodules.updating') : t('repository:submodules.updateRecursive')}</Button><Button variant="secondary" disabled={busy !== null} onClick={() => void run('sync', () => syncRepositorySubmodules(repository.path), message('repository:submodules.synced'))}><RotateCcw size={14}/>{t('repository:submodules.sync')}</Button></div></article></div>}

    {selection.kind === 'submodule' && submodule && <div className="structure-detail-grid"><article className="structure-detail-card"><span className="structure-icon"><Box size={18}/></span><h3>{submodule.path}</h3><dl><DetailField label={t('repository:structure.relativePath')}><code>{submodule.path}</code></DetailField><DetailField label={t('repository:structure.absolutePath')}><code>{submoduleAbsolutePath(repository.path, submodule.path)}</code></DetailField><DetailField label={t('repository:submodules.recordedCommit')}><code>{submodule.hash}</code></DetailField><DetailField label={t('repository:submodules.trackingBranch')}>{submodule.branch ?? t('repository:submodules.fixedCommit')}</DetailField><DetailField label={t('repository:structure.status')}><strong>{currentSubmodule ? t('repository:manager.current') : t(statusLabels[submodule.status])}</strong></DetailField></dl><div className="structure-actions"><Button variant="primary" disabled={!availableSubmodule || currentSubmodule} onClick={() => onOpenPath(submoduleAbsolutePath(repository.path, submodule.path), 'submodule')}><FolderGit2 size={14}/>{currentSubmodule ? t('repository:manager.current') : t('repository:openRepository')}</Button>{(submodule.status === 'uninitialized' || submodule.status === 'missing') && <Button variant="secondary" disabled={busy !== null} onClick={() => void run('init', () => initializeRepositorySubmodule(repository.path, submodule.path), message('repository:submodules.initialized'))}><Plus size={14}/>{t('repository:submodules.initialize')}</Button>}<Button variant="secondary" disabled={busy !== null} onClick={() => void run('update', () => updateRepositorySubmodule(repository.path, submodule.path), message('repository:submodules.updated'))}><RefreshCw className={busy === 'update' ? 'spin' : ''} size={14}/>{t('repository:submodules.update')}</Button><Button variant="secondary" disabled={busy !== null} onClick={() => void run('sync', () => syncRepositorySubmodules(repository.path), message('repository:submodules.synced'))}><RotateCcw size={14}/>{t('repository:submodules.sync')}</Button><Button variant="danger" disabled={busy !== null || submodule.status === 'uninitialized'} onClick={() => void deinitializeSubmodule(submodule.path)}><Trash2 size={14}/>{t('repository:submodules.deinitializeAction')}</Button></div></article></div>}

    {((selection.kind === 'worktree' && !worktree) || (selection.kind === 'submodule' && !submodule)) && <div className="workspace-hint"><FolderGit2 size={26}/><strong>{t('repository:structure.itemMissing')}</strong><span>{t('repository:structure.selectAgain')}</span></div>}
    {createOpen && (
      <CreateWorktreeDialog
        branches={repository.branches}
        busy={busy === 'create'}
        onClose={() => setCreateOpen(false)}
        onSubmit={async (path, branch, createBranch) => {
          if (await run('create', () => createRepositoryWorktree(repository.path, path, branch, createBranch), message('repository:worktree.created', { path }))) setCreateOpen(false)
        }}
      />
    )}
    {confirmDialog}
  </section>
}
