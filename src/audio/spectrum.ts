/**
 * Lectura del espectro para el visualizador.
 *
 * Devuelve **una banda por barra**, no tres bandas gruesas. Esa es la
 * diferencia que hace que el visualizador se vea vivo: con tres bandas, todas
 * las barras de un mismo grupo suben y bajan juntas y el resultado es un
 * latido, no un espectro.
 */

import { getAnalyser } from './context'

/** Rango que se dibuja. Arriba de 12 kHz casi no queda energía musical. */
const MIN_HZ = 30
const MAX_HZ = 12_000

/** Se reusa entre frames: reservar 512 bytes 60 veces por segundo es basura. */
let raw: Uint8Array<ArrayBuffer> | null = null

/**
 * Llena `out` con el nivel de cada barra, de 0 a 1.
 *
 * El reparto de frecuencias es **logarítmico**, no lineal. Con reparto lineal
 * la mitad de las barras cae arriba de 5 kHz, donde no pasa nada, y todo el
 * bombo y la voz se aplastan en las dos primeras: se vería un pico a la
 * izquierda y una planicie muerta. El oído oye en octavas, así que las barras
 * también.
 *
 * Además se compensa la caída natural del espectro —la música tiene mucha más
 * energía en graves que en agudos—, o si no los agudos no se levantan nunca.
 */
export function readSpectrum(out: Float32Array): void {
  const analyser = getAnalyser()

  if (raw === null || raw.length !== analyser.frequencyBinCount) {
    raw = new Uint8Array(analyser.frequencyBinCount)
  }
  const data = raw
  analyser.getByteFrequencyData(data)

  const nyquist = analyser.context.sampleRate / 2
  const bars = out.length
  const ratio = Math.log(MAX_HZ / MIN_HZ)

  for (let i = 0; i < bars; i++) {
    const from = MIN_HZ * Math.exp((ratio * i) / bars)
    const to = MIN_HZ * Math.exp((ratio * (i + 1)) / bars)

    const first = Math.min(data.length - 1, Math.floor((from / nyquist) * data.length))
    const last = Math.min(data.length, Math.max(first + 1, Math.ceil((to / nyquist) * data.length)))

    let peak = 0
    for (let bin = first; bin < last; bin++) {
      if (data[bin] > peak) peak = data[bin]
    }

    // Pico y no promedio: un promedio sobre una banda ancha se come justamente
    // el ataque, que es lo que se quiere ver.
    out[i] = Math.min(1, (peak / 255) * tilt(i, bars))
  }
}

/**
 * Realce progresivo hacia los agudos. Al doble en la barra más alta.
 *
 * No es un adorno: sin esto el lado derecho del anillo queda plano en cualquier
 * canción, porque la energía musical cae con la frecuencia.
 */
function tilt(index: number, bars: number): number {
  return 1 + index / (bars - 1)
}
