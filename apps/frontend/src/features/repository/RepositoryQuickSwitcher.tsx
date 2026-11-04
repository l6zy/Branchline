import { Tooltip } from '../../components/tooltip'
import { useAppTranslation } from '../../i18n/useAppTranslation'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Box, Check, ChevronsUpDown, FolderGit2, FolderOpen, GitFork, Search, Star } from 'lucide-react'
import type { RepositorySnapshot } from '../../repository'
import type { RecentRepository, RepositoryParent } from './useRepositoryWorkspace'
import {
  buildRepositorySwitchTargets,
  filterRepositoryTargets,
  quickAccessRepositoryTargets,
  type FavoriteRepository,
  type RepositorySwitchSource,
  type RepositorySwitchTarget,
} from './repositorySwitcher'

const submoduleStatusKeys = { ok: 'repository:status.initialized', modified: 'repository:status.modified', uninitialized: 'repository:status.uninitialized', missing: 'repository:status.missing', unknown: 'repository:status.unknown' } as const

function targetIcon(source: RepositorySwitchSource) {
  if (source === 'worktree') return GitFork
  if (source === 'submodule') return Box
  return FolderGit2
}

type RepositoryQuickSwitcherProps = {
  repository: RepositorySnapshot | null
  parentRepository: RepositoryParent | null
  favorites: FavoriteRepository[]
  onToggleFavorite: (repository: FavoriteRepository) => void
  recentRepositories: RecentRepository[]
  openingRepository: boolean
  openSignal: number
  onOpenRepository: () => void
  onOpenRepositoryPath: (path: string) => void
  onOpenSubmodulePath: (path: string) => void
  onReturnToParentRepository: () => void
}

export function RepositoryQuickSwitcher({ favorites, onToggleFavorite, repository, parentRepository, recentRepositories, openingRepository, openSignal, onOpenRepository, onOpenRepositoryPath, onOpenSubmodulePath, onReturnToParentRepository }: RepositoryQuickSwitcherProps) {
  const { t } = useAppTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
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
    else onOpenRepositoryPath(target.path)
  }

  const shortcutTargets = query.trim() ? [] : quickTargets
  const shortcutIds = new Set(shortcutTargets.map((target) => target.id))
  const groups = [
    { id: 'favorites', label: t('repository:switcher.favorites'), items: filteredTargets.filter((target) => target.pinned && target.source !== 'current') },
    { id: 'structure', label: t('repository:switcher.structure'), items: filteredTargets.filter((target) => target.source === 'current' || (!target.pinned && ['worktree', 'submodule'].includes(target.source))) },
    { id: 'recent', label: t('repository:switcher.recent'), items: filteredTargets.filter((target) => !target.pinned && !['current', 'worktree', 'submodule'].includes(target.source)) },
  ].map((group) => ({ ...group, items: group.items.filter((target) => !shortcutIds.has(target.id)) })).filter((group) => group.items.length)

  const targetDescription = (target: RepositorySwitchTarget) => {
    if (target.kind === 'current') return t('repository:switcher.kindCurrent', { branch: target.branch })
    if (target.kind === 'recent') return t('repository:switcher.kindRecent', { branch: target.branch })
    if (target.kind === 'worktree') return t('repository:switcher.kindWorktree', { branch: target.branch ?? t('repository:worktree.detached') })
    if (target.kind === 'submodule') return t('repository:switcher.kindSubmodule', { status: t(submoduleStatusKeys[target.status as keyof typeof submoduleStatusKeys] ?? 'repository:status.unknown') })
    return t('repository:switcher.kindPinned')
  }

  const renderTarget = (target: RepositorySwitchTarget) => {
    const TargetIcon = targetIcon(target.source)
    const index = filteredTargets.indexOf(target)
    return <div className={`repository-switch-row ${index === activeIndex ? 'keyboard-active' : ''}`} key={target.id}>
      <Tooltip content={`${target.label}\n${target.path}`}><button type="button" className="repository-switch-target" onMouseEnter={() => setActiveIndex(index)} onClick={() => selectTarget(target)}>
        <span className="switcher-icon"><TargetIcon size={14}/></span>
        <span className="repository-switch-text"><Tooltip content={target.label}><strong>{target.label}</strong></Tooltip><Tooltip content={target.path}><small>{targetDescription(target)} · {target.path}</small></Tooltip></span>
        {target.source === 'current' && <Check size={14}/>} 
      </button></Tooltip>
      <Tooltip content={target.pinned ? t('repository:unfavorite') : t('repository:switcher.favorites')}><button type="button" className={`repository-pin-button ${target.pinned ? 'active' : ''}`} onClick={() => onToggleFavorite({ name: target.label, path: target.path })} aria-label={t(target.pinned ? 'repository:manager.unfavoriteName' : 'repository:manager.favoriteName', { name: target.label })}><Star size={13} fill={target.pinned ? 'currentColor' : 'none'}/></button></Tooltip>
    </div>
  }

  const menu = open && <div ref={menuRef} className="repo-switcher-menu" style={menuPosition}>
    {parentRepository && <Tooltip content={parentRepository.path}><button type="button" className="parent-repository-action" onClick={() => { closeSwitcher(); onReturnToParentRepository() }}><span className="switcher-icon"><ArrowLeft size={14}/></span><span><strong>{t('repository:switcher.returnParent', { name: parentRepository.name })}</strong><small>{parentRepository.path}</small></span></button></Tooltip>}
    <div className="repository-switch-search"><Search size={14}/><input ref={searchRef} value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }} onKeyDown={(event) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((current) => filteredTargets.length ? (current + 1) % filteredTargets.length : 0) }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((current) => filteredTargets.length ? (current - 1 + filteredTargets.length) % filteredTargets.length : 0) }
      if (event.key === 'Enter' && filteredTargets[activeIndex]) { event.preventDefault(); selectTarget(filteredTargets[activeIndex]) }
      if (event.key === 'Escape') { event.preventDefault(); closeSwitcher() }
    }} placeholder={t('repository:switcher.searchPlaceholder')} spellCheck={false}/></div>
    <div className="repository-switch-results">
      {shortcutTargets.length > 0 && <div className="repository-switch-shortcuts"><div className="switcher-label">{t('repository:switcher.quickAccess')}</div>{shortcutTargets.map(renderTarget)}</div>}
      {groups.map((group) => <div className="repository-switch-group" key={group.id}><div className="switcher-label">{group.label}</div>{group.items.map(renderTarget)}</div>)}
      {!filteredTargets.length && <div className="repository-switch-empty">{t('repository:manager.noMatch')}</div>}
    </div>
    <button type="button" className="open-repository-action" disabled={openingRepository} onClick={() => { onOpenRepository(); closeSwitcher() }}><span className="switcher-icon"><FolderOpen size={14}/></span><span><strong>{openingRepository ? t('repository:switcher.reading') : t('repository:welcome.openLocal')}</strong><small>{t('repository:switcher.otherHint')}</small></span></button>
  </div>

  return <div className="repo-switcher-wrap" ref={rootRef}>
    <Tooltip content={activeTarget ? `${activeTarget.label}\n${activeTarget.path}` : t('repository:welcome.openLocal')}><button type="button" className={`repo-switcher ${open ? 'open' : ''}`} onClick={() => open ? closeSwitcher() : showSwitcher()}>
      <div className="repo-icon"><ActiveIcon size={17}/></div>
      <div><Tooltip content={activeTarget?.label}><strong>{activeTarget?.label ?? t('repository:welcome.openLocal')}</strong></Tooltip><Tooltip content={activeTarget?.path}><span>{activeTarget?.path ?? t('repository:switcher.choose')}</span></Tooltip></div>
      <ChevronsUpDown size={14}/>
    </button></Tooltip>
    {menu && createPortal(menu, rootRef.current?.closest('.app-shell') ?? document.body)}
  </div>
}
