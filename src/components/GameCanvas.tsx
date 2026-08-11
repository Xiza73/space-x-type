import { useEffect, useRef } from 'react'

import { DEFAULTS } from '../game/constants'
import { startGameLoop } from '../game/loop'
import { sequenceProvider, type Language, type SequenceType } from '../game/sequence'
import { Overlays } from './Overlays'

type Props = {
  sequenceType: SequenceType
  language: Language
}

export function GameCanvas({ sequenceType, language }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (canvas === null) return

    const loop = startGameLoop({
      canvas,
      config: { lives: DEFAULTS.lives, speedScale: DEFAULTS.speedScale },
      bpm: DEFAULTS.bpm,
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
  }, [sequenceType, language])

  return (
    <>
      <canvas ref={ref} className="block h-screen w-screen" />
      <Overlays />
    </>
  )
}
