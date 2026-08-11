import { getAudioContext, playTone } from './context'

/**
 * Cada tecla correcta suena más agudo que la anterior: da feedback de progreso
 * sin obligar al jugador a mirar la secuencia.
 */
export function keyToneFreq(index: number): number {
  return 440 * 1.12 ** index
}

export function sfxKey(index: number): void {
  playTone({ freq: keyToneFreq(index), durationSec: 0.09, gain: 0.08, wave: 'square' })
}

/** Tecla incorrecta. Grave y descendente: se lee como "no" sin ser un castigo. */
export function sfxWrong(): void {
  playTone({ freq: 130, durationSec: 0.22, gain: 0.12, wave: 'sawtooth', slideTo: 70 })
}

export function sfxPerfect(): void {
  arpeggio([660, 880, 1320], 0.16, 0.14)
}

export function sfxGood(): void {
  arpeggio([520, 780], 0.14, 0.12)
}

export function sfxMiss(): void {
  playTone({ freq: 220, durationSec: 0.35, gain: 0.14, wave: 'sawtooth', slideTo: 55 })
}

function arpeggio(freqs: readonly number[], durationSec: number, gain: number): void {
  const start = getAudioContext().currentTime
  freqs.forEach((freq, i) => {
    playTone({ freq, durationSec, gain, wave: 'triangle' }, start + i * 0.07)
  })
}
