import { describe, expect, it } from 'vitest'
import { getAutoFastForwardBranches, isAutoPullBranchSettings, toggleAutoPullBranch } from './branchSwitch'

describe('configured auto-pull branches', () => {
  it('selects only configured, unoccupied local branches that are strictly behind upstream', () => {
    const snapshot = {
      branch: 'feature/a',
      branches: ['main', 'release', 'feature/a', 'ahead', 'diverged', 'untracked', 'other-worktree', 'up-to-date'],
      branchTracking: Object.fromEntries([
        ['main', { upstream: 'origin/main', ahead: 0, behind: 2 }],
        ['release', { upstream: 'origin/release', ahead: 0, behind: 1 }],
        ['feature/a', { upstream: 'origin/feature/a', ahead: 0, behind: 1 }],
        ['ahead', { upstream: 'origin/ahead', ahead: 1, behind: 0 }],
        ['diverged', { upstream: 'origin/diverged', ahead: 1, behind: 1 }],
        ['untracked', { ahead: 0, behind: 2 }],
        ['other-worktree', { upstream: 'origin/other', ahead: 0, behind: 1 }],
        ['up-to-date', { upstream: 'origin/up-to-date', ahead: 0, behind: 0 }],
      ]),
      worktrees: [{ branch: 'other-worktree' }],
    }
    expect(getAutoFastForwardBranches(snapshot, [...snapshot.branches, 'deleted', 'origin/main', 'main'])).toEqual(['main', 'release'])
    expect(getAutoFastForwardBranches(snapshot, [])).toEqual([])
    expect(getAutoFastForwardBranches({ ...snapshot, branch: 'main' }, ['main', 'release'])).toEqual(['release'])
  })

  it('validates and toggles branch lists independently per repository', () => {
    expect(isAutoPullBranchSettings({ 'C:/repo-a': ['main'] })).toBe(true)
    expect(isAutoPullBranchSettings({ 'C:/repo-a': ['main', 1] })).toBe(false)
    const first = toggleAutoPullBranch({}, 'C:/repo-a', 'main')
    const second = toggleAutoPullBranch(first, 'C:/repo-b', 'main')
    expect(second).toEqual({ 'C:/repo-a': ['main'], 'C:/repo-b': ['main'] })
    expect(toggleAutoPullBranch(second, 'C:/repo-a', 'main')).toEqual({ 'C:/repo-b': ['main'] })
  })
})
