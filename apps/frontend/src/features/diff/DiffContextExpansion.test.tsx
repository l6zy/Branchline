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

const renderRows = async (rows: Array<{ old: number; next: number; kind: 'same' | 'add'; code: string }>, view: 'unified' | 'split' = 'unified') => {
  const i18n = await createAppI18n('en-US')
  localStorage.setItem('branchline.diffView.v1', JSON.stringify(view))
  localStorage.setItem('branchline.diffScope.v1', JSON.stringify('changes'))
  render(<I18nextProvider i18n={i18n}><DiffPanel files={[{ path: 'file.txt', type: 'M', add: 1, del: 0 }]} wide={false} onWideChange={() => {}} fallbackChangeRows={rows}/></I18nextProvider>)
}

describe('diff context expansion', () => {
  it('shows only the expandable edge at the start and end of the file', async () => {
    const rows = Array.from({ length: 60 }, (_, index) => ({ old: index + 1, next: index + 1, kind: index === 30 ? 'add' as const : 'same' as const, code: `line ${index}` }))
    await renderRows(rows)

    const gaps = document.querySelectorAll<HTMLElement>('.diff-omitted')
    expect(gaps[0].classList.contains('one-action')).toBe(true)
    expect(gaps[1].classList.contains('one-action')).toBe(true)
    expect(gaps[0].style.height).toBe('24px')
    expect(gaps[1].style.height).toBe('24px')
    expect(gaps[0].querySelectorAll('button')).toHaveLength(1)
    expect(gaps[0].querySelector('.lucide-chevron-up')).toBeTruthy()
    expect(gaps[1].querySelectorAll('button')).toHaveLength(1)
    expect(gaps[1].querySelector('.lucide-chevron-down')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Expand 20 unchanged lines above' }))
    expect(document.body.textContent).toContain('line 26')
    expect(document.body.textContent).not.toContain('line 0')

    fireEvent.click(screen.getByRole('button', { name: 'Expand 20 unchanged lines below' }))
    expect(document.body.textContent).toContain('line 34')
    expect(document.body.textContent).not.toContain('line 59')
  })

  it('expands only the requested twenty lines upward at a middle gap', async () => {
    const rows = Array.from({ length: 80 }, (_, index) => ({ old: index + 1, next: index + 1, kind: index === 20 || index === 50 ? 'add' as const : 'same' as const, code: `line ${index}` }))
    await renderRows(rows)

    const middle = document.querySelectorAll<HTMLElement>('.diff-omitted')[1]
    const up = Array.from(middle.querySelectorAll('button')).find((button) => button.getAttribute('aria-label')?.includes('above'))!
    fireEvent.click(up)

    const codes = Array.from(document.querySelectorAll('.code-row code')).map((node) => node.textContent)
    expect(codes).toContain('line 46')
    expect(codes).not.toContain('line 24')
    expect(codes).not.toContain('line 26')
  })

  it('keeps the remaining bar before the newly revealed rows in split view', async () => {
    const rows = Array.from({ length: 80 }, (_, index) => ({ old: index + 1, next: index + 1, kind: index === 20 || index === 50 ? 'add' as const : 'same' as const, code: `line ${index}` }))
    await renderRows(rows, 'split')

    const before = document.querySelectorAll('.split-code-side').length
    const middle = document.querySelectorAll<HTMLElement>('.diff-omitted')[1]
    const up = Array.from(middle.querySelectorAll('button')).find((button) => button.getAttribute('aria-label')?.includes('above'))!
    fireEvent.click(up)

    const after = document.querySelectorAll('.split-code-side').length
    expect(after).toBe(before + 40)
    const codes = Array.from(document.querySelectorAll('.split-code-side code')).map((node) => node.textContent)
    expect(codes).toContain('line 46')
    expect(codes).not.toContain('line 24')
    const bars = document.querySelectorAll<HTMLElement>('.diff-omitted')
    expect(bars[1].style.height).toBe('48px')
  })

  it('shows both controls for a gap between two hunks', async () => {
    const rows = Array.from({ length: 80 }, (_, index) => ({ old: index + 1, next: index + 1, kind: index === 20 || index === 50 ? 'add' as const : 'same' as const, code: `line ${index}` }))
    await renderRows(rows)

    const middle = document.querySelectorAll<HTMLElement>('.diff-omitted')[1]
    expect(middle.classList.contains('two-actions')).toBe(true)
    expect(middle.style.height).toBe('48px')
    expect(middle.querySelectorAll('button')).toHaveLength(2)
    const middleDown = Array.from(middle.querySelectorAll('button')).find((button) => button.getAttribute('aria-label')?.includes('below'))!
    fireEvent.click(middleDown)
    expect(document.body.textContent).toContain('line 24')
    expect(document.body.textContent).not.toContain('line 46')

    const remaining = document.querySelectorAll('.diff-omitted')[1]
    const middleUp = Array.from(remaining.querySelectorAll('button')).find((button) => button.getAttribute('aria-label')?.includes('above'))!
    fireEvent.click(middleUp)
    expect(document.body.textContent).toContain('line 46')
  })
})
