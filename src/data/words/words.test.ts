import { describe, expect, it } from 'vitest'

import { normalizeKey } from '../../game/sequence'
import { WORDS_EN } from './en'
import { WORDS_ES } from './es'

/**
 * Las listas son datos escritos a mano, así que la validación va acá y no en la
 * cabeza de quien las edita. Una sola palabra con Ñ o con tilde deja al jugador
 * comiéndose una ronda sin entender por qué: `normalizeKey` no la produce nunca
 * y la secuencia no puede avanzar.
 */
const LISTS = [
  ['es', WORDS_ES],
  ['en', WORDS_EN],
] as const

describe.each(LISTS)('palabras %s', (_lang, words) => {
  it('tiene suficientes para no repetir a cada rato', () => {
    expect(words.length).toBeGreaterThanOrEqual(100)
  })

  it('usa solo A–Z en mayúscula, sin tildes ni Ñ', () => {
    const malas = words.filter((w) => !/^[A-Z]+$/.test(w))
    expect(malas).toEqual([])
  })

  it('mantiene todas entre 4 y 7 letras', () => {
    // La longitud no es palanca de dificultad: la única es la velocidad.
    const malas = words.filter((w) => w.length < 4 || w.length > 7)
    expect(malas).toEqual([])
  })

  it('no repite palabras', () => {
    expect(new Set(words).size).toBe(words.length)
  })

  it('es tipeable: cada letra sobrevive a normalizeKey', () => {
    const malas = words.filter((w) => [...w].some((c) => normalizeKey(c) !== c))
    expect(malas).toEqual([])
  })
})
