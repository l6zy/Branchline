// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef, forwardRef, type ButtonHTMLAttributes } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Tooltip, TooltipProvider } from './index'

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
function user() {
  let current: HTMLElement | null = null
  return {
    hover(element: HTMLElement) {
      if (current && current !== element) fireEvent.mouseLeave(current, { relatedTarget: element })
      fireEvent.mouseEnter(element, { relatedTarget: current })
      current = element
    },
    unhover(element: HTMLElement) { fireEvent.mouseLeave(element); current = null },
    click(element: HTMLElement) { fireEvent.pointerDown(element); act(() => element.focus()); fireEvent.click(element) },
    tab() { fireEvent.keyDown(document.body, { key: 'Tab' }); act(() => screen.getByRole('button').focus()) },
  }
}
async function advance(ms: number) { await act(async () => { vi.advanceTimersByTime(ms) }) }

describe('Tooltip', () => {
  it('opens after 300ms and uses a body portal without wrapping an enabled trigger', async () => {
    const { container } = render(<TooltipProvider><Tooltip content="Copy hash"><button aria-label="Copy">copy</button></Tooltip></TooltipProvider>)
    const button = screen.getByRole('button', { name: 'Copy' })
    expect(container.firstElementChild).toBe(button)
    await user().hover(button)
    await advance(299)
    expect(screen.queryByRole('tooltip')).toBeNull()
    await advance(1)
    const tip = screen.getByRole('tooltip')
    expect(tip.textContent).toBe('Copy hash')
    expect(tip.hasAttribute('tabindex')).toBe(false)
    expect(container.contains(tip)).toBe(false)
    expect(document.body.contains(tip)).toBe(true)
    expect(button.getAttribute('aria-describedby')).toBe(tip.id)
    expect(tip.querySelector('svg')).toBeTruthy()
  })

  it('cancels pending hover when leaving before 300ms', async () => {
    render(<TooltipProvider><Tooltip content="Hint"><button>trigger</button></Tooltip></TooltipProvider>)
    const client = user()
    await client.hover(screen.getByRole('button'))
    await advance(299)
    await client.unhover(screen.getByRole('button'))
    await advance(400)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('opens ordinary hover when the native timer starts before the delegated claim', async () => {
    render(<TooltipProvider><Tooltip content="Hint"><button>trigger</button></Tooltip></TooltipProvider>)
    const button = screen.getByRole('button')
    fireEvent.mouseEnter(button, { relatedTarget: document.body })
    await advance(1)
    fireEvent.mouseOver(button, { relatedTarget: document.body })
    await advance(299)
    expect(screen.queryByRole('tooltip')).toBeNull()
    await advance(1)
    expect(screen.getByRole('tooltip').textContent).toBe('Hint')
  })

  it('opens immediately for keyboard focus and consumes Escape without moving focus', async () => {
    const globalEscape = vi.fn()
    window.addEventListener('keydown', globalEscape)
    render(<TooltipProvider><Tooltip content="Keyboard hint"><button>trigger</button></Tooltip></TooltipProvider>)
    await user().tab()
    globalEscape.mockClear()
    expect(screen.getByRole('tooltip').textContent).toBe('Keyboard hint')
    const button = screen.getByRole('button')
    fireEvent.keyDown(button, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(document.activeElement).toBe(button)
    expect(button.hasAttribute('aria-describedby')).toBe(false)
    expect(globalEscape).not.toHaveBeenCalled()
    fireEvent.keyDown(button, { key: 'Escape' })
    expect(globalEscape).toHaveBeenCalledOnce()
    window.removeEventListener('keydown', globalEscape)
  })

  it.each(['pointerdown', 'click', 'contextmenu', 'scroll'])('dismisses on capture %s and invalidates pending hover', async (eventName) => {
    const click = vi.fn()
    const contextmenu = vi.fn()
    render(<TooltipProvider><div data-testid="scroll"><Tooltip content="Hint"><button onClick={click} onContextMenu={contextmenu}>trigger</button></Tooltip></div></TooltipProvider>)
    const button = screen.getByRole('button')
    await user().hover(button)
    await advance(300)
    expect(screen.getByRole('tooltip')).toBeTruthy()
    const target = eventName === 'scroll' ? screen.getByTestId('scroll') : button
    fireEvent(target, new Event(eventName, { bubbles: eventName !== 'scroll', cancelable: true }))
    expect(screen.queryByRole('tooltip')).toBeNull()
    if (eventName === 'click') expect(click).toHaveBeenCalledOnce()
    if (eventName === 'contextmenu') expect(contextmenu).toHaveBeenCalledOnce()
    fireEvent.mouseMove(button)
    await advance(500)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('does not reopen after pointer activation until the pointer reenters', async () => {
    render(<TooltipProvider><Tooltip content="Hint"><button>trigger</button></Tooltip></TooltipProvider>)
    const client = user()
    const button = screen.getByRole('button')
    await client.hover(button)
    await advance(200)
    await client.click(button)
    await advance(500)
    expect(screen.queryByRole('tooltip')).toBeNull()
    await client.unhover(button)
    await client.hover(button)
    await advance(300)
    expect(screen.getByRole('tooltip')).toBeTruthy()
  })

  it('preserves a forwardRef, handlers, accessible name and external description ids', async () => {
    const ref = createRef<HTMLButtonElement>()
    const click = vi.fn()
    const enter = vi.fn()
    const CustomButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>((props, forwardedRef) => <button {...props} ref={forwardedRef}/>)
    render(<TooltipProvider><Tooltip content="Detailed hint"><CustomButton ref={ref} aria-label="Independent name" aria-describedby="external other" onMouseEnter={enter} onClick={click}>trigger</CustomButton></Tooltip></TooltipProvider>)
    const button = screen.getByRole('button', { name: 'Independent name' })
    expect(ref.current).toBe(button)
    await user().hover(button)
    await advance(300)
    expect(enter).toHaveBeenCalledOnce()
    const id = screen.getByRole('tooltip').id
    expect(button.getAttribute('aria-describedby')).toBe(`external other ${id}`)
    fireEvent.click(button)
    expect(click).toHaveBeenCalledOnce()
    expect(button.getAttribute('aria-describedby')).toBe('external other')
  })

  it('gives nested triggers precedence over their ancestors', async () => {
    render(<TooltipProvider><Tooltip content="Outer"><div data-testid="outer">outer<Tooltip content="Inner"><button>inner</button></Tooltip></div></Tooltip></TooltipProvider>)
    await user().hover(screen.getByRole('button'))
    await advance(300)
    expect(screen.getAllByRole('tooltip').map(element => element.textContent)).toEqual(['Inner'])
  })

  it('removes an open ancestor immediately when entering its nested trigger', async () => {
    render(<TooltipProvider><Tooltip content="Outer"><div data-testid="outer">outer<Tooltip content="Inner"><button>inner</button></Tooltip></div></Tooltip></TooltipProvider>)
    const client = user()
    await client.hover(screen.getByTestId('outer'))
    await advance(300)
    expect(screen.getByRole('tooltip').textContent).toBe('Outer')
    await client.hover(screen.getByRole('button'))
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
    await advance(300)
    expect(screen.getByRole('tooltip').textContent).toBe('Inner')
  })

  it('reclaims an ancestor after leaving its nested trigger without leaving the ancestor', async () => {
    render(<TooltipProvider><Tooltip content="Outer"><div data-testid="outer"><span data-testid="area">outer area</span><Tooltip content="Inner"><button>inner</button></Tooltip></div></Tooltip></TooltipProvider>)
    const outer = screen.getByTestId('outer')
    const area = screen.getByTestId('area')
    const inner = screen.getByRole('button')
    fireEvent.mouseOver(area, { relatedTarget: document.body })
    fireEvent.mouseEnter(outer, { relatedTarget: document.body })
    await advance(300)
    expect(screen.getByRole('tooltip').textContent).toBe('Outer')
    fireEvent.mouseOut(area, { relatedTarget: inner })
    fireEvent.mouseOver(inner, { relatedTarget: area })
    fireEvent.mouseEnter(inner, { relatedTarget: area })
    await advance(300)
    expect(screen.getByRole('tooltip').textContent).toBe('Inner')
    fireEvent.mouseLeave(inner, { relatedTarget: area })
    fireEvent.mouseOut(inner, { relatedTarget: area })
    fireEvent.mouseOver(area, { relatedTarget: inner })
    fireEvent.mouseMove(area)
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
    await advance(299)
    expect(screen.queryByRole('tooltip')?.textContent).not.toBe('Outer')
    await advance(1)
    expect([...document.querySelectorAll('[role="tooltip"]')].map(element => element.textContent)).toEqual(['Outer'])
  })

  it('restores nested ancestor hover with browser-shaped events and real timers', async () => {
    vi.useRealTimers()
    render(<TooltipProvider><Tooltip content="Outer"><div data-testid="outer"><span data-testid="area">outer area</span><Tooltip content="Inner"><span data-testid="inner">inner area</span></Tooltip></div></Tooltip></TooltipProvider>)
    const outer = screen.getByTestId('outer')
    const area = screen.getByTestId('area')
    const inner = screen.getByTestId('inner')
    const expectAfterHover = async (content: string) => {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 360)) })
      expect([...document.querySelectorAll('[role="tooltip"]')].map(element => element.textContent)).toEqual([content])
    }
    fireEvent.mouseOver(area, { relatedTarget: document.body })
    fireEvent.mouseEnter(outer, { relatedTarget: document.body })
    await expectAfterHover('Outer')
    for (let cycle = 0; cycle < 3; cycle++) {
      fireEvent.mouseOut(area, { relatedTarget: inner })
      fireEvent.mouseOver(inner, { relatedTarget: area })
      fireEvent.mouseEnter(inner, { relatedTarget: area })
      await expectAfterHover('Inner')
      fireEvent.mouseOut(inner, { relatedTarget: area })
      fireEvent.mouseLeave(inner, { relatedTarget: area })
      fireEvent.mouseOver(area, { relatedTarget: inner })
      fireEvent.mouseMove(area)
      await expectAfterHover('Outer')
    }
  })

  it('starts a fresh ancestor delay after a nested detour during its initial pending hover', async () => {
    render(<TooltipProvider><Tooltip content="Outer"><div data-testid="outer"><span data-testid="area">outer area</span><Tooltip content="Inner"><button>inner</button></Tooltip></div></Tooltip></TooltipProvider>)
    const outer = screen.getByTestId('outer')
    const area = screen.getByTestId('area')
    const inner = screen.getByRole('button')
    fireEvent.mouseOver(area, { relatedTarget: document.body })
    fireEvent.mouseEnter(outer, { relatedTarget: document.body })
    await advance(100)
    fireEvent.mouseOut(area, { relatedTarget: inner })
    fireEvent.mouseOver(inner, { relatedTarget: area })
    fireEvent.mouseEnter(inner, { relatedTarget: area })
    await advance(100)
    fireEvent.mouseLeave(inner, { relatedTarget: area })
    fireEvent.mouseOut(inner, { relatedTarget: area })
    fireEvent.mouseOver(area, { relatedTarget: inner })
    await advance(299)
    expect(screen.queryByRole('tooltip')).toBeNull()
    await advance(1)
    expect(screen.getByRole('tooltip').textContent).toBe('Outer')
  })

  it.each(['leave', 'activate'])('cancels resumed ancestor hover on %s without reopening on movement', async action => {
    render(<TooltipProvider><Tooltip content="Outer"><div data-testid="outer"><span data-testid="area">outer area</span><Tooltip content="Inner"><button>inner</button></Tooltip></div></Tooltip></TooltipProvider>)
    const outer = screen.getByTestId('outer')
    const area = screen.getByTestId('area')
    const inner = screen.getByRole('button')
    fireEvent.mouseOver(inner, { relatedTarget: document.body })
    fireEvent.mouseEnter(outer, { relatedTarget: document.body })
    fireEvent.mouseEnter(inner, { relatedTarget: document.body })
    await advance(300)
    expect(screen.getByRole('tooltip').textContent).toBe('Inner')
    fireEvent.mouseLeave(inner, { relatedTarget: area })
    fireEvent.mouseOut(inner, { relatedTarget: area })
    fireEvent.mouseOver(area, { relatedTarget: inner })
    await advance(299)
    if (action === 'leave') {
      fireEvent.mouseOut(area, { relatedTarget: document.body })
      fireEvent.mouseLeave(outer, { relatedTarget: document.body })
    } else {
      fireEvent.pointerDown(area)
      fireEvent.click(area)
      fireEvent.mouseMove(area)
    }
    await advance(500)
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
  })

  it('keeps the tooltip while the pointer enters its floating surface', async () => {
    render(<TooltipProvider><Tooltip content="Hover bridge"><button>trigger</button></Tooltip></TooltipProvider>)
    const button = screen.getByRole('button')
    await user().hover(button)
    await advance(300)
    const tip = screen.getByRole('tooltip')
    fireEvent.mouseLeave(button, { relatedTarget: tip })
    fireEvent.mouseEnter(tip, { relatedTarget: button })
    await advance(1000)
    expect(screen.getByRole('tooltip')).toBeTruthy()
  })

  it('updates open content without remounting the trigger and cleans up when content becomes empty', async () => {
    const ui = (content?: string | null) => <TooltipProvider><Tooltip content={content}><span data-testid="trigger">path</span></Tooltip></TooltipProvider>
    const { rerender, unmount } = render(ui('Original'))
    const span = screen.getByTestId('trigger')
    expect(span.hasAttribute('tabindex')).toBe(false)
    await user().hover(span)
    await advance(300)
    rerender(ui('翻译后的提示'))
    expect(screen.getByRole('tooltip').textContent).toBe('翻译后的提示')
    expect(screen.getByTestId('trigger')).toBe(span)
    rerender(ui(null))
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(span.hasAttribute('aria-describedby')).toBe(false)
    unmount()
    await advance(1000)
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
  })

  it('leaves empty content unchanged without requiring a provider', () => {
    const { container } = render(<Tooltip content=""><button aria-describedby="external">trigger</button></Tooltip>)
    expect(container.firstElementChild?.outerHTML).toBe('<button aria-describedby="external">trigger</button>')
  })

  it('cleans up an unmounted pending trigger without closing a newer owner', async () => {
    const ui = (showFirst: boolean) => <TooltipProvider>{showFirst && <Tooltip content="First"><button>first</button></Tooltip>}<Tooltip content="Second"><button>second</button></Tooltip></TooltipProvider>
    const { rerender } = render(ui(true))
    const client = user()
    await client.hover(screen.getByRole('button', { name: 'first' }))
    await advance(100)
    await client.hover(screen.getByRole('button', { name: 'second' }))
    rerender(ui(false))
    await advance(300)
    expect(screen.getByRole('tooltip').textContent).toBe('Second')
  })

  it('never revives earlier fading surfaces during rapid focus changes', () => {
    render(<TooltipProvider>{['A', 'B', 'C'].map(value => <Tooltip content={value} key={value}><button>{value}</button></Tooltip>)}</TooltipProvider>)
    for (const value of ['A', 'B', 'C']) {
      fireEvent.keyDown(document.body, { key: 'Tab' })
      act(() => screen.getByRole('button', { name: value }).focus())
      expect([...document.querySelectorAll('[role="tooltip"]')].map(element => element.textContent)).toEqual([value])
    }
  })
})
