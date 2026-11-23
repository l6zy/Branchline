import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { localeStorage, readLocalePreference, resolveLocale, systemLanguages, writeLocalePreference, type Locale, type LocalePreference } from './localePreference'

type LocaleContextValue = {
  preference: LocalePreference
  locale: Locale
  systemLocale: Locale
  setPreference: (value: LocalePreference) => void
  refreshSystemLocale: () => void
}
const LocaleContext = createContext<LocaleContextValue | null>(null)
export function LocaleProvider({ children }: { children: ReactNode }) {
  const { i18n, t } = useTranslation()
  const [preference, updatePreference] = useState(readLocalePreference)
  const [systemLocale, setSystemLocale] = useState(() => resolveLocale('system', systemLanguages()))
  const locale = preference === 'system' ? systemLocale : preference
  const refreshSystemLocale = useCallback(() => {
    setSystemLocale(resolveLocale('system', systemLanguages()))
  }, [])
  const setPreference = useCallback((value: LocalePreference) => {
    if (value === 'system') refreshSystemLocale()
    writeLocalePreference(localeStorage(), value)
    updatePreference(value)
  }, [refreshSystemLocale])
  useEffect(() => {
    window.addEventListener('languagechange', refreshSystemLocale)
    return () => window.removeEventListener('languagechange', refreshSystemLocale)
  }, [refreshSystemLocale])
  useEffect(() => { void i18n.changeLanguage(locale) }, [i18n, locale])
  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage ?? locale
    const title = t('appName')
    document.title = title
    if ('__TAURI_INTERNALS__' in window) {
      try { void getCurrentWindow().setTitle(title).catch(() => undefined) } catch { /* Browser preview. */ }
    }
  }, [i18n, i18n.resolvedLanguage, locale, t])
  const value = useMemo(() => ({ preference, locale, systemLocale, setPreference, refreshSystemLocale }), [preference, locale, systemLocale, setPreference, refreshSystemLocale])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}
export function useLocale() {
  const value = useContext(LocaleContext)
  if (!value) throw new Error('LanguageSelect requires LocaleProvider')
  return value
}
