import { useEffect, useRef, useState } from 'react'

import { resumeAudio, suspendAudio } from '../audio/context'
import { loadSong, playSong, type SongPlayback } from '../audio/song'
import { DEFAULTS, SPEED_PRESETS } from '../game/constants'
import type { GameState } from '../game/engine'
import { startGameLoop, type Loop } from '../game/loop'
import { arcadeRhythm, beatmapRhythm, songRhythm, type RhythmSource } from '../game/rhythm'
import { sequenceProvider, type Language, type SequenceType } from '../game/sequence'
import { songBeatmap } from '../library/client'
import { modeKey } from '../scores/client'
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

export function GameCanvas({
  sequenceType,
  language,
  rhythmMode,
  speed,
  songId,
  onMenu,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const pausedRef = useRef(false)
  const [paused, setPaused] = useState(false)
  // El buffer decodificado se cachea: reintentar no tiene que volver a traer
  // megabytes por IPC ni decodificar de nuevo.
  const bufferRef = useRef<{ id: string; buffer: AudioBuffer } | null>(null)
  const [over, setOver] = useState<GameState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [run, setRun] = useState(0)

  useEffect(() => {
    let cancelled = false
    let loop: Loop | null = null
    let playback: SongPlayback | null = null
    let onKeyDown: ((event: KeyboardEvent) => void) | null = null

    async function boot() {
      const canvas = ref.current
      if (canvas === null) return

      let rhythm: RhythmSource
      let bpm: number | null = DEFAULTS.bpm

      if (rhythmMode === 'song' && songId !== null) {
        setLoading(true)
        try {
          const beatmap = await songBeatmap(songId)
          if (bufferRef.current?.id !== songId) {
            bufferRef.current = { id: songId, buffer: await loadSong(songId) }
          }
          if (cancelled) return

          playback = playSong(bufferRef.current.buffer)
          rhythm = beatmapRhythm(beatmap, playback.startedAtMs)
          bpm = null
        } catch (e: unknown) {
          if (!cancelled) setError(String(e))
          return
        } finally {
          if (!cancelled) setLoading(false)
        }
      } else if (rhythmMode === 'song') {
        const preset = SPEED_PRESETS.find((p) => p.id === speed) ?? SPEED_PRESETS[1]
        rhythm = songRhythm(preset.roundDurationMs)
      } else {
        rhythm = arcadeRhythm(DEFAULTS.speedScale)
      }

      if (cancelled) return

      loop = startGameLoop({
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

      onKeyDown = (event: KeyboardEvent) => {
        // El espacio scrollea la página y las flechas mueven el foco.
        if (event.key === ' ' || event.key.startsWith('Arrow')) event.preventDefault()
        // En pausa el reloj está congelado: aceptar teclas dejaría al jugador
        // resolviendo la ronda con la barra detenida.
        if (pausedRef.current) return
        loop?.handleKey(event.key)
      }
      window.addEventListener('keydown', onKeyDown)
    }

    void boot()

    return () => {
      cancelled = true
      if (onKeyDown !== null) window.removeEventListener('keydown', onKeyDown)
      loop?.stop()
      playback?.stop()
      // Salir con el contexto suspendido dejaría la próxima partida con el
      // reloj congelado y sin ninguna pista de por qué.
      pausedRef.current = false
      void resumeAudio()
    }
  }, [sequenceType, language, rhythmMode, speed, songId, run])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Con los resultados en pantalla la partida ya terminó: no hay qué pausar.
      if (event.key !== 'Escape' || over !== null) return
      const next = !pausedRef.current
      pausedRef.current = next
      setPaused(next)
      void (next ? suspendAudio() : resumeAudio())
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [over])

  function leave() {
    pausedRef.current = false
    setPaused(false)
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

      {paused && over === null && (
        <div className="fixed inset-0 grid place-content-center justify-items-center gap-6 bg-night/92 px-6 text-center">
          <h2 className="chrome font-display text-5xl leading-none">PAUSA</h2>
          <p className="text-[13px] text-ink-soft">
            El reloj está congelado: la partida te espera exactamente donde la dejaste.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                pausedRef.current = false
                setPaused(false)
                void resumeAudio()
              }}
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
