import { describe, expect, it } from 'vitest'
import {
  displayRepositoryPath,
  isRepositoryDescendant,
  repositoryCacheKey,
  sameRepositoryPath,
} from './repositoryPaths'

describe('displayRepositoryPath', () => {
  it('drops the Windows extended-length prefix', () => {
    expect(displayRepositoryPath('\\\\?\\E:\\FONE\\mono-web')).toBe('E:\\FONE\\mono-web')
  })

  it('restores the ordinary spelling of a UNC path', () => {
    expect(displayRepositoryPath('\\\\?\\UNC\\server\\share\\repo')).toBe('\\\\server\\share\\repo')
  })

  it('leaves an ordinary path untouched', () => {
    expect(displayRepositoryPath('  E:\\FONE\\mono-web  ')).toBe('E:\\FONE\\mono-web')
  })
})

describe('repositoryCacheKey', () => {
  it('normalizes separators, casing and trailing slashes', () => {
    expect(repositoryCacheKey('E:\\FONE\\Mono-Web\\')).toBe('e:/fone/mono-web')
    expect(repositoryCacheKey('E:/FONE/mono-web//')).toBe('e:/fone/mono-web')
  })

  it('matches an extended-length path against the plain spelling', () => {
    expect(repositoryCacheKey('\\\\?\\E:\\FONE\\mono-web')).toBe('e:/fone/mono-web')
  })
})

describe('sameRepositoryPath', () => {
  it('matches the same repository written in different styles', () => {
    expect(sameRepositoryPath('E:\\FONE\\mono-web', 'e:/fone/mono-web/')).toBe(true)
  })

  it('rejects different repositories and missing paths', () => {
    expect(sameRepositoryPath('E:\\FONE\\mono-web', 'E:\\FONE\\mono-api')).toBe(false)
    expect(sameRepositoryPath(null, 'E:\\FONE\\mono-web')).toBe(false)
    expect(sameRepositoryPath('E:\\FONE\\mono-web', undefined)).toBe(false)
  })
})

describe('isRepositoryDescendant', () => {
  it('detects a submodule nested inside its superproject', () => {
    expect(isRepositoryDescendant('E:\\FONE\\mono-web\\packages\\ui', 'E:/FONE/mono-web')).toBe(true)
  })

  it('treats the repository itself as no descendant', () => {
    expect(isRepositoryDescendant('E:\\FONE\\mono-web', 'E:\\FONE\\mono-web')).toBe(false)
  })

  it('does not match sibling directories sharing a prefix', () => {
    expect(isRepositoryDescendant('E:\\FONE\\mono-web-legacy', 'E:\\FONE\\mono-web')).toBe(false)
  })
})
