import { describe, expect, it } from 'vitest'

import { WORDS_EN } from '../data/words/en'
import { WORDS_ES } from '../data/words/es'
import { ROUND } from './constants'
import {
  ARROWS,
  makeArrowSequence,
  makeWordSequence,
  normalizeKey,
  sequenceProvider,
  NO_REPEAT_WINDOW,
  type Step,
} from './sequence'

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

describe('makeWordSequence', () => {
  const WORDS = ['SOL', 'RITMO', 'ESTRELLA'] as const
  const text = (steps: readonly { glyph: string }[]) => steps.map((s) => s.glyph).join('')

  it('parte la palabra letra por letra', () => {
    const seq = makeWordSequence(WORDS, 5, () => 0)

    expect(text(seq)).toBe('RITMO')
    expect(seq).toHaveLength(5)
  })

  it('elige por longitud: el largo ES la dificultad', () => {
    expect(text(makeWordSequence(WORDS, 3, () => 0))).toBe('SOL')
    expect(text(makeWordSequence(WORDS, 8, () => 0))).toBe('ESTRELLA')
  })

  it('cae a la longitud más cercana cuando no hay exacta', () => {
    // Un hueco en la lista no puede tumbar la partida.
    expect(text(makeWordSequence(WORDS, 4, () => 0))).toBe('SOL')
    expect(text(makeWordSequence(WORDS, 7, () => 0))).toBe('ESTRELLA')
  })

  it('usa la letra como tecla, que es lo que devuelve normalizeKey', () => {
    for (const step of makeWordSequence(WORDS, 5, () => 0)) {
      expect(step.key).toBe(normalizeKey(step.glyph))
    }
  })

  it('no marca dirección: las palabras se dibujan como texto, no como vector', () => {
    expect(makeWordSequence(WORDS, 5, () => 0).every((s) => s.dir === undefined)).toBe(true)
  })

  it('no se sale del rango si random devuelve 1', () => {
    expect(text(makeWordSequence(['UNO', 'DOS'], 3, () => 1))).toBe('DOS')
  })
})

describe('sequenceProvider', () => {
  it('respeta el largo pedido en los dos modos', () => {
    for (const length of [3, 5, 8]) {
      expect(sequenceProvider('arrows', 'es')(length)).toHaveLength(length)
      expect(sequenceProvider('words', 'es')(length)).toHaveLength(length)
      expect(sequenceProvider('words', 'en')(length)).toHaveLength(length)
    }
  })

  it('en modo flechas entrega flechas vectoriales', () => {
    const steps = sequenceProvider('arrows', 'es')(ROUND.arrowCount)

    expect(steps.every((s) => s.dir !== undefined)).toBe(true)
  })

  it('en modo palabras entrega una palabra del idioma elegido', () => {
    const es = sequenceProvider('words', 'es')(5)
    const en = sequenceProvider('words', 'en')(5)

    expect(WORDS_ES).toContain(es.map((s) => s.glyph).join(''))
    expect(WORDS_EN).toContain(en.map((s) => s.glyph).join(''))
  })

  it('entrega secuencias tipeables en los tres casos', () => {
    const providers = [
      sequenceProvider('arrows', 'es'),
      sequenceProvider('words', 'es'),
      sequenceProvider('words', 'en'),
    ]
    for (const next of providers) {
      for (const step of next(6)) {
        expect(normalizeKey(step.key)).toBe(step.key)
      }
    }
  })
})

describe('sin repeticiones cercanas', () => {
  /** Misma identidad que usa el módulo: las teclas, no los objetos. */
  const clave = (sequence: readonly Step[]) => sequence.map((s) => s.key).join('')

  it('no repite una secuencia dentro de una tanda de tres', () => {
    // Repetir dentro de una tanda corta se lee como que el juego se colgó o te
    // está regalando la ronda.
    // Tres flechas = 64 combinaciones: sin la protección, en 200 rondas
    // aparecen repeticiones cercanas casi con certeza.
    const next = sequenceProvider('arrows', 'es')
    const vistas: string[] = []

    for (let i = 0; i < 200; i++) {
      const actual = clave(next(3))
      expect(vistas.slice(-NO_REPEAT_WINDOW)).not.toContain(actual)
      vistas.push(actual)
    }
  })

  it('vuelve a permitir una secuencia pasada la ventana', () => {
    // La ventana es corta a propósito: cuando la curva vuelve a ese largo el
    // jugador ya no se acuerda, y recordar más achicaría el repertorio.
    const next = sequenceProvider('words', 'es')
    const vistas = Array.from({ length: 400 }, () => clave(next(3)))

    expect(new Set(vistas).size).toBeLessThan(vistas.length)
  })

  it('no se cuelga cuando el repertorio es más chico que la ventana', () => {
    // Con longitudes donde hay muy pocas palabras, insistir hasta encontrar una
    // distinta sería un bucle infinito. Un juego trabado es peor que una
    // repetición, así que reintenta un número acotado de veces y sigue.
    const next = sequenceProvider('words', 'en')
    for (let i = 0; i < 100; i++) {
      expect(next(8).length).toBe(8)
    }
  })
})
