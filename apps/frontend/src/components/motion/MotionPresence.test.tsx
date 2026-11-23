// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AnimatedModal, AnimatedPage, MotionPresence } from './Motion'

describe('MotionPresence', () => {
  let host: HTMLDivElement | null = null
  let root: ReturnType<typeof createRoot> | null = null

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(() => {
    if (root) act(() => root?.unmount())
    host?.remove()
    host = null
    root = null
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
  })

  it('keeps exiting content visible to the animation while disabling interaction', () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(<MotionPresence present><button>Repository</button></MotionPresence>))

    const layer = host.querySelector('.motion-presence') as HTMLDivElement
    expect(layer.inert).toBe(false)

    act(() => root?.render(<MotionPresence present={false}><button>Repository</button></MotionPresence>))

    expect(host.querySelector('.motion-presence')).toBe(layer)
    expect(layer.getAttribute('aria-hidden')).toBe('true')
    expect(layer.hasAttribute('inert')).toBe(true)
  })

  it('mounts the next page immediately while the previous page exits', () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(<AnimatedPage pageKey="history"><button>History</button></AnimatedPage>))
    act(() => root?.render(<AnimatedPage pageKey="changes"><button>Changes</button></AnimatedPage>))

    const incoming = host.querySelector('.motion-page[aria-hidden="false"]')
    expect(incoming?.textContent).toBe('Changes')
    expect(host.querySelector('.motion-page[aria-hidden="true"]')?.textContent).toBe('History')
    expect((incoming as HTMLElement).inert).toBe(false)
  })

  it.each([undefined, 'repo'])('keeps the first page stable and animates navigation (cache scope: %s)', (cacheScope) => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(<AnimatedPage pageKey="history" cacheScope={cacheScope}><button>History</button></AnimatedPage>))

    const firstPage = host.querySelector<HTMLElement>('.motion-page')
    expect(firstPage?.style.opacity).toBe('1')
    expect(firstPage?.style.transform).toBe('none')

    act(() => root?.render(<AnimatedPage pageKey="changes" cacheScope={cacheScope}><button>Changes</button></AnimatedPage>))

    const incoming = host.querySelector<HTMLElement>('.motion-page[aria-hidden="false"]')
    expect(incoming?.style.opacity).toBe('0')
    expect(incoming?.style.transform).toContain('translateX(10px)')
  })

  it('responds to rapid navigation without waiting for queued exits', () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    for (const pageKey of ['history', 'changes', 'stash', 'history']) {
      act(() => root?.render(<AnimatedPage pageKey={pageKey}><button>{pageKey}</button></AnimatedPage>))
      expect(host.querySelector('.motion-page[aria-hidden="false"]')?.textContent).toBe(pageKey)
      expect(host.querySelectorAll('.motion-page[aria-hidden="false"]')).toHaveLength(1)
    }
  })

  it('portals dialogs outside transformed page layers', () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(<AnimatedPage pageKey="changes"><AnimatedModal open><section role="dialog">Template</section></AnimatedModal></AnimatedPage>))

    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    expect(document.querySelector('[role="dialog"]')?.closest('body')).not.toBeNull()
  })

  it('preserves a cached page and its draft after the outgoing animation', async () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(<AnimatedPage pageKey="changes" cacheScope="repo"><input defaultValue="Draft"/></AnimatedPage>))
    const draft = host.querySelector('input')!
    draft.value = 'Unfinished commit'
    act(() => root?.render(<AnimatedPage pageKey="history" cacheScope="repo"><button>History</button></AnimatedPage>))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 500)) })
    act(() => root?.render(<AnimatedPage pageKey="changes" cacheScope="repo"><input defaultValue="Draft"/></AnimatedPage>))

    expect(host.querySelector('.motion-page[aria-hidden="false"] input')).toBe(draft)
    expect(draft.value).toBe('Unfinished commit')
  })

  it('starts a fresh page when switching repositories', () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(<AnimatedPage pageKey="changes" cacheScope="repo-a"><input defaultValue="First repository"/></AnimatedPage>))
    act(() => root?.render(<AnimatedPage pageKey="changes" cacheScope="repo-b"><input defaultValue="Second repository"/></AnimatedPage>))

    const draft = host.querySelector('.motion-page[aria-hidden="false"] input') as HTMLInputElement
    expect(draft.value).toBe('Second repository')
  })

  it('disables a portal dialog when its cached page becomes inactive', () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(<AnimatedPage pageKey="changes" cacheScope="repo"><AnimatedModal open><section role="dialog">Template</section></AnimatedModal></AnimatedPage>))
    act(() => root?.render(<AnimatedPage pageKey="history" cacheScope="repo"><button>History</button></AnimatedPage>))

    expect(document.querySelector('.motion-modal-backdrop')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('passes an inactive route through nested page transitions to portal dialogs', () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(<AnimatedPage pageKey="workbench"><AnimatedPage pageKey="changes" cacheScope="repo"><AnimatedModal open><section role="dialog">Template</section></AnimatedModal></AnimatedPage></AnimatedPage>))
    act(() => root?.render(<AnimatedPage pageKey="manager"><button>Repositories</button></AnimatedPage>))

    expect(document.querySelector('.motion-modal-backdrop')?.getAttribute('aria-hidden')).toBe('true')
  })
})
