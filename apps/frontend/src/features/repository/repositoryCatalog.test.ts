import { describe, expect, it } from 'vitest'
import { addRecentRepository, parseRecentRepositories, removeRepositoryRecord, repositoryCatalog, toggleFavoriteRepository } from './repositoryCatalog'

const first = { name: 'App', path: 'E:\\code\\App', branch: 'main', openedAt: 10 }
const other = { name: 'Tools', path: 'E:\\code\\Tools', branch: 'dev', openedAt: 5 }

describe('repository catalog', () => {
  it('rejects malformed saved entries before they reach path and date rendering', () => {
    expect(parseRecentRepositories({ path: 'invalid' })).toEqual([])
    expect(parseRecentRepositories([null, {}, { ...first, path: 1 }, { ...first, openedAt: 1e20 }, { ...first, openedAt: 'yesterday' }, first])).toEqual([first])
  })
  it('updates a recent entry without duplicating Windows path aliases', () => {
    const next = addRecentRepository([first, other], { ...first, path: 'e:/code/app/', branch: 'feature' }, 20)
    expect(next).toHaveLength(2)
    expect(next[0]).toMatchObject({ branch: 'feature', openedAt: 20 })
    expect(next[1]).toEqual(other)
  })

  it('keeps favorites whose recent entries were evicted and merges current metadata', () => {
    const entries = repositoryCatalog([first], [{ name: 'Old Tools', path: other.path }], { ...first, branch: 'live' })
    expect(entries).toHaveLength(2)
    expect(entries.find((item) => item.name === 'App')).toMatchObject({ branch: 'live', current: true })
    expect(entries.find((item) => item.path === other.path)).toMatchObject({ favorite: true })
  })

  it('toggles favorites using normalized paths', () => {
    const favorites = toggleFavoriteRepository([], first)
    expect(favorites).toEqual([{ name: first.name, path: first.path }])
    expect(toggleFavoriteRepository(favorites, { ...first, path: 'e:/code/app/' })).toEqual([])
  })

  it('removes all saved references without changing another repository', () => {
    expect(removeRepositoryRecord([first, other], [{ name: first.name, path: 'e:/code/app/' }], first.path))
      .toEqual({ recent: [other], favorites: [] })
  })
})
