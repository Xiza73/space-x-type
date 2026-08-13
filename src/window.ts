/**
 * Pantalla completa con **ALT + ENTER**, el atajo de siempre en juegos.
 *
 * Vive fuera de React porque no es estado de la UI: nada se redibuja distinto
 * según esté o no en pantalla completa, y el canvas ya se adapta solo al tamaño
 * del cliente en cada frame.
 *
 * ENTER a secas confirma una ronda (`CONFIRM_KEYS`), así que el modificador no
 * es decorativo: sin él, alternar pantalla completa se comería una jugada.
 */

import { getCurrentWindow } from '@tauri-apps/api/window'

export function bindFullscreenToggle(): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || !event.altKey) return
    // Sin esto, el ENTER llega igual al juego y confirma la ronda de fondo.
    event.preventDefault()
    void toggleFullscreen()
  }

  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}

/**
 * Fuera de Tauri —el navegador de desarrollo— no hay ventana nativa que
 * cambiar. Se ignora en vez de reventar: el resto del juego funciona igual y
 * poder abrirlo en el navegador es lo que hace posible medirlo.
 */
async function toggleFullscreen(): Promise<void> {
  try {
    const appWindow = getCurrentWindow()
    await appWindow.setFullscreen(!(await appWindow.isFullscreen()))
  } catch (e: unknown) {
    console.warn('No se pudo alternar pantalla completa', e)
  }
}
