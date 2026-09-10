export type StageScope = 'staged' | 'unstaged' | 'conflict'

export type StageSelection = {
  path: string
  scope: StageScope
}

export function stageSelectionKey(selection: StageSelection | null) {
  return selection ? `${selection.scope}:${selection.path}` : ''
}
