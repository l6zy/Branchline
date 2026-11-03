// @vitest-environment jsdom
import { act, cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderLocalized } from '../test/renderLocalized'
import { message } from '../i18n/messages'
import { useConfirmDialog } from './ConfirmDialog'

afterEach(cleanup)
describe('localized confirmation requests', () => {
  it('retranslates an open request without replacing its resolver', async () => {
    const resolved = vi.fn()
    function Harness() {
      const { confirm, confirmDialog } = useConfirmDialog()
      return <><button onClick={() => { void confirm({ message: message('repository:branchSwitched', { branch: '保留原文' }) }).then(resolved) }}>open</button>{confirmDialog}</>
    }
    const user = userEvent.setup()
    const { i18n } = await renderLocalized(<Harness />)
    await user.click(screen.getByRole('button', { name: 'open' }))
    const dialog = screen.getByRole('dialog')
    const id = dialog.getAttribute('aria-labelledby')
    await act(async () => { await i18n.changeLanguage('en-US') })
    expect(screen.getByRole('dialog').getAttribute('aria-labelledby')).toBe(id)
    expect(screen.getByText('Switched to branch: 保留原文')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(resolved).toHaveBeenCalledExactlyOnceWith(true)
  })
})
