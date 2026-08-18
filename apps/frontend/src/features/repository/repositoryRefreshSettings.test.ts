import { describe, expect, it } from 'vitest'
import { normalizeRepositoryRefreshSettings } from './repositoryRefreshSettings'

describe('normalizeRepositoryRefreshSettings', () => {
  it('keeps local repository polling disabled when migrating existing settings', () => {
    expect(normalizeRepositoryRefreshSettings({ enabled: true, intervalMinutes: 10 })).toEqual({
      enabled: true,
      intervalMinutes: 10,
      localPollingEnabled: false,
      localPollingIntervalSeconds: 5,
    })
  })

  it('falls back to the default local polling interval when the stored value is invalid', () => {
    expect(normalizeRepositoryRefreshSettings({
      enabled: false,
      intervalMinutes: 5,
      localPollingEnabled: true,
      localPollingIntervalSeconds: 3,
    }).localPollingIntervalSeconds).toBe(5)
  })
})
