// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppI18n } from './index'
import { LocaleProvider } from './LocaleProvider'
import { TooltipProvider } from '../components/tooltip'
import { LanguageSelect } from '../components/LanguageSelect'

beforeEach(() => { vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['zh-CN']) })
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })
async function mount() {
  const i18n = await createAppI18n('zh-CN')
  render(<I18nextProvider i18n={i18n}><LocaleProvider><TooltipProvider><LanguageSelect/><input aria-label="draft" defaultValue="keep my draft"/></TooltipProvider></LocaleProvider></I18nextProvider>)
  return i18n
}
describe('language selector', () => {
  it('switches immediately, preserves drafts and remembers the manual preference', async () => {
    const user = userEvent.setup()
    const i18n = await mount()
    await user.click(screen.getByRole('button', { name: '界面语言' }))
    await user.click(screen.getByRole('option', { name: 'English' }))
    await waitFor(() => expect(i18n.resolvedLanguage).toBe('en-US'))
    expect(document.documentElement.lang).toBe('en-US')
    expect(localStorage.getItem('branchline.locale.v1')).toBe('en-US')
    expect((screen.getByRole('textbox', { name: 'draft' }) as HTMLInputElement).value).toBe('keep my draft')
    cleanup()
    const restored = await mount()
    await waitFor(() => expect(restored.resolvedLanguage).toBe('en-US'))
  })
  it('follows system changes only while in system mode', async () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['zh-CN'])
    const i18n = await mount()
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-GB'])
    await act(async () => { window.dispatchEvent(new Event('languagechange')) })
    expect(i18n.resolvedLanguage).toBe('en-US')
    localStorage.setItem('branchline.locale.v1', 'zh-CN')
    cleanup()
    const manual = await mount()
    await act(async () => { window.dispatchEvent(new Event('languagechange')) })
    expect(manual.resolvedLanguage).toBe('zh-CN')
  })
  it('supports keyboard selection and restores focus on Escape', async () => {
    await mount()
    const button = screen.getByRole('button', { name: '界面语言' })
    button.focus()
    fireEvent.keyDown(button, { key: 'ArrowDown' })
    expect(screen.getByRole('listbox')).not.toBeNull()
    fireEvent.keyDown(document.activeElement!, { key: 'End' })
    expect(document.activeElement?.textContent).toBe('English')
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(button)
  })
})
