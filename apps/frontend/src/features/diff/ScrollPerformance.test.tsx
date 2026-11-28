// @vitest-environment jsdom
import { Profiler } from 'react'
import { act, cleanup, fireEvent, render as renderUi } from '@testing-library/react'
import type { ReactElement } from 'react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppI18n } from '../../i18n'
import { TooltipProvider } from '../../components/tooltip'
import { DiffFileList } from './DiffFileList'
import { DiffPanel } from './DiffPanel'
import type { RepositoryDiffLine } from '../../repository'

const render = (ui: ReactElement) => renderUi(<TooltipProvider>{ui}</TooltipProvider>)

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  HTMLElement.prototype.scrollIntoView = vi.fn()
})
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

const rows = (count: number): RepositoryDiffLine[] => Array.from({ length: count }, (_, index) => ({ old: index + 1, next: index + 1, kind: 'same' as const, code: `line ${index + 1}` }))

async function renderPanel(rowCount: number, view: 'unified' | 'split') {
  localStorage.setItem('branchline.diffView.v1', JSON.stringify(view))
  localStorage.setItem('branchline.diffScope.v1', JSON.stringify('file'))
  const i18n = await createAppI18n('en-US')
  let renders = 0
  const result = render(<I18nextProvider i18n={i18n}><Profiler id="diff" onRender={() => { renders += 1 }}><DiffPanel files={[{ path: 'file.txt', type: 'M', add: 0, del: 0 }]} wide={false} onWideChange={() => {}} fallbackChangeRows={rows(rowCount)}/></Profiler></I18nextProvider>)
  return { ...result, renders: () => renders }
}

describe('diff scroll rendering', () => {
  it.each([
    ['unified', 12, 24],
    ['split', 12, 24],
    ['unified', 9, 22],
  ] as const)('mounts the target %s rows at font size %i before moving the overview scrollbar', async (view, fontSize, rowHeight) => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(384)
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(24_000)
    localStorage.setItem('branchline.diffFontSize.v1', String(fontSize))
    const rowCount = 1000
    const panel = await renderPanel(rowCount, view)
    const pane = panel.container.querySelector<HTMLElement>(view === 'split' ? '.split-diff-panes' : '.unified-diff-pane')!
    expect(pane.querySelector<HTMLElement>('[data-diff-row-index]')?.style.height).toBe(`${rowHeight}px`)
    const scrollHeight = rowCount * rowHeight
    Object.defineProperty(pane, 'scrollHeight', { value: scrollHeight })
    let top = 0
    const rowCoverage: boolean[] = []
    Object.defineProperty(pane, 'scrollTop', {
      get: () => top,
      set: (target: number) => {
        const first = Math.floor(target / rowHeight)
        const last = Math.ceil((target + pane.clientHeight) / rowHeight) - 1
        const sides = view === 'split' ? ['.split-left ', '.split-right '] : ['']
        for (const side of sides) {
          rowCoverage.push(Boolean(pane.querySelector(`${side}[data-diff-row-index="${first}"]`)))
          rowCoverage.push(Boolean(pane.querySelector(`${side}[data-diff-row-index="${last}"]`)))
        }
        top = target
      },
    })

    const scrollbar = panel.getByRole('scrollbar')
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    fireEvent.keyDown(scrollbar, { key: 'End' })
    expect(pane.scrollTop).toBe(scrollHeight - pane.clientHeight)
    fireEvent.keyDown(scrollbar, { key: 'Home' })
    expect(pane.scrollTop).toBe(0)
    expect(rowCoverage).not.toContain(false)
  })

  it('updates a large file-list jump during the native scroll event', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400)
    const i18n = await createAppI18n('en-US')
    const files = Array.from({ length: 1000 }, (_, index) => ({ path: `file-${index}.txt`, type: 'M', add: 1, del: 0 }))
    const panel = render(<I18nextProvider i18n={i18n}><DiffFileList files={files} activeFile={0} mode="list" onSelectFile={() => {}}/></I18nextProvider>)
    const list = panel.container.querySelector<HTMLElement>('.file-list')!
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))

    act(() => {
      list.scrollTop = 20_000
      fireEvent.scroll(list)
      expect(list.textContent).toContain('file-500.txt')
      expect(list.textContent).toContain('file-509.txt')
    })
  })

  it('does not re-render a small diff while scrolling', async () => {
    const panel = await renderPanel(80, 'unified')
    const pane = document.querySelector<HTMLElement>('.unified-diff-pane')
    expect(pane).toBeTruthy()
    if (!pane) return
    pane.scrollTop = 100
    fireEvent.scroll(pane)
    const settled = panel.renders()
    for (let step = 1; step <= 6; step += 1) {
      pane.scrollTop = step * 100
      fireEvent.scroll(pane)
    }
    expect(panel.renders()).toBe(settled)
  })

  it('does not re-render a small split diff while scrolling', async () => {
    const panel = await renderPanel(80, 'split')
    const pane = document.querySelector<HTMLElement>('.split-diff-panes')
    expect(pane).toBeTruthy()
    if (!pane) return
    pane.scrollTop = 100
    fireEvent.scroll(pane)
    const settled = panel.renders()
    for (let step = 1; step <= 6; step += 1) {
      pane.scrollTop = step * 100
      fireEvent.scroll(pane)
    }
    expect(panel.renders()).toBe(settled)
  })

  it('only recenters a virtualized diff after crossing the buffer threshold', async () => {
    const panel = await renderPanel(1000, 'unified')
    const pane = document.querySelector<HTMLElement>('.unified-diff-pane')
    expect(pane).toBeTruthy()
    if (!pane) return
    for (let step = 1; step <= 4; step += 1) {
      pane.scrollTop = step * 4 * 24
      fireEvent.scroll(pane)
    }
    const settled = panel.renders()
    pane.scrollTop = 40 * 24
    fireEvent.scroll(pane)
    expect(panel.renders()).toBeGreaterThan(settled)
  })
})
