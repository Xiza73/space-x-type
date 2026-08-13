import { describe, expect, it } from 'vitest'

import { BAR_COUNT, createVisualizer, seedFrom } from './visualizer'

/** Un frame de 60fps. */
const FRAME = 16.7

const silencio = () => new Float32Array(BAR_COUNT)

/** Espectro con energía solo en una parte del rango. */
function soloEn(desde: number, hasta: number): Float32Array {
  const out = new Float32Array(BAR_COUNT)
  for (let i = desde; i < hasta; i++) out[i] = 1
  return out
}

describe('visualizador', () => {
  it('cada barra se mueve con SU frecuencia', () => {
    // **Este es el test que faltaba en el fondo anterior.** Aquel agrupaba todo
    // en tres bandas, así que dentro de un grupo todas las luces recibían el
    // mismo valor y se prendían juntas: era un latido, no un espectro.
    const v = createVisualizer(0)
    v.update(soloEn(0, 8), FRAME)

    const niveles = v.levels()
    expect(Math.max(...niveles.slice(0, 8))).toBe(1)
    expect(Math.max(...niveles.slice(8))).toBe(0)
  })

  it('prende al instante y se apaga de a poco', () => {
    const v = createVisualizer(0)
    v.update(soloEn(0, BAR_COUNT), FRAME)
    expect(v.levels()[0]).toBe(1)

    v.update(silencio(), FRAME)
    expect(v.levels()[0]).toBeLessThan(1)
    expect(v.levels()[0]).toBeGreaterThan(0.9)
  })

  it('la caída no depende de los fps', () => {
    // Si fuera por frame, el anillo caería al doble de velocidad en 120Hz.
    const a = createVisualizer(0)
    const b = createVisualizer(0)
    a.update(soloEn(0, BAR_COUNT), FRAME)
    b.update(soloEn(0, BAR_COUNT), FRAME)

    a.update(silencio(), 100)
    for (let i = 0; i < 6; i++) b.update(silencio(), 100 / 6)

    expect(a.levels()[0]).toBeCloseTo(b.levels()[0], 5)
  })

  it('en silencio se apaga hasta cero, sin quedar negativo', () => {
    const v = createVisualizer(0)
    v.update(soloEn(0, BAR_COUNT), FRAME)
    for (let i = 0; i < 400; i++) v.update(silencio(), FRAME)

    expect(Math.max(...v.levels())).toBeLessThan(0.001)
    expect(Math.min(...v.levels())).toBeGreaterThanOrEqual(0)
  })

  it('cada canción cae siempre en la misma figura', () => {
    // Estable por canción: le da identidad, en vez de sortear una distinta cada
    // vez que se juega la misma.
    const id = 'dQw4w9WgXcQ'
    expect(createVisualizer(seedFrom(id)).styleId()).toBe(
      createVisualizer(seedFrom(id)).styleId(),
    )
  })

  it('el catálogo se reparte entre canciones distintas', () => {
    // Si el hash o el módulo se rompieran, todas las canciones caerían en la
    // misma figura y el catálogo no serviría de nada.
    const ids = Array.from({ length: 40 }, (_, i) => `cancion-${i}`)
    const figuras = new Set(ids.map((id) => createVisualizer(seedFrom(id)).styleId()))
    expect(figuras.size).toBeGreaterThan(1)
  })

  it('el hash aguanta cualquier texto y no da negativos', () => {
    // `seedFrom` alimenta un módulo: un negativo daría un índice fuera del
    // catálogo y reventaría al arrancar la partida.
    for (const texto of ['', 'a', 'ñ', '../..', '🎵', 'x'.repeat(500)]) {
      const seed = seedFrom(texto)
      expect(seed).toBeGreaterThanOrEqual(0)
      expect(createVisualizer(seed).styleId()).toBeTypeOf('string')
    }
  })
})
