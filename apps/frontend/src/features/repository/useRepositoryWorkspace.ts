import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchRepository,
  loadRepository,
  loadRepositoryStateToken,
  pickAndLoadRepository,
  type RepositorySnapshot,
} from '../../repository'
import { selectStartupRepository, type RecentRepository } from './repositoryPersistence'
import { repositoryParentFromSnapshot, type RepositoryParent } from './repositoryParents'
import {
  AUTO_FETCH_INTERVALS,
  DEFAULT_REPOSITORY_REFRESH_SETTINGS,
  LOCAL_POLLING_INTERVALS,
  normalizeRepositoryRefreshSettings,
  type RepositoryRefreshSettings,
} from './repositoryRefreshSettings'
import { repositoryCacheKey } from './repositoryPaths'

const RECENT_REPOSITORIES_KEY = 'branchline.recentRepositories.v1'
const STARTUP_REPOSITORY_KEY = 'branchline.startupRepository.v1'
const AUTO_FETCH_SETTINGS_KEY = 'branchline.autoFetchSettings.v1'
const NOTICE_DURATION = 5 * 1000
const SNAPSHOT_CACHE_LIMIT = 12
const NAVIGATION_FETCH_INTERVAL = 60 * 1000

export type AutoFetchSettings = RepositoryRefreshSettings

export type { RecentRepository } from './repositoryPersistence'

export type { RepositoryParent } from './repositoryParents'

function readRecentRepositories(): RecentRepository[] {
  try {
    const value = window.localStorage.getItem(RECENT_REPOSITORIES_KEY)
    return value ? JSON.parse(value) as RecentRepository[] : []
  } catch {
    return []
  }
}

function readStartupRepositoryPath() {
  try {
    return window.localStorage.getItem(STARTUP_REPOSITORY_KEY)
  } catch {
    return null
  }
}

function readAutoFetchSettings(): AutoFetchSettings {
  try {
    const value = window.localStorage.getItem(AUTO_FETCH_SETTINGS_KEY)
    return normalizeRepositoryRefreshSettings(value ? JSON.parse(value) as Partial<AutoFetchSettings> : null)
  } catch {
    return DEFAULT_REPOSITORY_REFRESH_SETTINGS
  }
}

export function useRepositoryWorkspace() {
  const [repository, setRepository] = useState<RepositorySnapshot | null>(null)
  const [structureRepository, setStructureRepository] = useState<RepositorySnapshot | null>(null)
  const [recentRepositories, setRecentRepositories] = useState<RecentRepository[]>(readRecentRepositories)
  const [openingRepository, setOpeningRepository] = useState(recentRepositories.length > 0)
  const [fetching, setFetching] = useState(false)
  const [repositoryNotice, setRepositoryNoticeState] = useState<string | null>(null)
  const [noticeVersion, setNoticeVersion] = useState(0)
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null)
  const [autoFetchSettings, setAutoFetchSettings] = useState<AutoFetchSettings>(readAutoFetchSettings)
  const fetchInProgress = useRef(false)
  const stateRefreshInProgress = useRef(false)
  // The snapshot last shown for a repository, so revisiting it repaints without waiting for Git.
  const snapshotCache = useRef(new Map<string, RepositorySnapshot>())
  // The state token that matches the cached snapshot, used to detect drift after coming back.
  const repositoryTokens = useRef(new Map<string, string>())
  const navigationFetchedAt = useRef(new Map<string, number>())
  const navigationSequence = useRef(0)
  const initialRestoreStarted = useRef(false)
  const noticeTimer = useRef<number | null>(null)
  const noticeStartedAt = useRef(0)
  const noticeRemaining = useRef(NOTICE_DURATION)
  const noticePaused = useRef(false)
  const stopNoticeTimer = useCallback(() => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = null
  }, [])
  const startNoticeTimer = useCallback((duration: number) => {
    stopNoticeTimer()
    noticeRemaining.current = duration
    noticeStartedAt.current = Date.now()
    noticeTimer.current = window.setTimeout(() => {
      noticeTimer.current = null
      noticeRemaining.current = 0
      setRepositoryNoticeState(null)
    }, duration)
  }, [stopNoticeTimer])
  const setRepositoryNotice = useCallback((notice: string | null) => {
    stopNoticeTimer()
    noticeRemaining.current = NOTICE_DURATION
    if (!notice) noticePaused.current = false
    setRepositoryNoticeState(notice)
    setNoticeVersion((version) => version + 1)
  }, [stopNoticeTimer])

  useEffect(() => {
    if (!repositoryNotice) return
    if (!noticePaused.current) startNoticeTimer(NOTICE_DURATION)
    return stopNoticeTimer
  }, [noticeVersion, repositoryNotice, startNoticeTimer, stopNoticeTimer])

  const pauseRepositoryNotice = useCallback(() => {
    noticePaused.current = true
    if (noticeTimer.current === null) return
    noticeRemaining.current = Math.max(0, noticeRemaining.current - (Date.now() - noticeStartedAt.current))
    stopNoticeTimer()
  }, [stopNoticeTimer])

  const resumeRepositoryNotice = useCallback(() => {
    noticePaused.current = false
    if (!repositoryNotice || noticeTimer.current !== null) return
    if (noticeRemaining.current <= 0) {
      setRepositoryNoticeState(null)
      return
    }
    startNoticeTimer(noticeRemaining.current)
  }, [repositoryNotice, startNoticeTimer])

  const rememberRepository = useCallback((snapshot: RepositorySnapshot) => {
    try {
      window.localStorage.setItem(STARTUP_REPOSITORY_KEY, snapshot.path)
    } catch {
      // The current session still works when browser storage is unavailable.
    }
    setRecentRepositories((current) => {
      const next = [
        { name: snapshot.name, path: snapshot.path, branch: snapshot.branch, openedAt: Date.now() },
        ...current.filter((item) => item.path.toLowerCase() !== snapshot.path.toLowerCase()),
      ].slice(0, 50)
      try {
        window.localStorage.setItem(RECENT_REPOSITORIES_KEY, JSON.stringify(next))
      } catch {
        // Keep the in-memory list usable when browser storage is unavailable.
      }
      return next
    })
  }, [])

  const cacheSnapshot = useCallback((snapshot: RepositorySnapshot) => {
    const key = repositoryCacheKey(snapshot.path)
    // Reapplying the exact cached snapshot keeps its state token, so drift is still detected.
    if (snapshotCache.current.get(key) !== snapshot) repositoryTokens.current.delete(key)
    snapshotCache.current.delete(key)
    snapshotCache.current.set(key, snapshot)
    while (snapshotCache.current.size > SNAPSHOT_CACHE_LIMIT) {
      const oldest = snapshotCache.current.keys().next().value
      if (oldest === undefined) break
      snapshotCache.current.delete(oldest)
      repositoryTokens.current.delete(oldest)
    }
  }, [])

  const applySnapshot = useCallback((snapshot: RepositorySnapshot, notice?: string) => {
    cacheSnapshot(snapshot)
    setRepository(snapshot)
    setStructureRepository((current) => {
      if (!current || current.path.toLowerCase() === snapshot.path.toLowerCase() || !snapshot.superprojectPath) return snapshot
      return current
    })
    if (notice) setRepositoryNotice(notice)
  }, [cacheSnapshot, setRepositoryNotice])

  const applyStructureSnapshot = useCallback((snapshot: RepositorySnapshot) => {
    cacheSnapshot(snapshot)
    setStructureRepository(snapshot)
    setRepository((current) => current?.path.toLowerCase() === snapshot.path.toLowerCase() ? snapshot : current)
  }, [cacheSnapshot])

  // Refreshes whichever panes already show this repository without touching navigation state.
  const applyRefreshedSnapshot = useCallback((snapshot: RepositorySnapshot) => {
    const key = repositoryCacheKey(snapshot.path)
    cacheSnapshot(snapshot)
    setRepository((current) => current && repositoryCacheKey(current.path) === key ? snapshot : current)
    setStructureRepository((current) => current && repositoryCacheKey(current.path) === key ? snapshot : current)
  }, [cacheSnapshot])

  // Remote refs are refreshed after the snapshot is painted, so navigation never waits for the network.
  const startBackgroundFetch = useCallback((path: string) => {
    if (fetchInProgress.current) return false
    const key = repositoryCacheKey(path)
    const now = Date.now()
    if ((navigationFetchedAt.current.get(key) ?? 0) + NAVIGATION_FETCH_INTERVAL > now) return false
    const sequence = navigationSequence.current
    navigationFetchedAt.current.set(key, now)
    fetchInProgress.current = true
    setFetching(true)
    void fetchRepository(path)
      .then((snapshot) => {
        if (sequence !== navigationSequence.current) return
        setLastFetchAt(Date.now())
        applyRefreshedSnapshot(snapshot)
      })
      .catch(() => {
        navigationFetchedAt.current.delete(key)
      })
      .finally(() => {
        fetchInProgress.current = false
        setFetching(false)
      })
    return true
  }, [applyRefreshedSnapshot])

  const navigateToRepository = useCallback(async (path: string, notice: (snapshot: RepositorySnapshot) => string) => {
    const sequence = ++navigationSequence.current
    const key = repositoryCacheKey(path)
    const cached = snapshotCache.current.get(key)
    if (cached) {
      applySnapshot(cached, notice(cached))
      const fetching = startBackgroundFetch(cached.path)
      // Without a state token the polling loop cannot tell whether the cached snapshot drifted.
      if (!fetching && !repositoryTokens.current.has(key)) {
        void loadRepository(cached.path)
          .then((snapshot) => {
            if (sequence === navigationSequence.current) applyRefreshedSnapshot(snapshot)
          })
          .catch(() => undefined)
      }
      return cached
    }
    setOpeningRepository(true)
    setRepositoryNotice(null)
    try {
      const snapshot = await loadRepository(path)
      if (sequence !== navigationSequence.current) return null
      applySnapshot(snapshot, notice(snapshot))
      startBackgroundFetch(snapshot.path)
      return snapshot
    } catch (error) {
      setRepositoryNotice(error instanceof Error ? error.message : String(error))
      return null
    } finally {
      setOpeningRepository(false)
    }
  }, [applyRefreshedSnapshot, applySnapshot, setRepositoryNotice, startBackgroundFetch])

  const openRepositoryPath = useCallback(async (path: string) => {
    const snapshot = await navigateToRepository(path, (loaded) => `已打开仓库：${loaded.name}`)
    if (snapshot) rememberRepository(snapshot)
    return snapshot
  }, [navigateToRepository, rememberRepository])

  const openSubmodulePath = useCallback(
    (path: string) => navigateToRepository(path, (snapshot) => `已进入 Submodule：${snapshot.name}`),
    [navigateToRepository],
  )

  // The parent is read from the working tree's superproject, so hopping between sibling submodules
  // always resolves to the repository that actually contains the current one.
  const parentRepository = useMemo(() => repository ? repositoryParentFromSnapshot(repository) : null, [repository])

  const returnToParentRepository = useCallback(async () => {
    if (!parentRepository) return null
    return navigateToRepository(parentRepository.path, (snapshot) => `已返回父仓库：${snapshot.name}`)
  }, [navigateToRepository, parentRepository])

  const openRepository = useCallback(async () => {
    setOpeningRepository(true)
    setRepositoryNotice(null)
    try {
      const snapshot = await pickAndLoadRepository()
      if (!snapshot) return null
      navigationSequence.current += 1
      applySnapshot(snapshot, `已打开仓库：${snapshot.name}`)
      rememberRepository(snapshot)
      startBackgroundFetch(snapshot.path)
      return snapshot
    } catch (error) {
      setRepositoryNotice(error instanceof Error ? error.message : String(error))
      return null
    } finally {
      setOpeningRepository(false)
    }
  }, [applySnapshot, rememberRepository, setRepositoryNotice, startBackgroundFetch])

  useEffect(() => {
    if (initialRestoreStarted.current) return
    initialRestoreStarted.current = true
    const previousRepository = selectStartupRepository(recentRepositories, readStartupRepositoryPath())
    if (!previousRepository) {
      setOpeningRepository(false)
      return
    }
    setOpeningRepository(true)
    loadRepository(previousRepository.path)
      .then((snapshot) => {
        applySnapshot(snapshot)
        rememberRepository(snapshot)
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        setRepositoryNotice(`无法重新打开上次仓库：${message}`)
      })
      .finally(() => setOpeningRepository(false))
  }, [applySnapshot, recentRepositories, rememberRepository, setRepositoryNotice])

  const fetchNow = useCallback(async (quiet = false) => {
    if (!repository || fetchInProgress.current) return null
    fetchInProgress.current = true
    setFetching(true)
    try {
      const snapshot = await fetchRepository(repository.path)
      navigationFetchedAt.current.set(repositoryCacheKey(snapshot.path), Date.now())
      applyRefreshedSnapshot(snapshot)
      setLastFetchAt(Date.now())
      if (!quiet) setRepositoryNotice('Fetch 完成，远程引用已更新')
      return snapshot
    } catch (error) {
      if (!quiet) setRepositoryNotice(error instanceof Error ? error.message : String(error))
      return null
    } finally {
      fetchInProgress.current = false
      setFetching(false)
    }
  }, [applyRefreshedSnapshot, repository, setRepositoryNotice])

  useEffect(() => {
    if (!repository || !autoFetchSettings.enabled) return
    const timer = window.setInterval(() => void fetchNow(true), autoFetchSettings.intervalMinutes * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [autoFetchSettings.enabled, autoFetchSettings.intervalMinutes, fetchNow, repository?.path])

  useEffect(() => {
    const repositoryPath = repository?.path
    if (!repositoryPath) return
    const key = repositoryCacheKey(repositoryPath)
    let cancelled = false
    const synchronizeLocalState = async () => {
      if (document.hidden || stateRefreshInProgress.current) return
      stateRefreshInProgress.current = true
      try {
        const token = await loadRepositoryStateToken(repositoryPath)
        if (cancelled) return
        const previous = repositoryTokens.current.get(key)
        if (previous === token) return
        if (previous === undefined) {
          repositoryTokens.current.set(key, token)
          return
        }
        const snapshot = await loadRepository(repositoryPath)
        if (cancelled) return
        applyRefreshedSnapshot(snapshot)
        repositoryTokens.current.set(key, token)
      } catch {
        // A transient lock or an in-progress external Git operation is retried on the next poll.
      } finally {
        stateRefreshInProgress.current = false
      }
    }
    void synchronizeLocalState()
    const timer = autoFetchSettings.localPollingEnabled
      ? window.setInterval(() => void synchronizeLocalState(), autoFetchSettings.localPollingIntervalSeconds * 1000)
      : null
    const synchronizeWhenVisible = () => {
      if (!document.hidden) void synchronizeLocalState()
    }
    window.addEventListener('focus', synchronizeWhenVisible)
    document.addEventListener('visibilitychange', synchronizeWhenVisible)
    return () => {
      cancelled = true
      if (timer !== null) window.clearInterval(timer)
      window.removeEventListener('focus', synchronizeWhenVisible)
      document.removeEventListener('visibilitychange', synchronizeWhenVisible)
    }
  }, [applyRefreshedSnapshot, autoFetchSettings.localPollingEnabled, autoFetchSettings.localPollingIntervalSeconds, repository?.path])

  const updateAutoFetchSettings = useCallback((next: Partial<AutoFetchSettings>) => {
    setAutoFetchSettings((current) => {
      const updated = {
        enabled: next.enabled ?? current.enabled,
        intervalMinutes: next.intervalMinutes !== undefined && AUTO_FETCH_INTERVALS.includes(next.intervalMinutes)
          ? next.intervalMinutes
          : current.intervalMinutes,
        localPollingEnabled: next.localPollingEnabled ?? current.localPollingEnabled,
        localPollingIntervalSeconds: next.localPollingIntervalSeconds !== undefined && LOCAL_POLLING_INTERVALS.includes(next.localPollingIntervalSeconds)
          ? next.localPollingIntervalSeconds
          : current.localPollingIntervalSeconds,
      }
      try {
        window.localStorage.setItem(AUTO_FETCH_SETTINGS_KEY, JSON.stringify(updated))
      } catch {
        // Keep the in-memory setting usable when browser storage is unavailable.
      }
      return updated
    })
  }, [])

  return {
    repository,
    structureRepository,
    recentRepositories,
    openingRepository,
    fetching,
    repositoryNotice,
    pauseRepositoryNotice,
    resumeRepositoryNotice,
    lastFetchAt,
    parentRepository,
    setRepositoryNotice,
    applySnapshot,
    applyStructureSnapshot,
    openRepository,
    openRepositoryPath,
    openSubmodulePath,
    returnToParentRepository,
    fetchNow,
    autoFetchEnabled: autoFetchSettings.enabled,
    fetchIntervalMinutes: autoFetchSettings.intervalMinutes,
    localPollingEnabled: autoFetchSettings.localPollingEnabled,
    localPollingIntervalSeconds: autoFetchSettings.localPollingIntervalSeconds,
    setAutoFetchEnabled: (enabled: boolean) => updateAutoFetchSettings({ enabled }),
    setFetchIntervalMinutes: (intervalMinutes: number) => updateAutoFetchSettings({ intervalMinutes }),
    setLocalPollingEnabled: (enabled: boolean) => updateAutoFetchSettings({ localPollingEnabled: enabled }),
    setLocalPollingIntervalSeconds: (seconds: number) => updateAutoFetchSettings({ localPollingIntervalSeconds: seconds }),
  }
}
