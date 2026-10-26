import { useEffect, useRef, useState } from 'react'
import { CloudDownload, FolderGit2, FolderOpen, Plus, RefreshCw, X } from 'lucide-react'
import { Button } from '../../components/Button'
import { createRepository, pickRepositoryDirectory, type RepositoryDetails } from '../../repository'

export function AddRepositoryDialog({ mode, initialParent, onClose, onCreated }: {
  mode: 'clone' | 'init'
  initialParent: string
  onClose: () => void
  onCreated: (repository: RepositoryDetails) => void
}) {
  const [source, setSource] = useState('')
  const [parent, setParent] = useState(initialParent)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLElement>(null)
  const destination = parent ? `${parent.replace(/[\\/]+$/, '')}${parent.includes('\\') ? '\\' : '/'}${name}` : ''
  const validName = Boolean(name.trim()) && !/^[.]+$|[<>:"/\\|?*\x00-\x1f]|[. ]$/.test(name)
  const canSubmit = validName && Boolean(parent.trim()) && (mode !== 'clone' || Boolean(source.trim()))
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector('input')?.focus()
    return () => { if (previousFocus?.isConnected) previousFocus.focus() }
  }, [])
  useEffect(() => {
    if (!busy && !dialogRef.current?.contains(document.activeElement)) dialogRef.current?.querySelector('input')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (!busy) onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [busy, onClose])

  const browse = async () => {
    try {
      const path = await pickRepositoryDirectory('选择仓库的父目录')
      if (path) setParent(path)
    } catch (error) { setError(String(error)) }
  }
  const submit = async () => {
    if (!canSubmit || busy) return
    setBusy(true)
    setError('')
    try { onCreated(await createRepository(destination, mode === 'clone' ? source.trim() : null)) }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); setBusy(false) }
  }

  return <div className="modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section ref={dialogRef} className="branch-dialog repository-add-dialog" role="dialog" aria-modal="true" aria-labelledby="repository-add-title" onKeyDown={(event) => {
      if (event.key === 'Tab') {
        const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled)') ?? [])
        const target = event.shiftKey ? items[items.length - 1] : items[0]
        if (document.activeElement === (event.shiftKey ? items[0] : items[items.length - 1])) { event.preventDefault(); target?.focus() }
      }
    }}>
      <div className="branch-dialog-heading"><span className="branch-dialog-icon"><FolderGit2 size={19}/></span><div><h2 id="repository-add-title">{mode === 'clone' ? '克隆仓库' : '初始化仓库'}</h2><p>{mode === 'clone' ? '克隆远程仓库，或复制已有本地仓库。' : '创建一个新的本地 Git 仓库。'}</p></div><Button variant="icon" title="关闭" disabled={busy} onClick={onClose}><X size={17}/></Button></div>
      <form onSubmit={(event) => { event.preventDefault(); void submit() }}>
        {mode === 'clone' && <label>仓库地址<input value={source} onChange={(event) => setSource(event.target.value)} onBlur={() => {
          if (!name) setName(source.trim().replace(/[\\/]+$/, '').split(/[/:\\]/).pop()?.replace(/\.git$/, '') ?? '')
        }} placeholder="https://… / git@… / 本地仓库路径" spellCheck={false} disabled={busy}/></label>}
        <label>父目录<span className="repository-directory-input"><input value={parent} onChange={(event) => setParent(event.target.value)} placeholder="选择或输入父目录" disabled={busy}/><Button type="button" variant="secondary" onClick={() => void browse()} disabled={busy} title="选择父目录"><FolderOpen size={15}/></Button></span></label>
        <label>仓库文件夹名称<input value={name} onChange={(event) => setName(event.target.value)} placeholder="my-project" spellCheck={false} disabled={busy}/></label>
        <div className="repository-destination"><span>将保存到</span><code>{destination || '请选择父目录并填写名称'}</code><small>目标文件夹须为新目录或空目录。</small></div>
        {error && <p className="repository-inline-error" role="alert">{error}</p>}
        <div className="branch-dialog-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>取消</Button><Button type="submit" variant="primary" disabled={!canSubmit || busy}>{busy ? <RefreshCw size={14} className="spin"/> : mode === 'clone' ? <CloudDownload size={14}/> : <Plus size={14}/>}<span>{busy ? (mode === 'clone' ? '正在克隆…' : '正在创建…') : mode === 'clone' ? '克隆仓库' : '创建仓库'}</span></Button></div>
      </form>
    </section>
  </div>
}
