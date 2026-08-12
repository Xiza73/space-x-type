import { startChiptune, stopChiptune } from '../audio/chiptune'
import { nowMs } from '../audio/context'
import { CONFIRM_KEYS, ROUND_START_TOLERANCE_MS } from './constants'
import { sfxBad, sfxGood, sfxGreat, sfxKey, sfxMiss, sfxPerfect, sfxWrong } from '../audio/sfx'
import {
  abortRound,
  createGame,
  pressKey,
  pressSpace,
  startPreview,
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
  /** Descarta la ronda en curso. Se usa al volver de una pausa. */
  abort(): void
}

export type LoopOptions = {
  canvas: HTMLCanvasElement
  /** La pausa entre rondas la aporta el ritmo, así que no viene acá. */
  config: Omit<GameConfig, 'interRoundPauseMs'>
  /** BPM del chiptune, o `null` cuando suena una canción de verdad. */
  bpm: number | null
  /** **Eje 2**: cuánto dura la ronda y cuántas teclas tiene. */
  rhythm: RhythmSource
  /**
   * **Eje 1**: qué se tipea. El loop lo llama sin saber si devuelve flechas o
   * una palabra.
   */
  nextSequence: (length: number) => Step[]
  /**
   * Se llama una sola vez, al terminar la partida. La pantalla de resultados
   * vive en React porque necesita un input de texto, y un input no va en canvas.
   */
  onGameOver: (state: GameState) => void
}

/**
 * El loop del juego. Vive **fuera de React**: corre sobre `requestAnimationFrame`
 * y dibuja en canvas. React lo monta y lo desmonta, nada más.
 *
 * Es el único lugar donde los dos ejes se tocan, y se tocan sin conocerse: le
 * pide el largo al ritmo y se lo pasa a la secuencia.
 */
export function startGameLoop({
  canvas,
  config,
  bpm,
  rhythm,
  nextSequence,
  onGameOver,
}: LoopOptions): Loop {
  const fullConfig: GameConfig = { ...config, interRoundPauseMs: rhythm.interRoundPauseMs }
  let state = createGame(fullConfig)
  let raf = 0
  // La partida puede terminar en `tick` (se acabó el tiempo) o en `pressSpace`
  // (se acabaron las vidas). Comparar el estado anterior contra el nuevo dentro
  // del frame se pierde el segundo caso, porque para cuando corre el frame el
  // estado ya venía en `over`. Una bandera cubre los dos caminos.
  let notified = false
  // Después de un fallo o de una pausa, la próxima ronda se muestra primero en
  // anticipo: se ve la secuencia y corre la barra, pero no se acepta input.
  let wantsPreview = false

  // Con una canción de verdad sonando, el chiptune sobra.
  if (bpm !== null) startChiptune(bpm)

  function frame(): void {
    // UN solo valor del reloj por frame. Llamar `nowMs()` dos veces en el mismo
    // frame te da dos tiempos distintos y bugs de timing imposibles de reproducir.
    const now = nowMs()

    const before = state
    state = tick(state, now)

    // `tick` solo resuelve por vencimiento de la ronda, y eso siempre es miss.
    if (state !== before && before.status === 'round' && state.status !== 'round') {
      afterJudgement('miss')
    }
    if (state.status === 'over' && !notified) {
      notified = true
      stopChiptune()
      onGameOver(state)
    }

    // `resumeAtMs` sostiene la cuenta regresiva del arranque y la pausa entre
    // rondas; la grilla decide el instante exacto.
    if (state.status === 'idle' && now >= state.resumeAtMs) {
      const startAt = rhythm.roundStartMs(now)
      // Tres condiciones, y las tres hacen falta:
      // - `now >= startAt`: el compás ya llegó.
      // - `startAt > state.roundStartMs`: no repetir el mismo compás, que si no
      //   se dispararía una ronda por frame.
      // - dentro de la tolerancia: un compás que quedó muy atrás —por la espera
      //   que suma un fallo— daría una ronda que nace por la mitad.
      const late = now - startAt
      if (now >= startAt && startAt > state.roundStartMs && late <= ROUND_START_TOLERANCE_MS) {
        const sequence = nextSequence(rhythm.sequenceLength(state.rounds))
        const duration = rhythm.roundDurationMs(state.rounds)

        // Arranca en `startAt`, no en `now`: el frame puede haber llegado unos
        // milisegundos tarde y con un beatmap eso se acumula.
        if (wantsPreview) {
          wantsPreview = false
          state = startPreview(state, sequence, duration, startAt)
        } else {
          state = startRound(state, sequence, duration, startAt)
        }
      }
    }

    draw(canvas, state, now)
    raf = requestAnimationFrame(frame)
  }

  raf = requestAnimationFrame(frame)

  function handleKey(rawKey: string): void {
    // Terminada la partida manda la pantalla de resultados, que es React.
    if (state.status === 'over') return

    if (CONFIRM_KEYS.includes(rawKey)) {
      const { state: next, judgement } = pressSpace(state, nowMs())
      state = next
      afterJudgement(judgement)
      return
    }

    const { state: next, result } = pressKey(state, rawKey)
    // El tono usa el índice ANTES de avanzar: la primera tecla suena la nota base.
    if (result === 'advance') sfxKey(state.index)
    if (result === 'reset') sfxWrong()
    state = next
  }

  /** Suena el veredicto y, si fue fallo, deja pedido el anticipo. */
  function afterJudgement(judgement: Judgement | null): void {
    if (judgement === null) return
    JUDGEMENT_SFX[judgement]()
    if (judgement === 'miss') wantsPreview = true
  }

  return {
    stop(): void {
      cancelAnimationFrame(raf)
      stopChiptune()
    },
    handleKey,
    abort(): void {
      state = abortRound(state, nowMs())
      // Volver de una pausa se siente igual que volver de un fallo: primero se
      // ve lo que viene y después se juega.
      wantsPreview = true
    },
  }
}

const JUDGEMENT_SFX: Record<Judgement, () => void> = {
  perfect: sfxPerfect,
  great: sfxGreat,
  good: sfxGood,
  bad: sfxBad,
  miss: sfxMiss,
}

export type { GameState }
