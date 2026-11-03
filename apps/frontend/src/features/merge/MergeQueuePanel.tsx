import { errorMessage, type MessageContent } from '../../i18n/messages'
import { useAppTranslation } from '../../i18n/useAppTranslation'
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, GitBranch, GitMerge, RefreshCw } from 'lucide-react'
import { loadMergeQueue, type MergeQueueSnapshot, type RepositorySnapshot } from '../../repository'
import { Button } from '../../components/Button'

export function MergeQueuePanel({ repository, onNotice, onSwitchBranch }: { repository: RepositorySnapshot | null; onNotice: (message: MessageContent) => void; onSwitchBranch: (branch: string) => Promise<void> }) {
  const { t, i18n } = useAppTranslation()
  const [queue, setQueue] = useState<MergeQueueSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const refresh = useCallback(async () => {
    if (!repository) return
    setLoading(true)
    try {
      setQueue(await loadMergeQueue(repository.path))
    } catch (error) {
      onNotice(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [onNotice, repository?.path])
  useEffect(() => { setQueue(null); void refresh() }, [refresh])

  if (!repository) return <section className="workspace-empty"><GitMerge size={34}/><strong>{t('operations:queue.title')}</strong><span>{t('operations:queue.openHint')}</span></section>
  return <section className="merge-panel workspace-page">
    <div className="workspace-page-heading"><div><span className="eyebrow">{t('operations:queue.title')}</span><h2>{t('operations:queue.mergeInto', { branch: repository.branch })}</h2><p>{t('operations:queue.description')}</p></div><Button variant="secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''}/>{loading ? t('operations:queue.refreshing') : t('operations:queue.refresh')}</Button></div>
    {queue?.conflicts.length ? <div className="conflict-card"><AlertTriangle size={17}/><div><strong>{t('operations:queue.conflictCount', { count: queue.conflicts.length })}</strong>{queue.conflicts.map((path) => <code key={path}>{path}</code>)}</div></div> : <div className="queue-healthy"><Check size={14}/>{t('operations:queue.healthy')}</div>}
    <div className="merge-list">
      <div className="merge-list-header"><span>{t('operations:queue.candidates')}</span><span>{t('operations:queue.ahead')}</span><span>{t('operations:queue.behind')}</span><span>{t('operations:queue.status')}</span><span/></div>
      {queue?.candidates.map((candidate) => <div className="merge-row" key={candidate.branch}><div><GitBranch size={14}/><strong>{candidate.branch}</strong></div><span className="ahead-count">+{new Intl.NumberFormat(i18n.resolvedLanguage).format(candidate.ahead)}</span><span>{new Intl.NumberFormat(i18n.resolvedLanguage).format(candidate.behind)}</span><span className={candidate.merged ? 'merged-state' : 'ready-state'}>{candidate.merged ? t('operations:queue.merged') : candidate.ahead ? t('operations:queue.ready') : t('operations:queue.noNewCommits')}</span><button onClick={() => void onSwitchBranch(candidate.branch)}>{t('operations:queue.switch')}</button></div>)}
      {!loading && queue?.candidates.length === 0 && <div className="workspace-hint"><GitMerge size={26}/><strong>{t('operations:queue.empty')}</strong><span>{t('operations:queue.emptyHint')}</span></div>}
    </div>
  </section>
}
