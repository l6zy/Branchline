export type StageScope = 'staged' | 'unstaged' | 'conflict'

export type StageSelection = {
  path: string
  scope: StageScope
}

export function stageSelectionKey(selection: StageSelection | null) {
  return selection ? `${selection.scope}:${selection.path}` : ''
}

export function visibleStagingSections(stagedCount: number, unstagedCount: number) {
  const sections: Exclude<StageScope, 'conflict'>[] = []
  if (stagedCount > 0) sections.push('staged')
  if (unstagedCount > 0) sections.push('unstaged')
  return sections
}

export function hasStagingChanges(stagedCount: number, unstagedCount: number, conflictCount: number) {
  return stagedCount > 0 || unstagedCount > 0 || conflictCount > 0
}
