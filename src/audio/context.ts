/**
 * Contexto de audio y **reloj maestro** del juego.
 *
 * Todo el timing del juego sale de `nowMs()`, que deriva de
 * `AudioContext.currentTime`. Nunca `Date.now()` ni `performance.now()`:
 * esos relojes derivan respecto del audio y desincronizan la partida.
 */

export type Tone = {
  freq: number
  durationSec: number
  gain: number
  wave: OscillatorType
  /** Rampa exponencial de frecuencia hasta este valor. Kicks y errores. */
  slideTo?: number
}

let context: AudioContext | null = null
let master: GainNode | null = null
let analyser: AnalyserNode | null = null

/**
 * El contexto se crea perezosamente: construirlo en el import haría que el
 * navegador lo abra suspendido antes de cualquier gesto del usuario, y que
 * los tests tengan que fingir Web Audio para poder importar este módulo.
 */
export function getAudioContext(): AudioContext {
  context ??= new AudioContext()
  return context
}

/**
 * Salida maestra. **Todo lo que suena se conecta aquí**, nunca a `destination`.
 *
 * El grafo es `fuentes → master → analyser → destination`. Ese punto único es
 * lo que permite que el fondo reaccione a lo que realmente se escucha, sin que
 * cada fuente tenga que enterarse de que existe un fondo: el chiptune, la
 * canción y los efectos siguen sin saber nada.
 */
export function masterOut(): GainNode {
  buildGraph()
  return master as GainNode
}

/**
 * El analizador del que lee el fondo reactivo.
 *
 * `smoothingTimeConstant` va bajo a propósito: el suavizado de verdad lo hace
 * el campo de luces, con ataque instantáneo y caída lenta. Suavizar aquí
 * además redondearía los golpes y las luces dejarían de marcar el ritmo, que
 * es justo lo único que tienen que hacer.
 */
export function getAnalyser(): AnalyserNode {
  buildGraph()
  return analyser as AnalyserNode
}

function buildGraph(): void {
  if (master !== null) return
  const ctx = getAudioContext()

  master = ctx.createGain()
  analyser = ctx.createAnalyser()
  // 512 bins sobre el espectro: ~43 Hz por bin a 44.1 kHz. Suficiente para
  // separar graves de agudos, y barato de leer una vez por frame.
  analyser.fftSize = 1024
  analyser.smoothingTimeConstant = 0.3

  master.connect(analyser).connect(ctx.destination)
}

/**
 * Los navegadores arrancan el contexto suspendido hasta que hay un gesto del
 * usuario. Llamar esto desde el handler que inicia la partida.
 *
 * Mientras está suspendido `currentTime` no avanza — o sea que el juego queda
 * pausado solo, que es justo lo que queremos.
 */
export async function resumeAudio(): Promise<void> {
  const ctx = getAudioContext()
  if (ctx.state === 'suspended') await ctx.resume()
}

/**
 * Congela el contexto, y con él `currentTime`.
 *
 * Como el reloj del juego SALE de `currentTime`, esto pausa la partida, la
 * canción y el chiptune de una sola vez y sin que nada se desincronice. Es un
 * regalo de haber elegido el reloj de audio desde el principio: con
 * `performance.now()` habría que llevar a mano un offset de pausa.
 */
export async function suspendAudio(): Promise<void> {
  const ctx = getAudioContext()
  if (ctx.state === 'running') await ctx.suspend()
}

/**
 * Reloj maestro, en **milisegundos**.
 *
 * `currentTime` viene en segundos; el motor del juego trabaja en ms. Esta es
 * la ÚNICA conversión entre las dos unidades en todo el proyecto. Si aparece
 * otro `* 1000` o `/ 1000` en código de timing, es un bug esperando.
 */
export function nowMs(): number {
  return getAudioContext().currentTime * 1000
}

/**
 * Agenda un tono. `atSec` va en segundos del reloj de audio (no en ms):
 * es la unidad que espera la Web Audio API y aquí estamos del lado del audio.
 *
 */
export function playTone(tone: Tone, atSec?: number): void {
  const ctx = getAudioContext()
  const at = atSec ?? ctx.currentTime

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = tone.wave
  osc.frequency.setValueAtTime(tone.freq, at)
  if (tone.slideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(tone.slideTo, at + tone.durationSec)
  }

  // Las rampas exponenciales no admiten 0 — de ahí el 0.001 en vez de apagar.
  gain.gain.setValueAtTime(tone.gain, at)
  gain.gain.exponentialRampToValueAtTime(0.001, at + tone.durationSec)

  osc.connect(gain).connect(masterOut())
  osc.start(at)
  osc.stop(at + tone.durationSec + 0.02)
}
