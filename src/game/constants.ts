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
 * Progresión del modo **arcade**: la barra se acelera y la secuencia mantiene
 * el largo. Una sola palanca de dificultad, legible para el jugador.
 *
 * Ojo: este modelo NO se traslada a canción. Ahí el tempo lo pone la canción y
 * la barra no puede acelerar, así que la dificultad sale del largo (ver `SONG`).
 */
export const PROGRESSION = {
  baseDurationMs: 4200,
  durationStepMs: 350,
  minDurationMs: 1500,
  hitsPerLevel: 4,
} as const

/**
 * Progresión del modo **canción**: velocidad fija y el largo de la secuencia
 * sube de a uno hasta el techo, después vuelve al piso. Diente de sierra.
 *
 * Emula lo que va a hacer un beatmap real, sin necesitar el pipeline de audio.
 */
export const SONG = {
  minKeys: 3,
  maxKeys: 8,
  /** Cada cuántos aciertos sube una tecla. */
  hitsPerKeyStep: 3,
  /** Cuánto dura la partida. Hace las veces de "largo de la canción". */
  durationMs: 120_000,
} as const

/** Velocidades elegibles para el modo canción, en duración de ronda. */
export const SPEED_PRESETS = [
  { id: 'calma', label: 'CALMA', roundDurationMs: 3400 },
  { id: 'normal', label: 'NORMAL', roundDurationMs: 2600 },
  { id: 'rapido', label: 'RÁPIDO', roundDurationMs: 1900 },
  { id: 'extremo', label: 'EXTREMO', roundDurationMs: 1400 },
] as const

export const ROUND = {
  arrowCount: 5,
  interRoundPauseMs: 700,
} as const

export const DEFAULTS = {
  lives: 3,
  bpm: 132,
  speedScale: 1,
  speed: 'normal',
} as const

/** Rangos válidos para la pantalla de configuración. */
export const LIMITS = {
  lives: { min: 1, max: 9, step: 1 },
  bpm: { min: 100, max: 170, step: 2 },
  speedScale: { min: 0.6, max: 1.6, step: 0.1 },
} as const
