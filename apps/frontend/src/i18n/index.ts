import { createInstance, type i18n } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { resources } from './resources'
import { readLocalePreference, resolveLocale, systemLanguages, type Locale } from './localePreference'

export async function createAppI18n(locale: Locale): Promise<i18n> {
  const instance = createInstance()
  await instance.use(initReactI18next).init({
    resources, lng: locale, fallbackLng: 'zh-CN',
    supportedLngs: ['zh-CN', 'en-US'], defaultNS: 'common',
    interpolation: { escapeValue: false }, react: { useSuspense: false },
  })
  return instance
}
export const initialLocale = () => resolveLocale(readLocalePreference(), systemLanguages())
