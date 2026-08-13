import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import './index.css'
import { bindFullscreenToggle } from './window'

// Va aquí y no en un componente: el atajo vale en toda la app, no depende de
// qué pantalla esté montada, y no tiene que remontarse al entrar a una partida.
bindFullscreenToggle()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
