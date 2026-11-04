import type { RepositoryDiffLine } from '../../repository'
import { buildStagePatch } from '../diff/DiffPanel'

export function hasNonWhitespaceChanges(rows: RepositoryDiffLine[]) {
  return rows.some((row) => row.kind !== 'same')
}

/** A gitlink change is a pointer update, not a text patch that Git can apply. */
export function isSubmodulePointerChange(rows: RepositoryDiffLine[]) {
  const changed = rows.filter((row) => row.kind !== 'same')
  return changed.length > 0 && changed.every((row) => /^Subproject commit [0-9a-f]{40}$/.test(row.code.trim()))
}

function withoutWhitespace(code: string) {
  return code.replace(/\s+/g, '')
}

/**
 * Merges replacement pairs whose only difference is whitespace. The backend
 * already folds leading/trailing differences into context rows; this also
 * covers differences inside a line, matching the promise that only lines with
 * actual code changes are staged.
 */
export function hideWhitespaceOnlyReplacements(rows: RepositoryDiffLine[]) {
  const result: RepositoryDiffLine[] = []
  let index = 0
  while (index < rows.length) {
    if (rows[index].kind === 'same') {
      result.push(rows[index])
      index += 1
      continue
    }
    const start = index
    while (index < rows.length && rows[index].kind !== 'same') index += 1
    const block = rows.slice(start, index)
    const deletions = block.filter((row) => row.kind === 'del')
    const additions = block.filter((row) => row.kind === 'add')
    const pendingDeletions: RepositoryDiffLine[] = []
    const pendingAdditions: RepositoryDiffLine[] = []
    for (let pair = 0; pair < Math.max(deletions.length, additions.length); pair += 1) {
      const deletion = deletions[pair]
      const addition = additions[pair]
      if (deletion && addition && withoutWhitespace(deletion.code) === withoutWhitespace(addition.code)) {
        result.push(...pendingDeletions, ...pendingAdditions)
        pendingDeletions.length = 0
        pendingAdditions.length = 0
        result.push({
          old: deletion.old,
          next: addition.next,
          kind: 'same',
          code: addition.code,
          oldCode: deletion.oldCode ?? deletion.code,
          newCode: addition.newCode ?? addition.code,
          oldNoNewline: deletion.oldNoNewline,
          newNoNewline: addition.newNoNewline,
        })
        continue
      }
      if (deletion) pendingDeletions.push(deletion)
      if (addition) pendingAdditions.push(addition)
    }
    result.push(...pendingDeletions, ...pendingAdditions)
  }
  return result
}

/**
 * Builds a patch that stages every row with a substantive change while keeping
 * whitespace-only replacements out of the index. Callers load `rows` with the
 * whitespace filter enabled, so leading and trailing differences already appear
 * as context rows; `hideWhitespaceOnlyReplacements` also folds differences
 * inside a line.
 */
export function buildNonWhitespacePatch(filePath: string, rows: RepositoryDiffLine[], fileType?: string) {
  const filtered = hideWhitespaceOnlyReplacements(rows)
  return hasNonWhitespaceChanges(filtered) ? buildStagePatch(filePath, filtered, fileType, 'stage', filtered) : ''
}
