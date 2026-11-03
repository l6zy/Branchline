import { Tooltip } from '../../components/tooltip'
import { message, errorMessage, type MessageContent } from '../../i18n/messages'
import { useAppTranslation } from '../../i18n/useAppTranslation'
import { useState } from 'react'
import { Archive, Check, CornerDownLeft, GitCommitHorizontal, Plus, Trash2 } from 'lucide-react'
import {
  applyRepositoryStash,
  createRepositoryStash,
  dropRepositoryStash,
  type RepositorySnapshot,
} from '../../repository'
import { formatLocalDateTime } from '../../dateTime'
import { Button } from '../../components/Button'
import { useConfirmDialog } from '../../components/ConfirmDialog'

export function StashPage({ repository, onSelectStash, onSnapshot, onNotice }: { repository: RepositorySnapshot | null; onSelectStash: (reference: string) => void; onSnapshot: (snapshot: RepositorySnapshot) => void; onNotice: (message: MessageContent) => void }) {
  const { t, i18n } = useAppTranslation()
  const [stashMessage, setMessage] = useState('')
  const [includeUntracked, setIncludeUntracked] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const { confirm, confirmDialog } = useConfirmDialog()
  const run = async (key: string, operation: () => Promise<RepositorySnapshot>, notice: MessageContent) => {
    if (!repository) return onNotice(message('operations:stash.openRequired'))
    setBusy(key)
    try {
      const snapshot = await operation()
      onSnapshot(snapshot)
      onNotice(snapshot.operation
        ? message('operations:stash.conflicts', { operation: message(`operations:kind.${snapshot.operation.kind}`), count: snapshot.operation.conflicts.length })
        : notice)
    } catch (error) {
      onNotice(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }
  const selectStash = (reference: string) => {
    onSelectStash(reference)
  }
  const dropStash = async (reference: string) => {
    if (!await confirm({ title: message('operations:stash.deleteTitle'), message: message('operations:stash.deleteConfirm', { reference }), confirmLabel: message('operations:stash.delete'), variant: 'danger' })) return
    await run(`drop-${reference}`, () => dropRepositoryStash(repository!.path, reference), message('operations:stash.deleted', { reference }))
  }

  return <section className="workspace-page stash-page">
    <div className="stash-workspace stash-manager">
      <div className="stash-control-pane">
        <div className="stash-compose"><input value={stashMessage} onChange={(event) => setMessage(event.target.value)} placeholder={t('operations:stash.placeholder')}/><label><input type="checkbox" checked={includeUntracked} onChange={(event) => setIncludeUntracked(event.target.checked)}/>{t('operations:stash.includeUntracked')}</label><Button variant="primary" disabled={!repository || busy !== null} onClick={() => void run('create', () => createRepositoryStash(repository!.path, stashMessage, includeUntracked), message('operations:stash.saved'))}><Plus size={14}/>{busy === 'create' ? t('operations:stash.saving') : t('operations:stash.create')}</Button></div>
        <div className="stash-list-heading"><strong>{t('operations:stash.savedWorktrees')}</strong><span>{new Intl.NumberFormat(i18n.resolvedLanguage).format(repository?.stashes.length ?? 0)}</span></div>
        <div className="stash-list">{repository?.stashes.map((stash) => <article key={stash.reference}>
          <Tooltip content={t('operations:stash.viewGraph')}><button className="stash-select" aria-label={t('operations:stash.viewGraph')} onClick={() => selectStash(stash.reference)} ><span className="stash-icon"><Archive size={15}/></span><span><strong>{stash.message}</strong><small>{stash.reference} · {stash.author} · {formatLocalDateTime(stash.time, true, i18n.resolvedLanguage === 'en-US' ? 'en-US' : 'zh-CN')}</small></span></button></Tooltip>
          <div className="stash-actions"><Button variant="icon" disabled={busy !== null} tooltip={t('operations:stash.apply')} aria-label={t('operations:stash.apply')} onClick={() => void run(`apply-${stash.reference}`, () => applyRepositoryStash(repository.path, stash.reference, false), message('operations:stash.applied', { reference: stash.reference }))}><Check size={13}/></Button><Button variant="icon" disabled={busy !== null} tooltip={t('operations:stash.pop')} aria-label={t('operations:stash.pop')} onClick={() => void run(`pop-${stash.reference}`, () => applyRepositoryStash(repository.path, stash.reference, true), message('operations:stash.popped', { reference: stash.reference }))}><CornerDownLeft size={13}/></Button><Button variant="danger" disabled={busy !== null} tooltip={t('operations:stash.delete')} aria-label={t('operations:stash.delete')} onClick={() => void dropStash(stash.reference)}><Trash2 size={13}/></Button></div>
        </article>)}
          {repository && repository.stashes.length === 0 && <div className="workspace-hint"><Archive size={26}/><strong>{t('operations:stash.empty')}</strong><span>{t('operations:stash.emptyHint')}</span></div>}
          {!repository && <div className="workspace-hint"><Archive size={26}/><strong>{t('operations:stash.openRepository')}</strong></div>}
        </div>
      </div>
      <div className="stash-graph-handoff">
        <GitCommitHorizontal size={32}/><strong>{t('operations:stash.graphTitle')}</strong><span>{t('operations:stash.graphHint')}</span>
      </div>
      {confirmDialog}
    </div>
  </section>
}
