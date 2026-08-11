import { getAudioContext, playTone, type Tone } from './context'

/**
 * Música chiptune generada con osciladores. Cero assets, cero descargas.
 *
 * IMPORTANTE: en modo arcade la música y la barra **no están sincronizadas** a
 * propósito. La barra dura según el nivel, la música corre a BPM fijo. Coexisten
 * sin alinearse y el jugador sigue la barra, no el beat. No es un bug: si alguien
 * lo "arregla", la curva de dificultad desaparece.
 */

/** El patrón avanza en semicorcheas. */
export const STEPS_PER_BEAT = 4

const BASS = [110, 110, 164.8, 98, 110, 110, 130.8, 146.8] as const
const PENTA = [220, 261.6, 293.7, 329.6, 392, 440] as const

/**
 * Qué suena en un paso del patrón. Función pura: es la parte del chiptune que
 * tiene lógica, así que es la parte que se testea. Agendar en Web Audio no.
 *
 * `random` se inyecta porque los adornos son probabilísticos.
 */
export function patternAt(
  step: number,
  beatSec: number,
  random: () => number = Math.random,
): Tone[] {
  const voices: Tone[] = []

  // Bombo en cada negra.
  if (step % 4 === 0) {
    voices.push({ freq: 150, durationSec: 0.12, gain: 0.22, wave: 'sine', slideTo: 45 })
  }
  // Hi-hat a contratiempo.
  if (step % 4 === 2) {
    voices.push({ freq: 6000, durationSec: 0.04, gain: 0.03, wave: 'square' })
  }
  // Bajo en corcheas, ciclo de 8 notas.
  if (step % 2 === 0) {
    voices.push({
      freq: BASS[(step / 2) % BASS.length],
      durationSec: (beatSec / 2) * 0.9,
      gain: 0.09,
      wave: 'triangle',
    })
  }
  // Adorno pentatónico, la mitad de las veces.
  if (step % 4 === 1 && random() < 0.5) {
    const note = PENTA[Math.min(PENTA.length - 1, Math.floor(random() * PENTA.length))]
    voices.push({ freq: note * 2, durationSec: 0.1, gain: 0.035, wave: 'square' })
  }

  return voices
}

/** Cada cuánto despierta el scheduler. */
const TICK_MS = 25
/** Cuánto futuro agenda por vuelta. Tiene que superar holgadamente TICK_MS. */
const LOOKAHEAD_SEC = 0.12
/** Colchón inicial para que la primera vuelta no llegue tarde. */
const PRIMING_SEC = 0.1

let timer: ReturnType<typeof setInterval> | null = null

/**
 * Arranca la música.
 *
 * El patrón es **lookahead**: un `setInterval` grueso que agenda eventos en el
 * futuro contra `currentTime`. No se agenda con `setTimeout` directo — el timer
 * del navegador no tiene la precisión necesaria y además lo estrangulan cuando
 * la ventana pierde foco. Es el patrón estándar de Web Audio; no lo simplifiques.
 */
export function startChiptune(bpm: number, random: () => number = Math.random): void {
  stopChiptune()

  const ctx = getAudioContext()
  const beatSec = 60 / bpm
  const stepSec = beatSec / STEPS_PER_BEAT

  let step = 0
  let nextAtSec = ctx.currentTime + PRIMING_SEC

  timer = setInterval(() => {
    while (nextAtSec < ctx.currentTime + LOOKAHEAD_SEC) {
      for (const voice of patternAt(step, beatSec, random)) playTone(voice, nextAtSec)
      nextAtSec += stepSec
      step++
    }
  }, TICK_MS)
}

export function stopChiptune(): void {
  if (timer !== null) clearInterval(timer)
  timer = null
}
