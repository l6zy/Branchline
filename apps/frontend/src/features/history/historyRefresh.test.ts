import { describe, expect, it } from 'vitest'
import { captureCommitAnchor, resolveCommitSelection, restoreCommitAnchor } from './historyRefresh'

const commits = (...ids: string[]) => ids.map((id) => ({ id }))

describe('history refresh position', () => {
  it('keeps the same visible commit offset when newer commits are inserted above it', () => {
    const before = commits('c5', 'c4', 'c3', 'c2', 'c1')
    const anchor = captureCommitAnchor(before, 2 * 32 + 7, 32)

    expect(restoreCommitAnchor(commits('c7', 'c6', ...before.map((commit) => commit.id)), anchor, 32, 0)).toBe(4 * 32 + 7)
  })

  it('keeps the closest previous neighbor when the selected commit disappears', () => {
    expect(resolveCommitSelection(
      commits('c5', 'c4', 'c3', 'c2', 'c1'),
      commits('c6', 'c5', 'c3', 'c2', 'c1'),
      'c4',
    )).toBe('c5')
  })

  it('retains the bounded numeric position when the viewport anchor disappears', () => {
    const anchor = captureCommitAnchor(commits('c3', 'c2', 'c1'), 37, 32)
    expect(restoreCommitAnchor(commits('n2', 'n1'), anchor, 32, 19)).toBe(19)
  })
})
