import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
const tokens = readFileSync(new URL('./styles/tokens.css', import.meta.url), 'utf8')
const components = readFileSync(new URL('./styles/components.css', import.meta.url), 'utf8')
const features = readFileSync(new URL('./styles/features.css', import.meta.url), 'utf8')
const layout = readFileSync(new URL('./styles/layout.css', import.meta.url), 'utf8')
const themeOverrides = readFileSync(new URL('./styles/theme-overrides.css', import.meta.url), 'utf8')
const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
const diffPanel = readFileSync(new URL('./features/diff/DiffPanel.tsx', import.meta.url), 'utf8')

describe('semantic style architecture', () => {
  it('reserves horizontal scrollbar tracks for unified and split diff panes', () => {
    expect(features.match(/\.unified-diff-pane \{[^}]+\}/)?.[0]).toContain('overflow-x: scroll;')
    expect(components.match(/\.split-diff-pane \{[^}]+\}/)?.[0]).toContain('overflow-x: scroll;')
  })

  it('aligns the native title bar with the active theme and gives blame a wide code workspace', () => {
    expect(app).toContain('getCurrentWindow().setTheme(theme)')
    expect(app).toContain('className="app-titlebar"')
    expect(readFileSync(new URL('../../desktop/tauri.conf.json', import.meta.url), 'utf8')).toContain('"decorations": false')
    expect(features.match(/\.history-drawer \{[^}]+\}/)?.[0]).toContain('96vw')
    expect(features.match(/\.blame-workspace \{[^}]+\}/)?.[0]).toContain('minmax(360px, 1fr)')
    expect(features).toContain('.blame-workspace.wide { grid-template-columns: minmax(0, 1fr); }')
    expect(features).toContain('.blame-row { width: 100%; height: 26px; min-height: 26px;')
    expect(layout).toContain('.window-controls { height: 100%; display: flex; }')
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
    expect(features).toContain('.diff-block-actions > button { position: static; width: 24px; height: 20px;')
    expect(diffPanel).toContain('className={`split-code-side')
    expect(diffPanel).toContain('style={{ height: virtualRowHeight }}')
    expect(components).toContain('.line-action-add:hover, .line-action-add:focus-visible')
    expect(components).toContain('.line-action-del:hover, .line-action-del:focus-visible')
  })

  it('allows committer and branch filters to select multiple values', () => {
    expect(app).toContain('提交人（可多选）')
    expect(app).toContain('按分支筛选（可多选）')
    expect(app).toContain('committerName(commit)')
    expect(app).toContain('checked={branchFilter.includes(branch)}')
    expect(app).toContain('committerColumnVisible ? `${widths.author}px` : \'\'')
    expect(app).toMatch(/message-label[^\n]*\{committerFilterButton\}/)
    expect(app).toMatch(/const committerFilterButton = .*aria-label="筛选提交人"/)
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
