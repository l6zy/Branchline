import { describe, expect, it } from 'vitest'
import { initialCommitMessage } from './commitMessage'

describe('initial commit message', () => {
  it('uses the pending message for merge, cherry-pick and rebase operations', () => {
    expect(initialCommitMessage('template message', {
      kind: 'merge',
      message: "Merge branch 'feature/demo'\n\n# Conflicts:\n#\tREADME.md",
    })).toBe("Merge branch 'feature/demo'\n")
    expect(initialCommitMessage('template message', {
      kind: 'cherry-pick',
      message: 'picked commit message\n\n# Issue 123',
    })).toBe('picked commit message\n\n# Issue 123')
    expect(initialCommitMessage('template message', {
      kind: 'rebase',
      message: 'rebased commit message',
    })).toBe('rebased commit message')
  })

  it('keeps the configured template when no operation message exists', () => {
    expect(initialCommitMessage('template message', { kind: 'conflict', message: undefined })).toBe('template message')
    expect(initialCommitMessage('template message', { kind: 'cherry-pick', message: '   ' })).toBe('template message')
    expect(initialCommitMessage('template message')).toBe('template message')
  })
})
