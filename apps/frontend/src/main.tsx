import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import { I18nextProvider } from 'react-i18next'
import { createAppI18n, initialLocale } from './i18n'
import { LocaleProvider } from './i18n/LocaleProvider'
import { TooltipProvider } from './components/tooltip'

if (import.meta.env.PROD) {
  // Cancel the browser menu while still delivering events to custom menus.
  window.addEventListener('contextmenu', (event) => event.preventDefault(), { capture: true })
}

void createAppI18n(initialLocale()).then((i18n) => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}><LocaleProvider><TooltipProvider><App /></TooltipProvider></LocaleProvider></I18nextProvider>
  </StrictMode>,
))
