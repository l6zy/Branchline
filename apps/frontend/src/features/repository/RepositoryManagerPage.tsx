import { Tooltip } from '../../components/tooltip'
import { errorMessage, message, type MessageContent } from '../../i18n/messages'
import { useLocale } from '../../i18n/LocaleProvider'
import { useAppTranslation } from '../../i18n/useAppTranslation'
import { useMemo, useState } from 'react'
import { ArrowLeft, ChevronRight, Clock3, CloudDownload, Code2, FolderGit2, FolderOpen, GitBranch, Monitor, Moon, Plus, RefreshCw, Search, Star, Sun, Trash2, X } from 'lucide-react'
import { Button } from '../../components/Button'
import { loadRepositoryDetails, openRepositoryInVscode, pickRepositoryDirectory, type RepositoryDetails } from '../../repository'
import { AddRepositoryDialog } from './AddRepositoryDialog'
import { RepositoryDetailsPanel } from './RepositoryDetailsPanel'
import { repositoryCatalog } from './repositoryCatalog'
import { repositoryCacheKey, sameRepositoryPath } from './repositoryPaths'
import type { RecentRepository } from './repositoryPersistence'
import type { FavoriteRepository } from './repositorySwitcher'

export function RepositoryManagerPage({ recent, favorites, current, opening, theme, resolvedTheme, onToggleTheme, onBack, onOpen, onRegister, onToggleFavorite, onForget, onNotice }: {
  recent: RecentRepository[]
  favorites: FavoriteRepository[]
  current: Pick<RecentRepository, 'name' | 'path' | 'branch'> | null
  opening: boolean
  theme: 'light' | 'dark' | 'system'
  resolvedTheme: 'light' | 'dark'
  onToggleTheme: () => void
  onBack: () => void
  onOpen: (path: string) => void
  onRegister: (repository: RepositoryDetails) => void
  onToggleFavorite: (repository: FavoriteRepository) => void
  onForget: (path: string) => void
  onNotice: (message: MessageContent) => void
}) {
  const { t } = useAppTranslation()
  const { locale } = useLocale()
  const formatNumber = new Intl.NumberFormat(locale).format
  const [query, setQuery] = useState('')
  const [selectedPath, setSelectedPath] = useState(current?.path ?? recent[0]?.path ?? favorites[0]?.path ?? '')
  const [adding, setAdding] = useState(false)
  const [dialog, setDialog] = useState<'clone' | 'init' | null>(null)
  const catalog = useMemo(() => repositoryCatalog(recent, favorites, current), [recent, favorites, current])
  const filtered = catalog.filter((item) => `${item.name}\n${item.path}`.replace(/\\/g, '/').toLocaleLowerCase().includes(query.trim().replace(/\\/g, '/').toLocaleLowerCase()))
  const selected = filtered.find((item) => sameRepositoryPath(item.path, selectedPath)) ?? filtered[0]
  const groups = [
    { id: 'current', label: t('repository:manager.current'), icon: FolderGit2, entries: filtered.filter((item) => item.current) },
    { id: 'favorites', label: t('repository:manager.favorites'), icon: Star, entries: filtered.filter((item) => item.favorite && !item.current) },
    { id: 'recent', label: t('repository:manager.recent'), icon: Clock3, entries: filtered.filter((item) => !item.favorite && !item.current).sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0)) },
  ]
  const register = (repository: RepositoryDetails) => {
    onRegister(repository)
    setQuery('')
    setSelectedPath(repository.path)
    setDialog(null)
  }
  const browse = async () => {
    if (adding) return
    setAdding(true)
    try {
      const path = await pickRepositoryDirectory(t('repository:manager.addPicker'))
      if (path) register(await loadRepositoryDetails(path))
    } catch (error) { onNotice(errorMessage(error)) }
    finally { setAdding(false) }
  }
  const openVscode = async (path: string) => {
    try { await openRepositoryInVscode(path) }
    catch (error) { onNotice(errorMessage(error)) }
  }
  const initialParent = (selected?.path ?? current?.path ?? '').replace(/[\\/][^\\/]+[\\/]*$/, '')
  const hasRepositories = catalog.length > 0

  return <section className="repository-manager" aria-label={t('repository:manager.title')}>
    {hasRepositories && <header className="repository-manager-heading">
      <div className="repository-manager-title">{current && <Button variant="icon" tooltip={t('repository:manager.back')} aria-label={t('repository:manager.back')} onClick={onBack}><ArrowLeft size={18}/></Button>}<FolderGit2 size={23}/><div><h1>{t('repository:manager.title')}</h1><p>{t('repository:manager.description')}</p></div></div>
      <div className="repository-manager-toolbar">{hasRepositories && <><Button variant="primary" onClick={() => void browse()} disabled={adding || opening}>{adding ? <RefreshCw size={15} className="spin"/> : <FolderOpen size={15}/>}{t('repository:manager.selectLocal')}</Button><Button onClick={() => setDialog('clone')} disabled={adding || opening}><CloudDownload size={15}/>{t('repository:add.clone')}</Button><Button onClick={() => setDialog('init')} disabled={adding || opening}><Plus size={15}/>{t('repository:add.initialize')}</Button></>}<Button variant="icon" tooltip={t(theme === 'system' ? 'repository:manager.systemThemeHint' : 'repository:manager.themeHint', { theme: t(resolvedTheme === 'dark' ? 'repository:manager.dark' : 'repository:manager.light') })} aria-label={t('repository:manager.toggleTheme')} onClick={onToggleTheme}>{theme === 'system' ? <Monitor size={17}/> : theme === 'dark' ? <Moon size={17}/> : <Sun size={17}/>}</Button></div>
    </header>}
    {hasRepositories ? <div className="repository-manager-body">
      <div className="repository-catalog">
        <div className="repository-catalog-search"><Search size={15}/><input aria-label={t('repository:manager.search')} placeholder={t('repository:manager.searchPlaceholder')} value={query} onChange={(event) => setQuery(event.target.value)}/>{query && <Button variant="icon" tooltip={t('repository:manager.clearSearch')} aria-label={t('repository:manager.clearSearch')} onClick={() => setQuery('')}><X size={13}/></Button>}<span>{formatNumber(filtered.length)}</span></div>
        <div className="repository-catalog-list">
          {groups.filter(({ entries }) => entries.length > 0 || (query && filtered.length === 0)).map(({ id, label, icon: Icon, entries }) => <section className="repository-catalog-group" key={id} aria-label={label}><h2><Icon size={13}/>{label}<small>{formatNumber(entries.length)}</small></h2>{entries.map((item) => <div className={`repository-catalog-row ${selected && sameRepositoryPath(item.path, selected.path) ? 'selected' : ''}`} key={repositoryCacheKey(item.path)}>
            <button className="repository-catalog-select" aria-pressed={Boolean(selected && sameRepositoryPath(item.path, selected.path))} onClick={() => setSelectedPath(item.path)} onDoubleClick={() => { if (!opening) onOpen(item.path) }}><span className="repository-catalog-icon"><FolderGit2 size={18}/></span><span><strong><Tooltip content={item.name}><span className="repository-catalog-name">{item.name}</span></Tooltip>{item.current && <small>{t('repository:manager.inUse')}</small>}</strong><Tooltip content={item.path}><span className="repository-catalog-path">{item.path}</span></Tooltip><span className="repository-catalog-meta">{item.branch && <span><GitBranch size={11}/><Tooltip content={item.branch}><span className="repository-catalog-branch">{item.branch}</span></Tooltip></span>}{item.openedAt && <time dateTime={new Date(item.openedAt).toISOString()}>{new Intl.DateTimeFormat(locale).format(new Date(item.openedAt))}</time>}</span></span></button>
            <div className="repository-catalog-actions"><Button variant="icon" tooltip={t(item.favorite ? 'repository:manager.unfavoriteName' : 'repository:manager.favoriteName', { name: item.name })} aria-label={t(item.favorite ? 'repository:manager.unfavoriteName' : 'repository:manager.favoriteName', { name: item.name })} aria-pressed={item.favorite} onClick={() => onToggleFavorite(item)}><Star size={14} fill={item.favorite ? 'currentColor' : 'none'}/></Button><Button variant="icon" tooltip={t('repository:manager.vscodeName', { name: item.name })} aria-label={t('repository:manager.vscodeName', { name: item.name })} onClick={() => void openVscode(item.path)}><Code2 size={14}/></Button><Button variant="icon" tooltip={t('repository:manager.forgetName', { name: item.name })} aria-label={t('repository:manager.forgetName', { name: item.name })} onClick={() => { onForget(item.path); onNotice(message('repository:manager.recordRemoved')) }}><Trash2 size={14}/></Button><Button variant="icon" tooltip={t('repository:manager.openName', { name: item.name })} aria-label={t('repository:manager.openName', { name: item.name })} disabled={opening} onClick={() => onOpen(item.path)}><ChevronRight size={15}/></Button></div>
          </div>)}{entries.length === 0 && <p className="repository-group-empty">{id === 'current' ? t('repository:manager.notOpened') : id === 'favorites' ? t('repository:manager.favoriteHint') : t('repository:manager.noRecent')}</p>}</section>)}
          {query && filtered.length === 0 && <p className="repository-search-empty">{t('repository:manager.noMatchHint')}</p>}
        </div>
        <footer className="repository-catalog-footer">{t('repository:manager.keepFiles')}</footer>
      </div>
      {selected ? <RepositoryDetailsPanel key={repositoryCacheKey(selected.path)} item={selected} opening={opening} onOpen={(path) => selected.current ? onBack() : onOpen(path)} onVscode={(path) => void openVscode(path)} onToggleFavorite={onToggleFavorite}/> : <div className="repository-manager-empty"><span><FolderGit2 size={38}/></span><h2>{query ? t('repository:manager.noMatch') : t('repository:manager.emptyTitle')}</h2><p>{query ? t('repository:manager.changeSearch') : t('repository:manager.emptyHint')}</p>{!query && <Button onClick={() => void browse()} disabled={adding}><FolderOpen size={15}/>{t('repository:manager.addFirst')}</Button>}</div>}
      </div> : <div className="repository-manager-welcome">
      <Button className="repository-welcome-theme" variant="icon" tooltip={t('repository:manager.toggleTheme')} aria-label={t('repository:manager.toggleTheme')} onClick={onToggleTheme}>{theme === 'system' ? <Monitor size={17}/> : theme === 'dark' ? <Moon size={17}/> : <Sun size={17}/>}</Button>
      <div className="repository-welcome-hero">
        <div className="repository-welcome-brand"><img src="/app-icon.svg" alt="Branchline"/><span>BRANCHLINE</span></div>
        <p className="repository-welcome-kicker">{t('repository:welcome.ready')}</p>
        <h2>{t('repository:welcome.title')}</h2>
        <p className="repository-welcome-copy">{t('repository:welcome.description')}</p>
      </div>
      <div className="repository-start-actions" aria-label={t('repository:welcome.actions')}>
        <button className="repository-start-action primary" onClick={() => void browse()} disabled={adding || opening}>
          <span className="repository-start-icon"><FolderOpen size={20}/></span><span><strong>{t('repository:welcome.openLocal')}</strong><small>{t('repository:welcome.localHint')}</small></span><ChevronRight size={17}/>
        </button>
        <button className="repository-start-action" onClick={() => setDialog('clone')} disabled={adding || opening}>
          <span className="repository-start-icon"><CloudDownload size={20}/></span><span><strong>{t('repository:welcome.clone')}</strong><small>{t('repository:welcome.cloneHint')}</small></span><ChevronRight size={17}/>
        </button>
        <button className="repository-start-action" onClick={() => setDialog('init')} disabled={adding || opening}>
          <span className="repository-start-icon"><Plus size={20}/></span><span><strong>{t('repository:welcome.initialize')}</strong><small>{t('repository:welcome.initializeHint')}</small></span><ChevronRight size={17}/>
        </button>
      </div>
      <div className="repository-welcome-hint"><span>{t('repository:welcome.favoriteHint')}</span><kbd>Ctrl P</kbd><span>{t('repository:manager.search')}</span></div>
    </div>}
    {dialog && <AddRepositoryDialog mode={dialog} initialParent={initialParent} onClose={() => setDialog(null)} onCreated={register}/>}
  </section>
}
