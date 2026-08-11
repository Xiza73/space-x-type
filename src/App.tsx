import { useState } from 'react'

import { startChiptune, stopChiptune } from './audio/chiptune'
import { resumeAudio } from './audio/context'
import { sfxGood, sfxKey, sfxMiss, sfxPerfect, sfxWrong } from './audio/sfx'
import { DEFAULTS } from './game/constants'

// ponytail: banco de pruebas del audio, no la UI final. Web Audio no existe en
// Node, así que esto es la única forma de verificar el chiptune y los efectos.
// Lo reemplaza la pantalla de inicio real cuando entre el canvas.
export function App() {
  const [playing, setPlaying] = useState(false)

  async function toggleMusic() {
    if (playing) {
      stopChiptune()
      setPlaying(false)
      return
    }
    // El contexto arranca suspendido: este click es el gesto que lo habilita.
    await resumeAudio()
    startChiptune(DEFAULTS.bpm)
    setPlaying(true)
  }

  async function play(sfx: () => void) {
    await resumeAudio()
    sfx()
  }

  return (
    <main>
      <h1>SPACE x TYPE</h1>
      <p>Banco de pruebas de audio</p>

      <button onClick={() => void toggleMusic()}>
        {playing ? '■ PARAR CHIPTUNE' : `▶ CHIPTUNE ${DEFAULTS.bpm} BPM`}
      </button>

      <div className="row">
        <button onClick={() => void play(() => sfxKey(0))}>tecla 1</button>
        <button onClick={() => void play(() => sfxKey(4))}>tecla 5</button>
        <button onClick={() => void play(sfxWrong)}>error</button>
        <button onClick={() => void play(sfxGood)}>good</button>
        <button onClick={() => void play(sfxPerfect)}>perfect</button>
        <button onClick={() => void play(sfxMiss)}>miss</button>
      </div>
    </main>
  )
}
