import { describe, expect, it } from 'vitest'
import { buildCommitFileTree, compareCommitTreeEntries, visibleCommitTreeFiles } from './commitFileTree'

describe('commit source file tree', () => {
  it('includes common source/config paths and excludes assets', () => {
    const tree = buildCommitFileTree(['src/main.ts', 'src/lib.rs', 'config/tool.toml', 'src/Branchline.csproj', 'Branchline.sln', 'Directory.Build.props', 'Dockerfile', '.gitignore', 'image.png', 'font.woff2'], [])
    expect(tree.files.map((file) => file.path)).toEqual(['.gitignore', 'Branchline.sln', 'config/tool.toml', 'Directory.Build.props', 'Dockerfile', 'src/Branchline.csproj', 'src/lib.rs', 'src/main.ts'])
  })

  it('includes every Git tree path when the all-files scope is enabled', () => {
    const tree = buildCommitFileTree(['src/main.ts', 'assets/logo.png', 'docs/guide.pdf'], [], true)
    expect(tree.files.map((file) => file.path)).toEqual(['assets/logo.png', 'docs/guide.pdf', 'src/main.ts'])
    expect(tree.files.every((file) => !file.changed)).toBe(true)
  })

  it('marks changed files and every ancestor while preserving diff indices', () => {
    const changed = [{ path: 'src/deep/app.ts', type: 'M', add: 2, del: 1 }, { path: 'src/deleted.ts', type: 'D', add: 0, del: 3 }]
    const tree = buildCommitFileTree(['src/deep/app.ts', 'src/keep.ts'], changed)
    expect(tree.files.find((file) => file.path === 'src/deep/app.ts')).toMatchObject({ changed: true, changeIndex: 0, type: 'M' })
    expect(tree.files.find((file) => file.path === 'src/keep.ts')).toMatchObject({ changed: false, changeIndex: null })
    expect(tree.files.find((file) => file.path === 'src/deleted.ts')).toMatchObject({ changed: true, changeIndex: 1, type: 'D' })
    expect(tree.changedFolders).toEqual(['src', 'src/deep'])
  })

  it('normalizes separators and returns an empty tree for no code paths', () => {
    expect(buildCommitFileTree(['src\\keep.ts'], [{ path: 'src/keep.ts', type: 'A', add: 1, del: 0 }]).files).toHaveLength(1)
    expect(buildCommitFileTree(['image.png'], []).files).toEqual([])
  })

  it('keeps changed assets visible in the changed-only tree', () => {
    const tree = buildCommitFileTree(['src/app.ts', 'assets/logo.png'], [
      { path: 'src/app.ts', type: 'M', add: 1, del: 0 },
      { path: 'assets/logo.png', type: 'M', add: 1, del: 1 },
    ])
    expect(visibleCommitTreeFiles(tree.files, true).map((file) => file.path)).toEqual(['assets/logo.png', 'src/app.ts'])
    expect(buildCommitFileTree(['assets/keep.png'], []).files).toEqual([])
  })

  it('keeps the changed-only view filtered while retaining folders before root files', () => {
    const tree = buildCommitFileTree(['src/main.ts', 'README.md', 'src/lib/core.ts'], [{ path: 'src/main.ts', type: 'M', add: 1, del: 0 }])
    expect(tree.files.map((file) => file.path)).toEqual(['README.md', 'src/lib/core.ts', 'src/main.ts'])
    expect(tree.files.filter((file) => file.changed).map((file) => file.path)).toEqual(['src/main.ts'])
    expect(visibleCommitTreeFiles(tree.files, true).map((file) => file.path)).toEqual(['src/main.ts'])
    expect(visibleCommitTreeFiles(tree.files, false)).toHaveLength(3)
  })

  it('sorts folders before files at every tree level', () => {
    const entries = [
      { kind: 'file' as const, name: 'alpha.ts' },
      { kind: 'folder' as const, name: 'zeta' },
      { kind: 'folder' as const, name: 'alpha' },
      { kind: 'file' as const, name: 'beta.ts' },
    ].sort(compareCommitTreeEntries)
    expect(entries.map(({ kind, name }) => `${kind}:${name}`)).toEqual(['folder:alpha', 'folder:zeta', 'file:alpha.ts', 'file:beta.ts'])
  })
})
