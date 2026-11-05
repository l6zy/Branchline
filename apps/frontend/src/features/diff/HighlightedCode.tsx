import { memo, useMemo, type ReactNode } from 'react'
import type { InlineDiffRange } from './inlineDiff'

type Token = { value: string; kind?: string }

const languageKeywords: Record<string, Set<string>> = {
  javascript: new Set(['async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'delete', 'do', 'else', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'null', 'of', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'undefined', 'var', 'void', 'while', 'yield']),
  typescript: new Set(['abstract', 'any', 'as', 'asserts', 'async', 'await', 'boolean', 'break', 'case', 'catch', 'class', 'const', 'continue', 'declare', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'if', 'implements', 'import', 'in', 'infer', 'instanceof', 'interface', 'keyof', 'let', 'module', 'namespace', 'never', 'new', 'null', 'number', 'object', 'of', 'private', 'protected', 'public', 'readonly', 'return', 'satisfies', 'static', 'string', 'super', 'switch', 'symbol', 'this', 'throw', 'true', 'try', 'type', 'typeof', 'undefined', 'unknown', 'var', 'void', 'while', 'yield']),
  rust: new Set(['as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn', 'else', 'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self', 'static', 'struct', 'super', 'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while']),
  shell: new Set(['case', 'do', 'done', 'elif', 'else', 'esac', 'export', 'fi', 'for', 'function', 'if', 'in', 'local', 'then', 'while']),
  css: new Set(['important', 'inherit', 'initial', 'none', 'relative', 'absolute', 'fixed', 'sticky', 'flex', 'grid', 'block', 'inline', 'transparent']),
}

function languageForPath(path: string) {
  const extension = path.toLowerCase().split('.').pop() ?? ''
  if (['ts', 'tsx'].includes(extension)) return 'typescript'
  if (['js', 'jsx', 'mjs', 'cjs'].includes(extension)) return 'javascript'
  if (extension === 'rs') return 'rust'
  if (['sh', 'bash', 'zsh', 'ps1'].includes(extension)) return 'shell'
  if (['css', 'scss', 'less'].includes(extension)) return 'css'
  if (['json', 'jsonc'].includes(extension)) return 'json'
  if (['md', 'mdx'].includes(extension)) return 'markdown'
  if (['yaml', 'yml', 'toml'].includes(extension)) return 'config'
  if (['html', 'htm', 'vue', 'svelte'].includes(extension)) return 'markup'
  return 'plain'
}

function tokenize(code: string, language: string): Token[] {
  const tokens: Token[] = []
  const keywords = languageKeywords[language] ?? languageKeywords.javascript
  let index = 0
  const push = (value: string, kind?: string) => tokens.push({ value, kind })

  while (index < code.length) {
    const rest = code.slice(index)
    const isHashComment = ['shell', 'config'].includes(language)
    if (rest.startsWith('//') || rest.startsWith('/*') || (isHashComment && rest.startsWith('#'))) {
      push(rest, 'comment')
      break
    }
    const quote = code[index]
    if (quote === '"' || quote === "'" || quote === '`') {
      let end = index + 1
      while (end < code.length) {
        if (code[end] === '\\') end += 2
        else if (code[end] === quote) { end += 1; break }
        else end += 1
      }
      push(code.slice(index, end), 'string')
      index = end
      continue
    }
    const number = rest.match(/^(?:0x[\da-f]+|\d+(?:\.\d+)?)/i)
    if (number) {
      push(number[0], 'number')
      index += number[0].length
      continue
    }
    const word = rest.match(/^[A-Za-z_$][\w$-]*/)
    if (word) {
      const value = word[0]
      push(value, keywords.has(value) ? 'keyword' : /^[A-Z]/.test(value) ? 'type' : undefined)
      index += value.length
      continue
    }
    const operator = rest.match(/^(?:=>|===|!==|==|!=|<=|>=|&&|\|\||\?\?|\+\+|--|::|->|\.\.|[+\-*/%=<>!&|?:]+)/)
    if (operator) {
      push(operator[0], 'operator')
      index += operator[0].length
      continue
    }
    const character = String.fromCodePoint(code.codePointAt(index)!)
    if ('{}[](),.;'.includes(character)) push(character, 'punctuation')
    else push(character)
    index += character.length
  }
  return tokens
}

export const HighlightedCode = memo(function HighlightedCode({ code, filePath, changedRanges }: { code: string; filePath: string; changedRanges?: readonly InlineDiffRange[] }) {
  const language = languageForPath(filePath)
  const tokens = useMemo(() => tokenize(code || ' ', language), [code, language])
  let offset = 0
  let rangeIndex = 0
  return <code className={`syntax syntax-${language}`}>{tokens.map((token, index) => {
    const start = offset
    offset += token.value.length
    let content: ReactNode = token.value
    if (changedRanges?.length) {
      const parts: ReactNode[] = []
      let cursor = start
      while (rangeIndex < changedRanges.length && changedRanges[rangeIndex].to <= start) rangeIndex += 1
      for (let next = rangeIndex; next < changedRanges.length && changedRanges[next].from < offset; next += 1) {
        const from = Math.max(cursor, changedRanges[next].from)
        const to = Math.min(offset, changedRanges[next].to)
        if (from >= to) continue
        if (from > cursor) parts.push(token.value.slice(cursor - start, from - start))
        parts.push(<span className="diff-inline-change" key={next}>{token.value.slice(from - start, to - start)}</span>)
        cursor = to
      }
      if (parts.length) {
        if (cursor < offset) parts.push(token.value.slice(cursor - start))
        content = parts
      }
    }
    return <span className={token.kind ? `token ${token.kind}` : undefined} key={index}>{content}</span>
  })}</code>
})
