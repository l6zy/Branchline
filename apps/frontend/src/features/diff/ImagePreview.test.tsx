// @vitest-environment jsdom
import { cleanup, fireEvent, render as renderUi, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppI18n } from '../../i18n'
import { TooltipProvider } from '../../components/tooltip'
import type { RepositoryImage } from '../../repository'
import { DiffPanel } from './DiffPanel'

const render = (ui: ReactElement) => renderUi(<TooltipProvider>{ui}</TooltipProvider>)
const image = (data: string): RepositoryImage => ({ mime: 'image/png', data, byteLength: 3 })

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  HTMLElement.prototype.scrollIntoView = vi.fn()
})
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); vi.unstubAllGlobals() })

describe('diff image previews', () => {
  it('renders old and new raster images with the code controls hidden', async () => {
    const i18n = await createAppI18n('en-US')
    const loadImage = vi.fn(async (_path: string, side: 'old' | 'new') => image(side === 'old' ? 'b2xk' : 'bmV3'))
    render(<I18nextProvider i18n={i18n}><DiffPanel files={[{ path: 'assets/logo.png', type: 'M', add: 0, del: 0 }]} wide={false} onWideChange={() => {}} loadImage={loadImage}/></I18nextProvider>)
    await waitFor(() => expect(document.querySelectorAll('.diff-image-card img')).toHaveLength(2))
    expect(loadImage).toHaveBeenCalledWith('assets/logo.png', 'old')
    expect(loadImage).toHaveBeenCalledWith('assets/logo.png', 'new')
    expect(document.querySelectorAll('.diff-image-card img')[0].getAttribute('src')).toBe('data:image/png;base64,b2xk')
    expect(document.querySelectorAll('.diff-image-card img')[1].getAttribute('src')).toBe('data:image/png;base64,bmV3')
    expect(screen.queryByRole('button', { name: 'Unified diff' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Search diff' })).toBeNull()
  })

  it('switches svg between preview and source diff', async () => {
    const i18n = await createAppI18n('en-US')
    const loadRows = vi.fn(async () => [{ old: null, next: 1, kind: 'add' as const, code: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' }])
    const loadImage = vi.fn(async () => ({ mime: 'image/svg+xml', data: 'PHN2Zy8+', byteLength: 6 }))
    render(<I18nextProvider i18n={i18n}><DiffPanel files={[{ path: 'docs/icon.svg', type: 'M', add: 1, del: 0 }]} wide={false} onWideChange={() => {}} loadRows={loadRows} loadImage={loadImage}/></I18nextProvider>)
    await waitFor(() => expect(document.querySelector('.diff-image-preview')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Source diff' }))
    await waitFor(() => expect(document.querySelector('.code-row.add')?.textContent).toContain('<svg'))
    expect(document.querySelector('.diff-image-preview')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Image preview' }))
    await waitFor(() => expect(document.querySelector('.diff-image-preview')).toBeTruthy())
  })

  it('shows a preview for a single available side', async () => {
    const i18n = await createAppI18n('en-US')
    const loadImage = vi.fn(async (_path: string, side: 'old' | 'new') => side === 'new' ? image('bmV3') : null)
    render(<I18nextProvider i18n={i18n}><DiffPanel files={[{ path: 'assets/added.png', type: 'A', add: 0, del: 0 }]} wide={false} onWideChange={() => {}} loadImage={loadImage}/></I18nextProvider>)
    await waitFor(() => expect(document.querySelectorAll('.diff-image-card img')).toHaveLength(1))
    expect(document.querySelector('.diff-image-grid')?.className).toContain('single')
  })

  it('loads only the committed side for read-only file content', async () => {
    const i18n = await createAppI18n('en-US')
    const loadImage = vi.fn(async () => image('ZmlsZQ=='))
    render(<I18nextProvider i18n={i18n}><DiffPanel files={[{ path: 'assets/icon.svg', type: 'M', add: 0, del: 0 }]} wide={false} onWideChange={() => {}} hideFileList fileContentOnly loadImage={loadImage}/></I18nextProvider>)
    await waitFor(() => expect(document.querySelectorAll('.diff-image-card img')).toHaveLength(1))
    expect(loadImage).toHaveBeenCalledWith('assets/icon.svg', 'new')
    expect(loadImage).not.toHaveBeenCalledWith('assets/icon.svg', 'old')
    expect(screen.getByText('File preview')).toBeTruthy()
  })

  it('adjusts image preview zoom from the toolbar', async () => {
    const i18n = await createAppI18n('en-US')
    const loadImage = vi.fn(async () => image('ZmlsZQ=='))
    render(<I18nextProvider i18n={i18n}><DiffPanel files={[{ path: 'assets/photo.png', type: 'M', add: 0, del: 0 }]} wide={false} onWideChange={() => {}} loadImage={loadImage}/></I18nextProvider>)
    await waitFor(() => expect(document.querySelectorAll('.diff-image-card img')).toHaveLength(2))
    const reset = screen.getByRole('button', { name: 'Reset image zoom' })
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' })
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' })
    expect(reset.textContent).toBe('100%')
    fireEvent.click(zoomIn)
    expect(reset.textContent).toBe('125%')
    fireEvent.click(zoomOut)
    expect(reset.textContent).toBe('100%')
    fireEvent.click(reset)
    expect(reset.textContent).toBe('100%')
  })
})
