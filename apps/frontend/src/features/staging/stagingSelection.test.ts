import { describe, expect, it } from 'vitest'
import { stageSelectionKey } from './stagingSelection'

describe('staging selection identity', () => {
  it('keeps staged and unstaged views distinct for the same file', () => {
    expect(stageSelectionKey({ path: 'src/app.ts', scope: 'staged' })).not.toBe(stageSelectionKey({ path: 'src/app.ts', scope: 'unstaged' }))
  })
})
