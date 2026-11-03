// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Button } from './Button'
import { Tooltip, TooltipProvider } from './tooltip'
import { CompactSelect } from './CompactSelect'
import { renderLocalized } from '../test/renderLocalized'

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
async function advance(ms: number) { await act(async () => { vi.advanceTimersByTime(ms) }) }

describe('shared control tooltips', () => {
  it('keeps disabled Button semantics and uses only a nonfocusable hover anchor', async () => {
    const ref = createRef<HTMLButtonElement>()
    const click = vi.fn()
    render(<TooltipProvider><Button ref={ref} disabled tooltip="Nothing selected" aria-label="Commit" onClick={click} disabledAnchorClassName="fill-cell" disabledAnchorStyle={{ width: '100%' }}>commit</Button></TooltipProvider>)
    const button = screen.getByRole('button', { name: 'Commit' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(ref.current).toBe(button)
    const anchor = button.parentElement!
    expect(anchor.classList.contains('tooltip-disabled-anchor')).toBe(true)
    expect(anchor.classList.contains('fill-cell')).toBe(true)
    expect(anchor.style.width).toBe('100%')
    expect(anchor.hasAttribute('tabindex')).toBe(false)
    expect(anchor.hasAttribute('role')).toBe(false)
    expect(button.style.pointerEvents).toBe('none')
    fireEvent.mouseEnter(anchor)
    await advance(300)
    expect(screen.getByRole('tooltip').textContent).toBe('Nothing selected')
    fireEvent.click(button)
    fireEvent.click(anchor)
    expect(click).not.toHaveBeenCalled()
  })

  it('removes a disabled anchor when enabled and restores the forwarded ref and click handler', () => {
    const ref = createRef<HTMLButtonElement>()
    const click = vi.fn()
    const ui = (disabled: boolean) => <TooltipProvider><Button ref={ref} disabled={disabled} tooltip="Hint" onClick={click}>commit</Button></TooltipProvider>
    const { rerender, container } = render(ui(true))
    rerender(ui(false))
    const button = screen.getByRole('button') as HTMLButtonElement
    expect(container.firstElementChild).toBe(button)
    expect(ref.current).toBe(button)
    expect(button.disabled).toBe(false)
    expect(button.style.pointerEvents).toBe('')
    fireEvent.click(button)
    expect(click).toHaveBeenCalledOnce()
  })

  it('does not alter a Button without tooltip content', () => {
    const { container } = render(<Button disabled variant="primary">commit</Button>)
    expect(container.innerHTML).toBe('<button class="button button-primary" disabled="">commit</button>')
  })

  it('supports a disabled intrinsic input without giving it a new tab stop', async () => {
    render(<TooltipProvider><Tooltip content="Read only"><input disabled aria-label="Input"/></Tooltip></TooltipProvider>)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(input.parentElement?.hasAttribute('tabindex')).toBe(false)
    fireEvent.mouseEnter(input.parentElement!)
    await advance(300)
    expect(screen.getByRole('tooltip').textContent).toBe('Read only')
  })

  it('keeps disabled controls out of the native Tab order', async () => {
    vi.useRealTimers()
    render(<TooltipProvider><Button disabled tooltip="Disabled">disabled</Button><button>next</button></TooltipProvider>)
    await userEvent.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'next' }))
  })

  it('keeps a disabled CompactSelect anchor filling the control width', async () => {
    await renderLocalized(<div style={{ width: 240 }}><CompactSelect value="one" options={[{ value: 'one', label: 'One' }]} onChange={vi.fn()} ariaLabel="Choose" disabled/></div>, 'en-US')
    const trigger = screen.getByRole('button', { name: 'Choose' }) as HTMLButtonElement
    const anchor = trigger.parentElement!
    expect(trigger.disabled).toBe(true)
    expect(anchor.classList.contains('tooltip-disabled-anchor')).toBe(true)
    expect(anchor.style.width).toBe('100%')
  })

  it('replaces CompactSelect hints and preserves single-Escape menu dismissal', async () => {
    const onChange = vi.fn()
    const globalEscape = vi.fn()
    window.addEventListener('keydown', globalEscape)
    await renderLocalized(<CompactSelect value="one" options={[{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }]} onChange={onChange} ariaLabel="Choose" tooltip="Choose a value"/>, 'en-US')
    const trigger = screen.getByRole('button', { name: 'Choose' })
    expect(trigger.hasAttribute('title')).toBe(false)
    fireEvent.mouseEnter(trigger)
    await advance(300)
    expect(screen.getByRole('tooltip').textContent).toBe('Choose a value')
    fireEvent.click(trigger)
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('listbox')).toBeTruthy()
    expect(screen.queryByRole('tooltip')).toBeTruthy()
    globalEscape.mockClear()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(onChange).not.toHaveBeenCalled()
    expect(globalEscape).not.toHaveBeenCalled()
    window.removeEventListener('keydown', globalEscape)
  })
})
