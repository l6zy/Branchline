import { describe, expect, it } from 'vitest'
import { GRAPH_COLORS } from './commitGraphLayout'

describe('commit graph lane palette', () => {
  it('provides twelve unique colors in the shared palette order', () => {
    expect(GRAPH_COLORS).toEqual([
      '#36cfc9', '#9254de', '#fa8c16', '#52c41a', '#f759ab', '#597ef7',
      '#13c2c2', '#eb2f96', '#d4b106', '#389e0d', '#2f54eb', '#cf1322',
    ])
    expect(new Set(GRAPH_COLORS).size).toBe(12)
  })
})
