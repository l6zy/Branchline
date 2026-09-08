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
  const content = operation?.kind === 'merge' && operation.message?.trim()
    ? operation.message
    : templateContent
  return templateMessage(content)
}
