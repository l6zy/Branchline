// @vitest-environment jsdom
import { cleanup, fireEvent, render as renderUi, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '../../components/tooltip'
import { createAppI18n } from '../../i18n'
import { DiffPanel } from './DiffPanel'

const render = (ui: ReactElement) => renderUi(<TooltipProvider>{ui}</TooltipProvider>)

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  HTMLElement.prototype.scrollIntoView = vi.fn()
})
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); vi.unstubAllGlobals() })

const rows = Array.from({ length: 60 }, (_, index) => ({ old: index + 1, next: index + 1, kind: 'same' as const, code: `line ${index} ${'x'.repeat(180)}` }))

const renderPanel = async (view: 'unified' | 'split') => {
  const i18n = await createAppI18n('en-US')
  localStorage.setItem('branchline.diffView.v1', JSON.stringify(view))
  localStorage.setItem('branchline.diffScope.v1', JSON.stringify('file'))
  render(<I18nextProvider i18n={i18n}><DiffPanel files={[{ path: 'file.txt', type: 'M', add: 0, del: 0 }]} wide={false} onWideChange={() => {}} fallbackChangeRows={rows}/></I18nextProvider>)
}

describe('diff wrap mode', () => {
  it('wraps unified rows without duplicating line numbers', async () => {
    await renderPanel('unified')
    fireEvent.click(screen.getByRole('button', { name: 'Wrap long lines' }))

    expect(screen.getByRole('button', { name: 'Disable line wrapping' }).getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('.code-diff')?.classList.contains('wrap')).toBe(true)
    expect(document.querySelector('.unified-diff-pane')?.classList.contains('wrap')).toBe(true)
    const codeRows = document.querySelectorAll('.code-row')
    expect(codeRows).toHaveLength(rows.length)
    codeRows.forEach((row) => {
      expect(row.classList.contains('wrap')).toBe(true)
      expect(row.querySelectorAll('.line-no')).toHaveLength(1)
    })
  })

  it('uses one wrapped side-by-side row with aligned sides and single line numbers', async () => {
    await renderPanel('split')
    fireEvent.click(screen.getByRole('button', { name: 'Wrap long lines' }))

    expect(document.querySelector('.split-wrap-panes')).toBeTruthy()
    expect(document.querySelector('.split-diff-viewport')).toBeNull()
    expect(document.querySelectorAll('.split-wrap-row')).toHaveLength(rows.length)
    const sides = document.querySelectorAll('.split-wrap-row .split-code-side')
    expect(sides).toHaveLength(rows.length * 2)
    sides.forEach((side) => {
      expect(side.classList.contains('wrap')).toBe(true)
      expect(side.querySelectorAll('.line-no')).toHaveLength(1)
    })
  })
})
