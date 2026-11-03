import { readFileSync, readdirSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import ts from 'typescript'
import { expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
function audit(source: string, file = 'fixture.tsx') {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const problems: string[] = []
  const declarations = new Map<string, ts.Expression>()
  const declaredTypes = new Map<string, ts.TypeNode>()
  const collect = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) declarations.set(node.name.text, node.initializer)
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node)) && ts.isIdentifier(node.name) && node.type) declaredTypes.set(node.name.text, node.type)
    ts.forEachChild(node, collect)
  }
  collect(ast)
  const hasTitle = (node: ts.Expression, seen = new Set<string>()): boolean => {
    if (ts.isIdentifier(node) && declarations.has(node.text) && !seen.has(node.text)) { seen.add(node.text); return hasTitle(declarations.get(node.text)!, seen) }
    if (ts.isObjectLiteralExpression(node)) return node.properties.some(prop => ts.isSpreadAssignment(prop) ? hasTitle(prop.expression, seen) : prop.name?.getText(ast).replace(/['"]/g, '') === 'title')
    return false
  }
  const isDomType = (type: ts.TypeNode | undefined) => Boolean(type && /\b(?:HTMLElement|HTML\w+Element|SVGElement|SVG\w+Element)\b/.test(type.getText(ast)))
  const isDomTarget = (node: ts.Expression, seen = new Set<string>()): boolean => {
    if (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)) return isDomTarget(node.expression, seen)
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) return isDomType(node.type) || isDomTarget(node.expression, seen)
    if (ts.isIdentifier(node) && !seen.has(node.text)) {
      seen.add(node.text)
      return isDomType(declaredTypes.get(node.text)) || Boolean(declarations.has(node.text) && isDomTarget(declarations.get(node.text)!, seen))
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const { expression: receiver, name } = node.expression
      return /^(?:createElement|createElementNS|getElementById|querySelector)$/.test(name.text)
        && (/^(?:document|window\.document)$/.test(receiver.getText(ast)) || isDomTarget(receiver, seen))
    }
    return false
  }
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'title') problems.push(`${file}: native hint`)
    if (ts.isJsxSpreadAttribute(node) && hasTitle(node.expression)) problems.push(`${file}: spread native hint`)
    if (ts.isCallExpression(node) && /(?:createElement|setAttribute)$/.test(node.expression.getText(ast))) {
      if (node.arguments.some(arg => ts.isStringLiteral(arg) && arg.text === 'title') || node.arguments.some(arg => hasTitle(arg))) problems.push(`${file}: imperative native hint`)
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment && ts.isPropertyAccessExpression(node.left) && node.left.name.text === 'title' && isDomTarget(node.left.expression)) problems.push(`${file}: assigned native hint`)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return problems
}
function paths(dir: string): string[] { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? paths(resolve(dir, entry.name)) : [resolve(dir, entry.name)]) }
it('detects native hints in actual JSX, spread and imperative DOM APIs', () => {
  expect(audit('<button title="copy"/>')).toHaveLength(1)
  expect(audit('const props = { title: "copy" }; const button = <button {...props}/>')).toHaveLength(1)
  expect(audit('button.setAttribute("title", value)')).toHaveLength(1)
  expect(audit('const button = document.createElement("button"); button.title = "Copy"')).toHaveLength(1)
  expect(audit('const button: HTMLButtonElement = getButton(); button.title = "Copy"')).toHaveLength(1)
  expect(audit('document.querySelector("button").title = "Copy"')).toHaveLength(1)
  expect(audit('(target as HTMLElement).title = "Copy"')).toHaveLength(1)
  expect(audit('next.title = commit.title; commit.title === query; document.title = "Branchline"')).toEqual([])
  expect(audit('const commit = {title:"subject"}; const x=<span>{commit.title}</span>; document.title="Branchline"; const icon=<svg><title>accessible</title></svg>')).toEqual([])
})
it('uses project Tooltip for every application hint', () => {
  const found = paths(root).filter(path => /\.tsx?$/.test(path) && !/\.test\.|[\\/]test[\\/]/.test(path)).flatMap(path => audit(readFileSync(path, 'utf8'), relative(root, path)))
  expect(found).toEqual([])
})
