import { PROGRESSION, SCORING, TIMING } from './constants'
import { normalizeKey, type Step } from './sequence'

export type Judgement = 'perfect' | 'great' | 'good' | 'bad' | 'miss'

/**
 * Qué hace cada escalón con el estado.
 *
 * `bad` es el escalón interesante: **sumás puntos y no perdés vida, pero se te
 * corta el combo y no cuenta para la progresión.** Sin eso sería un `good`
 * flojo y no tendría razón de existir; con eso, es el aviso de que estás al
 * borde antes de empezar a perder vidas.
 */
const RULES: Record<Judgement, { score: number; keepsCombo: boolean; counts: boolean; costsLife: boolean }> = {
  perfect: { score: SCORING.perfect, keepsCombo: true, counts: true, costsLife: false },
  great: { score: SCORING.great, keepsCombo: true, counts: true, costsLife: false },
  good: { score: SCORING.good, keepsCombo: true, counts: true, costsLife: false },
  bad: { score: SCORING.bad, keepsCombo: false, counts: false, costsLife: false },
  miss: { score: 0, keepsCombo: false, counts: false, costsLife: true },
}

/**
 * Por qué se perdió la ronda. Los tres se sienten igual jugando —"me fue mal"—
 * pero se arreglan con números distintos, así que hay que poder distinguirlos.
 */
export type MissReason =
  /** Se acabó la barra sin que apretaras espacio. */
  | 'timeout'
  /** Apretaste espacio con la secuencia sin terminar. */
  | 'incomplete'
  /** Secuencia completa, pero fuera de la ventana. */
  | 'window'

/** Centro de la ventana PERFECT. La referencia contra la que se mide el desvío. */
export const PERFECT_CENTER = (TIMING.perfectStart + TIMING.perfectEnd) / 2

/**
 * Medición de la partida. Existe para calibrar: sin esto, "se siente raro" no
 * se puede convertir en "movele 200ms a la duración de ronda".
 */
export type Stats = {
  perfect: number
  great: number
  good: number
  bad: number
  missTimeout: number
  missIncomplete: number
  missWindow: number
  /**
   * Suma de desvíos respecto del centro de PERFECT, en milisegundos.
   * Negativo = apretás antes de tiempo. Solo cuenta rondas con la secuencia
   * completa: las demás no dicen nada sobre tu timing.
   */
  offsetSumMs: number
  offsetCount: number
}

const NO_STATS: Stats = {
  perfect: 0,
  great: 0,
  good: 0,
  bad: 0,
  missTimeout: 0,
  missIncomplete: 0,
  missWindow: 0,
  offsetSumMs: 0,
  offsetCount: 0,
}

/** Desvío promedio en ms. `null` si nunca se completó una secuencia. */
export function meanOffsetMs(stats: Stats): number | null {
  return stats.offsetCount === 0 ? null : stats.offsetSumMs / stats.offsetCount
}

export function totalRounds(stats: Stats): number {
  return (
    stats.perfect +
    stats.great +
    stats.good +
    stats.bad +
    stats.missTimeout +
    stats.missIncomplete +
    stats.missWindow
  )
}

export function totalMisses(stats: Stats): number {
  return stats.missTimeout + stats.missIncomplete + stats.missWindow
}

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
  /**
   * Vidas iniciales, o `null` si el modo no tiene vidas.
   *
   * En canción **no hay vidas**: la partida dura lo que dura la canción y punto.
   * Cortarla antes por fallar sería sacar al jugador de la canción a la mitad,
   * que es justo lo contrario de lo que hace un juego de ritmo.
   */
  lives: number | null
  /** Cuánto dura la partida. `null` = hasta quedarse sin vidas (arcade). */
  durationMs: number | null
  /**
   * Cuánto se espera entre que se resuelve una ronda y arranca la siguiente.
   * Lo pone la fuente del ritmo: con un beatmap es cero, porque el hueco lo da
   * la grilla del beat.
   */
  interRoundPauseMs: number
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
  /** Cuándo arrancó la primera ronda. `null` hasta que arranca. */
  readonly sessionStartMs: number | null
  readonly stats: Stats
}

export function levelFor(hits: number): number {
  return 1 + Math.floor(hits / PROGRESSION.hitsPerLevel)
}

export function multiplierFor(combo: number): number {
  return 1 + Math.floor(combo / SCORING.comboStep)
}

/** Se prueba de la ventana más chica a la más grande: están anidadas. */
export function judge(progress: number): Judgement {
  if (progress >= TIMING.perfectStart && progress <= TIMING.perfectEnd) return 'perfect'
  if (progress >= TIMING.greatStart && progress <= TIMING.greatEnd) return 'great'
  if (progress >= TIMING.goodStart && progress <= TIMING.goodEnd) return 'good'
  if (progress >= TIMING.badStart && progress <= TIMING.badEnd) return 'bad'
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
    lives: config.lives ?? 0,
    hits: 0,
    level: 1,
    sequence: [],
    index: 0,
    roundStartMs: 0,
    roundDurationMs: 0,
    resolvedAtMs: 0,
    lastJudgement: null,
    sessionStartMs: null,
    stats: NO_STATS,
  }
}

/**
 * Arranca una ronda.
 *
 * La secuencia **y la duración** llegan como dato. El motor no sabe si son
 * flechas o una palabra, ni si el ritmo acelera o es fijo. Ahí viven los dos
 * ejes ortogonales: eje 1 arma la secuencia, eje 2 dice cuánto dura.
 */
export function startRound(
  state: GameState,
  sequence: readonly Step[],
  durationMs: number,
  nowMs: number,
): GameState {
  if (state.status !== 'idle') return state
  return {
    ...state,
    status: 'round',
    sequence,
    index: 0,
    roundStartMs: nowMs,
    roundDurationMs: durationMs,
    // El reloj de la partida arranca con la primera ronda, no al crear el juego:
    // entre crear y arrancar puede pasar cualquier cosa (menú, permiso de audio).
    sessionStartMs: state.sessionStartMs ?? nowMs,
  }
}

/** Milisegundos que quedan de partida. `null` si la partida no termina por tiempo. */
export function remainingMs(state: GameState, nowMs: number): number | null {
  const total = state.config.durationMs
  if (total === null || state.sessionStartMs === null) return total === null ? null : total
  return Math.max(0, total - (nowMs - state.sessionStartMs))
}

/**
 * `progress` va solo cuando la secuencia estaba completa: es la única ronda que
 * dice algo sobre el timing del jugador. Si no terminó de tipear, el momento en
 * que apretó no mide su precisión, mide su velocidad de dedos.
 */
function resolve(
  state: GameState,
  judgement: Judgement,
  nowMs: number,
  detail: { reason?: MissReason; progress?: number } = {},
): GameState {
  // El multiplicador usa el combo ANTES de sumar el acierto de esta ronda.
  const mult = multiplierFor(state.combo)
  const rule = RULES[judgement]
  const combo = rule.keepsCombo ? state.combo + 1 : 0
  const hits = rule.counts ? state.hits + 1 : state.hits
  const hasLives = state.config.lives !== null
  const lives = rule.costsLife && hasLives ? state.lives - 1 : state.lives
  const gained = rule.score

  return {
    ...state,
    status: hasLives && lives <= 0 ? 'over' : 'resolved',
    score: state.score + gained * mult,
    combo,
    maxCombo: Math.max(state.maxCombo, combo),
    hits,
    lives,
    level: levelFor(hits),
    resolvedAtMs: nowMs,
    lastJudgement: judgement,
    stats: countRound(state.stats, judgement, detail, state.roundDurationMs),
  }
}

function countRound(
  stats: Stats,
  judgement: Judgement,
  detail: { reason?: MissReason; progress?: number },
  roundDurationMs: number,
): Stats {
  const next: Stats = { ...stats }

  if (judgement === 'perfect') next.perfect++
  else if (judgement === 'great') next.great++
  else if (judgement === 'good') next.good++
  else if (judgement === 'bad') next.bad++
  else if (detail.reason === 'incomplete') next.missIncomplete++
  else if (detail.reason === 'window') next.missWindow++
  else next.missTimeout++

  if (detail.progress !== undefined) {
    next.offsetSumMs += (detail.progress - PERFECT_CENTER) * roundDurationMs
    next.offsetCount++
  }

  return next
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

  if (state.index < state.sequence.length) {
    return { state: resolve(state, 'miss', nowMs, { reason: 'incomplete' }), judgement: 'miss' }
  }

  const progress = progressAt(state, nowMs)
  const judgement = judge(progress)

  return {
    state: resolve(state, judgement, nowMs, {
      reason: judgement === 'miss' ? 'window' : undefined,
      progress,
    }),
    judgement,
  }
}

/**
 * Avance del tiempo. Cubre lo que no dispara el jugador: que se acabe la ronda
 * y que se cumpla la pausa entre rondas.
 *
 * Devuelve el mismo objeto cuando no hay cambios.
 */
export function tick(state: GameState, nowMs: number): GameState {
  // El tiempo de partida manda sobre todo lo demás: si la canción terminó,
  // terminó, aunque haya una ronda a mitad de camino.
  if (state.status !== 'over' && remainingMs(state, nowMs) === 0) {
    return { ...state, status: 'over' }
  }
  if (state.status === 'round' && progressAt(state, nowMs) >= 1) {
    return resolve(state, 'miss', nowMs, { reason: 'timeout' })
  }
  if (state.status === 'resolved' && nowMs - state.resolvedAtMs >= state.config.interRoundPauseMs) {
    return { ...state, status: 'idle' }
  }
  return state
}
