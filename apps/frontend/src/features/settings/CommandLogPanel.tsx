import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronDown, Clipboard, RefreshCw, TerminalSquare, Trash2, X } from 'lucide-react'
import { clearCommandLogs, loadCommandLogs, type CommandLogEntry } from '../../repository'
import { Button } from '../../components/Button'

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function output(entry: CommandLogEntry) {
  return [entry.stdout && `stdout\n${entry.stdout}`, entry.stderr && `stderr\n${entry.stderr}`].filter(Boolean).join('\n\n') || '命令没有输出'
}

export function CommandLogPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [entries, setEntries] = useState<CommandLogEntry[]>([])
  const [expanded, setExpanded] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [failedOnly, setFailedOnly] = useState(false)
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setEntries((await loadCommandLogs()).slice().reverse())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void refresh()
    const timer = window.setInterval(() => void refresh(), 1500)
    return () => window.clearInterval(timer)
  }, [open, refresh])

  if (!open) return null
  const visibleEntries = failedOnly ? entries.filter((entry) => !entry.success) : entries
  const clear = async () => {
    await clearCommandLogs()
    setEntries([])
    setExpanded(null)
  }
  return <div className="command-log-backdrop" onPointerDown={onClose}>
    <section className="command-log-panel" role="dialog" aria-modal="true" aria-label="执行命令日志" onPointerDown={(event) => event.stopPropagation()}>
      <header className="command-log-heading"><span className="command-log-icon"><TerminalSquare size={18}/></span><div><h2>执行命令日志</h2><p>仅保留当前应用会话，提交内容和身份参数已脱敏。</p></div><Button variant="icon" onClick={onClose} title="关闭"><X size={17}/></Button></header>
      <div className="command-log-toolbar"><button className={failedOnly ? 'active' : ''} onClick={() => setFailedOnly((value) => !value)}>仅失败命令</button><span>{visibleEntries.length} 条</span><div/><Button variant="icon" onClick={() => void refresh()} disabled={loading} title="刷新日志"><RefreshCw size={14} className={loading ? 'spin' : ''}/></Button><Button variant="icon" onClick={() => void clear()} disabled={!entries.length} title="清空日志"><Trash2 size={14}/></Button></div>
      <div className="command-log-list">{visibleEntries.length ? visibleEntries.map((entry) => <article className={`command-log-entry ${entry.success ? 'success' : 'failed'} ${expanded === entry.id ? 'expanded' : ''}`} key={entry.id}><button className="command-log-summary" onClick={() => setExpanded((current) => current === entry.id ? null : entry.id)}><span className="command-log-status">{entry.success ? <Check size={13}/> : <X size={13}/>}</span><div><strong>{entry.command}</strong><small>{formatTime(entry.startedAt)} · {entry.durationMs} ms · {entry.exitCode === undefined ? '未返回退出码' : `退出 ${entry.exitCode}`}</small></div><ChevronDown size={15}/></button>{expanded === entry.id && <div className="command-log-detail"><div><span>工作目录</span><code>{entry.workingDirectory || '全局 Git 配置'}</code></div><pre>{output(entry)}</pre><Button variant="secondary" size="compact" onClick={() => navigator.clipboard?.writeText(`${entry.command}\n\n${output(entry)}`).catch(() => undefined)}><Clipboard size={13}/>复制命令与输出</Button></div>}</article>) : <div className="command-log-empty"><TerminalSquare size={25}/><strong>{failedOnly ? '没有失败命令' : '暂未记录执行命令'}</strong><span>后续 Git 操作会自动显示在这里。</span></div>}</div>
    </section>
  </div>
}
