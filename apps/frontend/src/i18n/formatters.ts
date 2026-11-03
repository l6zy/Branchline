import type { Locale } from './localePreference'
export function formatDateTime(value: string | number | null | undefined, locale: Locale, includeSeconds = true) {
  if (value == null || value === '') return '—'
  const stamp = typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(stamp)) return String(value)
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
  }).format(new Date(stamp))
}
export function formatDisplayNumber(value: number, locale: Locale) { return new Intl.NumberFormat(locale).format(value) }
