import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
const tokens = readFileSync(new URL('./styles/tokens.css', import.meta.url), 'utf8')
const components = readFileSync(new URL('./styles/components.css', import.meta.url), 'utf8')
const themeOverrides = readFileSync(new URL('./styles/theme-overrides.css', import.meta.url), 'utf8')

describe('semantic style architecture', () => {
  it('loads styles through explicit cascade layers', () => {
    expect(styles).toContain('@layer tokens, base, layout, components, features, theme-overrides;')
    expect(styles).toContain("@import './styles/tokens.css' layer(tokens);")
    expect(styles).toContain("@import './styles/theme-overrides.css' layer(theme-overrides);")
  })

  it('defines theme-independent semantic tokens for controls and surfaces', () => {
    expect(tokens).toContain('--surface-control:')
    expect(tokens).toContain('--surface-hover:')
    expect(tokens).toContain('--text-on-accent:')
    expect(tokens).toContain('--danger-solid:')
    expect(tokens).toContain('--danger-hover:')
  })

  it('keeps shared button behavior in the owning component layer', () => {
    expect(components).toContain('.button-secondary, .button-primary, .button-danger')
    expect(components).toContain('.button-icon {')
    expect(components).toContain('color: var(--text-secondary);')
    expect(components).toContain('background: var(--surface-control);')
    expect(components).toContain('background: var(--danger-solid);')
    expect(components).toContain('background: var(--danger-hover);')
  })

  it('does not duplicate common controls in the light-theme exception layer', () => {
    expect(themeOverrides).not.toContain('.theme-light .button-secondary')
    expect(themeOverrides).not.toContain('.theme-light .button-danger')
    expect(themeOverrides).not.toContain('.theme-light .fetch-button')
  })
})
