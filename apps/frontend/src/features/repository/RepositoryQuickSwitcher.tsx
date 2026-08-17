import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Box, Check, ChevronsUpDown, FolderGit2, FolderOpen, GitFork, Search, Star } from 'lucide-react'
import type { RepositorySnapshot } from '../../repository'
import type { RecentRepository, RepositoryParent } from './useRepositoryWorkspace'
import {
  buildRepositorySwitchTargets,
  filterRepositoryTargets,
  normalizedRepositoryTargetPath,
  quickAccessRepositoryTargets,
  type FavoriteRepository,
  type RepositorySwitchSource,
  type RepositorySwitchTarget,
} from './repositorySwitcher'

const FAVORITE_REPOSITORIES_KEY = 'branchline.favoriteRepositories.v1'

function readFavoriteRepositories(): FavoriteRepository[] {
  try {
    const value = window.localStorage.getItem(FAVORITE_REPOSITORIES_KEY)
    if (!value) return []
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((favorite): favorite is FavoriteRepository => Boolean(
      favorite
      && typeof favorite === 'object'
      && typeof (favorite as FavoriteRepository).name === 'string'
      && typeof (favorite as FavoriteRepository).path === 'string',
    ))
  } catch {
    return []
  }
}

function targetIcon(source: RepositorySwitchSource) {
  if (source === 'worktree') return GitFork
  if (source === 'submodule') return Box
  return FolderGit2
}

type RepositoryQuickSwitcherProps = {
  repository: RepositorySnapshot | null
  parentRepository: RepositoryParent | null
  recentRepositories: RecentRepository[]
  openingRepository: boolean
  openSignal: number
  onOpenRepository: () => void
  onOpenRepositoryPath: (path: string, preserveTrail?: boolean) => void
  onOpenSubmodulePath: (path: string) => void
  onReturnToParentRepository: () => void
}

export function RepositoryQuickSwitcher({ repository, parentRepository, recentRepositories, openingRepository, openSignal, onOpenRepository, onOpenRepositoryPath, onOpenSubmodulePath, onReturnToParentRepository }: RepositoryQuickSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [favorites, setFavorites] = useState<FavoriteRepository[]>(readFavoriteRepositories)
  const [menuPosition, setMenuPosition] = useState({ left: 12, top: 72, width: 420 })
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const targets = useMemo(() => buildRepositorySwitchTargets(repository, recentRepositories, favorites), [favorites, recentRepositories, repository])
  const filteredTargets = useMemo(() => filterRepositoryTargets(targets, query), [query, targets])
  const quickTargets = useMemo(() => quickAccessRepositoryTargets(targets), [targets])
  const activeTarget = targets.find((target) => target.source === 'current')
  const ActiveIcon = activeTarget ? targetIcon(activeTarget.source) : FolderOpen

  const showSwitcher = () => {
    setOpen(true)
    window.requestAnimationFrame(() => searchRef.current?.focus())
  }

  const closeSwitcher = () => {
    setOpen(false)
    setQuery('')
    setActiveIndex(0)
  }

  useEffect(() => {
    if (!openSignal) return
    showSwitcher()
  }, [openSignal])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) closeSwitcher()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    const updateMenuPosition = () => {
      const bounds = rootRef.current?.getBoundingClientRect()
      if (!bounds) return
      const viewportPadding = 12
      const width = Math.min(420, window.innerWidth - viewportPadding * 2)
      const left = Math.min(Math.max(viewportPadding, bounds.left), window.innerWidth - width - viewportPadding)
      setMenuPosition({ left, top: bounds.bottom + 5, width })
    }
    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [open])

  useEffect(() => {
    setActiveIndex((current) => Math.max(0, Math.min(current, filteredTargets.length - 1)))
  }, [filteredTargets.length])

  const selectTarget = (target: RepositorySwitchTarget) => {
    closeSwitcher()
    if (target.source === 'current') return
    if (target.navigation === 'submodule') onOpenSubmodulePath(target.path)
    else onOpenRepositoryPath(target.path, target.navigation === 'worktree')
  }

  const toggleFavorite = (target: RepositorySwitchTarget) => {
    setFavorites((current) => {
      const key = normalizedRepositoryTargetPath(target.path)
      const exists = current.some((favorite) => normalizedRepositoryTargetPath(favorite.path) === key)
      const next = exists
        ? current.filter((favorite) => normalizedRepositoryTargetPath(favorite.path) !== key)
        : [...current, { name: target.label, path: target.path }]
      try {
        window.localStorage.setItem(FAVORITE_REPOSITORIES_KEY, JSON.stringify(next))
      } catch {
        // Keep favorites available in memory when local storage is unavailable.
      }
      return next
    })
  }

  const shortcutTargets = query.trim() ? [] : quickTargets
  const shortcutIds = new Set(shortcutTargets.map((target) => target.id))
  const groups = [
    { label: '收藏仓库', items: filteredTargets.filter((target) => target.pinned && target.source !== 'current') },
    { label: '当前仓库结构', items: filteredTargets.filter((target) => target.source === 'current' || (!target.pinned && ['worktree', 'submodule'].includes(target.source))) },
    { label: '最近仓库', items: filteredTargets.filter((target) => !target.pinned && !['current', 'worktree', 'submodule'].includes(target.source)) },
  ].map((group) => ({ ...group, items: group.items.filter((target) => !shortcutIds.has(target.id)) })).filter((group) => group.items.length)

  const renderTarget = (target: RepositorySwitchTarget) => {
    const TargetIcon = targetIcon(target.source)
    const index = filteredTargets.indexOf(target)
    return <div className={`repository-switch-row ${index === activeIndex ? 'keyboard-active' : ''}`} key={target.id}>
      <button type="button" className="repository-switch-target" onMouseEnter={() => setActiveIndex(index)} onClick={() => selectTarget(target)} title={`${target.label}\n${target.path}`}>
        <span className="switcher-icon"><TargetIcon size={14}/></span>
        <span className="repository-switch-text"><strong title={target.label}>{target.label}</strong><small title={target.path}>{target.kind} · {target.path}</small></span>
        {target.source === 'current' && <Check size={14}/>} 
      </button>
      <button type="button" className={`repository-pin-button ${target.pinned ? 'active' : ''}`} onClick={() => toggleFavorite(target)} title={target.pinned ? '取消收藏' : '收藏仓库'} aria-label={target.pinned ? `取消收藏 ${target.label}` : `收藏 ${target.label}`}><Star size={13} fill={target.pinned ? 'currentColor' : 'none'}/></button>
    </div>
  }

  const menu = open && <div ref={menuRef} className="repo-switcher-menu" style={menuPosition}>
    {parentRepository && <button type="button" className="parent-repository-action" onClick={() => { closeSwitcher(); onReturnToParentRepository() }} title={parentRepository.path}><span className="switcher-icon"><ArrowLeft size={14}/></span><span><strong>返回父仓库 · {parentRepository.name}</strong><small>{parentRepository.path}</small></span></button>}
    <div className="repository-switch-search"><Search size={14}/><input ref={searchRef} value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }} onKeyDown={(event) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((current) => filteredTargets.length ? (current + 1) % filteredTargets.length : 0) }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((current) => filteredTargets.length ? (current - 1 + filteredTargets.length) % filteredTargets.length : 0) }
      if (event.key === 'Enter' && filteredTargets[activeIndex]) { event.preventDefault(); selectTarget(filteredTargets[activeIndex]) }
      if (event.key === 'Escape') { event.preventDefault(); closeSwitcher() }
    }} placeholder="搜索仓库名称或路径" spellCheck={false}/></div>
    <div className="repository-switch-results">
      {shortcutTargets.length > 0 && <div className="repository-switch-shortcuts"><div className="switcher-label">快捷访问</div>{shortcutTargets.map(renderTarget)}</div>}
      {groups.map((group) => <div className="repository-switch-group" key={group.label}><div className="switcher-label">{group.label}</div>{group.items.map(renderTarget)}</div>)}
      {!filteredTargets.length && <div className="repository-switch-empty">没有匹配的仓库</div>}
    </div>
    <button type="button" className="open-repository-action" disabled={openingRepository} onClick={() => { onOpenRepository(); closeSwitcher() }}><span className="switcher-icon"><FolderOpen size={14}/></span><span><strong>{openingRepository ? '正在读取仓库…' : '打开本地仓库'}</strong><small>选择其他 Git 仓库或 Worktree</small></span></button>
  </div>

  return <div className="repo-switcher-wrap" ref={rootRef}>
    <button type="button" className={`repo-switcher ${open ? 'open' : ''}`} onClick={() => open ? closeSwitcher() : showSwitcher()} title={activeTarget ? `${activeTarget.label}\n${activeTarget.path}` : '打开本地仓库'}>
      <div className="repo-icon"><ActiveIcon size={17}/></div>
      <div><strong title={activeTarget?.label}>{activeTarget?.label ?? '打开本地仓库'}</strong><span title={activeTarget?.path}>{activeTarget?.path ?? '选择 Git 仓库或 Worktree'}</span></div>
      <ChevronsUpDown size={14}/>
    </button>
    {menu && createPortal(menu, rootRef.current?.closest('.app-shell') ?? document.body)}
  </div>
}
