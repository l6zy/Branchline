import { render } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import type { ReactElement } from 'react'
import { createAppI18n } from '../i18n'
import type { Locale } from '../i18n/localePreference'
import { TooltipProvider } from '../components/tooltip'

export async function renderLocalized(ui: ReactElement, locale: Locale = 'zh-CN') {
  const i18n = await createAppI18n(locale)
  return { ...render(<I18nextProvider i18n={i18n}><TooltipProvider>{ui}</TooltipProvider></I18nextProvider>), i18n }
}
