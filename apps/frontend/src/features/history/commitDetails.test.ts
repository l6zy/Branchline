import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8')
const details = app.slice(app.indexOf('function CommitDetails('), app.indexOf('function ChangedFilesPanel('))
const files = app.slice(app.indexOf('function ChangedFilesPanel('), app.indexOf('function ShortcutOverlay('))

describe('commit inspector controls', () => {
  it('keeps the full message copy control without a redundant overflow menu', () => {
    expect(details).toContain('onClick={copy}')
    expect(details).not.toContain('moreMenu')
    expect(details).not.toContain('copyHash')
  })

  it('renders parent hashes as navigation buttons', () => {
    expect(details).toContain('onOpenParent(parent)')
    expect(details).toContain('跳转到父提交')
  })

  it('adds an all-files view while preserving the existing list and tree views', () => {
    expect(files).toContain("useState<'list' | 'tree' | 'all'>('tree')")
    expect(files).toContain('显示全部文件')
    expect(files).toContain('title="列表视图"')
    expect(files).toContain('title="树形视图"')
    expect(files).toContain("mode={fileMode === 'list' ? 'list' : 'tree'}")
    expect(files).toContain("changedPaths={fileMode === 'all' ? changedPaths : undefined}")
    expect(files).toContain('buildCommitFileTree(treePaths, files, true)')
    expect(files).toContain('changeIndex')
    expect(files).toContain('treeError')
    expect(files).toContain('activeFile === null ? -1')
    expect(app).toContain('loadRepositoryCommitFileContent')
  })

  it('rechecks selection visibility after history filters are cleared', () => {
    const selectionEffect = app.slice(app.indexOf('const index = filtered.findIndex((commit) => commit.id === selected)'))
    expect(selectionEffect.slice(0, selectionEffect.indexOf('const committerColumnVisible'))).toContain('[revealSignal, selected, selectedVisible, deferredQuery]')
  })
})
