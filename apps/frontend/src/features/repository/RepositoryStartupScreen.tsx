import { FolderGit2, RefreshCw } from 'lucide-react'
import type { RecentRepository } from './repositoryPersistence'

export function RepositoryStartupScreen({ repository }: { repository: RecentRepository | null }) {
  return <section className="repository-startup-loading" role="status" aria-live="polite" aria-label="正在打开仓库">
    <div className="repository-startup-content">
      <img className="repository-startup-mark" src="/app-icon.svg" alt="" aria-hidden="true"/>
      <h1>Branchline</h1>
      <p>{repository ? '正在恢复你的工作区' : '正在准备你的工作区'}</p>
      <div className="repository-startup-project">
        <div className="repository-startup-project-info">
          <span className="repository-startup-folder" aria-hidden="true"><FolderGit2 size={20}/></span>
          <div><strong title={repository?.name}>{repository?.name ?? '正在打开仓库'}</strong><code title={repository?.path}>{repository?.path ?? '读取仓库信息…'}</code></div>
        </div>
        <div className="repository-startup-progress" aria-hidden="true"><span/></div>
      </div>
      <div className="repository-startup-status"><RefreshCw size={12} className="spin" aria-hidden="true"/><span>正在读取分支与提交记录</span></div>
    </div>
  </section>
}
