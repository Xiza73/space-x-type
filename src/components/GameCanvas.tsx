import { useEffect, useRef, useState } from 'react'

import { resumeAudio, suspendAudio } from '../audio/context'
import { loadSong, playSong, type SongPlayback } from '../audio/song'
import { COUNTDOWN_SECONDS, DEFAULTS, SPEED_PRESETS } from '../game/constants'
import type { GameState } from '../game/engine'
import { startGameLoop, type Loop } from '../game/loop'
import { arcadeRhythm, beatmapRhythm, songRhythm, type RhythmSource } from '../game/rhythm'
import { sequenceProvider, type Language, type SequenceType } from '../game/sequence'
import { songBeatmap } from '../library/client'
import { modeKey } from '../scores/client'
import { Countdown } from './Countdown'
import { GameOver } from './GameOver'
import { Overlays } from './Overlays'

export type RhythmMode = 'arcade' | 'song'
export type SpeedId = (typeof SPEED_PRESETS)[number]['id']

type Props = {
  sequenceType: SequenceType
  language: Language
  rhythmMode: RhythmMode
  speed: SpeedId
  /** Canción de la biblioteca, o `null` para el chiptune simulado. */
  songId: string | null
  onMenu: () => void
}

/** Espera un segundo de reloj de pared. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 1000))

export function GameCanvas({
  sequenceType,
  language,
  rhythmMode,
  speed,
  songId,
  onMenu,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const loopRef = useRef<Loop | null>(null)
  const pausedRef = useRef(false)
  // El buffer decodificado se cachea: reintentar no tiene que volver a traer
  // megabytes por IPC ni decodificar de nuevo.
  const bufferRef = useRef<{ id: string; buffer: AudioBuffer } | null>(null)

  const [over, setOver] = useState<GameState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [paused, setPaused] = useState(false)
  // El título va aparte y no derivado de `paused`: al reanudar hay que apagar
  // la pausa antes de contar, y derivarlo mostraría el texto de arranque.
  const [countdown, setCountdown] = useState<{ value: number; title: string } | null>(null)
  const [run, setRun] = useState(0)

  useEffect(() => {
    let cancelled = false
    let playback: SongPlayback | null = null
    let onKeyDown: ((event: KeyboardEvent) => void) | null = null

    async function boot() {
      const canvas = ref.current
      if (canvas === null) return

      let buffer: AudioBuffer | null = null

      if (rhythmMode === 'song' && songId !== null) {
        setLoading(true)
        try {
          if (bufferRef.current?.id !== songId) {
            bufferRef.current = { id: songId, buffer: await loadSong(songId) }
          }
          buffer = bufferRef.current.buffer
        } catch (e: unknown) {
          if (!cancelled) setError(String(e))
          return
        } finally {
          if (!cancelled) setLoading(false)
        }
      }
      if (cancelled) return

      // La cuenta corre con el audio suspendido: nada suena y nada avanza.
      await suspendAudio()
      for (let left = COUNTDOWN_SECONDS; left > 0; left--) {
        if (cancelled) return
        setCountdown({ value: left, title: 'PREPARATE' })
        await tick()
      }
      if (cancelled) return
      setCountdown(null)
      await resumeAudio()
      if (cancelled) return

      let rhythm: RhythmSource
      let bpm: number | null = DEFAULTS.bpm

      if (buffer !== null && songId !== null) {
        try {
          const beatmap = await songBeatmap(songId)
          if (cancelled) return
          playback = playSong(buffer)
          rhythm = beatmapRhythm(beatmap, playback.startedAtMs)
          bpm = null
        } catch (e: unknown) {
          if (!cancelled) setError(String(e))
          return
        }
      } else if (rhythmMode === 'song') {
        const preset = SPEED_PRESETS.find((p) => p.id === speed) ?? SPEED_PRESETS[1]
        rhythm = songRhythm(preset.roundDurationMs)
      } else {
        rhythm = arcadeRhythm(DEFAULTS.speedScale)
      }

      const loop = startGameLoop({
        canvas,
        // Canción no lleva vidas: dura lo que dura la canción, se falle o no.
        config: {
          lives: rhythmMode === 'arcade' ? DEFAULTS.lives : null,
          durationMs: rhythm.totalDurationMs,
        },
        bpm,
        rhythm,
        nextSequence: sequenceProvider(sequenceType, language),
        onGameOver: setOver,
      })
      loopRef.current = loop

      onKeyDown = (event: KeyboardEvent) => {
        // El espacio scrollea la página y las flechas mueven el foco.
        if (event.key === ' ' || event.key.startsWith('Arrow')) event.preventDefault()
        // En pausa el reloj está congelado: aceptar teclas dejaría al jugador
        // resolviendo la ronda con la barra detenida.
        if (pausedRef.current) return
        loop.handleKey(event.key)
      }
      window.addEventListener('keydown', onKeyDown)
    }

    void boot()

    return () => {
      cancelled = true
      if (onKeyDown !== null) window.removeEventListener('keydown', onKeyDown)
      loopRef.current?.stop()
      loopRef.current = null
      playback?.stop()
      setCountdown(null)
      // Salir con el contexto suspendido dejaría la próxima partida con el
      // reloj congelado y sin ninguna pista de por qué.
      pausedRef.current = false
      void resumeAudio()
    }
  }, [sequenceType, language, rhythmMode, speed, songId, run])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Sin partida en curso no hay nada que pausar.
      if (event.key !== 'Escape' || over !== null || countdown !== null) return
      if (pausedRef.current) void unpause()
      else void pause()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [over, countdown])

  async function pause() {
    pausedRef.current = true
    setPaused(true)
    await suspendAudio()
  }

  /**
   * Volver de la pausa no es instantáneo: cuenta tres segundos en silencio y
   * después descarta la ronda que estaba a medias. Retomar la barra donde
   * quedó sería injusto en los dos sentidos.
   */
  async function unpause() {
    setPaused(false)
    for (let left = COUNTDOWN_SECONDS; left > 0; left--) {
      setCountdown({ value: left, title: 'SEGUÍ CUANDO ESTÉS' })
      await tick()
    }
    setCountdown(null)
    pausedRef.current = false
    await resumeAudio()
    loopRef.current?.abort()
  }

  function leave() {
    pausedRef.current = false
    setPaused(false)
    setCountdown(null)
    void resumeAudio()
    onMenu()
  }

  return (
    <>
      <canvas ref={ref} className="block h-screen w-screen" />
      <Overlays />

      {loading && (
        <p className="fixed inset-0 grid place-content-center text-sm tracking-[3px] text-ink-muted">
          CARGANDO LA CANCIÓN…
        </p>
      )}

      {countdown !== null && <Countdown value={countdown.value} title={countdown.title} />}

      {error !== null && (
        <div className="fixed inset-0 grid place-content-center justify-items-center gap-4 bg-night px-6 text-center">
          <p className="max-w-[420px] text-red">No se pudo cargar la canción: {error}</p>
          <button
            onClick={leave}
            className="cursor-pointer rounded-xl border-2 border-line px-6 py-3 font-bold text-ink-soft"
          >
            MENÚ
          </button>
        </div>
      )}

      {paused && over === null && countdown === null && (
        <div className="fixed inset-0 grid place-content-center justify-items-center gap-6 bg-night/92 px-6 text-center">
          <h2 className="chrome font-display text-5xl leading-none">PAUSA</h2>
          <p className="max-w-[420px] text-[13px] text-ink-soft">
            El reloj está congelado. Al volver hay tres segundos de cuenta y la barra
            arranca de cero; la canción sigue donde la dejaste.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => void unpause()}
              className="cursor-pointer rounded-xl bg-linear-to-b from-magenta-light to-magenta-dark px-8 py-3 font-display text-lg text-white"
            >
              CONTINUAR ⎋
            </button>
            <button
              onClick={leave}
              className="cursor-pointer rounded-xl border-2 border-line px-6 py-3 font-bold text-ink-soft hover:border-ink-muted"
            >
              MENÚ
            </button>
          </div>
        </div>
      )}

      {over !== null && (
        <GameOver
          state={over}
          mode={modeKey(sequenceType, language, rhythmMode, speed)}
          onRetry={() => {
            // Se remonta todo: con una canción real hay que rearrancar el audio,
            // y un solo camino de reinicio es uno solo que puede fallar.
            setOver(null)
            setRun((n) => n + 1)
          }}
          onMenu={leave}
        />
      )}
    </>
  )
}
