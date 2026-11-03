import { readFileSync, readdirSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const han = /[\u4e00-\u9fff]/
const allowed = [
  { path: 'components/LanguageSelect.tsx', text: '简体中文', reason: 'Native language name stays recognizable in either locale' },
  { path: 'App.tsx', text: '刚刚', reason: 'Compatibility parser for legacy timestamps, never displayed as application text' },
  { path: 'App.tsx', text: '/(\\d+)\\s*分钟前/', reason: 'Legacy timestamp parser' },
  { path: 'App.tsx', text: '/今天\\s*(\\d{1,2}):(\\d{2})/', reason: 'Legacy timestamp parser' },
  { path: 'App.tsx', text: '/昨天\\s*(\\d{1,2}):(\\d{2})/', reason: 'Legacy timestamp parser' },
  { path: 'App.tsx', text: '/(\\d{1,2})月(\\d{1,2})日/', reason: 'Legacy timestamp parser' },
]
function candidates(source: string, file: string) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const result: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node) || node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      const text = ts.isStringLiteralLike(node) ? node.text : node.getText(ast)
      if (han.test(text) && !allowed.some(item => item.path === file && item.text === text)) result.push(`${file}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}: ${text}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return result
}
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(resolve(directory, item.name)) : [resolve(directory, item.name)])
}
describe('application text source audit', () => {
  it('detects untranslated JSX, attributes, strings and interpolation fragments', () => {
    expect(candidates('const x = "错误"; const ui = <button title="复制">确认</button>; const y = `读取${x}失败`', 'fixture.tsx').length).toBe(5)
  })
  it('keeps application Chinese in bundled resources with narrow documented exceptions', () => {
    const result = files(root).filter(file => /\.tsx?$/.test(file) && !/\.test\.|[\\/]i18n[\\/]|[\\/]test[\\/]/.test(file)).flatMap(file => candidates(readFileSync(file, 'utf8'), relative(root, file).replace(/\\/g, '/')))
    expect(result).toEqual([])
  })
  it('keeps Rust production application text out of native diagnostics', () => {
    for (const name of ['git.rs', 'repository_management.rs', 'commands.rs', 'errors.rs']) {
      const source = readFileSync(resolve(root, '../../desktop/src', name), 'utf8').split('#[cfg(test)]')[0]
      const quoted = source.match(/"(?:[^"\\]|\\.)*"/g) ?? []
      expect(quoted.filter(text => han.test(text)), name).toEqual([])
    }
  })
})
