// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BranchTree } from '../../App'
import { TooltipProvider } from '../../components/tooltip'
import { createAppI18n } from '../../i18n'

const handlers = {
  onToggleAutoPull: vi.fn(),
  onCreateBranch: vi.fn(),
  onDeletePrefix: vi.fn(),
  onJumpBranch: vi.fn(),
  onSwitchBranch: vi.fn(),
  onPullBranch: vi.fn(),
  onMergeBranch: vi.fn(),
  onDeleteBranch: vi.fn(),
  onCopyBranch: vi.fn(),
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })

describe('branch pull status', () => {
  it('shows only the spinning pull icon while a branch is being pulled', async () => {
    const i18n = await createAppI18n('en-US')
    const renderTree = (pulling: boolean) => (
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <BranchTree
            branches={['main']}
            currentBranch="main"
            autoPullBranches={['main']}
            pullingBranches={pulling ? ['main'] : []}
            {...handlers}
          />
        </TooltipProvider>
      </I18nextProvider>
    )
    const view = render(renderTree(false))
    expect(document.querySelectorAll('.branch-auto-pull-mark')).toHaveLength(1)
    expect(document.querySelectorAll('.branch-pull-spinner')).toHaveLength(0)

    view.rerender(renderTree(true))
    expect(document.querySelectorAll('.branch-auto-pull-mark')).toHaveLength(0)
    expect(document.querySelectorAll('.branch-pull-spinner')).toHaveLength(1)
    expect(document.querySelector('.branch-pull-spinner svg')?.classList.contains('spin')).toBe(true)
  })
})
