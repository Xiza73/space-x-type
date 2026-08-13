import type { Beatmap } from '../library/client'
import { measureDurationMs, PROGRESSION, ROUND, SONG } from './constants'
import { levelFor } from './engine'

/**
 * **Eje 2: de dónde sale el ritmo.**
 *
 * Responde dos cosas dado el progreso: cuánto dura la ronda y cuántas teclas
 * tiene. Nada más. No sabe si se tipean flechas o palabras — eso es el eje 1.
 *
 * Antes esta lógica vivía adentro de `startRound`, o sea que el motor tenía
 * hardcodeada la fórmula de arcade. Se notó solo al aparecer el segundo modo.
 */
export type RhythmSource = {
  roundDurationMs(rounds: number): number
  sequenceLength(rounds: number): number
  /** Cuánto dura la partida. `null` = hasta quedarse sin vidas. */
  totalDurationMs: number | null
  /**
   * Pausa entre rondas. En canción real es **cero**: las rondas van pegadas a
   * la grilla del beat y el hueco lo pone la propia grilla.
   */
  interRoundPauseMs: number
  /**
   * En qué instante **debería haber arrancado** la ronda que corresponde a
   * `nowMs`: el último compás ya cumplido, no el próximo.
   *
   * Tiene que ser el último y no el próximo porque el loop compara contra el
   * reloj real: un frame cae en `t`, el siguiente en `t + 16`, y jamás en un
   * múltiplo exacto del compás. Devolviendo el próximo, la condición
   * `now >= slot` no se cumple nunca y el juego se queda esperando.
   */
  roundStartMs(nowMs: number): number
}

/**
 * Arcade: la barra acelera, el largo no se mueve, la partida no termina sola.
 * Una sola palanca de dificultad.
 */
export function arcadeRhythm(speedScale: number): RhythmSource {
  return {
    roundDurationMs: (rounds) => {
      const raw =
        (PROGRESSION.baseDurationMs - (levelFor(rounds) - 1) * PROGRESSION.durationStepMs) *
        speedScale
      return Math.max(PROGRESSION.minDurationMs, raw)
    },
    sequenceLength: () => ROUND.arrowCount,
    totalDurationMs: null,
    interRoundPauseMs: ROUND.interRoundPauseMs,
    roundStartMs: (nowMs) => nowMs,
  }
}

/**
 * Canción: velocidad fija —la elige el jugador, y en su momento la va a poner
 * el beatmap— y el largo de la secuencia como única palanca. La partida dura
 * un tiempo fijo, igual que duraría una canción.
 */
export function songRhythm(bpm: number): RhythmSource {
  const step = measureDurationMs(bpm)
  return {
    roundDurationMs: () => step,
    sequenceLength: keyCountFor,
    totalDurationMs: SONG.durationMs,
    interRoundPauseMs: ROUND.interRoundPauseMs,
    roundStartMs: (nowMs) => nowMs,
  }
}

/**
 * Canción real: el tempo, el largo y la grilla salen del beatmap.
 *
 * `audioStartMs` es cuándo arranca el audio **en el reloj del juego**, o sea en
 * la misma base de tiempo que `nowMs()`. Sin eso la grilla no significaría nada.
 *
 * La velocidad **no entra como parámetro**: la barra cruza un compás y punto.
 * El BPM es la única perilla, igual que en el original. Si alguna vez aparece
 * aquí un segundo argumento de velocidad, volvimos al problema.
 */
export function beatmapRhythm(beatmap: Beatmap, audioStartMs: number): RhythmSource {
  const gridStartMs = audioStartMs + beatmap.firstBeatMs
  const step = measureDurationMs(beatmap.bpm)

  return {
    roundDurationMs: () => step,
    sequenceLength: keyCountFor,
    totalDurationMs: beatmap.durationMs,
    // Cero: si se le sumara una pausa, la ronda siguiente se pasaría del
    // compás y el juego se saltearía uno de cada dos.
    interRoundPauseMs: 0,
    roundStartMs: (nowMs) => {
      // Antes del primer beat todavía no hay grilla: se devuelve su comienzo,
      // que al ser futuro deja la condición del loop en falso y hace esperar.
      if (nowMs < gridStartMs) return gridStartMs
      return gridStartMs + Math.floor((nowMs - gridStartMs) / step) * step
    },
  }
}

/**
 * Diente de sierra: sube de a una tecla hasta el techo y vuelve al piso.
 *
 * Volver al piso es a propósito: da respiro y hace que la curva se sienta como
 * una canción con estrofas y estribillo, no como una rampa que no termina más.
 */
export function keyCountFor(rounds: number): number {
  const span = SONG.maxKeys - SONG.minKeys + 1
  return SONG.minKeys + (Math.floor(rounds / SONG.roundsPerKeyStep) % span)
}
