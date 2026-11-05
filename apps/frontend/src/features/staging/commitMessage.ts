import type { RepositoryOperationState } from '../../repository'

export function templateMessage(content: string) {
  return content
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')
}

export function initialCommitMessage(
  templateContent: string,
  operation?: Pick<RepositoryOperationState, 'kind' | 'message'>,
) {
  const operationMessage = operation && operation.kind !== 'conflict' ? operation.message : undefined
  if (!operationMessage?.trim()) return templateMessage(templateContent)
  // Git adds explanatory comments to MERGE_MSG; a cherry-pick or rebase message is the
  // original commit text and must be preserved verbatim.
  return operation?.kind === 'merge' ? templateMessage(operationMessage) : operationMessage
}
