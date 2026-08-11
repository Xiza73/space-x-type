import { describe, expect, it } from 'vitest'

import { patternAt, STEPS_PER_BEAT } from './chiptune'

const BEAT_SEC = 60 / 132

/** Nunca dispara los adornos probabilísticos. */
const noOrnament = () => 0.9
/** Siempre dispara el adorno, y elige la primera nota de la escala. */
const firstOrnament = () => 0

const freqs = (step: number, random: () => number) =>
  patternAt(step, BEAT_SEC, random).map((v) => v.freq)

describe('patternAt', () => {
  it('pone bombo y bajo en la negra', () => {
    expect(freqs(0, noOrnament)).toEqual([150, 110])
  })

  it('pone hi-hat y bajo a contratiempo', () => {
    expect(freqs(2, noOrnament)).toEqual([6000, 110])
  })

  it('deja en silencio los pasos impares sin adorno', () => {
    expect(freqs(1, noOrnament)).toEqual([])
    expect(freqs(3, noOrnament)).toEqual([])
  })

  it('suma el adorno pentatónico solo en el paso 1 de cada negra', () => {
    // PENTA[0] = 220, y el adorno suena una octava arriba.
    expect(freqs(1, firstOrnament)).toEqual([440])
    // El paso 3 nunca lleva adorno, ni con el azar a favor.
    expect(freqs(3, firstOrnament)).toEqual([])
  })

  it('recorre el ciclo de 8 notas del bajo y vuelve al principio', () => {
    expect(freqs(0, noOrnament)).toContain(110)
    expect(freqs(4, noOrnament)).toContain(164.8)
    expect(freqs(6, noOrnament)).toContain(98)
    // 16 pasos = 8 notas de bajo: el ciclo cierra.
    expect(freqs(16, noOrnament)).toEqual(freqs(0, noOrnament))
  })

  it('escala la duración del bajo con el tempo', () => {
    const [, bass] = patternAt(0, BEAT_SEC, noOrnament)
    expect(bass.durationSec).toBeCloseTo((BEAT_SEC / 2) * 0.9)

    const [, fastBass] = patternAt(0, BEAT_SEC / 2, noOrnament)
    expect(fastBass.durationSec).toBeCloseTo(bass.durationSec / 2)
  })

  it('mantiene el patrón estable a lo largo de un compás', () => {
    const bar = Array.from({ length: STEPS_PER_BEAT * 4 }, (_, step) =>
      freqs(step, noOrnament).length,
    )
    // negra: bombo+bajo · silencio · hihat+bajo · silencio
    expect(bar).toEqual([2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0])
  })
})
