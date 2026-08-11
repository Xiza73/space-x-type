import { describe, expect, it } from 'vitest'

import { ROUND } from './constants'
import { ARROWS, makeArrowSequence, normalizeKey } from './sequence'

/** Reloj de azar falso: devuelve los valores dados, en orden. */
function fakeRandom(values: readonly number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]
}

describe('normalizeKey', () => {
  it('deja pasar las cuatro flechas tal cual', () => {
    for (const arrow of ARROWS) {
      expect(normalizeKey(arrow.key)).toBe(arrow.key)
    }
  })

  it('normaliza letras a mayúscula', () => {
    expect(normalizeKey('a')).toBe('A')
    expect(normalizeKey('Z')).toBe('Z')
  })

  it('descarta lo que no participa del juego', () => {
    expect(normalizeKey('Shift')).toBeNull()
    expect(normalizeKey(' ')).toBeNull()
    expect(normalizeKey('1')).toBeNull()
    expect(normalizeKey('ArrowInventada')).toBeNull()
  })
})

describe('flechas', () => {
  it('todas traen dirección, para dibujarse como vector y no como glifo', () => {
    // Sin esto, ← y → salen de una fuente distinta que ↑ y ↓: el subconjunto
    // latin de Bungee no las tiene.
    expect(ARROWS.map((a) => a.dir)).toEqual(['left', 'up', 'down', 'right'])
  })
})

describe('makeArrowSequence', () => {
  it('genera 5 flechas por defecto', () => {
    expect(makeArrowSequence()).toHaveLength(ROUND.arrowCount)
  })

  it('solo produce flechas conocidas', () => {
    const keys: ReadonlySet<string> = new Set(ARROWS.map((a) => a.key))
    for (const step of makeArrowSequence(50)) {
      expect(keys.has(step.key)).toBe(true)
    }
  })

  it('es determinista con un random inyectado', () => {
    const seq = makeArrowSequence(4, fakeRandom([0, 0.3, 0.6, 0.9]))

    expect(seq.map((s) => s.glyph)).toEqual(['←', '↑', '↓', '→'])
  })

  it('no se sale del rango si random devuelve 1', () => {
    const seq = makeArrowSequence(1, () => 1)

    expect(seq[0]).toBe(ARROWS[ARROWS.length - 1])
  })
})
