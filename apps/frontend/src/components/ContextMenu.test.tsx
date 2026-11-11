// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextMenu } from './ContextMenu'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers() })

describe('ContextMenu', () => {
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
