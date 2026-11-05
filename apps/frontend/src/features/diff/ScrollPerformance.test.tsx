// @vitest-environment jsdom
import { Profiler } from 'react'
import { cleanup, fireEvent, render as renderUi } from '@testing-library/react'
import type { ReactElement } from 'react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppI18n } from '../../i18n'
import { TooltipProvider } from '../../components/tooltip'
import { DiffPanel } from './DiffPanel'
import type { RepositoryDiffLine } from '../../repository'

const render = (ui: ReactElement) => renderUi(<TooltipProvider>{ui}</TooltipProvider>)

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  HTMLElement.prototype.scrollIntoView = vi.fn()
})
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); vi.unstubAllGlobals() })

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
