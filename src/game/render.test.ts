import { describe, expect, it } from 'vitest'

import { PERFECT_CENTER } from './engine'
import { TIMING } from './constants'
import { markerX, railLayout, tileLayout, withAlpha } from './render'

const WIDE = { w: 1600, h: 900 }
const NARROW = { w: 600, h: 800 }

describe('riel', () => {
  it('se topa en 720px por más ancha que sea la ventana', () => {
    expect(railLayout(WIDE.w, WIDE.h).width).toBe(720)
  })

  it('usa el 86% del ancho en ventanas chicas', () => {
    expect(railLayout(NARROW.w, NARROW.h).width).toBeCloseTo(NARROW.w * 0.86)
  })

  it('queda centrado horizontalmente', () => {
    const rail = railLayout(WIDE.w, WIDE.h)
    expect(rail.x + rail.width / 2).toBeCloseTo(WIDE.w / 2)
  })
})

describe('ventanas sobre el riel', () => {
  it('mantiene las cuatro ventanas anidadas y dentro del riel', () => {
    // El degradado usa estos mismos valores como stops, y `addColorStop` explota
    // si no vienen en orden creciente. Este test es lo que lo evita.
    const bounds = [
      TIMING.badStart,
      TIMING.goodStart,
      TIMING.greatStart,
      TIMING.perfectStart,
      PERFECT_CENTER,
      TIMING.perfectEnd,
      TIMING.greatEnd,
      TIMING.goodEnd,
      TIMING.badEnd,
    ]

    for (let i = 1; i < bounds.length; i++) {
      expect(bounds[i]).toBeGreaterThan(bounds[i - 1])
    }
    expect(bounds[0]).toBeGreaterThanOrEqual(0)
    expect(bounds[bounds.length - 1]).toBeLessThanOrEqual(1)
  })
})

describe('withAlpha', () => {
  it('convierte el hex del token a rgba para el canvas', () => {
    expect(withAlpha('#ff2e88', 0.5)).toBe('rgba(255, 46, 136, 0.5)')
    expect(withAlpha('#000000', 0)).toBe('rgba(0, 0, 0, 0)')
    expect(withAlpha('#ffffff', 1)).toBe('rgba(255, 255, 255, 1)')
  })
})

describe('marcador', () => {
  it('recorre el riel de punta a punta', () => {
    const rail = railLayout(WIDE.w, WIDE.h)

    expect(markerX(rail, 0)).toBe(rail.x)
    expect(markerX(rail, 0.5)).toBe(rail.x + rail.width / 2)
    expect(markerX(rail, 1)).toBe(rail.x + rail.width)
  })

  it('recorta el progreso fuera de rango en vez de dibujar afuera', () => {
    const rail = railLayout(WIDE.w, WIDE.h)

    expect(markerX(rail, -3)).toBe(rail.x)
    expect(markerX(rail, 7)).toBe(rail.x + rail.width)
  })

  it('cae entre los bordes de PERFECT cuando el juez dice PERFECT', () => {
    const rail = railLayout(WIDE.w, WIDE.h)

    expect(markerX(rail, PERFECT_CENTER)).toBeGreaterThan(markerX(rail, TIMING.perfectStart))
    expect(markerX(rail, PERFECT_CENTER)).toBeLessThan(markerX(rail, TIMING.perfectEnd))
  })
})

describe('casillas de la secuencia', () => {
  it('centra la fila completa', () => {
    const tiles = tileLayout(5, WIDE.w, WIDE.h)
    const left = tiles[0].x
    const right = tiles[tiles.length - 1].x + tiles[0].width

    expect((left + right) / 2).toBeCloseTo(WIDE.w / 2)
  })

  it('las separa sin superponerlas', () => {
    const tiles = tileLayout(5, WIDE.w, WIDE.h)
    for (let i = 1; i < tiles.length; i++) {
      expect(tiles[i].x).toBeGreaterThan(tiles[i - 1].x + tiles[i - 1].width)
    }
  })

  it('aguanta una secuencia vacía', () => {
    expect(tileLayout(0, WIDE.w, WIDE.h)).toEqual([])
  })
})
