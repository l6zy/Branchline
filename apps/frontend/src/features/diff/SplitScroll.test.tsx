// @vitest-environment jsdom
import { act, cleanup, fireEvent, render as renderUi } from '@testing-library/react'
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
  localStorage.setItem('branchline.diffView.v1', JSON.stringify('split'))
})
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

const rows = Array.from({ length: 80 }, (_, index) => ({ old: index + 1, next: index + 1, kind: 'same' as const, code: `line ${index + 1}` }))

async function renderFullFile(source: RepositoryDiffLine[]) {
  localStorage.setItem('branchline.diffScope.v1', JSON.stringify('file'))
  const i18n = await createAppI18n('en-US')
  return render(<I18nextProvider i18n={i18n}><DiffPanel files={[{ path: 'file.txt', type: 'M', add: 1, del: 1 }]} wide={false} onWideChange={() => {}} fallbackChangeRows={source}/></I18nextProvider>)
}

function withChange(source: RepositoryDiffLine[], index: number) {
  const row = source[index]
  return [...source.slice(0, index), { ...row, next: null, kind: 'del' as const }, { ...row, old: null, kind: 'add' as const, code: 'replacement' }, ...source.slice(index + 1)]
}

function measurePane() {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(240)
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(12_000)
}

describe('shared split diff scroller', () => {
  it('centers the first change and search results using only the shared scroller', async () => {
    measurePane()
    const scrollTo = vi.fn(function (this: HTMLElement, options: ScrollToOptions) {
      this.scrollTop = options.top ?? 0
    })
    const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const index = this.dataset.diffRowIndex
      if (index === undefined) return new DOMRect(0, 20, 200, 240)
      const scroller = this.closest('.split-diff-panes')!
      return new DOMRect(0, 20 + Number(index) * 24 - scroller.scrollTop, 200, 24)
    })
    try {
      const source = rows.map((row, index) => index === 59 || index === 69 ? { ...row, code: 'search target' } : row)
      const panel = await renderFullFile(withChange(source, 60))
      const scroller = panel.container.querySelector<HTMLElement>('.split-diff-panes')!
      expect(scroller.scrollTop).toBe(1332)

      fireEvent.click(panel.getByRole('button', { name: 'Search diff' }))
      const search = panel.getByRole('textbox', { name: 'Search diff' })
      fireEvent.change(search, { target: { value: 'search target' } })
      fireEvent.keyDown(search, { key: 'Enter' })

      expect(scroller.scrollTop).toBe(1548)
      expect(scrollTo.mock.contexts).toEqual([scroller, scroller])
      expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled()

      scrollTo.mockImplementationOnce(() => {})
      fireEvent.keyDown(search, { key: 'Enter' })
      fireEvent.keyDown(search, { key: 'Enter' })
      expect(scrollTo).toHaveBeenNthCalledWith(3, { top: 1308, behavior: 'smooth' })
      expect(scrollTo).toHaveBeenNthCalledWith(4, { top: 1548, behavior: 'smooth' })
    } finally {
      if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo)
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
    }
  })

  it('keeps the automatic first-change position after the opening frame of a virtual diff', async () => {
    measurePane()
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
    const longFile = Array.from({ length: 400 }, (_, index) => ({ old: index + 1, next: index + 1, kind: 'same' as const, code: `line ${index + 1}` }))
    const panel = await renderFullFile(withChange(longFile, 350))
    const scroller = panel.container.querySelector<HTMLElement>('.split-diff-panes')!

    act(() => frames.splice(0).forEach((frame) => frame(0)))

    expect(scroller.scrollTop).toBe(8280)
    expect(scroller.style.getPropertyValue('--split-scroll-top')).toBe('8280px')
    expect(scroller.querySelector('.split-right [data-diff-row-index="350"]')).toBeTruthy()
  })

  it('drives both panes from one vertical scroll position', async () => {
    const i18n = await createAppI18n('en-US')
    render(<I18nextProvider i18n={i18n}><DiffPanel files={[{ path: 'file.txt', type: 'M', add: 0, del: 0 }]} wide={false} onWideChange={() => {}} fallbackChangeRows={rows}/></I18nextProvider>)
    const scroller = document.querySelector<HTMLElement>('.split-diff-panes')
    expect(scroller).toBeTruthy()
    expect(document.querySelectorAll('.split-diff-panes')).toHaveLength(1)
    expect(document.querySelector('.split-diff-viewport .split-left')).toBeTruthy()
    expect(document.querySelector('.split-diff-viewport .split-right')).toBeTruthy()
    if (!scroller) return

    scroller.scrollTop = 120
    fireEvent.scroll(scroller)
    expect(scroller.style.getPropertyValue('--split-scroll-top')).toBe('120px')

    scroller.scrollTop = 360
    fireEvent.scroll(scroller)
    expect(scroller.style.getPropertyValue('--split-scroll-top')).toBe('360px')
  })
})
