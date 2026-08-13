import { useEffect, useState } from 'react'

import { resumeAudio } from './audio/context'
import { GameCanvas, type RhythmMode, type SpeedId } from './components/GameCanvas'
import { Overlays } from './components/Overlays'
import { SongLibrary } from './components/SongLibrary'
import { Toggle } from './components/Toggle'
import { DEFAULTS, SPEED_PRESETS } from './game/constants'
import type { Language, SequenceType } from './game/sequence'
import type { SongStatus } from './library/client'

const SEQUENCE_OPTIONS = [
  { value: 'arrows', label: '← FLECHAS' },
  { value: 'words', label: 'ABC PALABRAS' },
] as const satisfies readonly { value: SequenceType; label: string }[]

const LANGUAGE_OPTIONS = [
  { value: 'es', label: 'ESPAÑOL' },
  { value: 'en', label: 'ENGLISH' },
] as const satisfies readonly { value: Language; label: string }[]

const RHYTHM_OPTIONS = [
  { value: 'arcade', label: 'ARCADE' },
  { value: 'song', label: 'CANCIÓN' },
] as const satisfies readonly { value: RhythmMode; label: string }[]

const SPEED_OPTIONS = SPEED_PRESETS.map((p) => ({ value: p.id, label: p.label }))

export function App() {
  const [started, setStarted] = useState(false)
  const [sequenceType, setSequenceType] = useState<SequenceType>('arrows')
  const [language, setLanguage] = useState<Language>('es')
  const [rhythmMode, setRhythmMode] = useState<RhythmMode>(DEFAULTS.rhythmMode)
  const [speed, setSpeed] = useState<SpeedId>(DEFAULTS.speed)
  const [song, setSong] = useState<SongStatus | null>(null)

  useEffect(() => {
    if (started) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return
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
        onMenu={() => setStarted(false)}
      />
    )
  }

  return (
    <>
      <main className="grid h-full place-content-center justify-items-center gap-6 px-6 text-center">
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
            : 'La velocidad no cambia: lo que sube es la cantidad de teclas, y la partida dura dos minutos.'}
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
            La velocidad se elige SIEMPRE en modo canción, también con una
            canción de la biblioteca. El beatmap pone el tempo —dónde caen los
            beats—, no la velocidad: con una canción elegida, esto define
            cuántos beats dura cada ronda.
          */}
          {rhythmMode === 'song' && (
            <Toggle
              label="VELOCIDAD"
              value={speed}
              options={SPEED_OPTIONS}
              accent="cyan"
              onChange={setSpeed}
            />
          )}
        </div>

        {rhythmMode === 'song' && (
          <SongLibrary
            selected={song}
            onSelect={setSong}
            beatsPerRound={
              (SPEED_PRESETS.find((p) => p.id === speed) ?? SPEED_PRESETS[1]).beatsPerRound
            }
          />
        )}

        <button
          onClick={() => void start()}
          className="cursor-pointer rounded-xl bg-linear-to-b from-magenta-light to-magenta-dark px-14 py-4 font-display text-xl text-white shadow-[0_6px_22px_rgb(255_46_136/0.4)] transition-transform duration-150 hover:-translate-y-0.5"
        >
          JUGAR ⏎
        </button>
      </main>
      <Overlays />
    </>
  )
}
