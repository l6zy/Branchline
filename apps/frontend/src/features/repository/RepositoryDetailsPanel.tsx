import { Tooltip } from '../../components/tooltip'
import { errorMessage, renderMessage, type MessageContent } from '../../i18n/messages'
import { useAppTranslation } from '../../i18n/useAppTranslation'
import { useEffect, useState } from 'react'
import { AlertTriangle, Box, Check, Code2, FileText, FolderGit2, GitBranch, Globe, RefreshCw, Star } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '../../components/Button'
import { loadRepositoryDetails, loadRepositoryReadme, type RepositoryDetails, type RepositoryReadme } from '../../repository'
import type { CatalogRepository } from './repositoryCatalog'

type DetailTab = 'branches' | 'submodules' | 'remotes' | 'readme'
const statusLabels = { ok: 'repository:status.initialized', modified: 'repository:status.modified', uninitialized: 'repository:status.uninitialized', missing: 'repository:status.conflict', unknown: 'repository:status.unknown' } as const

export function RepositoryDetailsPanel({ item, opening, onOpen, onVscode, onToggleFavorite }: {
  item: CatalogRepository
  opening: boolean
  onOpen: (path: string) => void
  onVscode: (path: string) => void
  onToggleFavorite: (item: CatalogRepository) => void
}) {
  const { t, i18n } = useAppTranslation()
  const formatNumber = new Intl.NumberFormat(i18n.resolvedLanguage).format
  const [tab, setTab] = useState<DetailTab>('branches')
  const [details, setDetails] = useState<RepositoryDetails | null>(null)
  const [readme, setReadme] = useState<RepositoryReadme | null | undefined>(undefined)
  const [error, setError] = useState<MessageContent | null>(null)
  const [readmeError, setReadmeError] = useState<MessageContent | null>(null)
  const [version, setVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setDetails(null)
    setReadme(undefined)
    setReadmeError(null)
    void loadRepositoryDetails(item.path).then((value) => { if (!cancelled) setDetails(value) })
      .catch((error) => { if (!cancelled) setError(errorMessage(error)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [item.path, version])

  useEffect(() => {
    if (tab !== 'readme' || !details || readme !== undefined) return
    let cancelled = false
    void loadRepositoryReadme(item.path).then((value) => { if (!cancelled) setReadme(value) })
      .catch((error) => { if (!cancelled) setReadmeError(errorMessage(error)) })
    return () => { cancelled = true }
  }, [details, item.path, readme, tab])

  const tabs = [
    { id: 'branches', label: t('repository:branches'), icon: GitBranch, count: details ? details.branches.length + details.remoteBranches.length : undefined },
    { id: 'submodules', label: t('repository:submodules.singular'), icon: Box, count: details?.submodules.length },
    { id: 'remotes', label: t('repository:remotes'), icon: Globe, count: details?.remotes.length },
    { id: 'readme', label: t('repository:readme.title'), icon: FileText },
  ] as const

  return <aside className="repository-details" aria-label={t('repository:details.title')}>
    <header className="repository-detail-heading"><span className="repository-detail-icon"><FolderGit2 size={23}/></span><div><h2>{item.name}</h2><Tooltip content={item.path}><p>{item.path}</p></Tooltip></div><Button variant="icon" tooltip={item.favorite ? t('repository:unfavorite') : t('repository:favorite')} aria-label={item.favorite ? t('repository:unfavorite') : t('repository:favorite')} aria-pressed={item.favorite} onClick={() => onToggleFavorite(item)}><Star size={17} fill={item.favorite ? 'currentColor' : 'none'}/></Button><Button variant="icon" tooltip={t('repository:details.refresh')} aria-label={t('repository:details.refresh')} disabled={loading} onClick={() => setVersion((value) => value + 1)}><RefreshCw size={16} className={loading ? 'spin' : ''}/></Button></header>
    <div className="repository-detail-actions"><Button variant="primary" disabled={opening || loading || Boolean(error)} onClick={() => onOpen(item.path)}><FolderOpenIcon/>{item.current ? t('repository:details.returnCurrent') : t('repository:openRepository')}</Button><Button variant="secondary" onClick={() => onVscode(item.path)}><Code2 size={14}/>{t('repository:openVscode')}</Button>{details && <span className="repository-branch-chip"><GitBranch size={13}/>{details.branch || t('repository:details.noCommits')}</span>}</div>
    <div className="repository-detail-tabs" role="tablist" aria-label={t('repository:details.information')}>{tabs.map(({ id, label, icon: Icon, ...rest }) => <button key={id} role="tab" id={`repository-tab-${id}`} aria-selected={tab === id} aria-controls="repository-detail-content" onClick={() => setTab(id)}><Icon size={14}/>{label}{'count' in rest && rest.count !== undefined && <small>{formatNumber(rest.count)}</small>}</button>)}</div>
    <div className="repository-detail-content" id="repository-detail-content" role="tabpanel" aria-labelledby={`repository-tab-${tab}`}>
      {loading ? <div className="repository-detail-empty" role="status"><RefreshCw size={23} className="spin"/><span>{t('repository:details.loading')}</span></div> : error ? <div className="repository-detail-empty"><AlertTriangle size={24}/><strong>{t('repository:details.failed')}</strong><p role="alert">{renderMessage(error, t)}</p><Button onClick={() => setVersion((value) => value + 1)}>{t('repository:retry')}</Button></div> : details && <>
        {tab === 'branches' && <>{[{ id: 'local', label: t('repository:details.localBranches'), empty: t('repository:details.noLocalBranches'), values: details.branches }, { id: 'remote', label: t('repository:details.remoteBranches'), empty: t('repository:details.noRemoteBranches'), values: details.remoteBranches }].map(({ id, label, empty, values }) => <section className="repository-info-section" key={id}><h3>{label as string}<small>{formatNumber(values.length)}</small></h3>{(values as string[]).length ? (values as string[]).map((branch) => <div className="repository-info-row" key={branch}><GitBranch size={14}/><code>{branch}</code>{branch === details.branch && <span className="repository-state-badge"><Check size={11}/>{t('repository:details.current')}</span>}</div>) : <p className="repository-info-empty">{empty}</p>}</section>)}</>}
        {tab === 'submodules' && (details.submodules.length ? details.submodules.map((module) => <div className="repository-module-card" key={module.path}><div><Box size={15}/><strong>{module.path}</strong><span className={`repository-state-badge ${module.status === 'ok' ? '' : 'warning'}`}>{t(statusLabels[module.status] ?? statusLabels.unknown)}</span></div><p><code>{module.hash.slice(0, 12)}</code>{module.branch && <span><GitBranch size={12}/>{module.branch}</span>}</p></div>) : <div className="repository-detail-empty"><Box size={26}/><strong>{t('repository:details.noSubmodules')}</strong><span>{t('repository:details.submodulesHint')}</span></div>)}
        {tab === 'remotes' && (details.remotes.length ? details.remotes.map((remote) => <section className="repository-remote-card" key={remote.name}><h3><Globe size={15}/>{remote.name}</h3>{[[t('repository:details.fetch'), remote.fetchUrls], [t('repository:details.push'), remote.pushUrls]].map(([label, urls]) => <div key={label as string}><span>{label as string}</span><section>{(urls as string[]).map((url) => <code key={url}>{url}</code>)}</section></div>)}</section>) : <div className="repository-detail-empty"><Globe size={26}/><strong>{t('repository:details.noRemotes')}</strong><span>{t('repository:details.remotesHint')}</span></div>)}
        {tab === 'readme' && (readmeError ? <p className="repository-inline-error" role="alert">{renderMessage(readmeError, t)}</p> : readme === undefined ? <div className="repository-detail-empty" role="status"><RefreshCw size={22} className="spin"/>{t('repository:readme.loading')}</div> : readme === null ? <div className="repository-detail-empty"><FileText size={26}/><strong>{t('repository:readme.missing')}</strong><span>{t('repository:readme.hint')}</span></div> : <><div className="repository-readme-name"><FileText size={13}/>{readme.name}{readme.truncated && <span>{t('repository:readme.truncated')}</span>}</div>{/\.(md|markdown|mdx)$/i.test(readme.name) ? <article className="repository-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ href, children }) => href && /^https?:\/\//i.test(href) ? <a href={href} target="_blank" rel="noreferrer">{children}</a> : <span>{children}</span>, img: ({ alt }) => <span className="repository-readme-image">{alt ? t('repository:readme.imageAlt', { alt }) : t('repository:readme.image')}</span> }}>{readme.content}</ReactMarkdown></article> : <pre className="repository-readme-text">{readme.content}</pre>}</>)}
      </>}
    </div>
  </aside>
}

function FolderOpenIcon() { return <FolderGit2 size={14}/> }
