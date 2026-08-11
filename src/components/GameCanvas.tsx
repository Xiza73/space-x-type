import { useEffect, useRef, useState } from 'react'

import { DEFAULTS, SPEED_PRESETS } from '../game/constants'
import type { GameState } from '../game/engine'
import { startGameLoop, type Loop } from '../game/loop'
import { arcadeRhythm, songRhythm } from '../game/rhythm'
import { sequenceProvider, type Language, type SequenceType } from '../game/sequence'
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
  onMenu: () => void
}

export function GameCanvas({ sequenceType, language, rhythmMode, speed, onMenu }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const loopRef = useRef<Loop | null>(null)
  const [over, setOver] = useState<GameState | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (canvas === null) return

    const preset = SPEED_PRESETS.find((p) => p.id === speed) ?? SPEED_PRESETS[1]
    const rhythm =
      rhythmMode === 'arcade'
        ? arcadeRhythm(DEFAULTS.speedScale)
        : songRhythm(preset.roundDurationMs)

    const loop = startGameLoop({
      canvas,
      // Canción no lleva vidas: dura lo que dura la canción, se falle o no.
      config: {
        lives: rhythmMode === 'arcade' ? DEFAULTS.lives : null,
        durationMs: rhythm.totalDurationMs,
      },
      bpm: DEFAULTS.bpm,
      rhythm,
      nextSequence: sequenceProvider(sequenceType, language),
      onGameOver: setOver,
    })
    loopRef.current = loop

    const onKeyDown = (event: KeyboardEvent) => {
      // El espacio scrollea la página y las flechas mueven el foco. Los dos molestan.
      if (event.key === ' ' || event.key.startsWith('Arrow')) event.preventDefault()
      loop.handleKey(event.key)
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      loop.stop()
      loopRef.current = null
    }
  }, [sequenceType, language, rhythmMode, speed])

  return (
    <>
      <canvas ref={ref} className="block h-screen w-screen" />
      <Overlays />
      {over !== null && (
        <GameOver
          state={over}
          mode={modeKey(sequenceType, language, rhythmMode, speed)}
          onRetry={() => {
            setOver(null)
            loopRef.current?.restart()
          }}
          onMenu={onMenu}
        />
      )}
    </>
  )
}
