/**
 * Constantes de calibración del juego.
 *
 * TODAS viven acá. Un número mágico suelto en el código es la razón por la que
 * después nadie se anima a tocar la dificultad.
 *
 * Punto de partida: el prototipo de referencia. Se calibran jugando.
 */

/**
 * Ventanas de timing sobre el progreso de la ronda `p ∈ [0, 1]`.
 *
 * Conceptualmente PERFECT es `0.84 ± 0.045`, pero se expresa como límites
 * explícitos a propósito: `Math.abs(0.795 - 0.84) <= 0.045` da **false** en
 * punto flotante. Comparar contra límites hace que el borde sea exacto.
 */
export const TIMING = {
  perfectStart: 0.795,
  perfectEnd: 0.885,
  goodStart: 0.72,
  goodEnd: 0.96,
} as const

export const SCORING = {
  perfect: 150,
  good: 60,
  /** El multiplicador sube de a 1 cada `comboStep` aciertos encadenados. */
  comboStep: 5,
} as const

/**
 * La aceleración de la barra es el **único** mecanismo de dificultad.
 * No se toca la longitud de la secuencia ni las ventanas de timing:
 * una sola variable es legible para el jugador.
 */
export const PROGRESSION = {
  baseDurationMs: 4200,
  durationStepMs: 350,
  minDurationMs: 1500,
  hitsPerLevel: 4,
} as const

export const ROUND = {
  arrowCount: 5,
  interRoundPauseMs: 700,
} as const

export const DEFAULTS = {
  lives: 3,
  bpm: 132,
  speedScale: 1,
} as const

/** Rangos válidos para la pantalla de configuración. */
export const LIMITS = {
  lives: { min: 1, max: 9, step: 1 },
  bpm: { min: 100, max: 170, step: 2 },
  speedScale: { min: 0.6, max: 1.6, step: 0.1 },
} as const
