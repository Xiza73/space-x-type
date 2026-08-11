import { describe, expect, it } from 'vitest'

import { TIMING } from './constants'
import { markerX, railLayout, tileLayout, zoneRect } from './render'

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

describe('zonas de timing', () => {
  it('dibuja la zona dorada exactamente donde puntúa PERFECT', () => {
    const rail = railLayout(WIDE.w, WIDE.h)
    const gold = zoneRect(rail, TIMING.perfectStart, TIMING.perfectEnd)

    // Si esto falla, la zona que ve el jugador dejó de ser la que suma puntos.
    expect(gold.x).toBeCloseTo(rail.x + TIMING.perfectStart * rail.width)
    expect(gold.x + gold.width).toBeCloseTo(rail.x + TIMING.perfectEnd * rail.width)
  })

  it('mete la zona dorada adentro de la zona cyan', () => {
    const rail = railLayout(WIDE.w, WIDE.h)
    const good = zoneRect(rail, TIMING.goodStart, TIMING.goodEnd)
    const gold = zoneRect(rail, TIMING.perfectStart, TIMING.perfectEnd)

    expect(gold.x).toBeGreaterThan(good.x)
    expect(gold.x + gold.width).toBeLessThan(good.x + good.width)
  })

  it('no se sale del riel', () => {
    const rail = railLayout(NARROW.w, NARROW.h)
    const good = zoneRect(rail, TIMING.goodStart, TIMING.goodEnd)

    expect(good.x).toBeGreaterThanOrEqual(rail.x)
    expect(good.x + good.width).toBeLessThanOrEqual(rail.x + rail.width)
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

  it('cae dentro de la zona dorada justo cuando el juez dice PERFECT', () => {
    const rail = railLayout(WIDE.w, WIDE.h)
    const gold = zoneRect(rail, TIMING.perfectStart, TIMING.perfectEnd)
    const x = markerX(rail, (TIMING.perfectStart + TIMING.perfectEnd) / 2)

    expect(x).toBeGreaterThan(gold.x)
    expect(x).toBeLessThan(gold.x + gold.width)
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
