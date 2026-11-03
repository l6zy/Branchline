export type Locale = 'zh-CN' | 'en-US'
export type LocalePreference = 'system' | Locale
export const LOCALE_STORAGE_KEY = 'branchline.locale.v1'
type LocaleStorage = Pick<Storage, 'getItem' | 'setItem'>

export function isLocalePreference(value: unknown): value is LocalePreference {
  return value === 'system' || value === 'zh-CN' || value === 'en-US'
}
export function resolveLocale(preference: LocalePreference, languages: readonly string[]): Locale {
  if (preference !== 'system') return preference
  for (const language of languages) {
    if (/^zh(?:-|$)/i.test(language)) return 'zh-CN'
    if (/^en(?:-|$)/i.test(language)) return 'en-US'
  }
  return 'zh-CN'
}
export function localeStorage(): LocaleStorage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage } catch { return undefined }
}
export function readLocalePreference(storage = localeStorage()): LocalePreference {
  try {
    const value = storage?.getItem(LOCALE_STORAGE_KEY)
    return isLocalePreference(value) ? value : 'system'
  } catch { return 'system' }
}
export function writeLocalePreference(storage: LocaleStorage | undefined, preference: LocalePreference) {
  try { storage?.setItem(LOCALE_STORAGE_KEY, preference) } catch { /* Keep the session usable. */ }
}
export function systemLanguages(): readonly string[] {
  return typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]
}
