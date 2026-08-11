import { useEffect, useRef } from 'react'

import { DEFAULTS, SPEED_PRESETS } from '../game/constants'
import { startGameLoop } from '../game/loop'
import { arcadeRhythm, songRhythm } from '../game/rhythm'
import { sequenceProvider, type Language, type SequenceType } from '../game/sequence'
import { Overlays } from './Overlays'

export type RhythmMode = 'arcade' | 'song'
export type SpeedId = (typeof SPEED_PRESETS)[number]['id']

type Props = {
  sequenceType: SequenceType
  language: Language
  rhythmMode: RhythmMode
  speed: SpeedId
}

export function GameCanvas({ sequenceType, language, rhythmMode, speed }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

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
      config: { lives: DEFAULTS.lives, durationMs: rhythm.totalDurationMs },
      bpm: DEFAULTS.bpm,
      rhythm,
      nextSequence: sequenceProvider(sequenceType, language),
    })

    const onKeyDown = (event: KeyboardEvent) => {
      // El espacio scrollea la página y las flechas mueven el foco. Los dos molestan.
      if (event.key === ' ' || event.key.startsWith('Arrow')) event.preventDefault()
      loop.handleKey(event.key)
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      loop.stop()
    }
  }, [sequenceType, language, rhythmMode, speed])

  return (
    <>
      <canvas ref={ref} className="block h-screen w-screen" />
      <Overlays />
    </>
  )
}
