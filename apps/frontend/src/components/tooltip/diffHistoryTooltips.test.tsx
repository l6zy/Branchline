// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createAppI18n } from '../../i18n'
import { DiffPanel } from '../../features/diff/DiffPanel'
import { DiffFileList } from '../../features/diff/DiffFileList'
import { HistoryDrawer } from '../../features/history/HistoryDrawer'
import { TooltipProvider } from './index'

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  HTMLElement.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  localStorage.clear()
})
async function mount(ui: ReactElement) {
  const i18n = await createAppI18n('en-US')
  return { ...render(<I18nextProvider i18n={i18n}><TooltipProvider>{ui}</TooltipProvider></I18nextProvider>), i18n }
}
async function hover(element: Element) {
  fireEvent.mouseEnter(element)
  fireEvent.mouseMove(element)
  await act(() => vi.advanceTimersByTime(299))
  expect(screen.queryByRole('tooltip')).toBeNull()
  await act(() => vi.advanceTimersByTime(1))
}
const files = [{ path: 'src/原始文件.ts', type: 'M', add: 1, del: 0 }]
const rows = [{ old: null, next: 1, kind: 'add' as const, code: 'raw content' }]

it('uses delayed filename help on the real diff without changing file selection', async () => {
  const { container } = await mount(<DiffPanel files={files} wide={false} onWideChange={vi.fn()} fallbackChangeRows={rows}/>)
  expect(container.querySelector('[title]')).toBeNull()
  vi.useFakeTimers()
  const file = screen.getByRole('button', { name: /原始文件.ts/ })
  await hover(file)
  expect(screen.getByRole('tooltip').textContent).toBe('原始文件.ts')
  fireEvent.click(file)
  expect(container.querySelector('.file-header code')?.textContent).toBe(files[0].path)
  expect(screen.queryByRole('tooltip')).toBeNull()
})

it('shows keyboard help immediately, updates language, and keeps the search input ref', async () => {
  const { i18n } = await mount(<DiffPanel files={files} wide={false} onWideChange={vi.fn()} fallbackChangeRows={rows}/>)
  const search = screen.getByRole('button', { name: 'Search diff' })
  vi.useFakeTimers()
  await act(() => search.focus())
  expect(screen.getByRole('tooltip').textContent).toBe(i18n.t('diff:search.hint'))
  await act(() => i18n.changeLanguage('zh-CN'))
  expect(screen.getByRole('tooltip').textContent).toBe(i18n.t('diff:search.hint'))
  fireEvent.click(search)
  await act(() => vi.advanceTimersByTime(20))
  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '搜索 Diff' }))
})

it('keeps one floating surface when keyboard focus moves quickly between real diff controls', async () => {
  await mount(<DiffPanel files={files} wide={false} onWideChange={vi.fn()} fallbackChangeRows={rows}/>)
  vi.useFakeTimers()
  for (const name of ['Tree view', 'List view', 'Unified diff']) {
    await act(() => screen.getByRole('button', { name }).focus())
    expect(screen.getByRole('tooltip').textContent).toBe(name)
    expect(document.querySelectorAll('[role="tooltip"]')).toHaveLength(1)
  }
})

it('explains a busy patch action through its measured anchor while keeping it disabled', async () => {
  const onStagePatch = vi.fn()
  await mount(<DiffPanel files={files} wide={false} onWideChange={vi.fn()} fallbackChangeRows={rows} allowStage actionsBusy onStagePatch={onStagePatch}/>)
  const stage = screen.getByRole('button', { name: 'Stage this change block' }) as HTMLButtonElement
  expect(stage.disabled).toBe(true)
  const anchor = stage.parentElement!
  expect(anchor.className).toContain('diff-block-action-anchor')
  expect(anchor.style.width).toBe('24px')
  expect(anchor.style.height).toBe('20px')
  vi.useFakeTimers()
  await hover(anchor)
  expect(screen.getByRole('tooltip').textContent).toBe('Stage this change block')
  fireEvent.click(stage)
  expect(onStagePatch).not.toHaveBeenCalled()
})

it('keeps nested line help separate from its stage and history actions', async () => {
  const onStagePatch = vi.fn()
  const onOpenLineHistory = vi.fn()
  const { container, i18n } = await mount(<DiffPanel files={files} wide={false} onWideChange={vi.fn()} fallbackChangeRows={rows} allowStage onStagePatch={onStagePatch} onOpenLineHistory={onOpenLineHistory}/>)
  vi.useFakeTimers()
  const line = screen.getByRole('button', { name: 'Stage this line' })
  await hover(line)
  expect(screen.getAllByRole('tooltip').map(tip => tip.textContent)).toEqual([i18n.t('diff:actions.lineHint', { action: 'Stage this line' })])
  expect(onStagePatch).not.toHaveBeenCalled()
  fireEvent.click(line)
  expect(onStagePatch).toHaveBeenCalledTimes(1)
  expect(onStagePatch.mock.calls[0][0]).toBe(files[0].path)
  expect(onStagePatch.mock.calls[0][1]).toContain('+raw content')
  expect(screen.queryByRole('tooltip')).toBeNull()
  const row = container.querySelector('.code-row')!
  await hover(row)
  expect(screen.queryByRole('tooltip')).toBeNull()
  await hover(row.querySelector('.line-no')!)
  expect(screen.getByRole('tooltip').textContent).toBe('Right-click to view line history')
  fireEvent.contextMenu(row)
  expect(screen.queryByRole('tooltip')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'View history for line 1' }))
  await act(() => vi.advanceTimersByTime(120))
  expect(onOpenLineHistory).toHaveBeenCalledWith(files[0].path, 1, 'new', rows[0])
  expect(onStagePatch).toHaveBeenCalledTimes(1)
})

it('does not advertise line history in a diff without a history action', async () => {
  const { container } = await mount(<DiffPanel files={files} wide={false} onWideChange={vi.fn()} fallbackChangeRows={rows}/>)
  vi.useFakeTimers()
  const row = container.querySelector('.code-row')!
  await hover(row)
  expect(screen.queryByRole('tooltip')).toBeNull()
  await hover(row.querySelector('.line-no')!)
  expect(screen.queryByRole('tooltip')).toBeNull()
})

it('clears a virtual file hint after its keyed row scrolls out of the render range', async () => {
  const onSelectFile = vi.fn()
  const virtualFiles = Array.from({ length: 80 }, (_, index) => ({ path: `file${index}.ts`, type: 'M', add: 0, del: 0 }))
  const { container } = await mount(<DiffFileList files={virtualFiles} activeFile={0} mode="list" onSelectFile={onSelectFile}/>)
  vi.useFakeTimers()
  const first = screen.getByRole('button', { name: /file0.ts/ })
  await hover(first)
  expect(screen.getByRole('tooltip').textContent).toBe('file0.ts')
  fireEvent.scroll(container.querySelector('.file-list')!, { target: { scrollTop: 2000 } })
  await act(() => vi.advanceTimersByTime(20))
  expect(first.isConnected).toBe(false)
  expect(screen.queryByRole('tooltip')).toBeNull()
  await act(() => vi.advanceTimersByTime(500))
  expect(screen.queryByRole('tooltip')).toBeNull()
  expect(onSelectFile).not.toHaveBeenCalled()
})

it('shows a raw history path and preserves the independently named close action', async () => {
  const onClose = vi.fn()
  const path = 'very/long/原始目录/file.ts'
  const { container } = await mount(<HistoryDrawer filePath={path} onClose={onClose}/>)
  expect(container.querySelector('[title]')).toBeNull()
  vi.useFakeTimers()
  await hover(container.querySelector('.history-file-path')!)
  expect(screen.getByRole('tooltip').textContent).toBe(path)
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(onClose).toHaveBeenCalledTimes(1)
})
