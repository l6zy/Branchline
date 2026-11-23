// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextMenu } from './ContextMenu'
import { AnimatedPage } from './motion/Motion'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers() })

describe('ContextMenu', () => {
  it('closes a cached page menu when navigating away', () => {
    const onClose = vi.fn()
    const { rerender } = render(<AnimatedPage pageKey="changes" cacheScope="repo"><ContextMenu x={0} y={0} onClose={onClose}><button>File history</button></ContextMenu></AnimatedPage>)
    expect(screen.getByRole('button', { name: 'File history' })).toBeTruthy()

    rerender(<AnimatedPage pageKey="history" cacheScope="repo"><button>Commits</button></AnimatedPage>)
    expect(screen.queryByRole('button', { name: 'File history' })).toBeNull()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes after an action so the owning trigger can open it again', () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return <>
        <button onClick={() => setOpen((value) => !value)}>More</button>
        {open && <ContextMenu x={0} y={0} onClose={() => setOpen(false)}>
          <button onClick={() => undefined}>Action</button>
        </ContextMenu>}
      </>
    }

    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'More' })
    fireEvent.click(trigger)
    expect(screen.getByRole('button', { name: 'Action' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Action' }))
    act(() => { vi.advanceTimersByTime(120) })
    expect(screen.queryByRole('button', { name: 'Action' })).toBeNull()

    fireEvent.click(trigger)
    expect(screen.getByRole('button', { name: 'Action' })).toBeTruthy()
  })
})
