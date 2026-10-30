import { describe, expect, it } from 'vitest'
import { conflictLanguageForPath } from './conflictLanguage'

describe('conflict editor language detection', () => {
  it.each([
    ['src/app.py', 'python'],
    ['cmd/server.go', 'go'],
    ['src/Main.java', 'java'],
    ['src/Program.cs', 'csharp'],
    ['native/module.cpp', 'cpp'],
    ['web/index.php', 'php'],
    ['db/schema.sql', 'sql'],
    ['config/app.yaml', 'yaml'],
    ['scripts/build.sh', 'shell'],
    ['src/App.tsx', 'typescript'],
    ['README.md', 'markdown'],
    ['assets/logo.png', 'plain'],
  ])('maps %s to %s', (path, language) => {
    expect(conflictLanguageForPath(path)).toBe(language)
  })
})
