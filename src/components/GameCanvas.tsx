import { useEffect, useRef } from 'react'

import { DEFAULTS } from '../game/constants'
import { startGameLoop } from '../game/loop'
import { Overlays } from './Overlays'

export function GameCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (canvas === null) return

    const loop = startGameLoop(
      canvas,
      { lives: DEFAULTS.lives, speedScale: DEFAULTS.speedScale },
      DEFAULTS.bpm,
    )

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
  }, [])

  return (
    <>
      <canvas ref={ref} className="block h-screen w-screen" />
      <Overlays />
    </>
  )
}
