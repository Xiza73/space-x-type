import { describe, expect, it } from 'vitest'

import { SILENT_BANDS, type Bands } from '../audio/bands'
import { createLightField } from './background'

const GOLPE: Bands = { bass: 1, mid: 1, treble: 1 }

/** Un frame de 60fps. */
const FRAME = 16.7

describe('campo de luces', () => {
  it('prende al instante y se apaga de a poco', () => {
    // Es la propiedad que hace que el fondo MARQUE el ritmo. Con ataque lento
    // la luz llega tarde al golpe; con caída rápida el fondo tiembla.
    const field = createLightField()

    field.update(GOLPE, FRAME)
    expect(Math.min(...field.levels())).toBe(1)

    field.update(SILENT_BANDS, FRAME)
    const despuesDeUnFrame = Math.max(...field.levels())
    expect(despuesDeUnFrame).toBeLessThan(1)
    expect(despuesDeUnFrame).toBeGreaterThan(0.9)
  })

  it('la caída no depende de los fps', () => {
    // Si la caída fuera por frame y no por tiempo, el fondo se apagaría al
    // doble de velocidad en un monitor de 120Hz.
    const a = createLightField()
    const b = createLightField()

    a.update(GOLPE, FRAME)
    b.update(GOLPE, FRAME)

    // 100ms en un solo salto contra 100ms en seis saltos de 60fps.
    a.update(SILENT_BANDS, 100)
    for (let i = 0; i < 6; i++) b.update(SILENT_BANDS, 100 / 6)

    expect(Math.max(...a.levels())).toBeCloseTo(Math.max(...b.levels()), 5)
  })

  it('cada banda mueve sus propias luces', () => {
    // Si una banda no tuviera ninguna luz asignada, ese rango del espectro
    // quedaría mudo en pantalla.
    for (const banda of ['bass', 'mid', 'treble'] as const) {
      const field = createLightField()
      field.update({ ...SILENT_BANDS, [banda]: 1 }, FRAME)
      expect(field.levels().filter((l) => l === 1).length).toBeGreaterThan(0)
    }
  })

  it('en silencio se apaga hasta cero y no queda negativo', () => {
    const field = createLightField()
    field.update(GOLPE, FRAME)
    for (let i = 0; i < 400; i++) field.update(SILENT_BANDS, FRAME)

    expect(Math.max(...field.levels())).toBeLessThan(0.001)
    expect(Math.min(...field.levels())).toBeGreaterThanOrEqual(0)
  })

  it('la misma semilla da el mismo campo', () => {
    // Sin esto, un test que mire posiciones sería intermitente.
    expect(createLightField(7).levels()).toEqual(createLightField(7).levels())
  })
})
