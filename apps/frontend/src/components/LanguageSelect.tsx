import { useTranslation } from 'react-i18next'
import { useLocale } from '../i18n/LocaleProvider'
import type { LocalePreference } from '../i18n/localePreference'
import { CompactSelect } from './CompactSelect'

export function LanguageSelect() {
  const { t } = useTranslation('settings')
  const { preference, locale, setPreference } = useLocale()
  return <div className="titlebar-language">
    <CompactSelect<LocalePreference> value={preference} onChange={setPreference}
      ariaLabel={t('language.label')} options={[
        { value: 'system', label: t('language.system', { language: locale === 'zh-CN' ? '简体中文' : 'English' }) },
        { value: 'zh-CN', label: '简体中文' },
        { value: 'en-US', label: 'English' },
      ]}/>
  </div>
}
