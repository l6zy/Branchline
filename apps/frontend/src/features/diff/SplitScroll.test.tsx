// @vitest-environment jsdom
import { cleanup, fireEvent, render as renderUi } from '@testing-library/react'
import type { ReactElement } from 'react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppI18n } from '../../i18n'
import { TooltipProvider } from '../../components/tooltip'
import { DiffPanel } from './DiffPanel'

const render = (ui: ReactElement) => renderUi(<TooltipProvider>{ui}</TooltipProvider>)

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  HTMLElement.prototype.scrollIntoView = vi.fn()
  localStorage.setItem('branchline.diffView.v1', JSON.stringify('split'))
})
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); vi.unstubAllGlobals() })

const rows = Array.from({ length: 80 }, (_, index) => ({ old: index + 1, next: index + 1, kind: 'same' as const, code: `line ${index + 1}` }))

describe('shared split diff scroller', () => {
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
