import { describe, expect, it } from 'vitest'

import { modeKey, newEntryAt, type ScoreEntry } from './client'

describe('modeKey', () => {
  it('separa arcade de canción', () => {
    // Un puntaje de arcade infinito no puede competir contra uno de dos
    // minutos: si comparten tabla, arcade la gana siempre y el top 5 no sirve.
    expect(modeKey('arrows', 'es', 'arcade', 'normal')).not.toBe(
      modeKey('arrows', 'es', 'song', 'normal'),
    )
  })

  it('separa por velocidad, que cambia la dificultad', () => {
    expect(modeKey('arrows', 'es', 'song', 'calma')).not.toBe(
      modeKey('arrows', 'es', 'song', 'extremo'),
    )
  })

  it('separa por idioma: tipear en español y en inglés no cuesta igual', () => {
    expect(modeKey('words', 'es', 'arcade', 'normal')).not.toBe(
      modeKey('words', 'en', 'arcade', 'normal'),
    )
  })

  it('ignora la velocidad en arcade, donde no se elige', () => {
    expect(modeKey('arrows', 'es', 'arcade', 'calma')).toBe(
      modeKey('arrows', 'es', 'arcade', 'extremo'),
    )
  })

  it('ignora el idioma con flechas, donde no se usa', () => {
    expect(modeKey('arrows', 'es', 'arcade', 'normal')).toBe(
      modeKey('arrows', 'en', 'arcade', 'normal'),
    )
  })

  it('produce claves legibles', () => {
    expect(modeKey('arrows', 'es', 'arcade', 'normal')).toBe('arrows/arcade')
    expect(modeKey('words', 'en', 'song', 'rapido')).toBe('words-en/song-rapido')
  })
})

describe('newEntryAt', () => {
  const entry = (at: number, score: number): ScoreEntry => ({
    name: 'X',
    score,
    maxCombo: 0,
    mode: 'arrows/arcade',
    at,
  })

  it('encuentra la entrada recién guardada', () => {
    const antes = [entry(10, 500), entry(20, 300)]
    const despues = [entry(10, 500), entry(99, 400), entry(20, 300)]

    expect(newEntryAt(antes, despues)).toBe(99)
  })

  it('devuelve null cuando el puntaje no entró al top', () => {
    // No es un error: es la respuesta que hay que mostrarle al jugador.
    const tabla = [entry(10, 500), entry(20, 300)]
    expect(newEntryAt(tabla, tabla)).toBeNull()
  })

  it('estrena una tabla vacía', () => {
    expect(newEntryAt([], [entry(7, 100)])).toBe(7)
  })

  it('no se confunde con dos entradas del mismo nombre y puntaje', () => {
    // La identidad es el `at`, que lo pone el backend. Comparar por nombre y
    // puntaje marcaría la vieja cuando alguien repite exactamente su marca.
    const antes = [entry(10, 500)]
    const despues = [entry(10, 500), entry(11, 500)]

    expect(newEntryAt(antes, despues)).toBe(11)
  })
})
