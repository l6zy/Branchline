import { formatDateTime } from './i18n/formatters'
import type { Locale } from './i18n/localePreference'
export function formatLocalDateTime(value: string | null | undefined, includeSeconds = true, locale: Locale = 'zh-CN') {
  return formatDateTime(value, locale, includeSeconds)
}
