import { PROGRESSION, SCORING, TIMING } from './constants'
import { normalizeKey, type Step } from './sequence'

export type Judgement = 'perfect' | 'great' | 'good' | 'bad' | 'miss'

/**
 * Qué hace cada escalón con el estado.
 *
 * `bad` es el escalón interesante: **sumás puntos y no perdés vida, pero se te
 * corta el combo.** Sin eso sería un `good` flojo y no tendría razón de
 * existir; con eso, es el aviso de que estás al borde antes de empezar a
 * perder vidas.
 *
 * La progresión no figura aquí: avanza con **toda** ronda jugada, se gane o no.
 */
const RULES: Record<Judgement, { score: number; keepsCombo: boolean; costsLife: boolean }> = {
  perfect: { score: SCORING.perfect, keepsCombo: true, costsLife: false },
  great: { score: SCORING.great, keepsCombo: true, costsLife: false },
  good: { score: SCORING.good, keepsCombo: true, costsLife: false },
  bad: { score: SCORING.bad, keepsCombo: false, costsLife: false },
  miss: { score: 0, keepsCombo: false, costsLife: true },
}

/**
 * Por qué se perdió la ronda. Los tres se sienten igual jugando —"me fue mal"—
 * pero se arreglan con números distintos, así que hay que poder distinguirlos.
 */
export type MissReason =
  /** Se acabó la barra sin que presionaras espacio. */
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
   * Negativo = presionas antes de tiempo. Solo cuenta rondas con la secuencia
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
 * - `preview`  se ve la secuencia que viene y el marcador corre, pero **no se
 *              acepta input**: es la espera después de un fallo o de una pausa
 * - `round`    el marcador corre y se acepta input
 * - `resolved` ya se juzgó, corriendo la pausa entre rondas
 * - `over`     sin vidas
 */
export type Status = 'idle' | 'preview' | 'round' | 'resolved' | 'over'

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
   * Antes de este instante no arranca ninguna ronda. Es lo que sostiene la
   * cuenta regresiva mientras la canción ya está sonando.
   */
  startsAtMs: number
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
  /**
   * Rondas jugadas, se hayan ganado o no. Es lo que mueve la progresión: la
   * dificultad avanza con el tiempo de juego, no con el acierto.
   */
  readonly rounds: number
  readonly level: number
  readonly sequence: readonly Step[]
  /** Cuántos pasos correctos lleva tipeados el jugador. */
  readonly index: number
  readonly roundStartMs: number
  readonly roundDurationMs: number
  readonly resolvedAtMs: number
  /**
   * Lo antes que puede arrancar la próxima ronda.
   *
   * Un `miss` suma una ronda entera de espera: si no, insistir con espacio después
   * de fallar encadena fallos, y el jugador se come tres vidas sin haber tenido
   * ninguna chance de reaccionar.
   */
  readonly resumeAtMs: number
  readonly lastJudgement: Judgement | null
  /** Cuándo arrancó la primera ronda. `null` hasta que arranca. */
  readonly sessionStartMs: number | null
  readonly stats: Stats
}

export function levelFor(rounds: number): number {
  return 1 + Math.floor(rounds / PROGRESSION.roundsPerLevel)
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
    rounds: 0,
    level: 1,
    sequence: [],
    index: 0,
    roundStartMs: 0,
    roundDurationMs: 0,
    resolvedAtMs: 0,
    resumeAtMs: config.startsAtMs,
    lastJudgement: null,
    sessionStartMs: null,
    stats: NO_STATS,
  }
}

/**
 * Deja lista la próxima secuencia.
 *
 * Se llama apenas se resuelve una ronda, para que el jugador vea lo que viene
 * —apagado— durante todo el hueco. Cuando la ronda arranca, esa misma secuencia
 * se enciende: lo que se mostró es exactamente lo que se juega.
 *
 * La secuencia llega **como dato**: el motor no sabe si son flechas o una
 * palabra. Ahí vive el eje 1.
 */
export function armSequence(state: GameState, sequence: readonly Step[]): GameState {
  // Con una ronda en curso pisaría lo que el jugador está tocando; terminada la
  // partida no hay nada que anticipar.
  if (state.status === 'round' || state.status === 'preview' || state.status === 'over') {
    return state
  }
  return { ...state, sequence, index: 0 }
}

/**
 * Enciende la secuencia ya armada y arranca la ronda.
 *
 * La duración llega como dato: el motor no sabe si el ritmo acelera o es fijo.
 * Ahí vive el eje 2.
 */
export function startRound(state: GameState, durationMs: number, nowMs: number): GameState {
  if (state.status !== 'idle') return state
  return {
    ...state,
    status: 'round',
    index: 0,
    roundStartMs: nowMs,
    roundDurationMs: durationMs,
    // El reloj de la partida arranca con la primera ronda, no al crear el juego:
    // entre crear y arrancar puede pasar cualquier cosa (menú, permiso de audio).
    sessionStartMs: state.sessionStartMs ?? nowMs,
  }
}

/**
 * Descarta la ronda en curso sin puntuarla ni contarla.
 *
 * Se usa al volver de una pausa: la barra vuelve a empezar de cero. Retomarla a
 * mitad de camino sería injusto en los dos sentidos —el jugador perdió el
 * contexto visual, o se congeló justo antes de la zona—.
 */
export function abortRound(state: GameState, nowMs: number): GameState {
  if (state.status !== 'round' && state.status !== 'preview') return state
  // La secuencia armada se conserva: sigue siendo lo que viene, y borrarla
  // dejaría la pantalla vacía por un frame.
  return { ...state, status: 'idle', index: 0, resumeAtMs: nowMs }
}

/**
 * Arranca una ronda de **anticipo**: se ve la secuencia que viene y el marcador
 * corre, pero no se acepta input.
 *
 * Es la espera después de un fallo y al volver de una pausa. Un hueco muerto
 * deja al jugador sin saber cuándo vuelve a jugar; con el anticipo ve la
 * secuencia de antemano y ve la barra corriendo, así que sabe exactamente
 * cuándo tiene que empezar a tipear.
 */
export function startPreview(
  state: GameState,
  durationMs: number,
  startAtMs: number,
): GameState {
  if (state.status !== 'idle') return state
  return {
    ...state,
    status: 'preview',
    index: 0,
    roundStartMs: startAtMs,
    roundDurationMs: durationMs,
    sessionStartMs: state.sessionStartMs ?? startAtMs,
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
  // Toda ronda cuenta para la progresión, se haya ganado o no.
  const rounds = state.rounds + 1
  const hasLives = state.config.lives !== null
  const lives = rule.costsLife && hasLives ? state.lives - 1 : state.lives
  const gained = rule.score

  return {
    ...state,
    status: hasLives && lives <= 0 ? 'over' : 'resolved',
    score: state.score + gained * mult,
    combo,
    maxCombo: Math.max(state.maxCombo, combo),
    rounds,
    lives,
    level: levelFor(rounds),
    resolvedAtMs: nowMs,
    // Fallar no suma espera aquí: la espera es la ronda de anticipo que arma el
    // loop, y que además le muestra al jugador lo que viene.
    resumeAtMs: nowMs + state.config.interRoundPauseMs,
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
  // El anticipo se convierte solo en la ronda de verdad, y arranca justo donde
  // terminó: así la promesa que se le mostró al jugador se cumple sobre el beat.
  if (state.status === 'preview' && progressAt(state, nowMs) >= 1) {
    return {
      ...state,
      status: 'round',
      index: 0,
      roundStartMs: state.roundStartMs + state.roundDurationMs,
    }
  }

  if (state.status === 'round' && progressAt(state, nowMs) >= 1) {
    return resolve(state, 'miss', nowMs, { reason: 'timeout' })
  }
  if (state.status === 'resolved' && nowMs >= state.resumeAtMs) {
    return { ...state, status: 'idle' }
  }
  return state
}
