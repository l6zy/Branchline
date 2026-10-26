import { useMemo, useState } from 'react'
import { ArrowLeft, ChevronRight, Clock3, CloudDownload, Code2, FolderGit2, FolderOpen, GitBranch, Moon, Plus, RefreshCw, Search, Star, Sun, Trash2, X } from 'lucide-react'
import { Button } from '../../components/Button'
import { loadRepositoryDetails, openRepositoryInVscode, pickRepositoryDirectory, type RepositoryDetails } from '../../repository'
import { AddRepositoryDialog } from './AddRepositoryDialog'
import { RepositoryDetailsPanel } from './RepositoryDetailsPanel'
import { repositoryCatalog } from './repositoryCatalog'
import { repositoryCacheKey, sameRepositoryPath } from './repositoryPaths'
import type { RecentRepository } from './repositoryPersistence'
import type { FavoriteRepository } from './repositorySwitcher'

export function RepositoryManagerPage({ recent, favorites, current, opening, theme, onToggleTheme, onBack, onOpen, onRegister, onToggleFavorite, onForget, onNotice }: {
  recent: RecentRepository[]
  favorites: FavoriteRepository[]
  current: Pick<RecentRepository, 'name' | 'path' | 'branch'> | null
  opening: boolean
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onBack: () => void
  onOpen: (path: string) => void
  onRegister: (repository: RepositoryDetails) => void
  onToggleFavorite: (repository: FavoriteRepository) => void
  onForget: (path: string) => void
  onNotice: (message: string) => void
}) {
  const [query, setQuery] = useState('')
  const [selectedPath, setSelectedPath] = useState(current?.path ?? recent[0]?.path ?? favorites[0]?.path ?? '')
  const [adding, setAdding] = useState(false)
  const [dialog, setDialog] = useState<'clone' | 'init' | null>(null)
  const catalog = useMemo(() => repositoryCatalog(recent, favorites, current), [recent, favorites, current])
  const filtered = catalog.filter((item) => `${item.name}\n${item.path}`.replace(/\\/g, '/').toLocaleLowerCase().includes(query.trim().replace(/\\/g, '/').toLocaleLowerCase()))
  const selected = filtered.find((item) => sameRepositoryPath(item.path, selectedPath)) ?? filtered[0]
  const groups = [
    { label: '当前仓库', icon: FolderGit2, entries: filtered.filter((item) => item.current) },
    { label: '收藏', icon: Star, entries: filtered.filter((item) => item.favorite && !item.current) },
    { label: '最近打开', icon: Clock3, entries: filtered.filter((item) => !item.favorite && !item.current).sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0)) },
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
      const path = await pickRepositoryDirectory('添加已有本地 Git 仓库')
      if (path) register(await loadRepositoryDetails(path))
    } catch (error) { onNotice(String(error)) }
    finally { setAdding(false) }
  }
  const openVscode = async (path: string) => {
    try { await openRepositoryInVscode(path) }
    catch (error) { onNotice(String(error)) }
  }
  const initialParent = (selected?.path ?? current?.path ?? '').replace(/[\\/][^\\/]+[\\/]*$/, '')
  const hasRepositories = catalog.length > 0

  return <section className="repository-manager" aria-label="仓库管理">
    {hasRepositories && <header className="repository-manager-heading">
      <div className="repository-manager-title">{current && <Button variant="icon" title="返回工作区" onClick={onBack}><ArrowLeft size={18}/></Button>}<FolderGit2 size={23}/><div><h1>仓库管理</h1><p>收藏常用项目，快速回到最近的工作。</p></div></div>
      <div className="repository-manager-toolbar">{hasRepositories && <><Button variant="primary" onClick={() => void browse()} disabled={adding || opening}>{adding ? <RefreshCw size={15} className="spin"/> : <FolderOpen size={15}/>}选择本地仓库</Button><Button onClick={() => setDialog('clone')} disabled={adding || opening}><CloudDownload size={15}/>克隆仓库</Button><Button onClick={() => setDialog('init')} disabled={adding || opening}><Plus size={15}/>初始化仓库</Button></>}<Button variant="icon" title={theme === 'dark' ? '切换浅色主题' : '切换深色主题'} onClick={onToggleTheme}>{theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}</Button></div>
    </header>}
    {hasRepositories ? <div className="repository-manager-body">
      <div className="repository-catalog">
        <div className="repository-catalog-search"><Search size={15}/><input aria-label="搜索仓库" placeholder="搜索仓库名称或路径…" value={query} onChange={(event) => setQuery(event.target.value)}/>{query && <Button variant="icon" title="清除仓库搜索" onClick={() => setQuery('')}><X size={13}/></Button>}<span>{filtered.length}</span></div>
        <div className="repository-catalog-list">
          {groups.filter(({ entries }) => entries.length > 0 || (query && filtered.length === 0)).map(({ label, icon: Icon, entries }) => <section className="repository-catalog-group" key={label} aria-label={label}><h2><Icon size={13}/>{label}<small>{entries.length}</small></h2>{entries.map((item) => <div className={`repository-catalog-row ${selected && sameRepositoryPath(item.path, selected.path) ? 'selected' : ''}`} key={repositoryCacheKey(item.path)}>
            <button className="repository-catalog-select" aria-pressed={Boolean(selected && sameRepositoryPath(item.path, selected.path))} onClick={() => setSelectedPath(item.path)} onDoubleClick={() => { if (!opening) onOpen(item.path) }}><span className="repository-catalog-icon"><FolderGit2 size={18}/></span><span><strong><span className="repository-catalog-name" title={item.name}>{item.name}</span>{item.current && <small>使用中</small>}</strong><span className="repository-catalog-path" title={item.path}>{item.path}</span><span className="repository-catalog-meta">{item.branch && <span><GitBranch size={11}/><span className="repository-catalog-branch" title={item.branch}>{item.branch}</span></span>}{item.openedAt && <time dateTime={new Date(item.openedAt).toISOString()}>{new Date(item.openedAt).toLocaleDateString('zh-CN')}</time>}</span></span></button>
            <div className="repository-catalog-actions"><Button variant="icon" title={`${item.favorite ? '取消收藏' : '收藏'} ${item.name}`} aria-pressed={item.favorite} onClick={() => onToggleFavorite(item)}><Star size={14} fill={item.favorite ? 'currentColor' : 'none'}/></Button><Button variant="icon" title={`在 VS Code 中打开 ${item.name}`} onClick={() => void openVscode(item.path)}><Code2 size={14}/></Button><Button variant="icon" title={`移除 ${item.name} 的记录（保留本地文件）`} onClick={() => { onForget(item.path); onNotice('已移除仓库记录，本地文件已保留') }}><Trash2 size={14}/></Button><Button variant="icon" title={`打开 ${item.name}`} disabled={opening} onClick={() => onOpen(item.path)}><ChevronRight size={15}/></Button></div>
          </div>)}{entries.length === 0 && <p className="repository-group-empty">{label === '当前仓库' ? '尚未打开仓库' : label === '收藏' ? '点击星标收藏常用仓库' : '暂无最近打开的仓库'}</p>}</section>)}
          {query && filtered.length === 0 && <p className="repository-search-empty">没有匹配的仓库，请尝试其他名称或路径。</p>}
        </div>
        <footer className="repository-catalog-footer">移除记录会保留本地仓库文件。</footer>
      </div>
      {selected ? <RepositoryDetailsPanel key={repositoryCacheKey(selected.path)} item={selected} opening={opening} onOpen={(path) => selected.current ? onBack() : onOpen(path)} onVscode={(path) => void openVscode(path)} onToggleFavorite={onToggleFavorite}/> : <div className="repository-manager-empty"><span><FolderGit2 size={38}/></span><h2>{query ? '没有匹配的仓库' : '让每个项目触手可及'}</h2><p>{query ? '修改搜索条件以查看其他仓库。' : '添加本地仓库，或从克隆、初始化开始。选择仓库后，可以在这里查看分支、Submodule、远程和 README。'}</p>{!query && <Button onClick={() => void browse()} disabled={adding}><FolderOpen size={15}/>添加第一个仓库</Button>}</div>}
      </div> : <div className="repository-manager-welcome">
      <Button className="repository-welcome-theme" variant="icon" title={theme === 'dark' ? '切换浅色主题' : '切换深色主题'} onClick={onToggleTheme}>{theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}</Button>
      <div className="repository-welcome-hero">
        <div className="repository-welcome-brand"><img src="/app-icon.svg" alt="Branchline"/><span>BRANCHLINE</span></div>
        <p className="repository-welcome-kicker">准备好开始了吗？</p>
        <h2>从一个仓库开始</h2>
        <p className="repository-welcome-copy">把常用项目集中在这里。打开仓库后即可查看分支、提交图谱、差异和 README。</p>
      </div>
      <div className="repository-start-actions" aria-label="开始使用仓库管理">
        <button className="repository-start-action primary" onClick={() => void browse()} disabled={adding || opening}>
          <span className="repository-start-icon"><FolderOpen size={20}/></span><span><strong>打开本地仓库</strong><small>选择已有的 Git 项目</small></span><ChevronRight size={17}/>
        </button>
        <button className="repository-start-action" onClick={() => setDialog('clone')} disabled={adding || opening}>
          <span className="repository-start-icon"><CloudDownload size={20}/></span><span><strong>克隆远程仓库</strong><small>从 URL 下载一个新项目</small></span><ChevronRight size={17}/>
        </button>
        <button className="repository-start-action" onClick={() => setDialog('init')} disabled={adding || opening}>
          <span className="repository-start-icon"><Plus size={20}/></span><span><strong>初始化新仓库</strong><small>从一个空文件夹开始</small></span><ChevronRight size={17}/>
        </button>
      </div>
      <div className="repository-welcome-hint"><span>添加后可收藏仓库，之后从最近打开中一键继续。</span><kbd>Ctrl P</kbd><span>搜索仓库</span></div>
    </div>}
    {dialog && <AddRepositoryDialog mode={dialog} initialParent={initialParent} onClose={() => setDialog(null)} onCreated={register}/>}
  </section>
}
