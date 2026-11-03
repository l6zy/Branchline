import type { RepositoryOperationState, ConflictFileContent } from '../repository'
import type { AppTranslator } from './useAppTranslation'
const operationKeys = {
  merge: 'operations:kind.merge', rebase: 'operations:kind.rebase',
  'cherry-pick': 'operations:kind.cherry-pick', conflict: 'operations:kind.conflict',
} as const
const sideKeys = {
  'current-branch': 'operations:side.current-branch', 'rebase-target': 'operations:side.rebase-target',
  'incoming-branch': 'operations:side.incoming-branch', 'applied-commit': 'operations:side.applied-commit',
} as const
export function operationLabel(kind: RepositoryOperationState['kind'], t: AppTranslator) { return t(operationKeys[kind]) }
export function conflictSideLabel(side: ConflictFileContent['currentSide'] | ConflictFileContent['incomingSide'], t: AppTranslator) { return t(sideKeys[side]) }
