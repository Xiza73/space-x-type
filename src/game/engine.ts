import { PROGRESSION, ROUND, SCORING, TIMING } from './constants'
import { normalizeKey, type Step } from './sequence'

export type Judgement = 'perfect' | 'good' | 'miss'

/** Qué pasó con una tecla. El motor no suena: el que llama decide qué reproducir. */
export type KeyResult = 'advance' | 'reset' | 'ignored'

/**
 * - `idle`     listo para arrancar la próxima ronda
 * - `round`    el marcador corre y se acepta input
 * - `resolved` ya se juzgó, corriendo la pausa entre rondas
 * - `over`     sin vidas
 */
export type Status = 'idle' | 'round' | 'resolved' | 'over'

export type GameConfig = {
  lives: number
  speedScale: number
}

export type GameState = {
  readonly config: GameConfig
  readonly status: Status
  readonly score: number
  readonly combo: number
  readonly maxCombo: number
  readonly lives: number
  readonly hits: number
  readonly level: number
  readonly sequence: readonly Step[]
  /** Cuántos pasos correctos lleva tipeados el jugador. */
  readonly index: number
  readonly roundStartMs: number
  readonly roundDurationMs: number
  readonly resolvedAtMs: number
  readonly lastJudgement: Judgement | null
}

export function levelFor(hits: number): number {
  return 1 + Math.floor(hits / PROGRESSION.hitsPerLevel)
}

export function roundDurationMs(level: number, speedScale: number): number {
  const raw = (PROGRESSION.baseDurationMs - (level - 1) * PROGRESSION.durationStepMs) * speedScale
  return Math.max(PROGRESSION.minDurationMs, raw)
}

export function multiplierFor(combo: number): number {
  return 1 + Math.floor(combo / SCORING.comboStep)
}

export function judge(progress: number): Judgement {
  if (progress >= TIMING.perfectStart && progress <= TIMING.perfectEnd) return 'perfect'
  if (progress >= TIMING.goodStart && progress <= TIMING.goodEnd) return 'good'
  return 'miss'
}

/**
 * Progreso de la ronda en curso.
 *
 * Se calcula **absoluto** contra el reloj, nunca acumulando deltas frame a
 * frame: ese error se suma y para el minuto tres el juego está corrido.
 *
 * Puede pasarse de 1 — el que dibuja es el que recorta.
 */
export function progressAt(state: GameState, nowMs: number): number {
  return (nowMs - state.roundStartMs) / state.roundDurationMs
}

export function createGame(config: GameConfig): GameState {
  return {
    config,
    status: 'idle',
    score: 0,
    combo: 0,
    maxCombo: 0,
    lives: config.lives,
    hits: 0,
    level: 1,
    sequence: [],
    index: 0,
    roundStartMs: 0,
    roundDurationMs: roundDurationMs(1, config.speedScale),
    resolvedAtMs: 0,
    lastJudgement: null,
  }
}

/**
 * Arranca una ronda con la secuencia dada.
 *
 * La secuencia llega **como dato**: el motor no sabe si son flechas o una
 * palabra, ni de dónde salió el ritmo. Ahí viven los dos ejes ortogonales.
 */
export function startRound(state: GameState, sequence: readonly Step[], nowMs: number): GameState {
  if (state.status !== 'idle') return state
  return {
    ...state,
    status: 'round',
    sequence,
    index: 0,
    roundStartMs: nowMs,
    roundDurationMs: roundDurationMs(state.level, state.config.speedScale),
  }
}

function resolve(state: GameState, judgement: Judgement, nowMs: number): GameState {
  // El multiplicador usa el combo ANTES de sumar el acierto de esta ronda.
  const mult = multiplierFor(state.combo)
  const hit = judgement !== 'miss'
  const combo = hit ? state.combo + 1 : 0
  const hits = hit ? state.hits + 1 : state.hits
  const lives = hit ? state.lives : state.lives - 1
  const gained = judgement === 'perfect' ? SCORING.perfect : judgement === 'good' ? SCORING.good : 0

  return {
    ...state,
    status: lives <= 0 ? 'over' : 'resolved',
    score: state.score + gained * mult,
    combo,
    maxCombo: Math.max(state.maxCombo, combo),
    hits,
    lives,
    level: levelFor(hits),
    resolvedAtMs: nowMs,
    lastJudgement: judgement,
  }
}

/**
 * Una tecla de secuencia.
 *
 * Tecla incorrecta reinicia la secuencia pero **no** saca vida: el castigo es
 * el tiempo perdido, que ya alcanza.
 */
export function pressKey(state: GameState, rawKey: string): { state: GameState; result: KeyResult } {
  if (state.status !== 'round') return { state, result: 'ignored' }

  const key = normalizeKey(rawKey)
  if (key === null) return { state, result: 'ignored' }

  // Secuencia completa: solo falta el espacio.
  if (state.index >= state.sequence.length) return { state, result: 'ignored' }

  if (key === state.sequence[state.index].key) {
    return { state: { ...state, index: state.index + 1 }, result: 'advance' }
  }
  return { state: { ...state, index: 0 }, result: 'reset' }
}

/** ESPACIO con la secuencia incompleta es `miss` directo. */
export function pressSpace(
  state: GameState,
  nowMs: number,
): { state: GameState; judgement: Judgement | null } {
  if (state.status !== 'round') return { state, judgement: null }

  const judgement =
    state.index < state.sequence.length ? 'miss' : judge(progressAt(state, nowMs))

  return { state: resolve(state, judgement, nowMs), judgement }
}

/**
 * Avance del tiempo. Cubre lo que no dispara el jugador: que se acabe la ronda
 * y que se cumpla la pausa entre rondas.
 *
 * Devuelve el mismo objeto cuando no hay cambios.
 */
export function tick(state: GameState, nowMs: number): GameState {
  if (state.status === 'round' && progressAt(state, nowMs) >= 1) {
    return resolve(state, 'miss', nowMs)
  }
  if (state.status === 'resolved' && nowMs - state.resolvedAtMs >= ROUND.interRoundPauseMs) {
    return { ...state, status: 'idle' }
  }
  return state
}
