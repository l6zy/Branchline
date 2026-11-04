import { describe, expect, it } from 'vitest'
import type { RepositoryDiffLine } from '../../repository'
import { buildNonWhitespacePatch, hasNonWhitespaceChanges, hideWhitespaceOnlyReplacements, isSubmodulePointerChange } from './nonWhitespaceStaging'

describe('non-whitespace staging', () => {
  it('detects that whitespace-only replacements have nothing substantive to stage', () => {
    const rows: RepositoryDiffLine[] = [
      { old: 1, next: 1, kind: 'same', code: '  first  ', oldCode: 'first', newCode: '  first  ' },
      { old: 2, next: 2, kind: 'same', code: 'second' },
    ]

    expect(hasNonWhitespaceChanges(rows)).toBe(false)
    expect(buildNonWhitespacePatch('file.txt', rows, 'M')).toBe('')
  })

  it('builds a patch from substantive rows and uses the old whitespace variant as context', () => {
    const rows: RepositoryDiffLine[] = [
      { old: 1, next: 1, kind: 'same', code: '  first  ', oldCode: 'first', newCode: '  first  ' },
      { old: 2, next: null, kind: 'del', code: 'second' },
      { old: null, next: 2, kind: 'add', code: 'second!' },
      { old: 3, next: 3, kind: 'same', code: 'third' },
    ]

    const patch = buildNonWhitespacePatch('file.txt', rows, 'M')
    expect(patch).toContain(' first\n')
    expect(patch).toContain('-second\n+second!\n')
    expect(patch).not.toContain('+  first  ')
  })

  it('builds a new-file patch from every added line', () => {
    const rows: RepositoryDiffLine[] = ['one', 'two'].map((code, index) => ({ old: null, next: index + 1, kind: 'add' as const, code }))

    const patch = buildNonWhitespacePatch('new.txt', rows, 'A')
    expect(patch).toContain('new file mode 100644')
    expect(patch).toContain('+one\n+two\n')
  })

  it('recognizes a submodule pointer update instead of treating it as text', () => {
    const rows: RepositoryDiffLine[] = [
      { old: 1, next: null, kind: 'del', code: 'Subproject commit 0c7268889e466fd084d9bff647e108783781e9cd' },
      { old: null, next: 1, kind: 'add', code: 'Subproject commit 4d845d158eb2c844685b4471801f9618d5265a34' },
    ]

    expect(isSubmodulePointerChange(rows)).toBe(true)
    expect(isSubmodulePointerChange([{ old: 1, next: 1, kind: 'same', code: 'Subproject commit 4d845d158eb2c844685b4471801f9618d5265a34' }])).toBe(false)
  })

  it('hides replacements that differ only in internal whitespace', () => {
    const rows: RepositoryDiffLine[] = [
      { old: 1, next: null, kind: 'del', code: 'call(one, two)' },
      { old: null, next: 1, kind: 'add', code: 'call(one,two)' },
    ]

    const filtered = hideWhitespaceOnlyReplacements(rows)
    expect(filtered).toHaveLength(1)
    expect(filtered[0]).toMatchObject({ kind: 'same', code: 'call(one,two)', oldCode: 'call(one, two)', newCode: 'call(one,two)' })
    expect(hasNonWhitespaceChanges(filtered)).toBe(false)
    expect(buildNonWhitespacePatch('file.txt', rows, 'M')).toBe('')
  })
})
