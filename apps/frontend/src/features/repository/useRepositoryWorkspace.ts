import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchRepository,
  loadRepository,
  pickAndLoadRepository,
  type RepositorySnapshot,
} from '../../repository'

const RECENT_REPOSITORIES_KEY = 'branchline.recentRepositories.v1'
const AUTO_FETCH_SETTINGS_KEY = 'branchline.autoFetchSettings.v1'
const NOTICE_DURATION = 5 * 1000

export type AutoFetchSettings = {
  enabled: boolean
  intervalMinutes: number
}

const DEFAULT_AUTO_FETCH_SETTINGS: AutoFetchSettings = {
  enabled: true,
  intervalMinutes: 5,
}

const AUTO_FETCH_INTERVALS = [1, 5, 10, 15, 30]

export type RecentRepository = {
  name: string
  path: string
  branch: string
  openedAt: number
}

export type RepositoryParent = {
  name: string
  path: string
  branch: string
}

function readRecentRepositories(): RecentRepository[] {
  try {
    const value = window.localStorage.getItem(RECENT_REPOSITORIES_KEY)
    return value ? JSON.parse(value) as RecentRepository[] : []
  } catch {
    return []
  }
}

function readAutoFetchSettings(): AutoFetchSettings {
  try {
    const value = window.localStorage.getItem(AUTO_FETCH_SETTINGS_KEY)
    if (!value) return DEFAULT_AUTO_FETCH_SETTINGS
    const parsed = JSON.parse(value) as Partial<AutoFetchSettings>
    const intervalMinutes = Number(parsed.intervalMinutes)
    return {
      enabled: parsed.enabled !== false,
      intervalMinutes: AUTO_FETCH_INTERVALS.includes(intervalMinutes) ? intervalMinutes : DEFAULT_AUTO_FETCH_SETTINGS.intervalMinutes,
    }
  } catch {
    return DEFAULT_AUTO_FETCH_SETTINGS
  }
}

export function useRepositoryWorkspace() {
  const [repository, setRepository] = useState<RepositorySnapshot | null>(null)
  const [recentRepositories, setRecentRepositories] = useState<RecentRepository[]>(readRecentRepositories)
  const [openingRepository, setOpeningRepository] = useState(recentRepositories.length > 0)
  const [fetching, setFetching] = useState(false)
  const [repositoryNotice, setRepositoryNoticeState] = useState<string | null>(null)
  const [noticeVersion, setNoticeVersion] = useState(0)
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null)
  const [autoFetchSettings, setAutoFetchSettings] = useState<AutoFetchSettings>(readAutoFetchSettings)
  const [repositoryTrail, setRepositoryTrail] = useState<RepositoryParent[]>([])
  const fetchInProgress = useRef(false)
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
    setRecentRepositories((current) => {
      const next = [
        { name: snapshot.name, path: snapshot.path, branch: snapshot.branch, openedAt: Date.now() },
        ...current.filter((item) => item.path.toLowerCase() !== snapshot.path.toLowerCase()),
      ].slice(0, 12)
      window.localStorage.setItem(RECENT_REPOSITORIES_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const applySnapshot = useCallback((snapshot: RepositorySnapshot, notice?: string) => {
    setRepository(snapshot)
    rememberRepository(snapshot)
    if (notice) setRepositoryNotice(notice)
  }, [rememberRepository])

  const openRepositoryPath = useCallback(async (path: string, preserveTrail = false) => {
    setOpeningRepository(true)
    setRepositoryNotice(null)
    try {
      const snapshot = await loadRepository(path)
      if (!preserveTrail) setRepositoryTrail([])
      applySnapshot(snapshot, `已打开仓库：${snapshot.name}`)
      return snapshot
    } catch (error) {
      setRepositoryNotice(error instanceof Error ? error.message : String(error))
      return null
    } finally {
      setOpeningRepository(false)
    }
  }, [applySnapshot])

  const openSubmodulePath = useCallback(async (path: string) => {
    setOpeningRepository(true)
    setRepositoryNotice(null)
    try {
      const snapshot = await loadRepository(path)
      if (repository && repository.path.toLowerCase() !== snapshot.path.toLowerCase()) {
        setRepositoryTrail((current) => [...current, {
          name: repository.name,
          path: repository.path,
          branch: repository.branch,
        }])
      }
      applySnapshot(snapshot, `已进入 Submodule：${snapshot.name}`)
      return snapshot
    } catch (error) {
      setRepositoryNotice(error instanceof Error ? error.message : String(error))
      return null
    } finally {
      setOpeningRepository(false)
    }
  }, [applySnapshot, repository])

  const returnToParentRepository = useCallback(async () => {
    const parent = repositoryTrail[repositoryTrail.length - 1]
    if (!parent) return null
    setOpeningRepository(true)
    setRepositoryNotice(null)
    try {
      const snapshot = await loadRepository(parent.path)
      setRepositoryTrail((current) => current.slice(0, -1))
      applySnapshot(snapshot, `已返回父仓库：${snapshot.name}`)
      return snapshot
    } catch (error) {
      setRepositoryNotice(error instanceof Error ? error.message : String(error))
      return null
    } finally {
      setOpeningRepository(false)
    }
  }, [applySnapshot, repositoryTrail])

  const openRepository = useCallback(async () => {
    setOpeningRepository(true)
    setRepositoryNotice(null)
    try {
      const snapshot = await pickAndLoadRepository()
      if (!snapshot) return null
      setRepositoryTrail([])
      applySnapshot(snapshot, `已打开仓库：${snapshot.name}`)
      return snapshot
    } catch (error) {
      setRepositoryNotice(error instanceof Error ? error.message : String(error))
      return null
    } finally {
      setOpeningRepository(false)
    }
  }, [applySnapshot])

  useEffect(() => {
    if (initialRestoreStarted.current) return
    initialRestoreStarted.current = true
    const previousRepository = recentRepositories[0]
    if (!previousRepository) {
      setOpeningRepository(false)
      return
    }
    setOpeningRepository(true)
    loadRepository(previousRepository.path)
      .then((snapshot) => {
        setRepositoryTrail([])
        applySnapshot(snapshot)
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        setRepositoryNotice(`无法重新打开上次仓库：${message}`)
      })
      .finally(() => setOpeningRepository(false))
  }, [applySnapshot, recentRepositories, setRepositoryNotice])

  const fetchNow = useCallback(async (quiet = false) => {
    if (!repository || fetchInProgress.current) return null
    fetchInProgress.current = true
    setFetching(true)
    try {
      const snapshot = await fetchRepository(repository.path)
      setRepository(snapshot)
      rememberRepository(snapshot)
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
  }, [rememberRepository, repository])

  useEffect(() => {
    if (!repository || !autoFetchSettings.enabled) return
    const timer = window.setInterval(() => void fetchNow(true), autoFetchSettings.intervalMinutes * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [autoFetchSettings.enabled, autoFetchSettings.intervalMinutes, fetchNow, repository?.path])

  const updateAutoFetchSettings = useCallback((next: Partial<AutoFetchSettings>) => {
    setAutoFetchSettings((current) => {
      const updated = {
        enabled: next.enabled ?? current.enabled,
        intervalMinutes: next.intervalMinutes !== undefined && AUTO_FETCH_INTERVALS.includes(next.intervalMinutes)
          ? next.intervalMinutes
          : current.intervalMinutes,
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
    recentRepositories,
    openingRepository,
    fetching,
    repositoryNotice,
    pauseRepositoryNotice,
    resumeRepositoryNotice,
    lastFetchAt,
    parentRepository: repositoryTrail[repositoryTrail.length - 1] ?? null,
    setRepositoryNotice,
    applySnapshot,
    openRepository,
    openRepositoryPath,
    openSubmodulePath,
    returnToParentRepository,
    fetchNow,
    autoFetchEnabled: autoFetchSettings.enabled,
    fetchIntervalMinutes: autoFetchSettings.intervalMinutes,
    setAutoFetchEnabled: (enabled: boolean) => updateAutoFetchSettings({ enabled }),
    setFetchIntervalMinutes: (intervalMinutes: number) => updateAutoFetchSettings({ intervalMinutes }),
  }
}
