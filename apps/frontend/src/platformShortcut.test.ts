import { describe, expect, it } from 'vitest'
import { getShortcutModifier } from './platformShortcut'

describe('platform shortcut modifier', () => {
  it('uses the Command symbol on Apple platforms', () => {
    expect(getShortcutModifier('MacIntel')).toBe('⌘')
    expect(getShortcutModifier('iPad')).toBe('⌘')
  })

  it('uses Ctrl on Windows and Linux platforms', () => {
    expect(getShortcutModifier('Win32')).toBe('Ctrl')
    expect(getShortcutModifier('Linux x86_64')).toBe('Ctrl')
  })
})
