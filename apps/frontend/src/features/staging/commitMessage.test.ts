import { describe, expect, it } from 'vitest'
import { initialCommitMessage } from './commitMessage'

describe('initial commit message', () => {
  it('uses the generated merge message and removes Git comment lines', () => {
    expect(initialCommitMessage('template message', {
      kind: 'merge',
      message: "Merge branch 'feature/demo'\n\n# Conflicts:\n#\tREADME.md",
    })).toBe("Merge branch 'feature/demo'\n")
  })

  it('keeps the configured template outside a merge operation', () => {
    expect(initialCommitMessage('template message', {
      kind: 'cherry-pick',
      message: 'picked commit message',
    })).toBe('template message')
    expect(initialCommitMessage('template message')).toBe('template message')
  })
})
