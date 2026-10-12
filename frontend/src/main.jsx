import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App.jsx'

// A View nativa ja reserva o espaco das barras Android em pixels fisicos.
// Nunca copiar esse valor diretamente para CSS px: gerava faixa branca gigante.
if (Capacitor.isNativePlatform()) {
  document.documentElement.style.setProperty('--splash-bottom-safe', '0px')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
