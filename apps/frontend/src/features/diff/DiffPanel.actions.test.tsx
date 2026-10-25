import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DiffPanel } from './DiffPanel'

afterEach(() => vi.unstubAllGlobals())

describe('diff patch actions', () => {
  for (const view of ['unified', 'split']) {
    it('keeps the file header outside the code scroll pane in ' + view, () => {
      vi.stubGlobal('window', { localStorage: { getItem: (key: string) => key === 'branchline.diffView.v1' ? JSON.stringify(view) : null } })
      const html = renderToStaticMarkup(<DiffPanel files={[{ path: 'file.txt', type: 'M', add: 1, del: 0, staged: false }]} wide={false} onWideChange={() => {}} fallbackChangeRows={[{ old: null, next: 1, kind: 'add', code: 'new' }]} />)
      const paneClass = view === 'unified' ? 'unified-diff-pane' : 'split-diff-panes'
      expect(html).toMatch(new RegExp('class="file-header"[\\s\\S]*?</span></div>(?:<div class="hunk">[^<]*</div>)?<div class="' + paneClass + '"'))
      expect(html.slice(html.indexOf('class="' + paneClass + '"'))).not.toContain('class="file-header"')
    })

    it('centers block actions across multiple compact code rows in ' + view, () => {
      vi.stubGlobal('window', { localStorage: { getItem: (key: string) => key === 'branchline.diffView.v1' ? JSON.stringify(view) : null } })
      const html = renderToStaticMarkup(<DiffPanel files={[{ path: 'file.txt', type: 'M', add: 3, del: 0, staged: false }]} wide={false} onWideChange={() => {}} allowStage onStagePatch={() => {}} onRestorePatch={() => {}} fallbackChangeRows={[1, 2, 3].map((next) => ({ old: null, next, kind: 'add', code: 'new ' + next }))} />)
      expect(html.match(/class="diff-block-actions"/g)).toHaveLength(1)
      expect(html).toContain('aria-orientation="vertical" style="top:12px"')
      expect(html).toContain('class="diff-block-range"')
      expect(html.indexOf('aria-label="还原此修改块"')).toBeLessThan(html.indexOf('aria-label="暂存此修改块"'))
      if (view === 'unified') {
        const middleRow = html.slice(html.indexOf('data-diff-row-index="1"'), html.indexOf('data-diff-row-index="2"'))
        expect(middleRow).toContain('class="diff-block-actions"')
        expect(middleRow).toContain('height:24px')
      } else {
        const gutter = html.slice(html.indexOf('aria-label="差异操作"'), html.indexOf('aria-label="新版本代码"'))
        expect(gutter).toMatch(/split-action-row[^>]*><\/div><div[^>]*>.*diff-block-actions/)
      }
    })

    it('keeps both block actions directly available for single-line blocks in ' + view, () => {
      vi.stubGlobal('window', { localStorage: { getItem: (key: string) => key === 'branchline.diffView.v1' ? JSON.stringify(view) : null } })
      const html = renderToStaticMarkup(<DiffPanel files={[{ path: 'file.txt', type: 'M', add: 2, del: 0, staged: false }]} wide={false} onWideChange={() => {}} allowStage onStagePatch={() => {}} onRestorePatch={() => {}} fallbackChangeRows={[{ old: null, next: 1, kind: 'add', code: 'first' }, { old: 1, next: 2, kind: 'same', code: 'context' }, { old: null, next: 3, kind: 'add', code: 'last' }]} />)
      expect(html.match(/aria-label="修改块操作"/g)).toHaveLength(2)
      expect(html).not.toContain('aria-haspopup="menu"')
      expect(html.match(/aria-label="暂存此修改块"/g)).toHaveLength(2)
      expect(html.match(/aria-label="还原此修改块"/g)).toHaveLength(2)
      expect(html).toContain('aria-orientation="vertical" style="top:20px"')
      expect(html).toContain('padding-bottom:16px')
      expect(html).toContain('height:24px')
    })

    it('shows unstage actions for staged rows and blocks in ' + view, () => {
      vi.stubGlobal('window', { localStorage: { getItem: (key: string) => key === 'branchline.diffView.v1' ? JSON.stringify(view) : null } })
      const html = renderToStaticMarkup(<DiffPanel files={[{ path: 'file.txt', type: 'M', add: 1, del: 1, staged: true }]} wide={false} onWideChange={() => {}} actionScope="staged" onUnstagePatch={() => {}} fallbackChangeRows={[1, 2, 3].map((next) => ({ old: null, next, kind: 'add', code: 'new ' + next }))} />)
      expect(html).toContain('aria-label="取消暂存此修改块"')
      expect(html.match(/aria-label="取消暂存此行"/g)).toHaveLength(3)
      expect(html).not.toContain('aria-label="还原此修改块"')
      expect(html).not.toContain('aria-label="暂存此修改块"')
    })
  }

  it('disables patch actions during mutation or reload', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => null } })
    const html = renderToStaticMarkup(<DiffPanel files={[{ path: 'file.txt', type: 'M', add: 1, del: 1, staged: false }]} wide={false} onWideChange={() => {}} allowStage actionsBusy onStagePatch={() => {}} onRestorePatch={() => {}} fallbackChangeRows={[{ old: null, next: 1, kind: 'add', code: 'new' }]} />)
    expect(html).toMatch(/disabled="" class="diff-stage-action"/)
    expect(html).toMatch(/disabled="" class="diff-restore-action"/)
    expect(html).toMatch(/disabled="" class="change-sign line-action-add"/)
  })
})
