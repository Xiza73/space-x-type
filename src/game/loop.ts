import { startChiptune, stopChiptune } from '../audio/chiptune'
import { nowMs } from '../audio/context'
import { sfxBad, sfxGood, sfxGreat, sfxKey, sfxMiss, sfxPerfect, sfxWrong } from '../audio/sfx'
import {
  createGame,
  pressKey,
  pressSpace,
  startRound,
  tick,
  type GameConfig,
  type GameState,
  type Judgement,
} from './engine'
import { draw } from './render'
import type { RhythmSource } from './rhythm'
import type { Step } from './sequence'

export type Loop = {
  stop(): void
  handleKey(rawKey: string): void
}

export type LoopOptions = {
  canvas: HTMLCanvasElement
  config: GameConfig
  bpm: number
  /** **Eje 2**: cuánto dura la ronda y cuántas teclas tiene. */
  rhythm: RhythmSource
  /**
   * **Eje 1**: qué se tipea. El loop lo llama sin saber si devuelve flechas o
   * una palabra.
   */
  nextSequence: (length: number) => Step[]
}

/**
 * El loop del juego. Vive **fuera de React**: corre sobre `requestAnimationFrame`
 * y dibuja en canvas. React lo monta y lo desmonta, nada más.
 *
 * Es el único lugar donde los dos ejes se tocan, y se tocan sin conocerse: le
 * pide el largo al ritmo y se lo pasa a la secuencia.
 */
export function startGameLoop({ canvas, config, bpm, rhythm, nextSequence }: LoopOptions): Loop {
  let state = createGame(config)
  let raf = 0

  startChiptune(bpm)

  function frame(): void {
    // UN solo valor del reloj por frame. Llamar `nowMs()` dos veces en el mismo
    // frame te da dos tiempos distintos y bugs de timing imposibles de reproducir.
    const now = nowMs()

    const before = state
    state = tick(state, now)

    // `tick` solo resuelve por vencimiento de la ronda, y eso siempre es miss.
    if (state !== before && before.status === 'round' && state.status !== 'round') {
      sfxMiss()
    }
    if (state.status === 'over' && before.status !== 'over') {
      stopChiptune()
    }

    if (state.status === 'idle') {
      const length = rhythm.sequenceLength(state.hits)
      state = startRound(state, nextSequence(length), rhythm.roundDurationMs(state.hits), now)
    }

    draw(canvas, state, now)
    raf = requestAnimationFrame(frame)
  }

  raf = requestAnimationFrame(frame)

  function handleKey(rawKey: string): void {
    if (state.status === 'over') {
      if (rawKey === 'Enter') restart()
      return
    }

    if (rawKey === ' ') {
      const { state: next, judgement } = pressSpace(state, nowMs())
      state = next
      if (judgement !== null) playJudgement(judgement)
      return
    }

    const { state: next, result } = pressKey(state, rawKey)
    // El tono usa el índice ANTES de avanzar: la primera tecla suena la nota base.
    if (result === 'advance') sfxKey(state.index)
    if (result === 'reset') sfxWrong()
    state = next
  }

  function restart(): void {
    state = createGame(config)
    startChiptune(bpm)
  }

  return {
    stop(): void {
      cancelAnimationFrame(raf)
      stopChiptune()
    },
    handleKey,
  }
}

const JUDGEMENT_SFX: Record<Judgement, () => void> = {
  perfect: sfxPerfect,
  great: sfxGreat,
  good: sfxGood,
  bad: sfxBad,
  miss: sfxMiss,
}

function playJudgement(judgement: Judgement): void {
  JUDGEMENT_SFX[judgement]()
}

export type { GameState }
