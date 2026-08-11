import { describe, expect, it } from 'vitest'

import { modeKey } from './client'

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
