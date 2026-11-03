import { useLocale } from '../../i18n/LocaleProvider'
import { useAppTranslation } from '../../i18n/useAppTranslation'
import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronDown, Clipboard, RefreshCw, TerminalSquare, Trash2, X } from 'lucide-react'
import { clearCommandLogs, loadCommandLogs, type CommandLogEntry } from '../../repository'
import { Button } from '../../components/Button'

function formatTime(timestamp: number, locale: string) {
  return new Date(timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function output(entry: CommandLogEntry, noOutput: string) {
  return [entry.stdout && `stdout\n${entry.stdout}`, entry.stderr && `stderr\n${entry.stderr}`].filter(Boolean).join('\n\n') || noOutput
}

export function CommandLogPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useAppTranslation()
  const { locale } = useLocale()
  const noOutput = t('settings:logs.noOutput')
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
    <section className="command-log-panel" role="dialog" aria-modal="true" aria-label={t('settings:logs.title')} onPointerDown={(event) => event.stopPropagation()}>
      <header className="command-log-heading"><span className="command-log-icon"><TerminalSquare size={18}/></span><div><h2>{t('settings:logs.title')}</h2><p>{t('settings:logs.description')}</p></div><Button variant="icon" onClick={onClose} tooltip={t('settings:close')} aria-label={t('settings:close')}><X size={17}/></Button></header>
      <div className="command-log-toolbar"><button className={failedOnly ? 'active' : ''} onClick={() => setFailedOnly((value) => !value)}>{t('settings:logs.failedOnly')}</button><span>{t('settings:logs.count', { count: visibleEntries.length, formattedCount: new Intl.NumberFormat(locale).format(visibleEntries.length) })}</span><div/><Button variant="icon" onClick={() => void refresh()} disabled={loading} tooltip={t('settings:logs.refresh')} aria-label={t('settings:logs.refresh')}><RefreshCw size={14} className={loading ? 'spin' : ''}/></Button><Button variant="icon" onClick={() => void clear()} disabled={!entries.length} tooltip={t('settings:logs.clear')} aria-label={t('settings:logs.clear')}><Trash2 size={14}/></Button></div>
      <div className="command-log-list">{visibleEntries.length ? visibleEntries.map((entry) => <article className={`command-log-entry ${entry.success ? 'success' : 'failed'} ${expanded === entry.id ? 'expanded' : ''}`} key={entry.id}><button className="command-log-summary" onClick={() => setExpanded((current) => current === entry.id ? null : entry.id)}><span className="command-log-status">{entry.success ? <Check size={13}/> : <X size={13}/>}</span><div><strong>{entry.command}</strong><small>{formatTime(entry.startedAt, locale)} · {t('settings:logs.duration', { duration: new Intl.NumberFormat(locale).format(entry.durationMs) })} · {entry.exitCode === undefined ? t('settings:logs.noExitCode') : t('settings:logs.exitCode', { code: entry.exitCode })}</small></div><ChevronDown size={15}/></button>{expanded === entry.id && <div className="command-log-detail"><div><span>{t('settings:logs.directory')}</span><code>{entry.workingDirectory || t('settings:logs.globalConfig')}</code></div><pre>{output(entry, noOutput)}</pre><Button variant="secondary" size="compact" onClick={() => navigator.clipboard?.writeText(`${entry.command}\n\n${output(entry, noOutput)}`).catch(() => undefined)}><Clipboard size={13}/>{t('settings:logs.copy')}</Button></div>}</article>) : <div className="command-log-empty"><TerminalSquare size={25}/><strong>{failedOnly ? t('settings:logs.noFailures') : t('settings:logs.empty')}</strong><span>{t('settings:logs.emptyHint')}</span></div>}</div>
    </section>
  </div>
}
