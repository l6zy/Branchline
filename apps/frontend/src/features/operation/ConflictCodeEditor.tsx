import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Search, Save, X } from 'lucide-react'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { rust } from '@codemirror/lang-rust'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState, StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, keymap, lineNumbers, WidgetType, type DecorationSet } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { Button } from '../../components/Button'

export type ConflictBlockRange = {
  index: number
  offset: number
  currentEnd: number
  separatorStart: number
  separatorEnd: number
  incomingEnd: number
  endOffset: number
}

type ResolutionStrategy = 'current' | 'incoming' | 'both'

type ConflictCodeEditorProps = {
  value: string
  filePath: string
  blocks: ConflictBlockRange[]
  activeBlock: number
  resolvedRanges?: Array<{ from: number; to: number }>
  disabled?: boolean
  onChange: (value: string) => void
  onResolveBlock: (index: number, strategy: ResolutionStrategy) => void
  onSave: () => void
  saveLabel: string
}

type SearchMatch = { from: number; to: number }

export type ConflictCodeEditorHandle = {
  focusBlock: (from: number, to: number) => void
}

type ConflictDecorationPayload = {
  blocks: ConflictBlockRange[]
  activeBlock: number
  resolvedRanges: Array<{ from: number; to: number }>
  disabled: boolean
  onResolve: (index: number, strategy: ResolutionStrategy) => void
  searchMatches: SearchMatch[]
  activeSearchMatch: number
}

const setConflictDecorations = StateEffect.define<ConflictDecorationPayload>()

class ConflictActionsWidget extends WidgetType {
  constructor(
    private readonly index: number,
    private readonly active: boolean,
    private readonly disabled: boolean,
    private readonly onResolve: (index: number, strategy: ResolutionStrategy) => void,
  ) { super() }

  eq(other: ConflictActionsWidget) {
    return this.index === other.index && this.active === other.active && this.disabled === other.disabled
  }

  toDOM() {
    const root = document.createElement('div')
    root.className = `cm-conflict-actions${this.active ? ' active' : ''}`
    const actions: Array<[ResolutionStrategy, string]> = [
      ['current', '采用当前更改'],
      ['incoming', '采用传入的更改'],
      ['both', '保留双方更改'],
    ]
    for (const [strategy, label] of actions) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'button button-secondary'
      button.disabled = this.disabled
      button.textContent = label
      button.addEventListener('mousedown', (event) => event.preventDefault())
      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        this.onResolve(this.index, strategy)
      })
      root.append(button)
    }
    return root
  }

  ignoreEvent() {
    return false
  }
}

function conflictDecorations(doc: EditorState['doc'], payload: ConflictDecorationPayload): DecorationSet {
  const ranges = payload.blocks.flatMap((block) => {
    const from = Math.max(0, Math.min(block.offset, doc.length))
    const to = Math.max(from, Math.min(block.endOffset, doc.length))
    const separatorStart = Math.max(from, Math.min(block.separatorStart, to))
    const separatorEnd = Math.max(separatorStart, Math.min(block.separatorEnd, to))
    const active = block.index === payload.activeBlock
    const lineRanges = (start: number, end: number, className: string) => {
      if (end <= start) return []
      const first = doc.lineAt(start).number
      const last = doc.lineAt(Math.max(start, end - 1)).number
      return Array.from({ length: last - first + 1 }, (_, index) => Decoration.line({ class: className }).range(doc.line(first + index).from))
    }
    return [
      Decoration.widget({ widget: new ConflictActionsWidget(block.index, active, payload.disabled, payload.onResolve), block: true, side: -1 }).range(from),
      ...lineRanges(from, separatorStart, `cm-conflict-current${active ? ' cm-conflict-active' : ''}`),
      ...lineRanges(separatorStart, separatorEnd, 'cm-conflict-separator'),
      ...lineRanges(separatorEnd, to, `cm-conflict-incoming${active ? ' cm-conflict-active' : ''}`),
      Decoration.line({ class: `cm-conflict-marker cm-conflict-marker-current${active ? ' cm-conflict-active' : ''}` }).range(doc.lineAt(from).from),
      Decoration.line({ class: `cm-conflict-marker cm-conflict-marker-incoming${active ? ' cm-conflict-active' : ''}` }).range(doc.lineAt(Math.max(from, Math.min(block.incomingEnd, to))).from),
    ]
  })
  const resolvedDecorations = payload.resolvedRanges.flatMap((range) => {
    const from = Math.max(0, Math.min(range.from, doc.length))
    const to = Math.max(from, Math.min(range.to, doc.length))
    const first = doc.lineAt(from).number
    const last = doc.lineAt(Math.max(from, to - 1)).number
    return Array.from({ length: last - first + 1 }, (_, index) => Decoration.line({ class: 'cm-conflict-resolved' }).range(doc.line(first + index).from))
  })
  const searchDecorations = payload.searchMatches.map((match, index) => Decoration.mark({ class: index === payload.activeSearchMatch ? 'cm-search-match-current' : 'cm-search-match' }).range(
    Math.max(0, Math.min(match.from, doc.length)),
    Math.max(0, Math.min(match.to, doc.length)),
  ))
  return Decoration.set([...ranges, ...resolvedDecorations, ...searchDecorations], true)
}

const conflictDecorationField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    const update = transaction.effects.find((effect) => effect.is(setConflictDecorations))
    return update ? conflictDecorations(transaction.state.doc, update.value) : value.map(transaction.changes)
  },
  provide: (field) => EditorView.decorations.from(field),
})

const conflictEditorTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--text)' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-code)', fontSize: '12px', lineHeight: '1.55', tabSize: '4' },
  '.cm-content': { minHeight: '100%', padding: '10px 0 26px', caretColor: 'var(--text)' },
  '.cm-line': { padding: '0 12px' },
  '.cm-gutters': { minHeight: '100%', border: '0', color: 'var(--faint)', backgroundColor: 'color-mix(in srgb, var(--panel-2) 86%, transparent)' },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '32px', padding: '0 8px 0 6px' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--accent) 8%, transparent)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--accent) 34%, transparent) !important' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text)' },
  '.cm-conflict-current': { backgroundColor: 'color-mix(in srgb, #40c8ae 20%, transparent)' },
  '.cm-conflict-incoming': { backgroundColor: 'color-mix(in srgb, #40a6ff 20%, transparent)' },
  '.cm-conflict-separator': { backgroundColor: 'transparent' },
  '.cm-conflict-marker-current': { backgroundColor: 'color-mix(in srgb, #40c8ae 50%, transparent)' },
  '.cm-conflict-marker-incoming': { backgroundColor: 'color-mix(in srgb, #40a6ff 50%, transparent)' },
  '.cm-conflict-resolved': { backgroundColor: 'color-mix(in srgb, var(--success) 18%, transparent)', boxShadow: 'inset 3px 0 var(--success)' },
  '.cm-search-match': { backgroundColor: 'color-mix(in srgb, #fadb14 28%, transparent)', borderBottom: '1px solid color-mix(in srgb, #fadb14 75%, transparent)' },
  '.cm-search-match-current': { backgroundColor: 'color-mix(in srgb, #fa8c16 52%, transparent)', boxShadow: '0 0 0 1px #fa8c16' },
})

const conflictHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: 'var(--syntax-comment)', fontStyle: 'italic' },
  { tag: tags.keyword, color: 'var(--syntax-keyword)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--syntax-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--syntax-number)' },
  { tag: [tags.typeName, tags.className, tags.definition(tags.typeName)], color: 'var(--syntax-type)' },
  { tag: [tags.operatorKeyword, tags.operator], color: 'var(--text)' },
  { tag: [tags.punctuation, tags.bracket], color: 'var(--muted)' },
])

function languageForPath(path: string) {
  const extension = path.toLowerCase().split('.').pop() ?? ''
  if (['ts', 'tsx'].includes(extension)) return javascript({ jsx: extension === 'tsx', typescript: true })
  if (['js', 'jsx', 'mjs', 'cjs'].includes(extension)) return javascript({ jsx: ['jsx'].includes(extension) })
  if (extension === 'rs') return rust()
  if (['css', 'scss', 'less'].includes(extension)) return css()
  if (['json', 'jsonc'].includes(extension)) return json()
  if (['md', 'mdx'].includes(extension)) return markdown()
  if (['html', 'htm', 'vue', 'svelte'].includes(extension)) return html()
  return []
}

export const ConflictCodeEditor = forwardRef<ConflictCodeEditorHandle, ConflictCodeEditorProps>(function ConflictCodeEditor({ value, filePath, blocks, activeBlock, resolvedRanges = [], disabled = false, onChange, onResolveBlock, onSave, saveLabel }, ref) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onResolveRef = useRef(onResolveBlock)
  const languageCompartment = useRef(new Compartment())
  const editableCompartment = useRef(new Compartment())
  const previousResolvedRanges = useRef<Array<{ from: number; to: number }> | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearchMatch, setActiveSearchMatch] = useState(0)
  onChangeRef.current = onChange
  onResolveRef.current = onResolveBlock

  useImperativeHandle(ref, () => ({
    focusBlock(from, to) {
      const view = viewRef.current
      if (!view) return
      const start = Math.max(0, Math.min(from, view.state.doc.length))
      void to
      view.dispatch({ effects: EditorView.scrollIntoView(start, { y: 'start', yMargin: 52 }) })
    },
  }), [])

  useEffect(() => {
    if (!hostRef.current) return
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          conflictEditorTheme,
          syntaxHighlighting(conflictHighlightStyle, { fallback: true }),
          conflictDecorationField,
          languageCompartment.current.of(languageForPath(filePath)),
          editableCompartment.current.of(EditorView.editable.of(!disabled)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          }),
        ],
      }),
      parent: hostRef.current,
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    let from = 0
    while (from < current.length && from < value.length && current[from] === value[from]) from += 1
    let currentTo = current.length
    let valueTo = value.length
    while (currentTo > from && valueTo > from && current[currentTo - 1] === value[valueTo - 1]) {
      currentTo -= 1
      valueTo -= 1
    }
    view.dispatch({ changes: { from, to: currentTo, insert: value.slice(from, valueTo) } })
  }, [value])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: languageCompartment.current.reconfigure(languageForPath(filePath)) })
  }, [filePath])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: editableCompartment.current.reconfigure(EditorView.editable.of(!disabled)) })
  }, [disabled])

  const searchMatches = useMemo<SearchMatch[]>(() => {
    const query = searchQuery
    if (!query) return []
    const matches: SearchMatch[] = []
    let from = 0
    while (from <= value.length - query.length) {
      const index = value.indexOf(query, from)
      if (index < 0) break
      matches.push({ from: index, to: index + query.length })
      from = index + Math.max(1, query.length)
    }
    return matches
  }, [searchQuery, value])

  useEffect(() => {
    setActiveSearchMatch((current) => searchMatches.length ? Math.min(current, searchMatches.length - 1) : 0)
  }, [searchMatches.length])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'f') return
      const view = viewRef.current
      if (!view || (!view.hasFocus && !hostRef.current?.contains(document.activeElement))) return
      event.preventDefault()
      setSearchOpen(true)
      requestAnimationFrame(() => searchInputRef.current?.focus())
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const shouldScrollToResolved = previousResolvedRanges.current !== resolvedRanges && resolvedRanges.length > 0
    previousResolvedRanges.current = resolvedRanges
    const decorationEffect = setConflictDecorations.of({ blocks, activeBlock, resolvedRanges, disabled, searchMatches, activeSearchMatch, onResolve: (index, strategy) => onResolveRef.current(index, strategy) })
    view.dispatch({ effects: shouldScrollToResolved
      ? [decorationEffect, EditorView.scrollIntoView(Math.min(resolvedRanges[resolvedRanges.length - 1].from, view.state.doc.length), { y: 'nearest', yMargin: 52 })]
      : decorationEffect })
  }, [activeBlock, blocks, disabled, resolvedRanges, searchMatches, activeSearchMatch])

  const jumpSearch = (direction: -1 | 1) => {
    if (!searchMatches.length) return
    const next = (activeSearchMatch + direction + searchMatches.length) % searchMatches.length
    setActiveSearchMatch(next)
    const match = searchMatches[next]
    viewRef.current?.dispatch({ selection: { anchor: match.from, head: match.to }, effects: EditorView.scrollIntoView(match.from, { y: 'center', yMargin: 52 }) })
  }
  const updateSearchQuery = (query: string) => {
    setSearchQuery(query)
    setActiveSearchMatch(0)
  }

  const documentLines = Math.max(1, value.split('\n').length)
  const overviewStyle = (start: number, end: number) => ({
    top: `${(value.slice(0, Math.max(0, start)).split('\n').length - 1) / documentLines * 100}%`,
    height: `${Math.max(.8, ((value.slice(Math.max(0, start), Math.max(start, end)).split('\n').length - 1) / documentLines) * 100)}%`,
  })
  const jumpFromOverview = (clientY: number, element: HTMLDivElement) => {
    const view = viewRef.current
    if (!view) return
    const bounds = element.getBoundingClientRect()
    const percent = Math.max(0, Math.min(1, (clientY - bounds.top) / Math.max(1, bounds.height)))
    const line = Math.max(1, Math.min(view.state.doc.lines, Math.round(percent * (view.state.doc.lines - 1)) + 1))
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(line).from, { y: 'start', yMargin: 52 }) })
  }
  const beginOverviewDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    jumpFromOverview(event.clientY, event.currentTarget)
  }
  const moveOverviewDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    jumpFromOverview(event.clientY, event.currentTarget)
  }
  const endOverviewDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return <div className="conflict-code-editor">
    <div className="conflict-code-editor-host" ref={hostRef}/>
    {searchOpen && <div className="conflict-search-bar" role="search"><Search size={14}/><input ref={searchInputRef} value={searchQuery} onChange={(event) => updateSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); jumpSearch(event.shiftKey ? -1 : 1) } if (event.key === 'Escape') { event.preventDefault(); setSearchOpen(false) } }} placeholder="搜索当前文件" aria-label="搜索当前冲突文件"/><span className="conflict-search-count">{searchQuery ? (searchMatches.length ? `${activeSearchMatch + 1} / ${searchMatches.length}` : '无匹配') : '输入关键词'}</span><button type="button" onClick={() => jumpSearch(-1)} disabled={!searchMatches.length} title="上一个匹配"><ChevronUp size={14}/></button><button type="button" onClick={() => jumpSearch(1)} disabled={!searchMatches.length} title="下一个匹配"><ChevronDown size={14}/></button><button type="button" onClick={() => { setSearchOpen(false); setSearchQuery('') }} title="关闭搜索" aria-label="关闭搜索"><X size={14}/></button></div>}
    {!searchOpen && <button type="button" className="conflict-search-trigger" onClick={() => { setSearchOpen(true); requestAnimationFrame(() => searchInputRef.current?.focus()) }} title="搜索当前文件（Ctrl/Cmd+F）" aria-label="搜索当前文件"><Search size={15}/></button>}
    <div className="conflict-overview" onPointerDown={beginOverviewDrag} onPointerMove={moveOverviewDrag} onPointerUp={endOverviewDrag} onPointerCancel={endOverviewDrag} title="点击或拖拽跳转到对应位置">
      {blocks.map((block) => <span className={`current${block.index === activeBlock ? ' active' : ''}`} key={`current-${block.index}`} style={overviewStyle(block.offset, block.currentEnd)}/>)}
      {blocks.map((block) => <span className={`incoming${block.index === activeBlock ? ' active' : ''}`} key={`incoming-${block.index}`} style={overviewStyle(block.separatorEnd, block.endOffset)}/>)}
    </div>
    <Button variant="primary" className="conflict-save-floating" type="button" onClick={onSave} disabled={disabled} title="保存合并结果"><Save size={14}/>{saveLabel}</Button>
  </div>
})
