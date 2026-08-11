import { useState } from 'react'

import { resumeAudio } from './audio/context'
import { GameCanvas } from './components/GameCanvas'
import { Overlays } from './components/Overlays'

export function App() {
  const [started, setStarted] = useState(false)

  async function start() {
    // El contexto de audio arranca suspendido hasta que hay un gesto del usuario,
    // y de ese contexto depende TODO el timing del juego. Este click es el gesto.
    await resumeAudio()
    setStarted(true)
  }

  if (started) return <GameCanvas />

  return (
    <>
      <main className="grid h-full place-content-center justify-items-center gap-6 px-6 text-center">
        <p className="text-[11px] font-bold tracking-[6px] text-ink-muted">1P // MODO ARCADE</p>

        <h1 className="chrome font-display text-6xl leading-none">SPACE x TYPE</h1>

        <p className="max-w-[520px] text-[15px] leading-relaxed text-ink-soft">
          Completá la secuencia con las flechas y presioná <b className="text-gold">ESPACIO</b>{' '}
          cuando el marcador cruce la zona dorada. La barra se acelera con cada nivel.
        </p>

        <button
          onClick={() => void start()}
          className="cursor-pointer rounded-xl bg-linear-to-b from-magenta-light to-magenta-dark px-14 py-4 font-display text-xl text-white shadow-[0_6px_22px_rgb(255_46_136/0.4)] transition-transform duration-150 hover:-translate-y-0.5"
        >
          JUGAR
        </button>
      </main>
      <Overlays />
    </>
  )
}
