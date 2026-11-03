import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'

if (import.meta.env.PROD) {
  // Cancel the browser menu while still delivering events to custom menus.
  window.addEventListener('contextmenu', (event) => event.preventDefault(), { capture: true })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
