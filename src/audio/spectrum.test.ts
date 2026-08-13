import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BAR_GATE } from '../game/visualizer'

/**
 * El reclamo era "siempre se ven todas las líneas activas". Estos tests fijan lo
 * contrario: con el espectro de una canción real, **solo una minoría de barras**
 * pasa el umbral y entre ellas hay diferencia de altura.
 *
 * El fixture no es inventado: son los decibeles medidos banda por banda sobre
 * una canción de verdad, promediados en cinco momentos del tema. Ese perfil es
 * lo que hace útil al test — con una señal sintética plana, cualquier ajuste
 * parece funcionar.
 */

/** Perfil real: dB por banda, de la más grave a la más aguda. */
const PERFIL_DB = [
  -51.9, -51.9, -51.9, -51.9, -51.9, -51.9, -51.9, -51.9, -51.9, -51.9, -48.7, -48.7, -48.7,
  -48.7, -48.7, -48.7, -44.5, -44.5, -44.5, -44.5, -46.6, -46.6, -46.6, -44, -44, -36.2,
  -36.2, -34.2, -34.2, -39, -38.2, -42.8, -42.4, -48.2, -49.4, -45.8, -44.9, -49.5, -54.4,
  -48.6, -48, -55.7, -58.1, -59.2, -53.1, -49.9, -54.7, -62.5, -53.5, -60.9, -56.2, -61.5,
  -58.9, -61.9, -63.8, -66.4, -70.5, -70.5, -69.2, -71.8, -74.8, -74.5, -78.2, -76.6, -73.9,
  -72.4, -69.8, -77, -77.5, -72.1, -75.9, -75.7,
]

/** Los mismos que usa el analizador de verdad. Si cambian allá, cambian aquí. */
const MIN_DB = -80
const MAX_DB = -32
const BINS = 2048
const SAMPLE_RATE = 44_100
const BARS = 72
const MIN_HZ = 30
const MAX_HZ = 12_000

/**
 * Reparte el perfil por banda sobre los bins de la FFT, y lo convierte a bytes
 * igual que hace `getByteFrequencyData`: un mapeo lineal de la ventana de dB.
 */
function bytesDesdePerfil(perfil: readonly number[]): Uint8Array {
  const data = new Uint8Array(BINS)
  const nyquist = SAMPLE_RATE / 2
  const ratio = Math.log(MAX_HZ / MIN_HZ)

  for (let i = 0; i < BARS; i++) {
    const from = MIN_HZ * Math.exp((ratio * i) / BARS)
    const to = MIN_HZ * Math.exp((ratio * (i + 1)) / BARS)
    const first = Math.min(BINS - 1, Math.floor((from / nyquist) * BINS))
    const last = Math.min(BINS, Math.max(first + 1, Math.ceil((to / nyquist) * BINS)))

    const norm = Math.max(0, Math.min(1, (perfil[i] - MIN_DB) / (MAX_DB - MIN_DB)))
    for (let bin = first; bin < last; bin++) data[bin] = Math.round(norm * 255)
  }
  return data
}

async function leer(data: Uint8Array): Promise<number[]> {
  vi.doMock('./context', () => ({
    getAnalyser: () => ({
      frequencyBinCount: data.length,
      getByteFrequencyData: (out: Uint8Array) => out.set(data),
      context: { sampleRate: SAMPLE_RATE },
    }),
  }))
  const { readSpectrum } = await import('./spectrum')
  const out = new Float32Array(BARS)
  readSpectrum(out)
  return [...out]
}

describe('espectro', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('./context')
  })

  it('con una canción real no se enciende todo el anillo', async () => {
    // **La regresión que motivó esto.** Con la ventana de decibeles por defecto
    // (-100 a -30) toda la música quedaba arriba del umbral y el anillo se veía
    // como un aro parejo en vez de como un espectro.
    const niveles = await leer(bytesDesdePerfil(PERFIL_DB))
    const encendidas = niveles.filter((l) => l >= BAR_GATE).length

    // Medido: 24 de 72, un tercio del anillo.
    expect(encendidas).toBeGreaterThan(BARS / 8)
    expect(encendidas).toBeLessThan(BARS / 2)
  })

  it('las barras encendidas se destacan del resto', async () => {
    // No alcanza con que se enciendan pocas: las que se encienden tienen que
    // sobresalir, o el efecto sigue siendo un aro y no un espectro.
    const ordenadas = (await leer(bytesDesdePerfil(PERFIL_DB))).sort((a, b) => b - a)

    expect(ordenadas[0]).toBeGreaterThan(0.8)
    expect(ordenadas[Math.floor(BARS / 2)]).toBeLessThan(ordenadas[0] / 2)
  })

  it('el silencio deja todo en cero', async () => {
    expect(Math.max(...(await leer(new Uint8Array(BINS))))).toBe(0)
  })

  it('a todo volumen sí se llena', async () => {
    // La curva no puede ser tanta que un tema fuerte no llegue nunca: sería
    // cambiar "todo encendido" por "nada encendido".
    const niveles = await leer(new Uint8Array(BINS).fill(255))
    expect(niveles.filter((l) => l >= BAR_GATE).length).toBe(BARS)
  })

  it('cada banda mira su propio rango de frecuencias', async () => {
    // Energía solo en los graves: las barras agudas tienen que quedar apagadas.
    const soloGraves = PERFIL_DB.map((_, i) => (i < 10 ? -35 : -120))
    const niveles = await leer(bytesDesdePerfil(soloGraves))

    expect(Math.max(...niveles.slice(0, 10))).toBeGreaterThan(BAR_GATE)
    expect(Math.max(...niveles.slice(20))).toBe(0)
  })
})
