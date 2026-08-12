import { describe, expect, it } from 'vitest'

import type { Beatmap } from '../library/client'
import { PROGRESSION, ROUND, SONG } from './constants'
import { arcadeRhythm, beatmapRhythm, keyCountFor, songRhythm } from './rhythm'

describe('ritmo arcade', () => {
  const rhythm = arcadeRhythm(1)

  it('arranca en la duración base y acorta 350ms por nivel', () => {
    expect(rhythm.roundDurationMs(0)).toBe(PROGRESSION.baseDurationMs)
    expect(rhythm.roundDurationMs(PROGRESSION.hitsPerLevel)).toBe(
      PROGRESSION.baseDurationMs - PROGRESSION.durationStepMs,
    )
  })

  it('nunca baja del piso de 1500ms', () => {
    expect(rhythm.roundDurationMs(9999)).toBe(PROGRESSION.minDurationMs)
    expect(arcadeRhythm(0.1).roundDurationMs(0)).toBe(PROGRESSION.minDurationMs)
  })

  it('escala con speedScale', () => {
    expect(arcadeRhythm(1.5).roundDurationMs(0)).toBe(PROGRESSION.baseDurationMs * 1.5)
  })

  it('mantiene el largo de la secuencia: la única palanca es la velocidad', () => {
    expect(rhythm.sequenceLength(0)).toBe(ROUND.arrowCount)
    expect(rhythm.sequenceLength(500)).toBe(ROUND.arrowCount)
  })

  it('no termina por tiempo', () => {
    expect(rhythm.totalDurationMs).toBeNull()
  })
})

describe('ritmo canción', () => {
  const rhythm = songRhythm(2600)

  it('mantiene la velocidad fija: el tempo lo pone la canción', () => {
    expect(rhythm.roundDurationMs(0)).toBe(2600)
    expect(rhythm.roundDurationMs(500)).toBe(2600)
  })

  it('termina a los dos minutos', () => {
    expect(rhythm.totalDurationMs).toBe(SONG.durationMs)
  })

  it('mueve el largo de la secuencia, que es su única palanca', () => {
    expect(rhythm.sequenceLength(0)).toBe(SONG.minKeys)
    expect(rhythm.sequenceLength(SONG.hitsPerKeyStep)).toBe(SONG.minKeys + 1)
  })
})

describe('ritmo con beatmap', () => {
  const BEATMAP: Beatmap = {
    version: 1,
    bpm: 120,
    firstBeatMs: 250,
    durationMs: 180_000,
    beatsPerRound: 4,
    roundDurationMs: 2000,
  }
  const AUDIO_START = 10_000
  const GRID = AUDIO_START + BEATMAP.firstBeatMs

  const rhythm = beatmapRhythm(BEATMAP, AUDIO_START)

  it('toma tempo y largo del beatmap', () => {
    expect(rhythm.roundDurationMs(0)).toBe(BEATMAP.roundDurationMs)
    expect(rhythm.totalDurationMs).toBe(BEATMAP.durationMs)
  })

  it('no mete pausa entre rondas: el hueco lo da la grilla', () => {
    // Con pausa, la ronda siguiente se pasaría del compás y el juego se
    // saltearía uno de cada dos.
    expect(rhythm.interRoundPauseMs).toBe(0)
  })

  it('espera al primer beat antes de arrancar', () => {
    expect(rhythm.roundStartMs(AUDIO_START)).toBe(GRID)
    expect(rhythm.roundStartMs(GRID - 1)).toBe(GRID)
  })

  it('engancha cada ronda al compás siguiente', () => {
    expect(rhythm.roundStartMs(GRID)).toBe(GRID)
    // A mitad de la primera ronda, la próxima arranca al cerrar el compás.
    expect(rhythm.roundStartMs(GRID + 1)).toBe(GRID + 2000)
    expect(rhythm.roundStartMs(GRID + 1680)).toBe(GRID + 2000)
    expect(rhythm.roundStartMs(GRID + 2000)).toBe(GRID + 2000)
    expect(rhythm.roundStartMs(GRID + 2001)).toBe(GRID + 4000)
  })

  it('no acumula deriva por más rondas que pasen', () => {
    // El punto de engancharse a la grilla: la ronda 100 sigue sobre el beat.
    for (const round of [1, 10, 100, 1000]) {
      const inside = GRID + round * 2000 + 900
      expect(rhythm.roundStartMs(inside)).toBe(GRID + (round + 1) * 2000)
    }
  })

  it('mueve el largo de la secuencia igual que el modo simulado', () => {
    expect(rhythm.sequenceLength(0)).toBe(SONG.minKeys)
    expect(rhythm.sequenceLength(SONG.hitsPerKeyStep)).toBe(SONG.minKeys + 1)
  })
})

describe('keyCountFor', () => {
  it('arranca en el piso', () => {
    expect(keyCountFor(0)).toBe(SONG.minKeys)
    expect(keyCountFor(SONG.hitsPerKeyStep - 1)).toBe(SONG.minKeys)
  })

  it('sube de a una tecla', () => {
    expect(keyCountFor(SONG.hitsPerKeyStep)).toBe(SONG.minKeys + 1)
    expect(keyCountFor(SONG.hitsPerKeyStep * 2)).toBe(SONG.minKeys + 2)
  })

  it('llega al techo y vuelve al piso — diente de sierra', () => {
    const span = SONG.maxKeys - SONG.minKeys + 1
    expect(keyCountFor(SONG.hitsPerKeyStep * (span - 1))).toBe(SONG.maxKeys)
    expect(keyCountFor(SONG.hitsPerKeyStep * span)).toBe(SONG.minKeys)
  })

  it('nunca se sale del rango, por lejos que llegues', () => {
    for (let hits = 0; hits < 500; hits++) {
      const keys = keyCountFor(hits)
      expect(keys).toBeGreaterThanOrEqual(SONG.minKeys)
      expect(keys).toBeLessThanOrEqual(SONG.maxKeys)
    }
  })
})
