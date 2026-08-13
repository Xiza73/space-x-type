import { useEffect, useState } from 'react'

import { resumeAudio } from './audio/context'
import { GameCanvas, type RhythmMode, type SpeedId } from './components/GameCanvas'
import { Overlays } from './components/Overlays'
import { Modal } from './components/Modal'
import { Ranking } from './components/Ranking'
import { SongLibrary } from './components/SongLibrary'
import { Toggle } from './components/Toggle'
import { DEFAULTS, SPEED_PRESETS } from './game/constants'
import type { Language, SequenceType } from './game/sequence'
import type { SongStatus } from './library/client'
import { modeKey } from './scores/client'
import { isPlainKey } from './window'

const SEQUENCE_OPTIONS = [
  { value: 'arrows', label: 'FLECHAS', prefix: '←' },
  { value: 'words', label: 'PALABRAS', prefix: 'ABC' },
] as const satisfies readonly { value: SequenceType; label: string; prefix: string }[]

const LANGUAGE_OPTIONS = [
  { value: 'es', label: 'ESPAÑOL' },
  { value: 'en', label: 'ENGLISH' },
] as const satisfies readonly { value: Language; label: string }[]

// El default va primero. Que CANCIÓN sea el modo por defecto y apareciera
// segunda era una contradicción visible.
const RHYTHM_OPTIONS = [
  { value: 'song', label: 'CANCIÓN' },
  { value: 'arcade', label: 'ARCADE' },
] as const satisfies readonly { value: RhythmMode; label: string }[]

const SPEED_OPTIONS = SPEED_PRESETS.map((p) => ({ value: p.id, label: p.label }))

const BACKGROUND_OPTIONS = [
  { value: 'visual', label: 'VISUAL' },
  { value: 'plain', label: 'LISO' },
] as const satisfies readonly { value: BackgroundId; label: string }[]

type BackgroundId = 'visual' | 'plain'

export function App() {
  const [started, setStarted] = useState(false)
  const [sequenceType, setSequenceType] = useState<SequenceType>('arrows')
  const [language, setLanguage] = useState<Language>('es')
  const [rhythmMode, setRhythmMode] = useState<RhythmMode>(DEFAULTS.rhythmMode)
  const [speed, setSpeed] = useState<SpeedId>(DEFAULTS.speed)
  const [song, setSong] = useState<SongStatus | null>(null)
  const [background, setBackground] = useState<BackgroundId>('visual')
  const [showRanking, setShowRanking] = useState(false)

  useEffect(() => {
    if (started) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return
      // ALT+ENTER es el atajo de pantalla completa, no "jugar".
      if (!isPlainKey(event)) return
      // Con el foco en un campo, ENTER es de ese campo. Si no, arrancaría la
      // partida al confirmar la URL de la biblioteca.
      if (event.target instanceof HTMLInputElement) return
      void start()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [started])

  async function start() {
    // El contexto de audio arranca suspendido hasta que hay un gesto del usuario,
    // y de ese contexto depende TODO el timing del juego. Este es el gesto.
    await resumeAudio()
    setStarted(true)
  }

  if (started) {
    return (
      <GameCanvas
        sequenceType={sequenceType}
        language={language}
        rhythmMode={rhythmMode}
        speed={speed}
        song={rhythmMode === 'song' ? song : null}
        reactiveBackground={background === 'visual'}
        onMenu={() => setStarted(false)}
      />
    )
  }

  return (
    <>
      {/*
        La fila de acción va **fuera** del contenido que scrollea, anclada abajo.
        Recortar textos hasta que entre en 1024x640 —el tamaño mínimo de la
        ventana— funciona hasta el día que se agrega un control y vuelve a
        romperse. Así, JUGAR está a la vista con cualquier configuración y
        cualquier tamaño, y lo que sobra es el menú, que sí puede scrollear.
      */}
      <main className="flex h-full flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full max-w-[960px] flex-col items-center justify-center gap-5 px-6 py-6 text-center">
        <p className="text-[11px] font-bold tracking-[6px] text-ink-muted">
          1P // MODO {RHYTHM_OPTIONS.find((o) => o.value === rhythmMode)?.label}
        </p>

        <h1 className="chrome font-display text-6xl leading-none">SPACE x TYPE</h1>

        <p className="max-w-[560px] text-[15px] leading-relaxed text-ink-soft">
          {sequenceType === 'arrows'
            ? 'Completa la secuencia con las flechas'
            : 'Escribe la palabra completa'}{' '}
          y presiona <b className="text-gold">ESPACIO</b> cuando el marcador cruce la zona
          dorada.{' '}
          {rhythmMode === 'arcade'
            ? 'La barra se acelera con cada nivel y juegas hasta quedarte sin vidas.'
            : 'La barra va al tempo de la canción: más BPM, más rápida. Sin vidas — se juega hasta que la canción termina.'}
        </p>

        <div className="flex flex-wrap justify-center gap-4">
          <Toggle
            label="SECUENCIA"
            value={sequenceType}
            options={SEQUENCE_OPTIONS}
            accent="magenta"
            onChange={setSequenceType}
          />

          <Toggle
            label="RITMO"
            value={rhythmMode}
            options={RHYTHM_OPTIONS}
            accent="magenta"
            onChange={setRhythmMode}
          />

          {sequenceType === 'words' && (
            <Toggle
              label="IDIOMA"
              value={language}
              options={LANGUAGE_OPTIONS}
              accent="cyan"
              onChange={setLanguage}
            />
          )}

          {/*
            El visualizador es lo único que dibuja de más por frame, así que
            tiene que poder apagarse. El fondo nunca le gana al loop de juego.
          */}
          <Toggle
            label="FONDO"
            value={background}
            options={BACKGROUND_OPTIONS}
            accent="magenta"
            onChange={setBackground}
          />

          {/*
            Con una canción de la biblioteca este control NO aparece: ahí el
            tempo sale de la canción y se ajusta en la biblioteca. Dos lugares
            para la misma variable serían dos lugares para desincronizarse.
          */}
          {rhythmMode === 'song' && song === null && (
            <Toggle
              label="BPM"
              value={speed}
              options={SPEED_OPTIONS}
              accent="cyan"
              onChange={setSpeed}
            />
          )}
        </div>

        {rhythmMode === 'song' && <SongLibrary selected={song} onSelect={setSong} />}

          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-t border-line-card bg-night/85 px-6 py-3">
          <button
            onClick={() => void start()}
            className="cursor-pointer rounded-xl bg-linear-to-b from-magenta-light to-magenta-dark px-14 py-3.5 font-display text-xl text-white shadow-[0_6px_22px_rgb(255_46_136/0.4)] transition-transform duration-150 hover:-translate-y-0.5"
          >
            JUGAR ⏎
          </button>

          {/*
            El ranking en un modal y no en la pantalla: abierto ocupaba una
            tarjeta entera y competía con lo que sí hay que decidir antes de
            jugar.
          */}
          <button
            onClick={() => setShowRanking(true)}
            className="cursor-pointer rounded-xl border-2 border-line px-6 py-3.5 font-bold text-ink-soft hover:border-ink-muted"
          >
            VER RANKING
          </button>
        </div>
      </main>

      <Modal open={showRanking} title="RANKING" onClose={() => setShowRanking(false)}>
        {/*
          Qué tabla se está mirando. Dentro de un modal los controles quedan
          tapados, así que sin esta línea no se sabe a qué configuración
          corresponde el top 5 — y cada una tiene la suya.
        */}
        <p className="text-[12px] text-ink-muted">
          {sequenceType === 'arrows' ? 'Flechas' : `Palabras (${language})`} ·{' '}
          {rhythmMode === 'arcade' ? 'Arcade' : `Canción ${song?.title ?? `${speed}`}`}
        </p>

        <Ranking
          heading={false}
          mode={modeKey(sequenceType, language, rhythmMode, speed)}
          emptyHint="Nadie puntuó todavía en esta configuración. Estrenala."
        />
      </Modal>

      <Overlays />
    </>
  )
}
