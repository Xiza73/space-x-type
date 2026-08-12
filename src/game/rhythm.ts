import type { Beatmap } from '../library/client'
import { PROGRESSION, ROUND, SONG } from './constants'
import { levelFor } from './engine'

/**
 * **Eje 2: de dónde sale el ritmo.**
 *
 * Responde dos cosas dado el progreso: cuánto dura la ronda y cuántas teclas
 * tiene. Nada más. No sabe si se tipean flechas o palabras — eso es el eje 1.
 *
 * Antes esta lógica vivía adentro de `startRound`, o sea que el motor tenía
 * hardcodeada la fórmula de arcade. Se notó recién al aparecer el segundo modo.
 */
export type RhythmSource = {
  roundDurationMs(hits: number): number
  sequenceLength(hits: number): number
  /** Cuánto dura la partida. `null` = hasta quedarse sin vidas. */
  totalDurationMs: number | null
  /**
   * Pausa entre rondas. En canción real es **cero**: las rondas van pegadas a
   * la grilla del beat y el hueco lo pone la propia grilla.
   */
  interRoundPauseMs: number
  /**
   * Cuándo puede arrancar la próxima ronda. Los modos sin grilla contestan
   * "ya"; el beatmap contesta el próximo múltiplo del compás.
   */
  roundStartMs(nowMs: number): number
}

/**
 * Arcade: la barra acelera, el largo no se mueve, la partida no termina sola.
 * Una sola palanca de dificultad.
 */
export function arcadeRhythm(speedScale: number): RhythmSource {
  return {
    roundDurationMs: (hits) => {
      const raw =
        (PROGRESSION.baseDurationMs - (levelFor(hits) - 1) * PROGRESSION.durationStepMs) *
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
export function songRhythm(roundDurationMs: number): RhythmSource {
  return {
    roundDurationMs: () => roundDurationMs,
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
 */
export function beatmapRhythm(beatmap: Beatmap, audioStartMs: number): RhythmSource {
  const gridStartMs = audioStartMs + beatmap.firstBeatMs
  const step = beatmap.roundDurationMs

  return {
    roundDurationMs: () => step,
    sequenceLength: keyCountFor,
    totalDurationMs: beatmap.durationMs,
    // Cero: si se le sumara una pausa, la ronda siguiente se pasaría del
    // compás y el juego se saltearía uno de cada dos.
    interRoundPauseMs: 0,
    roundStartMs: (nowMs) => {
      if (nowMs <= gridStartMs) return gridStartMs
      const elapsed = nowMs - gridStartMs
      return gridStartMs + Math.ceil(elapsed / step) * step
    },
  }
}

/**
 * Diente de sierra: sube de a una tecla hasta el techo y vuelve al piso.
 *
 * Volver al piso es a propósito: da respiro y hace que la curva se sienta como
 * una canción con estrofas y estribillo, no como una rampa que no termina más.
 */
export function keyCountFor(hits: number): number {
  const span = SONG.maxKeys - SONG.minKeys + 1
  return SONG.minKeys + (Math.floor(hits / SONG.hitsPerKeyStep) % span)
}
