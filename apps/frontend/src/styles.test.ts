import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

describe('light danger button styles', () => {
  it('keeps destructive buttons red when they also use the secondary-button class', () => {
    expect(styles).toContain('.theme-light .danger-button, .theme-light .secondary-button.danger { color: #ffffff; border-color: #ff7875; background: #ff7875;')
    expect(styles).toContain('.theme-light .danger-button:hover:not(:disabled), .theme-light .secondary-button.danger:hover:not(:disabled) { color: #ffffff; border-color: #ff4d4f; background: #ff4d4f; transform: translateY(-1px);')
  })

  it('gives secondary actions the same visible hover feedback in the dark theme', () => {
    expect(styles).toContain('.fetch-button:hover:not(:disabled), .secondary-button:hover:not(:disabled), .filter-button:hover:not(:disabled) { color: #e6f4ff; border-color: #4a6f91; background: #253848; transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0,0,0,.28); }')
    expect(styles).toContain('.primary-button:hover:not(:disabled) { border-color: #4096ff; background: #4096ff; transform: translateY(-1px); box-shadow: 0 8px 20px rgba(0,0,0,.28); }')
  })

  it('uses readable text for secondary actions in the light theme', () => {
    expect(styles).toContain('.theme-light .secondary-button { color: #1f1f1f; border-color: #d5dce5; background: #ffffff; }')
  })

  it('keeps filter controls blue on hover in the light theme', () => {
    expect(styles).toContain('.theme-light .filter-button:hover:not(:disabled) { color: #0958d9; border-color: #91caff; background: #f4f7fb; }')
  })
})
