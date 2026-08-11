import { useState } from 'react'

import { resumeAudio } from './audio/context'
import { GameCanvas } from './components/GameCanvas'

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
    <main>
      <h1>SPACE x TYPE</h1>
      <p>
        Completá la secuencia con las flechas y presioná <b>ESPACIO</b> cuando el marcador
        cruce la zona dorada. La barra se acelera con cada nivel.
      </p>
      <button onClick={() => void start()}>JUGAR</button>
    </main>
  )
}
