import { describe, expect, it } from 'vitest'

import { SONG } from '../../game/constants'
import { normalizeKey } from '../../game/sequence'
import { WORDS_EN } from './en'
import { WORDS_ES } from './es'

const LENGTHS = Array.from(
  { length: SONG.maxKeys - SONG.minKeys + 1 },
  (_, i) => SONG.minKeys + i,
)

/**
 * Las listas son datos escritos a mano, así que la validación va aquí y no en la
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

  it('mantiene todas dentro del rango de teclas del modo canción', () => {
    const malas = words.filter((w) => w.length < SONG.minKeys || w.length > SONG.maxKeys)
    expect(malas).toEqual([])
  })

  it.each(LENGTHS)('tiene suficientes palabras de %i letras', (length) => {
    // El largo ES la dificultad: si falta un escalón, el juego saltea un nivel
    // o repite la misma palabra una y otra vez.
    expect(words.filter((w) => w.length === length).length).toBeGreaterThanOrEqual(8)
  })

  it('no repite palabras', () => {
    expect(new Set(words).size).toBe(words.length)
  })

  it('es tipeable: cada letra sobrevive a normalizeKey', () => {
    const malas = words.filter((w) => [...w].some((c) => normalizeKey(c) !== c))
    expect(malas).toEqual([])
  })
})
