import type { RepositoryFile } from '../../repository'

export type CommitTreeFile = RepositoryFile & { changed: boolean; changeIndex: number | null }
export function compareCommitTreeEntries(left: { kind: 'folder' | 'file'; name: string }, right: { kind: 'folder' | 'file'; name: string }) {
  if (left.kind !== right.kind) return left.kind === 'folder' ? -1 : 1
  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
}

export function visibleCommitTreeFiles(files: readonly CommitTreeFile[], changedOnly: boolean) {
  return changedOnly ? files.filter((file) => file.changed) : [...files]
}
const sourceExtensions = new Set('ts tsx js jsx mjs cjs mts cts vue svelte astro html htm css scss sass less rs go py pyw pyi java kt kts c h cc cpp cxx hpp hxx cs fs fsx vb csproj fsproj vbproj sln props targets swift m mm rb php phtml scala sc sh bash zsh fish ps1 psm1 psd1 bat cmd lua r R dart ex exs erl hrl clj cljs cljc edn elm hs lhs ml mli sql graphql gql proto cmake make mk json jsonc json5 yaml yml toml ini cfg conf config properties xml xaml gradle tf tfvars hcl nix dockerfile ipynb md mdx rst txt lock'.toLowerCase().split(' '))
const sourceNames = new Set(['dockerfile', 'containerfile', 'makefile', 'gnumakefile', 'cmakelists.txt', 'jenkinsfile', 'gemfile', 'rakefile', 'procfile', 'vagrantfile', 'justfile', 'go.mod', 'go.sum', '.gitignore', '.gitattributes', '.gitmodules', '.editorconfig', '.npmrc', '.nvmrc', '.prettierrc', '.eslintrc', '.babelrc', '.dockerignore', '.env'])
const normalizedPath = (path: string) => path.replace(/\\/g, '/')

function isSourcePath(path: string) {
  const name = path.split('/').pop()?.toLowerCase() ?? ''
  return sourceNames.has(name) || name.startsWith('.env.') || sourceExtensions.has(name.split('.').pop() ?? '')
}

export function buildCommitFileTree(paths: readonly string[], changes: readonly RepositoryFile[], includeAllPaths = false) {
  const changed = new Map(changes.map((file, changeIndex) => [normalizedPath(file.path), { file, changeIndex }]))
  // Deleted paths still belong in the review tree so their diffs stay reachable.
  const allPaths = new Set([...paths.map(normalizedPath), ...changed.keys()])
  const changedFolders = new Set<string>()
  const files: CommitTreeFile[] = [...allPaths].filter((path) => includeAllPaths || changed.has(path) || isSourcePath(path)).sort((left, right) => left.toLowerCase().localeCompare(right.toLowerCase())).map((path) => {
    const change = changed.get(path)
    if (change) {
      const segments = path.split('/').slice(0, -1)
      segments.forEach((_, index) => changedFolders.add(segments.slice(0, index + 1).join('/')))
    }
    return { ...(change?.file ?? { type: '', add: 0, del: 0 }), path, changed: Boolean(change), changeIndex: change?.changeIndex ?? null }
  })
  return { files, changedFolders: [...changedFolders].sort() }
}
