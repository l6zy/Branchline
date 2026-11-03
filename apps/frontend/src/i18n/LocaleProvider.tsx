import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { localeStorage, readLocalePreference, resolveLocale, systemLanguages, writeLocalePreference, type Locale, type LocalePreference } from './localePreference'

type LocaleContextValue = { preference: LocalePreference; locale: Locale; setPreference: (value: LocalePreference) => void }
const LocaleContext = createContext<LocaleContextValue | null>(null)
export function LocaleProvider({ children }: { children: ReactNode }) {
  const { i18n, t } = useTranslation()
  const [preference, updatePreference] = useState(readLocalePreference)
  const [languages, setLanguages] = useState(systemLanguages)
  const locale = resolveLocale(preference, languages)
  const setPreference = useCallback((value: LocalePreference) => {
    writeLocalePreference(localeStorage(), value)
    setLanguages(systemLanguages())
    updatePreference(value)
  }, [])
  useEffect(() => {
    const update = () => setLanguages([...systemLanguages()])
    window.addEventListener('languagechange', update)
    return () => window.removeEventListener('languagechange', update)
  }, [])
  useEffect(() => { void i18n.changeLanguage(locale) }, [i18n, locale])
  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage ?? locale
    const title = t('appName')
    document.title = title
    if ('__TAURI_INTERNALS__' in window) {
      try { void getCurrentWindow().setTitle(title).catch(() => undefined) } catch { /* Browser preview. */ }
    }
  }, [i18n, i18n.resolvedLanguage, locale, t])
  const value = useMemo(() => ({ preference, locale, setPreference }), [preference, locale, setPreference])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}
export function useLocale() {
  const value = useContext(LocaleContext)
  if (!value) throw new Error('LanguageSelect requires LocaleProvider')
  return value
}
