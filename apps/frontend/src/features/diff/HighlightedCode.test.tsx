import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HighlightedCode } from './HighlightedCode'

describe('HighlightedCode inline changes', () => {
  it('highlights part of a syntax token without losing its syntax color', () => {
    const html = renderToStaticMarkup(<HighlightedCode code={'const label = "hello world";'} filePath="file.ts" changedRanges={[{ from: 21, to: 26 }]} />)
    expect(html).toContain('<span class="token string">&quot;hello <span class="diff-inline-change">world</span>&quot;</span>')
    expect(html).toContain('<span class="token keyword">const</span>')
  })

  it('preserves text and syntax when a range crosses tokens', () => {
    const html = renderToStaticMarkup(<HighlightedCode code="return 42;" filePath="file.ts" changedRanges={[{ from: 0, to: 9 }]} />)
    expect(html).toContain('<span class="token keyword"><span class="diff-inline-change">return</span></span>')
    expect(html).toContain('<span class="token number"><span class="diff-inline-change">42</span></span>')
    expect(html.replace(/<[^>]+>/g, '')).toBe('return 42;')
  })

  it('supports separate ranges inside one string', () => {
    const html = renderToStaticMarkup(<HighlightedCode code={'"old and old"'} filePath="file.ts" changedRanges={[{ from: 1, to: 4 }, { from: 9, to: 12 }]} />)
    expect(html.match(/class="diff-inline-change"/g)).toHaveLength(2)
    expect(html).toContain('</span> and <span class="diff-inline-change">old</span>')
  })

  it('does not highlight empty ranges or change unmarked code rendering', () => {
    const normal = renderToStaticMarkup(<HighlightedCode code="const a = 1;" filePath="file.ts" />)
    const empty = renderToStaticMarkup(<HighlightedCode code="const a = 1;" filePath="file.ts" changedRanges={[{ from: 6, to: 6 }]} />)
    expect(empty).toBe(normal)
    expect(normal).not.toContain('diff-inline-change')
  })

  it('keeps emoji together even outside string tokens', () => {
    const html = renderToStaticMarkup(<HighlightedCode code="😀 text" filePath="file.txt" changedRanges={[{ from: 0, to: 2 }]} />)
    expect(html).toContain('<span class="diff-inline-change">😀</span>')
    expect(html.replace(/<[^>]+>/g, '')).toBe('😀 text')
  })
})
