import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
const tokens = readFileSync(new URL('./styles/tokens.css', import.meta.url), 'utf8')
const components = readFileSync(new URL('./styles/components.css', import.meta.url), 'utf8')
const features = readFileSync(new URL('./styles/features.css', import.meta.url), 'utf8')
const layout = readFileSync(new URL('./styles/layout.css', import.meta.url), 'utf8')
const themeOverrides = readFileSync(new URL('./styles/theme-overrides.css', import.meta.url), 'utf8')
const repositoryManagerStyles = readFileSync(new URL('./styles/repository-manager.css', import.meta.url), 'utf8')
const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
const diffPanel = readFileSync(new URL('./features/diff/DiffPanel.tsx', import.meta.url), 'utf8')

describe('semantic style architecture', () => {
  it('reserves horizontal scrollbar tracks for unified and split diff panes', () => {
    expect(features.match(/\.unified-diff-pane \{[^}]+\}/)?.[0]).toContain('overflow-x: scroll;')
    expect(components.match(/\.split-diff-pane \{[^}]+\}/)?.[0]).toContain('overflow-x: scroll;')
  })

  it('aligns the native title bar with the active theme and gives blame a wide code workspace', () => {
    expect(app).toContain("window.matchMedia?.('(prefers-color-scheme: dark)')")
    expect(app).toContain('getCurrentWindow().setTheme(resolvedTheme)')
    expect(app).toContain("resolvedTheme === 'light' ? 'theme-light' : ''")
    expect(app).toContain('className="app-titlebar"')
    expect(readFileSync(new URL('../../desktop/tauri.conf.json', import.meta.url), 'utf8')).toContain('"decorations": false')
    expect(features.match(/\.history-drawer \{[^}]+\}/)?.[0]).toContain('96vw')
    expect(features.match(/\.blame-workspace \{[^}]+\}/)?.[0]).toContain('minmax(360px, 1fr)')
    expect(features).toContain('.blame-workspace.wide { grid-template-columns: minmax(0, 1fr); }')
    expect(features).toContain('.blame-row { width: 100%; height: 26px; min-height: 26px;')
    expect(layout).toContain('.window-controls { grid-column: 5; height: 100%; display: flex; }')
    expect(layout).toContain('.titlebar-repository-controls { grid-column: 2; width: min(250px, 32vw);')
    expect(components).toContain('.titlebar-repository-controls .repo-switcher { height: 28px; min-height: 28px;')
    expect(layout).toMatch(/\.app-shell \{[^}]*grid-template-rows: 40px minmax\(0, 1fr\);/)
    expect(layout).toContain('.app-shell.workbench-active { grid-template-rows: 40px 54px minmax(0, 1fr);')
    expect(layout).toContain('.topbar { grid-column: 1 / -1; grid-row: 2;')
    expect(components).toContain('.titlebar-repository-controls .repo-switcher strong { max-width: 70%; flex: 0 1 auto; font-size: 12px;')
    expect(components).toContain('.titlebar-repository-controls .repo-switcher span { min-width: 0; flex: 1; font-size: 10px;')
  })
  it('wires a persisted rounded theme through both theme controls', () => {
    const repositoryManager = readFileSync(new URL('./features/repository/RepositoryManagerPage.tsx', import.meta.url), 'utf8')
    expect(app).toContain("usePersistentState('branchline.rounded.v2', true, isRoundedPreference)")
    expect(app).toContain("rounded ? 'theme-rounded' : ''")
    expect(app).toContain('<PanelTop size={14}/>')
    expect(repositoryManager).toContain('rounded: boolean')
    expect(repositoryManager).toContain('onToggleRounded: () => void')
  })
  it('scopes rounded surfaces and contrast without restyling code panes', () => {
    expect(tokens).toContain('--rounded-panel-radius:')
    expect(tokens).toContain('--rounded-border:')
    expect(tokens).toContain('--rounded-text-primary:')
    expect(themeOverrides).toContain('.theme-rounded .app-titlebar')
    expect(themeOverrides).toContain('.theme-rounded .sidebar')
    expect(themeOverrides).toContain('.theme-rounded .topbar')
    expect(themeOverrides).toContain('.theme-rounded .content-tabs')
    expect(themeOverrides).toContain('.theme-rounded .workspace-page')
    expect(themeOverrides).toContain('.theme-rounded .inspector-pane')
    expect(themeOverrides).toContain('.theme-rounded .statusbar')
    expect(themeOverrides).toContain('.theme-rounded .context-menu')
    expect(themeOverrides).toContain('.theme-rounded .button-secondary')
    expect(themeOverrides).not.toContain('.theme-rounded .diff-viewer')
    expect(themeOverrides).not.toContain('.theme-rounded .conflict-code-editor')
    expect(themeOverrides).toContain('.theme-rounded.workbench-active::before { content:')
    expect(themeOverrides).toContain('inset: 40px var(--rounded-surface-gap) var(--rounded-surface-gap);')
    expect(themeOverrides).toContain('.theme-rounded .workspace { position: relative; margin: 0 var(--rounded-surface-gap)')
    expect(themeOverrides).toContain('.theme-rounded .sidebar-shell { box-sizing: border-box; padding: 0 0 var(--rounded-surface-gap) var(--rounded-surface-gap);')
    expect(themeOverrides).toContain('.theme-rounded .sidebar { min-width: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }')
    expect(themeOverrides).toContain('.theme-rounded .app-titlebar { inset: 0;')
    expect(themeOverrides).toContain('.theme-rounded .topbar { position: relative; margin: 0 var(--rounded-surface-gap); border: 0; border-bottom: 1px solid var(--rounded-divider); border-radius: 0;')
    expect(themeOverrides).toContain('.theme-rounded .panel-resizer::before { top: 0; bottom: 0; left: 50%; transform: translateX(-50%); background: var(--rounded-divider);')
    expect(themeOverrides).toContain('.theme-rounded .commit-columns-header { border-bottom-color: var(--rounded-divider);')
    expect(themeOverrides).toContain('.theme-rounded .inspector-pane { border: 0;')
    expect(themeOverrides).toContain('.theme-rounded .history-pane,')
    expect(themeOverrides).toContain('.theme-rounded .staging-workspace { grid-template-columns: minmax(300px, var(--staging-control-width, 430px)) 4px minmax(0, 1fr);')
    expect(themeOverrides).toContain('.theme-rounded .stash-manager { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr);')
    expect(themeOverrides).toContain('.theme-rounded .stash-graph-handoff { display: none;')
    expect(themeOverrides).toContain('.theme-rounded .stage-section { margin-top: 4px; border: 0; border-radius: 0; background: transparent; box-shadow: none;')
    expect(app).toContain('`${sidebarWidth}px ${rounded ? 4 : 1}px minmax(0, 1fr)`')
    expect(app).toContain('${inspectorVisible ? rounded ? 4 : 1 : 0}px')
  })
  it('keeps commit graph geometry aligned with roomier rows and uses a continuous detail reading surface', () => {
    const rowHeight = Number(app.match(/const COMMIT_ROW_HEIGHT = (\d+)/)?.[1])
    const rowRule = features.match(/\.commit-row \{[^}]+\}/)?.[0] ?? ''
    expect(rowHeight).toBe(36)
    expect(rowRule).toContain(`height: ${rowHeight}px;`)
    expect(app).toContain('height={COMMIT_ROW_HEIGHT}')
    expect(app).toContain('buildCommitGraphLayout(filtered, widths.graph, COMMIT_ROW_HEIGHT)')
    expect(themeOverrides).toContain('.theme-rounded .commit-text-panel { margin-top: 10px; border: 0; border-radius: 0; background: transparent; }')
    expect(themeOverrides).toContain('.theme-rounded .commit-text-panel textarea { padding: 10px 0 0; color: var(--rounded-text-primary); background: transparent; font: 12px/1.7 "Segoe UI Variable", "Segoe UI", "Microsoft YaHei", sans-serif; white-space: pre-wrap; overflow-wrap: anywhere; resize: none; }')
  })
  it('animates sidebar layout changes while keeping column resizing direct', () => {
    expect(layout.match(/\.app-shell\.workbench-active \{[^}]+\}/)?.[0]).toContain('transition: grid-template-columns .22s ease;')
    expect(layout).toContain('.app-shell.panel-resizing .workspace-grid { transition: none; }')
  })
  it('preserves the original commit graph selection emphasis in the rounded theme', () => {
    expect(features).toContain('.commit-row.selected { color: var(--selection-text); background: var(--selection-surface); box-shadow: inset 3px 0 var(--accent),')
    expect(themeOverrides).not.toContain('.theme-rounded .commit-row.selected')
  })
  it('keeps rounded workbench content and the sidebar divider inside the shared surface', () => {
    expect(app).toContain("&& sidebarCollapsed ? 'sidebar-collapsed' : ''")
    expect(themeOverrides).toContain('.theme-rounded.sidebar-collapsed .workspace { margin-left: var(--rounded-surface-gap); }')
    expect(themeOverrides).toContain('.theme-rounded .sidebar-resizer { width: 100%; height: calc(100% - var(--rounded-surface-gap)); align-self: start; }')
  })
  it('removes both leading grid items when expanding the blame Diff', () => {
    expect(features).toContain('.blame-workspace.wide > .blame-list, .blame-workspace.wide > .blame-resizer { display: none; }')
    const drawer = readFileSync(new URL('./features/history/HistoryDrawer.tsx', import.meta.url), 'utf8')
    expect(drawer).not.toContain("wideDiff ? '0 0 minmax(0, 1fr)'")
  })
  it('keeps the history drawer below the custom title bar and expands file history diffs in wide mode', () => {
    expect(readFileSync(new URL('./features/history/HistoryDrawer.tsx', import.meta.url), 'utf8')).toContain('history-drawer-backdrop')
    expect(readFileSync(new URL('./features/history/HistoryDrawer.tsx', import.meta.url), 'utf8')).toContain('file-history-workspace ${wideDiff ? \'wide\' : \'\'}')
    expect(components).toContain('.history-drawer-backdrop { inset: 30px 0 0; }')
    expect(features).toContain('.file-history-workspace.wide { grid-template-columns: minmax(0, 1fr); }')
    expect(features).toContain('.file-history-workspace.wide > .file-history-list { display: none; }')
    expect(features).toContain('.history-drawer.wide-diff { width: 100vw; }')
  })
  it('keeps the Diff toolbar visible in the file history detail pane', () => {
    expect(features).toContain('.file-history-diff .diff-panel { height: 100%; min-height: 0; display: flex; flex-direction: column; }')
    expect(features).toContain('.file-history-diff .diff-toolbar { position: relative; z-index: 1; flex: 0 0 auto; }')
    expect(features).toContain('.file-history-diff .diff-body { min-height: 0; flex: 1; }')
  })
  it('grants the custom title bar permission to minimize, maximize, and close the window', () => {
    const capability = JSON.parse(readFileSync(new URL('../../desktop/capabilities/default.json', import.meta.url), 'utf8')) as { permissions: string[] }
    expect(capability.permissions).toEqual(expect.arrayContaining([
      'core:window:allow-close',
      'core:window:allow-is-maximized',
      'core:window:allow-minimize',
      'core:window:allow-toggle-maximize',
    ]))
  })
  it('loads styles through explicit cascade layers', () => {
    expect(styles).toContain('@layer tokens, base, layout, components, features, theme-overrides;')
    expect(styles).toContain("@import './styles/tokens.css' layer(tokens);")
    expect(styles).toContain("@import './styles/theme-overrides.css' layer(theme-overrides);")
  })

  it('defines theme-independent semantic tokens for controls and surfaces', () => {
    expect(tokens).toContain('--surface-control:')
    expect(tokens).toContain('--surface-hover:')
    expect(tokens).toContain('--text-on-accent:')
    expect(tokens).toContain('--danger-solid:')
    expect(tokens).toContain('--danger-hover:')
  })

  it('keeps shared button behavior in the owning component layer', () => {
    expect(components).toContain('.button-secondary, .button-primary, .button-danger')
    expect(components).toContain('.button-icon {')
    expect(components).toContain('color: var(--text-secondary);')
    expect(components).toContain('background: var(--surface-control);')
    expect(components).toContain('background: var(--danger-solid);')
    expect(components).toContain('background: var(--danger-hover);')
  })

  it('does not duplicate common controls in the light-theme exception layer', () => {
    expect(themeOverrides).not.toContain('.theme-light .button-secondary')
    expect(themeOverrides).not.toContain('.theme-light .button-danger')
    expect(themeOverrides).not.toContain('.theme-light .fetch-button')
  })

  it('uses theme tokens for app notices', () => {
    const noticeRule = components.match(/\.app-notice \{[^}]+\}/)?.[0] ?? ''
    expect(noticeRule).toContain('color: var(--accent-text);')
    expect(noticeRule).toContain('background: var(--accent-dim);')
  })

  it('keeps the worktree select menu outside the dialog clipping boundary', () => {
    expect(features).toContain('.branch-dialog.worktree-dialog { overflow: visible; }')
    expect(components).not.toContain('.worktree-dialog { overflow: visible; }')
  })

  it('keeps sticky diff file headers opaque and search hits visually distinct', () => {
    const fileHeaderRule = features.split('\n').find((line) => line.startsWith('.file-header {')) ?? ''
    const searchMatchRule = features.match(/\.commit-row\.search-match \{[^}]+\}/)?.[0] ?? ''
    expect(fileHeaderRule).toContain('background: var(--code-surface);')
    expect(searchMatchRule).toContain('box-shadow: inset 3px 0')
    expect(features).toContain('.diff-viewer *::-webkit-scrollbar-button { width: 0; height: 0; display: none; }')
  })

  it('draws height-scaled green and red difference ranges in both overview columns', () => {
    expect(features).toContain('.diff-overview-marker.add { background: var(--success); }')
    expect(features).toContain('.diff-overview-marker.del { background: var(--danger); }')
    expect(features).toContain('.diff-overview.split .diff-overview-marker.old')
    expect(features).toContain('.diff-overview.split .diff-overview-marker.new')
    expect(diffPanel).toContain('height: `${height}%`')
  })

  it('keeps diff actions aligned with compact line numbers and highlights row actions', () => {
    expect(features).toContain('.diff-panel.stage-actions-enabled .code-row { grid-template-columns: 32px var(--diff-line-number-width, 5ch) 26px')
    expect(components).toContain('.diff-panel.stage-actions-enabled .split-code-side { grid-template-columns: var(--diff-line-number-width, 5ch) 26px')
    expect(features).toContain('.diff-block-actions { position: absolute;')
    expect(features).toContain('flex-direction: column; align-items: center; overflow: hidden;')
    expect(features).toContain('.diff-omitted { min-height: 24px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center;')
    expect(features).toContain('.diff-omitted-action { flex: 1 1 0; width: var(--diff-line-number-width);')
    expect(features).toContain('.diff-block-actions > button, .diff-block-action-anchor > button { position: static; width: 24px; height: 20px;')
    expect(diffPanel).toContain('className={`split-code-side')
    expect(diffPanel).toContain('style={{ height: virtualRowHeight }}')
    expect(components).toContain('.line-action-add:hover, .line-action-add:focus-visible')
    expect(components).toContain('.line-action-del:hover, .line-action-del:focus-visible')
  })

  it('allows committer and branch filters to select multiple values', () => {
    expect(app).toContain('history:app.columns.filterCommitters')
    expect(app).toContain('history:app.filters.branchHeading')
    expect(app).toContain('committerName(commit)')
    expect(app).toContain('checked={branchFilter.includes(branch)}')
    expect(app).toContain('committerColumnVisible ? `${widths.author}px` : \'\'')
    expect(app).toMatch(/message-label[^\n]*\{committerFilterButton\}/)
    expect(app).toMatch(/const committerFilterButton = .*aria-label=\{t\('history:app.columns.filterCommitter'\)\}/)
  })
  it('places the committer resize handle on the message column and keeps its controls inline', () => {
    const messageHeader = app.match(/<div className="column-label message-label"[^\n]+/)?.[0] ?? ''
    const authorHeader = app.match(/<div className="column-label author-label"[^\n]+/)?.[0] ?? ''
    expect(messageHeader).toContain("resizer('author')")
    expect(messageHeader).toContain('{committerFilterButton}')
    expect(authorHeader).not.toContain('resizer(')
    expect(components.match(/\.column-label\.message-label \{[^}]+\}/)?.[0]).toContain('gap:')
    expect(components.match(/\.column-actions \{[^}]+\}/)?.[0]).toContain('position: relative;')
  })
  it('separates the rounded repository catalog from the page background and improves list readability', () => {
    expect(themeOverrides).toContain('.theme-rounded .repository-manager { background: var(--rounded-app-background); }')
    expect(tokens).toContain('--rounded-repository-frame: #e6ebf1;')
    expect(tokens).toContain('--rounded-repository-catalog: #ffffff;')
    expect(themeOverrides).toContain('.theme-rounded .repository-catalog { background: var(--rounded-repository-catalog);')
    expect(themeOverrides).toContain('.theme-rounded .repository-details { background: var(--rounded-repository-catalog);')
    expect(themeOverrides.match(/\.theme-rounded \.repository-catalog-select strong \{[^}]+\}/)?.[0]).toContain('font-size: 14px;')
    expect(themeOverrides.match(/\.theme-rounded \.repository-catalog-path \{[^}]+\}/)?.[0]).toContain('font-size: 12px;')
    expect(repositoryManagerStyles).toContain('.repository-catalog-group h2')
  })
  it('uses neutral black-gray surfaces for the dark rounded theme', () => {
    expect(tokens).toContain('--rounded-app-background: #141414;')
    expect(tokens).toContain('--rounded-surface: #1f1f1f;')
    expect(tokens).toContain('--rounded-repository-frame: #141414;')
    expect(tokens).toContain('--rounded-repository-catalog: #1f1f1f;')
  })

  it('places the diff close control at the far end of the toolbar', () => {
    const closeRule = features.match(/\.diff-close-control \{[^}]+\}/)?.[0] ?? ''
    expect(closeRule).toContain('margin-left: auto;')
  })

  it('keeps the cherry-pick progress indicator above its dialog', () => {
    expect(layout).toContain('.operation-indicator.cherry-pick { z-index: 1201; }')
    expect(app).toContain("activeOperation?.key === 'cherry-pick' ? 'cherry-pick' : ''")
  })

  it('omits branch navigation and switching from the branch context menu', () => {
    const branchMenu = app.match(/\{contextBranch && <ContextMenu[\s\S]*?\n    <\/ContextMenu>\}/)?.[0] ?? ''
    expect(branchMenu).not.toContain('定位到分支提交')
    expect(branchMenu).not.toContain('切换到该分支')
  })

  it('closes the notifications popover on outside pointer input', () => {
    expect(app).toContain("document.addEventListener('pointerdown'")
    expect(app).toContain('notificationButtonRef.current?.contains(event.target as Node)')
    expect(app).toContain('notificationPopoverRef.current?.contains(event.target as Node)')
  })

  it('keeps all diff toolbar actions reachable when search is open', () => {
    expect(features).toContain('.diff-toolbar { flex-wrap: wrap;')
    expect(features).toContain('.diff-search-bar { flex: 1 1 180px;')
  })

  it('keeps standard scrollbar properties off diff scroll containers', () => {
    const base = readFileSync(new URL('./styles/base.css', import.meta.url), 'utf8')
    const codeDiffRule = features.match(/\.code-diff \{[^}]+\}/)?.[0] ?? ''
    const splitDiffRule = components.match(/\.split-diff-pane \{[^}]+\}/)?.[0] ?? ''
    expect(features).toContain('.diff-viewer { position: relative; min-width: 0; min-height: 0; overflow: hidden; scrollbar-color: auto; }')
    expect(features).not.toContain('.code-diff::-webkit-scrollbar:vertical')
    expect(features).toContain('.code-diff::-webkit-scrollbar-button { display: none; }')
    expect(themeOverrides).toContain('.theme-light *:not(.diff-viewer):not(.diff-viewer *)')
    expect(base).toContain('*:not(.diff-viewer):not(.diff-viewer *) { scrollbar-width: thin; scrollbar-color: #667788 transparent; }')
    expect(codeDiffRule).not.toMatch(/scrollbar-(?:width|color)\s*:/)
    expect(splitDiffRule).not.toMatch(/scrollbar-(?:width|color)\s*:/)
  })

  it('aligns staging section labels independently from their action buttons', () => {
    expect(features).toContain('.stage-section-header { grid-template-columns: auto minmax(0, 1fr) auto;')
    expect(features).toContain('.stage-section-name { grid-column: 2;')
  })

  it('keeps staging section headers compact', () => {
    const headerRules = features.match(/\.stage-section-header \{[^}]+\}/g) ?? []
    const headerRule = headerRules[headerRules.length - 1] ?? ''
    expect(headerRule).toContain('min-height: 28px;')
  })

  it('renders diff file paths without a decorative leading arrow', () => {
    expect(diffPanel).not.toContain('<ChevronDown size={14}/><code title={activeFileInfo?.path}')
  })

  it('opens commit details from a selected row and closes them from the panel', () => {
    expect(app).toContain("usePersistentState('branchline.inspectorCollapsed.v2', true")
    expect(app).toContain('onSelect={(id) => { setSelected(id); setInspectorCollapsed(false) }}')
    expect(app).toContain('onClose={() => setInspectorCollapsed(true)}')
    expect(app).toContain('className="detail-heading-actions"')
    expect(app).not.toContain('title={inspectorCollapsed ? \'展开右侧面板\' : \'收起右侧面板\'}')
  })
})
