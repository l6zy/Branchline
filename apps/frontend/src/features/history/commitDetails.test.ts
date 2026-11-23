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
    expect(details).toContain('history:app.details.jumpParent')
  })

  it('adds an all-files view while preserving the existing list and tree views', () => {
    expect(files).toContain("usePersistentState('branchline.changedFilesMode.v1', 'list', isFileMode)")
    expect(files).toContain('history:app.files.showAll')
    expect(files).toContain('segmented compact-segmented icon-segmented')
    expect(files).toContain("content={t('history:app.files.list')}")
    expect(files).toContain("content={t('history:app.files.tree')}")
    expect(files).toContain("mode={fileMode === 'list' ? 'list' : 'tree'}")
    expect(files).toContain("changedPaths={effectiveFileMode === 'all' ? changedPaths : undefined}")
    expect(files).toContain('buildCommitFileTree(treePaths, files, true)')
    expect(files).toContain('changeIndex')
    expect(files).toContain('treeError')
    expect(files).toContain('filterCommitFilesByPath(displayFiles, appliedFileQuery)')
    expect(files).toContain("aria-label={t('history:app.files.filter')}")
    expect(files).toContain('fileMode === \'all\' && treePaths ?')
    expect(files).toContain('activeCommitFileIndex(filteredFiles, activeFilePath)')
    expect(files).toContain('files={filteredFiles} activeFile={activeFilteredFile}')
    expect(files).toContain('files.indexOf(file)')
    expect(app).toContain('loadRepositoryCommitFileContent')
    expect(app).toContain('fileContentOnly loadRows={(path) => loadSelectedCommitFileContent(path)}')
    expect(app).not.toContain('commit-file-viewer')
  })

  it('keeps list and tree controls available for working-tree files', () => {
    expect(files).toContain("fileMode === 'all' && treePaths ? 'all' : fileMode")
    expect(files).toContain('className="segmented compact-segmented icon-segmented"')
    expect(files).toContain("{treePaths && <Tooltip content={t('history:app.files.showAll')}>")
  })

  it('accepts persisted list, tree, and all-files modes', () => {
    expect(app).toContain("const isFileMode = (value: unknown): value is 'list' | 'tree' | 'all' => value === 'list' || value === 'tree' || value === 'all'")
  })

  it('rechecks selection visibility after history filters are cleared', () => {
    const selectionEffect = app.slice(app.indexOf('const index = filtered.findIndex((commit) => commit.id === selected)'))
    expect(selectionEffect.slice(0, selectionEffect.indexOf('const committerColumnVisible'))).toContain('[revealSignal, selected, selectedVisible, deferredQuery]')
  })

  it('animates refreshed commits from above while preserving row layout motion', () => {
    expect(app).toContain('const seenCommitIds = useRef(new Set<string>())')
    expect(app).toContain('const revealActive = previousRevealSignal.current !== revealSignal')
    expect(app).toContain('initial={shouldAnimate ? { opacity: 0, y: -COMMIT_ROW_HEIGHT } : false}')
    expect(app).toContain('layout="position"')
    expect(app).toContain('findNewHistoryCommitIds(historyBaseline.current, commits)')
  })

  it('keeps new commits pending until the refresh animation expires, including virtualized rows', () => {
    expect(app).not.toContain('setNewCommitIds(visibleNewIds)')
    expect(app).toContain('for (const commit of visibleCommits) seenCommitIds.current.add(commit.fullHash ?? commit.id)')
  })
})
