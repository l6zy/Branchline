export type RepositoryRefreshSettings = {
  enabled: boolean
  intervalMinutes: number
  localPollingEnabled: boolean
  localPollingIntervalSeconds: number
}

export const AUTO_FETCH_INTERVALS = [1, 5, 10, 15, 30]
export const LOCAL_POLLING_INTERVALS = [2, 5, 10, 30]

export const DEFAULT_REPOSITORY_REFRESH_SETTINGS: RepositoryRefreshSettings = {
  enabled: true,
  intervalMinutes: 5,
  localPollingEnabled: false,
  localPollingIntervalSeconds: 5,
}

export function normalizeRepositoryRefreshSettings(value: Partial<RepositoryRefreshSettings> | null | undefined): RepositoryRefreshSettings {
  const intervalMinutes = Number(value?.intervalMinutes)
  const localPollingIntervalSeconds = Number(value?.localPollingIntervalSeconds)
  return {
    enabled: value?.enabled !== false,
    intervalMinutes: AUTO_FETCH_INTERVALS.includes(intervalMinutes) ? intervalMinutes : DEFAULT_REPOSITORY_REFRESH_SETTINGS.intervalMinutes,
    localPollingEnabled: value?.localPollingEnabled === true,
    localPollingIntervalSeconds: LOCAL_POLLING_INTERVALS.includes(localPollingIntervalSeconds)
      ? localPollingIntervalSeconds
      : DEFAULT_REPOSITORY_REFRESH_SETTINGS.localPollingIntervalSeconds,
  }
}
