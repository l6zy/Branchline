import { describe, expect, it } from 'vitest'
import { stageSelectionKey, visibleStagingSections } from './stagingSelection'

describe('staging selection identity', () => {
  it('keeps staged and unstaged views distinct for the same file', () => {
    expect(stageSelectionKey({ path: 'src/app.ts', scope: 'staged' })).not.toBe(stageSelectionKey({ path: 'src/app.ts', scope: 'unstaged' }))
  })
})

describe('visible staging sections', () => {
  it.each<[number, number, string[]]>([
    [0, 0, []],
    [2, 0, ['staged']],
    [0, 2, ['unstaged']],
    [2, 3, ['staged', 'unstaged']],
  ])('shows populated groups for %i staged and %i unstaged files', (stagedCount, unstagedCount, expected) => {
    expect(visibleStagingSections(stagedCount, unstagedCount)).toEqual(expected)
  })
})
