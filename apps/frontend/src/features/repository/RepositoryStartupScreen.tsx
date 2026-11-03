import { Tooltip } from '../../components/tooltip'
import { useAppTranslation } from '../../i18n/useAppTranslation'
import { FolderGit2, RefreshCw } from 'lucide-react'
import type { RecentRepository } from './repositoryPersistence'

export function RepositoryStartupScreen({ repository }: { repository: RecentRepository | null }) {
  const { t } = useAppTranslation()
  return <section className="repository-startup-loading" role="status" aria-live="polite" aria-label={t('repository:startup.opening')}>
    <div className="repository-startup-content">
      <img className="repository-startup-mark" src="/app-icon.svg" alt="" aria-hidden="true"/>
      <h1>Branchline</h1>
      <p>{repository ? t('repository:startup.restoring') : t('repository:startup.preparing')}</p>
      <div className="repository-startup-project">
        <div className="repository-startup-project-info">
          <span className="repository-startup-folder" aria-hidden="true"><FolderGit2 size={20}/></span>
          <div><Tooltip content={repository?.name}><strong>{repository?.name ?? t('repository:startup.opening')}</strong></Tooltip><Tooltip content={repository?.path}><code>{repository?.path ?? t('repository:startup.reading')}</code></Tooltip></div>
        </div>
        <div className="repository-startup-progress" aria-hidden="true"><span/></div>
      </div>
      <div className="repository-startup-status"><RefreshCw size={12} className="spin" aria-hidden="true"/><span>{t('repository:startup.history')}</span></div>
    </div>
  </section>
}
