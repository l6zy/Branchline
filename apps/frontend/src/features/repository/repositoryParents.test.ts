import { describe, expect, it } from 'vitest'
import { repositoryParentFromSnapshot } from './repositoryParents'

describe('repositoryParentFromSnapshot', () => {
  it('creates a return target from a submodule superproject path', () => {
    expect(repositoryParentFromSnapshot({ superprojectPath: 'E:\\FONE\\mono-web' })).toEqual({
      name: 'mono-web',
      path: 'E:\\FONE\\mono-web',
      branch: '',
    })
  })

  it('returns no target for a top-level repository', () => {
    expect(repositoryParentFromSnapshot({})).toBeNull()
  })
})
