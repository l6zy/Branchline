import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RepositoryDiffLine } from '../../repository'
import { buildStagePatch, changeBlock, changeLine } from './DiffPanel'

function repository(before: string | null, after: string, run: (git: (...args: string[]) => string, path: string) => void) {
  const path = mkdtempSync(join(tmpdir(), 'branchline-patch-'))
  const git = (...args: string[]) => execFileSync('git', ['-C', path, ...args], { encoding: 'utf8', windowsHide: true })
  try {
    git('init'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.com'); git('config', 'core.autocrlf', 'false')
    if (before !== null) { writeFileSync(join(path, 'file.txt'), before); git('add', '.'); git('commit', '-m', 'baseline') }
    writeFileSync(join(path, 'file.txt'), after)
    run(git, path)
  } finally { rmSync(path, { recursive: true, force: true }) }
}

function apply(path: string, patch: string, reverse = false, cached = true) {
  execFileSync('git', ['-C', path, 'apply', ...(cached ? ['--cached'] : []), '--recount', '--whitespace=nowarn', ...(reverse ? ['--reverse'] : []), '-'], { input: patch, windowsHide: true })
}

const replacements: RepositoryDiffLine[] = [
  { old: 1, next: 1, kind: 'same', code: 'before' },
  { old: 2, next: null, kind: 'del', code: 'old one' },
  { old: 3, next: null, kind: 'del', code: 'old two' },
  { old: null, next: 2, kind: 'add', code: 'new one' },
  { old: null, next: 3, kind: 'add', code: 'new two' },
  { old: 4, next: 4, kind: 'same', code: 'after' },
]

describe('selected diff patches applied by Git', () => {
  for (const operation of ['stage', 'restore', 'unstage'] as const) {
    for (const selection of ['line', 'block'] as const) {
      it(`preserves CRLF when applying a selected ${selection} for ${operation}`, () => {
        const before = 'before\r\nold one\r\nold two\r\nafter\r\n'
        const after = 'before\r\nnew one\r\nnew two\r\nafter\r\n'
        repository(before, after, (git, path) => {
          if (operation === 'unstage') git('add', '.')
          git('config', 'core.autocrlf', 'input')
          const rows = replacements.map((row) => ({
            ...row,
            oldCode: row.kind === 'add' ? undefined : row.code + '\r',
            newCode: row.kind === 'del' ? undefined : row.code + '\r',
          }))
          const selected = selection === 'line' ? changeLine(rows, 4) : changeBlock(rows, 4)
          apply(path, buildStagePatch('file.txt', selected, undefined, operation, rows), operation !== 'stage', operation !== 'restore')
          const result = operation === 'restore' ? readFileSync(join(path, 'file.txt'), 'utf8') : git('show', ':file.txt')
          expect(result).toBe(selection === 'block'
            ? operation === 'stage' ? after : before
            : operation === 'stage' ? 'before\r\nold one\r\nnew two\r\nafter\r\n' : 'before\r\nnew one\r\nold two\r\nafter\r\n')
          if (operation !== 'restore') expect(readFileSync(join(path, 'file.txt'), 'utf8')).toBe(after)
        })
      })
    }
    it('applies only the selected hunk across a source coordinate gap for ' + operation, () => {
      const before = Array.from({ length: 40 }, (_, index) => 'line ' + (index + 1))
      const after = [...before]
      after[0] = 'changed first'
      after[39] = 'changed last'
      repository(before.join('\n') + '\n', after.join('\n') + '\n', (git, path) => {
        if (operation === 'unstage') git('add', '.')
        const rows: RepositoryDiffLine[] = [
          { old: 1, next: null, kind: 'del', code: before[0] },
          { old: null, next: 1, kind: 'add', code: after[0] },
          { old: 2, next: 2, kind: 'same', code: before[1] },
          { old: 39, next: 39, kind: 'same', code: before[38] },
          { old: 40, next: null, kind: 'del', code: before[39] },
          { old: null, next: 40, kind: 'add', code: after[39] },
        ]
        const selected = operation === 'stage' ? 1 : 5
        apply(path, buildStagePatch('file.txt', changeLine(rows, selected), undefined, operation, rows), operation !== 'stage', operation !== 'restore')
        const result = operation === 'restore' ? readFileSync(join(path, 'file.txt'), 'utf8') : git('show', ':file.txt')
        const expected = operation === 'stage' ? [...before] : [...after]
        expected[operation === 'stage' ? 0 : 39] = operation === 'stage' ? after[0] : before[39]
        expect(result).toBe(expected.join('\n') + '\n')
      })
    })
  }
  it('stages only the second replacement and leaves the worktree intact', () => {
    repository('before\nold one\nold two\nafter\n', 'before\nnew one\nnew two\nafter\n', (git, path) => {
      apply(path, buildStagePatch('file.txt', changeLine(replacements, 4), undefined, 'stage', replacements))
      expect(git('show', ':file.txt')).toBe('before\nold one\nnew two\nafter\n')
      expect(readFileSync(join(path, 'file.txt'), 'utf8')).toBe('before\nnew one\nnew two\nafter\n')
    })
  })

  it('stages a selected middle line from an untracked file', () => {
    repository(null, 'one\ntwo\nthree\n', (git, path) => {
      const rows: RepositoryDiffLine[] = ['one', 'two', 'three'].map((code, index) => ({ old: null, next: index + 1, kind: 'add', code }))
      apply(path, buildStagePatch('file.txt', changeLine(rows, 1), 'A', 'stage', rows))
      expect(git('show', ':file.txt')).toBe('two\n')
    })
  })

  it('stages a block within a deleted file without deleting the other lines', () => {
    repository('one\ntwo\nthree\n', '', (git, path) => {
      const rows: RepositoryDiffLine[] = ['one', 'two', 'three'].map((code, index) => ({ old: index + 1, next: null, kind: 'del', code }))
      apply(path, buildStagePatch('file.txt', changeLine(rows, 1), 'D', 'stage', rows))
      expect(git('show', ':file.txt')).toBe('one\nthree\n')
    })
  })

  it('unstages one replacement while preserving other staged and unstaged changes', () => {
    repository('before\nold one\nold two\nafter\n', 'before\nnew one\nnew two\nafter\n', (git, path) => {
      git('add', '.')
      writeFileSync(join(path, 'file.txt'), 'before\nnew one\nnew two\nafter\nlocal\n')
      apply(path, buildStagePatch('file.txt', changeLine(replacements, 4), undefined, 'unstage', replacements), true)
      expect(git('show', ':file.txt')).toBe('before\nnew one\nold two\nafter\n')
      expect(readFileSync(join(path, 'file.txt'), 'utf8')).toBe('before\nnew one\nnew two\nafter\nlocal\n')
    })
  })

  it('unstages part of a new file without removing its other staged lines', () => {
    repository(null, 'one\ntwo\nthree\n', (git, path) => {
      git('add', '.')
      const rows: RepositoryDiffLine[] = ['one', 'two', 'three'].map((code, index) => ({ old: null, next: index + 1, kind: 'add', code }))
      apply(path, buildStagePatch('file.txt', changeLine(rows, 1), 'A', 'unstage', rows), true)
      expect(git('show', ':file.txt')).toBe('one\nthree\n')
    })
  })

  it('unstages a whole replacement block', () => {
    repository('before\nold one\nold two\nafter\n', 'before\nnew one\nnew two\nafter\n', (git, path) => {
      git('add', '.')
      apply(path, buildStagePatch('file.txt', changeBlock(replacements, 4), undefined, 'unstage', replacements), true)
      expect(git('show', ':file.txt')).toBe('before\nold one\nold two\nafter\n')
    })
  })

  it('preserves a missing final newline when staging a block', () => {
    repository('old', 'new', (git, path) => {
      const rows: RepositoryDiffLine[] = [
        { old: 1, next: null, kind: 'del', code: 'old', oldNoNewline: true },
        { old: null, next: 1, kind: 'add', code: 'new', newNoNewline: true },
      ]
      apply(path, buildStagePatch('file.txt', changeBlock(rows, 0), undefined, 'stage', rows))
      expect(git('show', ':file.txt')).toBe('new')
    })
  })

  it('restores only one replacement while retaining the other worktree change', () => {
    repository('before\nold one\nold two\nafter\n', 'before\nnew one\nnew two\nafter\n', (git, path) => {
      apply(path, buildStagePatch('file.txt', changeLine(replacements, 4), undefined, 'restore', replacements), true, false)
      expect(readFileSync(join(path, 'file.txt'), 'utf8')).toBe('before\nnew one\nold two\nafter\n')
      expect(git('show', ':file.txt')).toBe('before\nold one\nold two\nafter\n')
    })
  })

  it('restores a selected line of a deleted file without restoring all lines', () => {
    repository('one\ntwo\nthree\n', '', (_git, path) => {
      rmSync(join(path, 'file.txt'))
      const rows: RepositoryDiffLine[] = ['one', 'two', 'three'].map((code, index) => ({ old: index + 1, next: null, kind: 'del', code }))
      apply(path, buildStagePatch('file.txt', changeLine(rows, 1), 'D', 'restore', rows), true, false)
      expect(readFileSync(join(path, 'file.txt'), 'utf8')).toBe('two\n')
    })
  })

  it('unstages a selected deletion from a fully deleted file', () => {
    repository('one\ntwo\nthree\n', '', (git, path) => {
      rmSync(join(path, 'file.txt')); git('add', '.')
      const rows: RepositoryDiffLine[] = ['one', 'two', 'three'].map((code, index) => ({ old: index + 1, next: null, kind: 'del', code }))
      apply(path, buildStagePatch('file.txt', changeLine(rows, 1), 'D', 'unstage', rows), true)
      expect(git('show', ':file.txt')).toBe('two\n')
    })
  })

  it('stages a later block without staging earlier additions or shifting its location', () => {
    repository('first\nmiddle\nold\nend\n', 'first\nextra\nmiddle\nnew\nend\n', (git, path) => {
      const rows: RepositoryDiffLine[] = [
        { old: 1, next: 1, kind: 'same', code: 'first' },
        { old: null, next: 2, kind: 'add', code: 'extra' },
        { old: 2, next: 3, kind: 'same', code: 'middle' },
        { old: 3, next: null, kind: 'del', code: 'old' },
        { old: null, next: 4, kind: 'add', code: 'new' },
        { old: 4, next: 5, kind: 'same', code: 'end' },
      ]
      apply(path, buildStagePatch('file.txt', changeBlock(rows, 4), undefined, 'stage', rows))
      expect(git('show', ':file.txt')).toBe('first\nmiddle\nnew\nend\n')
    })
  })

  it('stages a block while preserving a hidden trailing whitespace change', () => {
    repository('old\n tail\n', 'new\n  tail  \n', (git, path) => {
      const rows: RepositoryDiffLine[] = [
        { old: 1, next: null, kind: 'del', code: 'old' },
        { old: null, next: 1, kind: 'add', code: 'new' },
        { old: 2, next: 2, kind: 'same', code: '  tail  ', oldCode: ' tail', newCode: '  tail  ' },
      ]
      apply(path, buildStagePatch('file.txt', changeBlock(rows, 1), undefined, 'stage', rows))
      expect(git('show', ':file.txt')).toBe('new\n tail\n')
      expect(readFileSync(join(path, 'file.txt'), 'utf8')).toBe('new\n  tail  \n')
    })
  })

  it('unstages substantive changes while keeping hidden staged whitespace', () => {
    repository('old\n tail\n', 'new\n  tail  \n', (git, path) => {
      git('add', '.')
      const rows: RepositoryDiffLine[] = [
        { old: 1, next: null, kind: 'del', code: 'old' },
        { old: null, next: 1, kind: 'add', code: 'new' },
        { old: 2, next: 2, kind: 'same', code: '  tail  ', oldCode: ' tail', newCode: '  tail  ' },
      ]
      apply(path, buildStagePatch('file.txt', changeBlock(rows, 1), undefined, 'unstage', rows), true)
      expect(git('show', ':file.txt')).toBe('old\n  tail  \n')
    })
  })

  for (const operation of ['stage', 'restore', 'unstage'] as const) {
    it('keeps the line boundary when applying a partial ' + operation + ' at an unterminated EOF', () => {
      repository('old', 'new\nextra', (git, path) => {
        if (operation === 'unstage') git('add', '.')
        const rows: RepositoryDiffLine[] = [
          { old: 1, next: null, kind: 'del', code: 'old', oldNoNewline: true },
          { old: null, next: 1, kind: 'add', code: 'new' },
          { old: null, next: 2, kind: 'add', code: 'extra', newNoNewline: true },
        ]
        const selection = changeLine(rows, operation === 'stage' ? 2 : 1)
        apply(path, buildStagePatch('file.txt', selection, undefined, operation, rows), operation !== 'stage', operation !== 'restore')
        const result = operation === 'restore' ? readFileSync(join(path, 'file.txt'), 'utf8') : git('show', ':file.txt')
        expect(result).toBe('old\nextra')
      })
    })
  }
})
