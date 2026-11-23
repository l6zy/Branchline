import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnimatedCollapse, AnimatedModal } from './Motion'

describe('AnimatedModal', () => {
  it('renders modal content inside a separately animated surface', () => {
    const markup = renderToStaticMarkup(
      <AnimatedModal open>
        <section role="dialog" aria-modal="true">Confirmation</section>
      </AnimatedModal>,
    )

    expect(markup).toContain('motion-modal-surface')
    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('aria-hidden="false"')
  })
})

describe('AnimatedCollapse', () => {
  it('does not render descendants while initially collapsed', () => {
    const markup = renderToStaticMarkup(<AnimatedCollapse open={false}><button>Hidden branch</button></AnimatedCollapse>)

    expect(markup).not.toContain('Hidden branch')
  })
})
