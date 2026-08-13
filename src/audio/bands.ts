/**
 * Lectura del espectro en tres bandas, para el fondo reactivo.
 *
 * Tres y no treinta: el fondo tiene que comunicar "sonó algo, y de qué tipo",
 * no dibujar un ecualizador. Con tres bandas alcanza para que los graves, la
 * voz y los platillos prendan luces distintas, y se lee en una pasada.
 */

import { getAnalyser } from './context'

export type Bands = {
  /** Bombo y bajo. */
  bass: number
  /** Voz y armonía, donde vive casi toda la energía de una canción. */
  mid: number
  /** Platillos y ataques. Lo que hace que una luz "chispee". */
  treble: number
}

export const SILENT_BANDS: Bands = { bass: 0, mid: 0, treble: 0 }

/**
 * Cortes de banda en Hz. Los bordes son los de siempre en audio: 250 separa
 * graves de medios, 2 kHz medios de agudos.
 */
const EDGES_HZ = [20, 250, 2_000, 8_000] as const

/**
 * Se reusa entre frames: reservar 512 bytes 60 veces por segundo es basura.
 *
 * El parámetro de tipo no es adorno: `getByteFrequencyData` pide un buffer que
 * NO puede ser compartido, y un `Uint8Array` a secas admite `SharedArrayBuffer`.
 */
let spectrum: Uint8Array<ArrayBuffer> | null = null

/**
 * Energía por banda, normalizada a 0–1.
 *
 * Devuelve silencio si el contexto todavía no arrancó, así que se puede llamar
 * desde el primer frame sin preguntar nada.
 */
export function readBands(): Bands {
  const analyser = getAnalyser()

  if (spectrum === null || spectrum.length !== analyser.frequencyBinCount) {
    spectrum = new Uint8Array(analyser.frequencyBinCount)
  }

  const data = spectrum
  analyser.getByteFrequencyData(data)

  const nyquist = analyser.context.sampleRate / 2
  const binOf = (hz: number) =>
    Math.min(data.length - 1, Math.round((hz / nyquist) * data.length))

  return {
    bass: average(data, binOf(EDGES_HZ[0]), binOf(EDGES_HZ[1])),
    mid: average(data, binOf(EDGES_HZ[1]), binOf(EDGES_HZ[2])),
    treble: average(data, binOf(EDGES_HZ[2]), binOf(EDGES_HZ[3])),
  }
}

/**
 * Promedio de un rango de bins, llevado a 0–1.
 *
 * `from` y `to` pueden caer en el mismo bin con una tasa de muestreo rara; de
 * ahí el mínimo de uno, para no dividir por cero.
 */
function average(data: Uint8Array, from: number, to: number): number {
  const end = Math.max(to, from + 1)
  let sum = 0
  for (let i = from; i < end && i < data.length; i++) sum += data[i]
  return sum / (end - from) / 255
}
