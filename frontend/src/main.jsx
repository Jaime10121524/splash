// Android edge-to-edge: somente a barra inferior do SPLASH ocupa o inset.
// Em PWA/browser sem ponte nativa, a pagina usa env(safe-area-inset-bottom).
try {
  const inset = window.SplashSafeArea?.getBottomInset?.()
  if (Number.isFinite(inset) && inset >= 0 && inset <= 240) {
    document.documentElement.style.setProperty('--splash-bottom-safe', inset + 'px')
  }
} catch { /* browser web: sem ponte Android */ }

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
