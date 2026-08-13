/**
 * Constantes de calibración del juego.
 *
 * TODAS viven aquí. Un número mágico suelto en el código es la razón por la que
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
  greatStart: 0.755,
  greatEnd: 0.925,
  goodStart: 0.72,
  goodEnd: 0.96,
  badStart: 0.67,
  badEnd: 0.985,
} as const

/**
 * Las ventanas están **anidadas**: bad ⊃ good ⊃ great ⊃ perfect, todas
 * centradas en el mismo punto. `judge` prueba de la más chica a la más grande.
 *
 * PERFECT quedó donde estaba a propósito: ya está calibrada y no se toca al
 * agregar escalones. Lo que antes era GOOD se partió en GREAT y GOOD, y BAD
 * ganó terreno que antes era MISS.
 */
export const SCORING = {
  perfect: 150,
  great: 100,
  good: 60,
  bad: 20,
  /** El multiplicador sube de a 1 cada `comboStep` aciertos encadenados. */
  comboStep: 5,
} as const

/**
 * Progresión del modo **arcade**: la barra se acelera y la secuencia mantiene
 * el largo. Una sola palanca de dificultad, legible para el jugador.
 *
 * Atención: este modelo NO se traslada a canción. Ahí el tempo lo pone la canción y
 * la barra no puede acelerar, así que la dificultad sale del largo (ver `SONG`).
 */
export const PROGRESSION = {
  baseDurationMs: 4200,
  durationStepMs: 350,
  minDurationMs: 1500,
  /**
   * La progresión cuenta **rondas jugadas**, no aciertos: tres rondas suben un
   * escalón sean tres aciertos o dos aciertos y un fallo. Si contara aciertos,
   * al jugador que falla se le congela la dificultad justo cuando necesita que
   * la partida avance.
   */
  roundsPerLevel: 4,
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
  /** Cada cuántas **rondas jugadas** sube una tecla. Acierto o fallo, cuenta. */
  roundsPerKeyStep: 3,
  /** Cuánto dura la partida. Hace las veces de "largo de la canción". */
  durationMs: 120_000,
} as const

/**
 * Velocidades elegibles para el modo canción.
 *
 * Van los dos valores porque las dos fuentes de ritmo miden distinto y no se
 * pueden mezclar:
 *
 * - La canción **simulada** corre libre, así que se le da la duración en ms.
 * - La canción **real** tiene que caer en un número entero de beats o la barra
 *   se sale de la grilla, que es lo único que hace que un juego de ritmo sea un
 *   juego de ritmo. Por eso se elige en beats y la duración sale del tempo.
 *
 * Que la velocidad se elija en beats es lo que vuelve **predecible** al tempo:
 * con los beats fijos, `duración = beats · 60000 / bpm` es estrictamente
 * decreciente en el BPM. Más tempo, barra más rápida, siempre. Antes la
 * duración se elegía sola buscando un objetivo fijo y la relación tenía dos
 * saltos donde subir el tempo hacía la barra casi el doble de lenta.
 */
export const SPEED_PRESETS = [
  { id: 'calma', label: 'CALMA', roundDurationMs: 3400, beatsPerRound: 8 },
  { id: 'normal', label: 'NORMAL', roundDurationMs: 2600, beatsPerRound: 6 },
  { id: 'rapido', label: 'RÁPIDO', roundDurationMs: 1900, beatsPerRound: 4 },
  { id: 'extremo', label: 'EXTREMO', roundDurationMs: 1400, beatsPerRound: 2 },
] as const

/**
 * Duración de ronda de una canción real, dado el tempo y la velocidad elegida.
 *
 * Vive aquí y no en el ritmo porque la pantalla de la biblioteca la muestra
 * antes de jugar: el jugador tiene que poder ver a qué velocidad va a quedar la
 * canción **mientras** corrige el tempo, no descubrirlo jugando.
 */
export function beatRoundDurationMs(bpm: number, beatsPerRound: number): number {
  return Math.round((beatsPerRound * 60_000) / bpm)
}

export const ROUND = {
  arrowCount: 5,
  interRoundPauseMs: 700,
} as const

/** Cuenta regresiva al empezar y al volver de una pausa, en segundos. */
export const COUNTDOWN_SECONDS = 3

/**
 * Cuánto se tolera arrancar una ronda tarde respecto de su compás.
 *
 * El compás que devuelve el ritmo es el último **ya cumplido**, así que casi
 * siempre está a un frame de distancia. Pero si algo traba el hilo —una pausa
 * del recolector, una ventana que vuelve del fondo— ese compás puede quedar muy
 * atrás, y arrancar ahí daría una ronda que nace con la barra a mitad de camino.
 * Pasada la tolerancia se espera al siguiente, que es lo justo para el jugador.
 */
export const ROUND_START_TOLERANCE_MS = 100

/**
 * Teclas que confirman la secuencia.
 *
 * ESPACIO y ENTER valen las dos. En modo palabras las manos están sobre las
 * letras y estirarse hasta la barra rompe el tipeo; ENTER queda al lado del
 * meñique derecho. En flechas pasa lo mismo al revés.
 *
 * El input se lee de aquí, no con comparaciones de strings desparramadas: el día
 * que se puedan reasignar teclas, se cambia un solo lugar.
 */
export const CONFIRM_KEYS: readonly string[] = [' ', 'Enter']

export const DEFAULTS = {
  lives: 3,
  bpm: 132,
  speedScale: 1,
  speed: 'normal',
  /**
   * Canción, no arcade. Arcade fue el modo que validó la mecánica, pero el
   * juego que uno abre a jugar es el de la canción propia: arcade se elige a
   * propósito, canción es a lo que se entra.
   */
  rhythmMode: 'song',
} as const

/** Rangos válidos para la pantalla de configuración. */
export const LIMITS = {
  lives: { min: 1, max: 9, step: 1 },
  bpm: { min: 100, max: 170, step: 2 },
  speedScale: { min: 0.6, max: 1.6, step: 0.1 },
} as const
